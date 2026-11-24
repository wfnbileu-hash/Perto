const crypto = require('crypto');
const admin = require('firebase-admin');

const TARIFAS = Object.freeze({
  gratis: 0,
  intermediario: 29.90,
  avancado: 49.90
});

function iniciarFirebase() {
  if (admin.apps.length) return admin.firestore();

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credencial))
  });

  return admin.firestore();
}

function criadoEmMillis(item) {
  const data = item.criadoEm;
  if (data && typeof data.toMillis === 'function') return data.toMillis();
  if (data instanceof Date) return data.getTime();
  const convertido = data ? new Date(data).getTime() : 0;
  return Number.isFinite(convertido) ? convertido : 0;
}

function planoPorNumero(numero) {
  if (numero <= 1) return { nome: 'gratis', valor: TARIFAS.gratis };
  if (numero <= 5) return { nome: 'intermediario', valor: TARIFAS.intermediario };
  return { nome: 'avancado', valor: TARIFAS.avancado };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const tokenMP = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const site = process.env.PERTO_URL;
    if (!tokenMP || !site) {
      return res.status(500).json({ erro: 'Configuração do pagamento incompleta' });
    }

    const cabecalho = req.headers.authorization || '';
    const idToken = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
    if (!idToken) return res.status(401).json({ erro: 'Faça login para continuar' });

    const { estabelecimentoId } = req.body || {};
    if (typeof estabelecimentoId !== 'string' || !estabelecimentoId.trim() || estabelecimentoId.length > 150) {
      return res.status(400).json({ erro: 'Estabelecimento inválido' });
    }

    const db = iniciarFirebase();
    const usuario = await admin.auth().verifyIdToken(idToken);
    const conta = await admin.auth().getUser(usuario.uid);
    if (!conta.email) {
      return res.status(400).json({ erro: 'Sua conta precisa ter um e-mail válido' });
    }

    const estabelecimentosSnap = await db.collection('estabelecimentosProfissionais')
      .where('proprietarioId', '==', usuario.uid)
      .get();

    const estabelecimentos = estabelecimentosSnap.docs
      .map(documento => ({ id: documento.id, ...documento.data() }))
      .sort((a, b) => criadoEmMillis(a) - criadoEmMillis(b) || a.id.localeCompare(b.id));

    const indice = estabelecimentos.findIndex(item => item.id === estabelecimentoId);
    if (indice < 0) {
      return res.status(404).json({ erro: 'Estabelecimento não encontrado para esta conta' });
    }

    const estabelecimento = estabelecimentos[indice];
    if (estabelecimento.proprietarioId !== usuario.uid) {
      return res.status(403).json({ erro: 'Você não pode pagar este estabelecimento' });
    }

    const numeroEstabelecimento = indice + 1;
    const plano = planoPorNumero(numeroEstabelecimento);
    if (plano.valor === 0) {
      return res.status(400).json({
        erro: 'O primeiro estabelecimento do proprietário é gratuito e não precisa de pagamento',
        numeroEstabelecimento,
        valor: 0
      });
    }

    const mensalidadeRef = db.collection('mensalidadesEstabelecimentosProfissionais')
      .doc(estabelecimentoId);
    const mensalidadeSnap = await mensalidadeRef.get();
    const mensalidade = mensalidadeSnap.exists ? mensalidadeSnap.data() : {};

    if (mensalidade.status === 'authorized') {
      const vencimento = mensalidade.mensalidadeVenceEm;
      const dataVencimento = vencimento?.toDate ? vencimento.toDate() : null;
      if (dataVencimento && dataVencimento.getTime() > Date.now()) {
        return res.status(409).json({ erro: 'A mensalidade deste estabelecimento está em dia' });
      }
    }

    const referencia = `mensalidade_profissional_${estabelecimentoId}_${crypto.randomUUID()}`;
    const resposta = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenMP}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': crypto.randomUUID()
      },
      body: JSON.stringify({
        transaction_amount: plano.valor,
        description: `Mensalidade Perto Profissionais — ${estabelecimento.nome || 'Estabelecimento'}`,
        payment_method_id: 'pix',
        payer: { email: conta.email },
        external_reference: referencia,
        notification_url: `${site.replace(/\/$/, '')}/api/webhook-assinatura-loja`,
        metadata: {
          tipo: 'mensalidade_estabelecimento_profissional',
          estabelecimentoId,
          proprietarioId: usuario.uid,
          numeroEstabelecimento,
          plano: plano.nome
        }
      })
    });

    const dados = await resposta.json().catch(() => ({}));
    const transacao = dados.point_of_interaction?.transaction_data;
    if (!resposta.ok || !dados.id || !transacao?.qr_code || !transacao?.qr_code_base64) {
      console.error('Erro ao criar Pix Perto Profissionais:', {
        status: resposta.status,
        mensagem: dados.message,
        erro: dados.error,
        causa: dados.cause
      });
      return res.status(502).json({ erro: 'Não foi possível gerar o Pix da mensalidade' });
    }

    const agora = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('pagamentosMensalidadeProfissionais').doc(referencia).set({
      estabelecimentoId,
      proprietarioId: usuario.uid,
      referencia,
      pagamentoId: String(dados.id),
      numeroEstabelecimento,
      plano: plano.nome,
      valor: plano.valor,
      moeda: 'BRL',
      status: String(dados.status || 'pending'),
      criadoEm: agora,
      atualizadoEm: agora
    });

    await mensalidadeRef.set({
      estabelecimentoId,
      proprietarioId: usuario.uid,
      numeroEstabelecimento,
      plano: plano.nome,
      valorAtual: plano.valor,
      moeda: 'BRL',
      status: 'pending',
      tipoCobranca: 'pix',
      referenciaPagamento: referencia,
      pagamentoId: String(dados.id),
      atualizadoEm: agora
    }, { merge: true });

    return res.status(200).json({
      payment_id: String(dados.id),
      qr_code: transacao.qr_code,
      qr_code_base64: transacao.qr_code_base64,
      status: String(dados.status || 'pending'),
      valor: plano.valor,
      numeroEstabelecimento,
      plano: plano.nome
    });
  } catch (erro) {
    console.error('Erro ao criar Pix Perto Profissionais:', erro);
    if (String(erro.code || '').startsWith('auth/')) {
      return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente.' });
    }
    return res.status(500).json({ erro: 'Erro ao preparar o pagamento da mensalidade' });
  }
};
