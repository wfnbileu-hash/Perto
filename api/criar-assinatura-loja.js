
const crypto = require('crypto');
const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return admin.firestore();

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credencial))
  });

  return admin.firestore();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const tokenMP = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const site = process.env.PERTO_URL;

    if (!tokenMP || !site) {
      return res.status(500).json({
        erro: 'Configuração do pagamento incompleta'
      });
    }

    const cabecalho = req.headers.authorization || '';
    const idToken = cabecalho.startsWith('Bearer ')
      ? cabecalho.slice(7)
      : '';

    if (!idToken) {
      return res.status(401).json({
        erro: 'Faça login para continuar'
      });
    }

    const db = iniciarFirebase();
    const usuario = await admin.auth().verifyIdToken(idToken);
    const conta = await admin.auth().getUser(usuario.uid);

    if (!conta.email) {
      return res.status(400).json({
        erro: 'Sua conta precisa ter um e-mail válido'
      });
    }

    const lojaRef = db.collection('lojas').doc(usuario.uid);
    const lojaSnap = await lojaRef.get();

    if (!lojaSnap.exists) {
      return res.status(404).json({
        erro: 'Cadastre sua loja antes de assinar'
      });
    }

    const configSnap = await db
      .collection('configuracoes')
      .doc('plataforma')
      .get();

    const valorConfigurado = configSnap.exists
      ? Number(configSnap.data().mensalidadeLoja)
      : 49.90;

    if (
      !Number.isFinite(valorConfigurado) ||
      valorConfigurado <= 0
    ) {
      return res.status(400).json({
        erro: 'O administrador precisa configurar uma mensalidade válida'
      });
    }

    const valor = Math.round(valorConfigurado * 100) / 100;
    const mensalidadeRef = db
      .collection('mensalidadesLojas')
      .doc(usuario.uid);

    const mensalidadeSnap = await mensalidadeRef.get();
    const mensalidade = mensalidadeSnap.exists
      ? mensalidadeSnap.data()
      : {};

    if (mensalidade.status === 'authorized') {
      return res.status(409).json({
        erro: 'Esta loja já possui uma assinatura ativa'
      });
    }

    const referencia =
      `mensalidade_${usuario.uid}_${crypto.randomUUID()}`;

    const resposta = await fetch(
      'https://api.mercadopago.com/v1/payments',
      {
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
          payer: {
            email: conta.email
          },
          external_reference: referencia,
          notification_url:
            `${site.replace(/\/$/, '')}/api/webhook-assinatura-loja`,
          metadata: {
            tipo: 'mensalidade_loja',
            lojaId: usuario.uid
          }
        })
      }
    );

    const dados = await resposta.json().catch(() => ({}));
    const transacao = dados.point_of_interaction?.transaction_data;
    const qrCode = transacao?.qr_code;
    const qrBase64 = transacao?.qr_code_base64;

    if (!resposta.ok || !dados.id || !qrCode || !qrBase64) {
      console.error('Erro ao criar Pix da mensalidade:', {
        status: resposta.status,
        mensagem: dados.message,
        erro: dados.error,
        causa: dados.cause
      });

      return res.status(502).json({
        erro: 'Não foi possível gerar o Pix da mensalidade'
      });
    }

    const agora = admin.firestore.FieldValue.serverTimestamp();

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
      checkoutUrl: admin.firestore.FieldValue.delete(),
      atualizadoEm: agora
    }, { merge: true });

    return res.status(200).json({
      payment_id: String(dados.id),
      qr_code: qrCode,
      qr_code_base64: qrBase64,
      status: String(dados.status || 'pending')
    });
  } catch (erro) {
    console.error('Erro ao criar Pix da mensalidade:', erro);

    if (
      erro.code === 'auth/id-token-expired' ||
      erro.code === 'auth/argument-error' ||
      erro.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        erro: 'Sua sessão expirou. Entre novamente.'
      });
    }

    return res.status(500).json({
      erro: 'Erro ao preparar o pagamento da mensalidade'
    });
  }
};
