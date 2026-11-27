const crypto = require('crypto');
const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return admin.firestore();
  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credencial)) });
  return admin.firestore();
}

async function obterPagamentoExistente(mensalidade, tokenMP, mensalidadeRef) {
  if (mensalidade.status !== 'pending' || !mensalidade.pagamentoId) return null;
  const resposta = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(mensalidade.pagamentoId)}`,
    { headers: { Authorization: `Bearer ${tokenMP}` } }
  );
  const pagamento = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error('Não foi possível verificar o Pix pendente');

  const status = String(pagamento.status || '').toLowerCase();
  if (['cancelled', 'canceled', 'rejected', 'refunded', 'charged_back'].includes(status)) {
    await mensalidadeRef.set({
      status: 'rejected',
      pagamentoId: admin.firestore.FieldValue.delete(),
      referenciaPagamento: admin.firestore.FieldValue.delete(),
      pixQrCode: admin.firestore.FieldValue.delete(),
      pixQrCodeBase64: admin.firestore.FieldValue.delete(),
      pixExpiraEm: admin.firestore.FieldValue.delete(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return null;
  }

  if (['pending', 'in_process', 'authorized'].includes(status)) {
    const expiracao = mensalidade.pixExpiraEm?.toMillis ? mensalidade.pixExpiraEm.toMillis() : 0;
    if (expiracao && expiracao <= Date.now()) {
      return { erro: 'Este Pix expirou e o Mercado Pago ainda está atualizando o status. Tente novamente em alguns minutos.', status: 409 };
    }
    const transacao = pagamento.point_of_interaction?.transaction_data;
    const qrCode = transacao?.qr_code || mensalidade.pixQrCode;
    const qrBase64 = transacao?.qr_code_base64 || mensalidade.pixQrCodeBase64;
    if (!qrCode || !qrBase64) {
      return { erro: 'Já existe um pagamento em andamento. Aguarde a confirmação antes de tentar novamente.', status: 409 };
    }
    return {
      payment_id: String(pagamento.id || mensalidade.pagamentoId),
      qr_code: qrCode,
      qr_code_base64: qrBase64,
      status,
      reutilizado: true
    };
  }
  return { erro: 'O pagamento anterior está sendo confirmado. Aguarde antes de gerar outro Pix.', status: 409 };
}

async function adquirirTravaCriacaoPix(db, mensalidadeRef) {
  const token = crypto.randomUUID();
  return db.runTransaction(async transacao => {
    const snapshot = await transacao.get(mensalidadeRef);
    const mensalidade = snapshot.exists ? snapshot.data() : {};
    if (mensalidade.status === 'pending' && mensalidade.pagamentoId) return { estado: 'pendente' };
    const travaAte = mensalidade.pixCriacaoAte?.toMillis ? mensalidade.pixCriacaoAte.toMillis() : 0;
    if (travaAte > Date.now()) return { estado: 'ocupada' };
    transacao.set(mensalidadeRef, {
      pixCriacaoToken: token,
      pixCriacaoAte: admin.firestore.Timestamp.fromMillis(Date.now() + 2 * 60 * 1000)
    }, { merge: true });
    return { estado: 'adquirida', token };
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  try {
    const tokenMP = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const site = process.env.PERTO_URL;
    if (!tokenMP || !site) return res.status(500).json({ erro: 'Configuração do pagamento incompleta' });

    const cabecalho = req.headers.authorization || '';
    const idToken = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
    if (!idToken) return res.status(401).json({ erro: 'Faça login para continuar' });

    const db = iniciarFirebase();
    const usuario = await admin.auth().verifyIdToken(idToken);
    const conta = await admin.auth().getUser(usuario.uid);
    if (!conta.email) return res.status(400).json({ erro: 'Sua conta precisa ter um e-mail válido' });

    const lojaRef = db.collection('lojas').doc(usuario.uid);
    const lojaSnap = await lojaRef.get();
    if (!lojaSnap.exists) return res.status(404).json({ erro: 'Cadastre sua loja antes de assinar' });

    const configSnap = await db.collection('configuracoes').doc('plataforma').get();
    const valorConfigurado = configSnap.exists ? Number(configSnap.data().mensalidadeLoja) : 49.90;
    if (!Number.isFinite(valorConfigurado) || valorConfigurado <= 0) {
      return res.status(400).json({ erro: 'O administrador precisa configurar uma mensalidade válida' });
    }

    const valor = Math.round(valorConfigurado * 100) / 100;
    const mensalidadeRef = db.collection('mensalidadesLojas').doc(usuario.uid);
    let mensalidadeSnap = await mensalidadeRef.get();
    let mensalidade = mensalidadeSnap.exists ? mensalidadeSnap.data() : {};

    if (mensalidade.status === 'pending') {
      const existente = await obterPagamentoExistente(mensalidade, tokenMP, mensalidadeRef);
      if (existente) {
        if (existente.status) return res.status(existente.status).json({ erro: existente.erro });
        return res.status(200).json(existente);
      }
      mensalidadeSnap = await mensalidadeRef.get();
      mensalidade = mensalidadeSnap.exists ? mensalidadeSnap.data() : {};
    }

    if (mensalidade.status === 'authorized') {
      const vencimento = mensalidade.mensalidadeVenceEm;
      const dataVencimento = vencimento?.toDate
        ? vencimento.toDate()
        : vencimento ? new Date(vencimento) : null;
      const diasAteVencimento = dataVencimento
        ? Math.ceil((dataVencimento.getTime() - Date.now()) / 86400000)
        : null;
      if (!dataVencimento || Number.isNaN(dataVencimento.getTime()) || diasAteVencimento > 5) {
        return res.status(409).json({ erro: 'A mensalidade ainda está dentro do prazo. Você poderá pagar nos cinco dias anteriores ao vencimento.' });
      }
    }

    const trava = await adquirirTravaCriacaoPix(db, mensalidadeRef);
    if (trava.estado === 'ocupada') {
      return res.status(409).json({ erro: 'Estamos preparando seu Pix. Aguarde alguns segundos e tente novamente.' });
    }
    if (trava.estado === 'pendente') {
      mensalidadeSnap = await mensalidadeRef.get();
      mensalidade = mensalidadeSnap.exists ? mensalidadeSnap.data() : {};
      const existente = await obterPagamentoExistente(mensalidade, tokenMP, mensalidadeRef);
      if (existente?.status) return res.status(existente.status).json({ erro: existente.erro });
      if (existente) return res.status(200).json(existente);
      return res.status(409).json({ erro: 'O pagamento anterior está sendo atualizado. Aguarde e tente novamente.' });
    }

    const referencia = `mensalidade_${usuario.uid}_${crypto.randomUUID()}`;
    const expiracao = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMP}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({
        transaction_amount: valor,
        description: 'Mensalidade da loja Perto',
        payment_method_id: 'pix',
        date_of_expiration: expiracao.toISOString(),
        payer: { email: conta.email },
        external_reference: referencia,
        notification_url: `${site.replace(/\/$/, '')}/api/webhook-assinatura-loja`,
        metadata: { tipo: 'mensalidade_loja', lojaId: usuario.uid }
      })
    });

    const dados = await resposta.json().catch(() => ({}));
    const transacao = dados.point_of_interaction?.transaction_data;
    const qrCode = transacao?.qr_code;
    const qrBase64 = transacao?.qr_code_base64;
    if (!resposta.ok || !dados.id || !qrCode || !qrBase64) {
      await mensalidadeRef.set({
        pixCriacaoToken: admin.firestore.FieldValue.delete(),
        pixCriacaoAte: admin.firestore.FieldValue.delete()
      }, { merge: true });
      console.error('Erro ao criar Pix da mensalidade:', {
        status: resposta.status, mensagem: dados.message, erro: dados.error, causa: dados.cause
      });
      return res.status(502).json({ erro: 'Não foi possível gerar o Pix da mensalidade' });
    }

    const agora = admin.firestore.FieldValue.serverTimestamp();
    const expiraEm = admin.firestore.Timestamp.fromDate(expiracao);
    await db.collection('pagamentosMensalidade').doc(referencia).set({
      lojaId: usuario.uid,
      referencia,
      pagamentoId: String(dados.id),
      valor,
      moeda: 'BRL',
      status: String(dados.status || 'pending'),
      criadoEm: agora,
      atualizadoEm: agora
    });
    await mensalidadeRef.set({
      lojaId: usuario.uid,
      emailPagador: conta.email,
      valorAtual: valor,
      moeda: 'BRL',
      status: 'pending',
      tipoCobranca: 'pix',
      referenciaPagamento: referencia,
      pagamentoId: String(dados.id),
      pixQrCode: qrCode,
      pixQrCodeBase64: qrBase64,
      pixExpiraEm: expiraEm,
      pixCriacaoToken: admin.firestore.FieldValue.delete(),
      pixCriacaoAte: admin.firestore.FieldValue.delete(),
      checkoutUrl: admin.firestore.FieldValue.delete(),
      atualizadoEm: agora
    }, { merge: true });

    return res.status(200).json({
      payment_id: String(dados.id), qr_code: qrCode, qr_code_base64: qrBase64,
      status: String(dados.status || 'pending')
    });
  } catch (erro) {
    console.error('Erro ao criar Pix da mensalidade:', erro);
    if (String(erro.code || '').startsWith('auth/')) {
      return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente.' });
    }
    return res.status(500).json({ erro: 'Erro ao preparar o pagamento da mensalidade' });
  }
};
