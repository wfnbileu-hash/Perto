const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return;

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  }

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credencial))
  });
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
      return res.status(401).json({ erro: 'Faça login para continuar' });
    }

    iniciarFirebase();

    const usuario = await admin.auth().verifyIdToken(idToken);
    const conta = await admin.auth().getUser(usuario.uid);

    if (!conta.email) {
      return res.status(400).json({
        erro: 'Sua conta precisa ter um e-mail válido'
      });
    }

    const db = admin.firestore();
    const lojaSnap = await db.collection('lojas').doc(usuario.uid).get();

    if (!lojaSnap.exists) {
      return res.status(404).json({
        erro: 'Cadastre sua loja antes de assinar'
      });
    }

    const configSnap = await db
      .collection('configuracoes')
      .doc('plataforma')
      .get();

    const configurado = configSnap.exists
      ? Number(configSnap.data().mensalidadeLoja)
      : 49.90;

    if (!Number.isFinite(configurado) || configurado <= 0) {
      return res.status(400).json({
        erro: 'O administrador precisa configurar uma mensalidade válida'
      });
    }

    const valor = Math.round(configurado * 100) / 100;
    const mensalidadeRef = db.collection('mensalidadesLojas').doc(usuario.uid);
    const mensalidadeSnap = await mensalidadeRef.get();
    const mensalidade = mensalidadeSnap.exists
      ? mensalidadeSnap.data()
      : {};

    if (mensalidade.status === 'authorized') {
      return res.status(409).json({
        erro: 'Esta loja já possui uma assinatura ativa'
      });
    }

    if (
      mensalidade.status === 'pending' &&
      mensalidade.checkoutUrl &&
      Number(mensalidade.valorAtual) === valor
    ) {
      return res.status(200).json({
        checkout_url: mensalidade.checkoutUrl
      });
    }

    const resposta = await fetch(
      'https://api.mercadopago.com/preapproval',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenMP}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'Mensalidade da loja Perto',
          external_reference: usuario.uid,
          payer_email: conta.email,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: valor,
            currency_id: 'BRL'
          },
          back_url: site.replace(/\/$/, ''),
          notification_url:
            `${site.replace(/\/$/, '')}/api/webhook-assinatura-loja`,
          status: 'pending'
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok || !dados.id || !dados.init_point) {
      console.error('Erro ao criar assinatura:', dados);
      return res.status(502).json({
        erro: 'O Mercado Pago não conseguiu criar a assinatura'
      });
    }

    await mensalidadeRef.set({
      lojaId: usuario.uid,
      emailPagador: conta.email,
      assinaturaId: String(dados.id),
      valorAtual: valor,
      moeda: 'BRL',
      status: String(dados.status || 'pending'),
      checkoutUrl: dados.init_point,
      canceladaEm: admin.firestore.FieldValue.delete(),
      cancelamentoOrigem: admin.firestore.FieldValue.delete(),
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      checkout_url: dados.init_point
    });
  } catch (erro) {
    console.error('Erro ao criar assinatura:', erro);

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
      erro: 'Erro ao preparar a assinatura mensal'
    });
  }
};
