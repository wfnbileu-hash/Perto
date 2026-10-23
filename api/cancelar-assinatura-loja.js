
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

async function requisicaoMercadoPago(url, token, metodo = 'GET', corpo) {
  const resposta = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    ...(corpo ? { body: JSON.stringify(corpo) } : {})
  });

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    console.error('Erro Mercado Pago:', {
      status: resposta.status,
      mensagem: dados.message || dados.error || 'Erro não especificado'
    });

    const erro = new Error(
      'O Mercado Pago não confirmou o cancelamento da assinatura.'
    );
    erro.status = 502;
    throw erro;
  }

  return dados;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido'
    });
  }

  try {
    const autorizacao = req.headers.authorization || '';
    const idToken = autorizacao.startsWith('Bearer ')
      ? autorizacao.slice(7)
      : '';

    if (!idToken) {
      return res.status(401).json({
        erro: 'Faça login para continuar.'
      });
    }

    const tokenMP = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!tokenMP) {
      return res.status(500).json({
        erro: 'Mercado Pago não está configurado.'
      });
    }

    iniciarFirebase();

    const usuario = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();

    const mensalidadeRef = db
      .collection('mensalidadesLojas')
      .doc(usuario.uid);

    const mensalidadeSnap = await mensalidadeRef.get();

    if (!mensalidadeSnap.exists) {
      return res.status(200).json({
        sucesso: true,
        assinaturaCancelada: false,
        mensagem: 'Não há assinatura registrada para esta loja.'
      });
    }

    const mensalidade = mensalidadeSnap.data() || {};
    const assinaturaId = String(mensalidade.assinaturaId || '');

    if (!assinaturaId) {
      return res.status(200).json({
        sucesso: true,
        assinaturaCancelada: false,
        mensagem: 'Não há assinatura recorrente vinculada.'
      });
    }

    const url =
      'https://api.mercadopago.com/preapproval/' +
      encodeURIComponent(assinaturaId);

    const assinaturaAtual = await requisicaoMercadoPago(
      url,
      tokenMP
    );

    // Impede cancelar uma assinatura que pertence a outra conta.
    if (String(assinaturaAtual.external_reference || '') !== usuario.uid) {
      return res.status(403).json({
        erro: 'A assinatura não pertence a esta conta.'
      });
    }

    const statusAtual = String(
      assinaturaAtual.status || ''
    ).toLowerCase();

    let resultado = assinaturaAtual;

    if (statusAtual !== 'cancelled' && statusAtual !== 'canceled') {
      resultado = await requisicaoMercadoPago(
        url,
        tokenMP,
        'PUT',
        { status: 'canceled' }
      );
    }

    const statusFinal = String(
      resultado.status || ''
    ).toLowerCase();

    if (statusFinal !== 'cancelled' && statusFinal !== 'canceled') {
      return res.status(502).json({
        erro: 'O Mercado Pago não confirmou o cancelamento. Nenhum registro foi apagado.'
      });
    }

    // Preserva o registro financeiro e o histórico da assinatura.
    await mensalidadeRef.set({
      status: 'cancelled',
      canceladaEm: admin.firestore.FieldValue.serverTimestamp(),
      cancelamentoOrigem: 'solicitacao_loja',
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({
      sucesso: true,
      assinaturaCancelada: true,
      mensagem: 'Assinatura recorrente cancelada com sucesso.'
    });

  } catch (erro) {
    console.error('Erro ao cancelar assinatura:', erro);

    if (
      erro.code === 'auth/id-token-expired' ||
      erro.code === 'auth/argument-error' ||
      erro.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        erro: 'Sua sessão expirou. Entre novamente.'
      });
    }

    return res.status(erro.status || 500).json({
      erro: erro.status === 502
        ? erro.message
        : 'Não foi possível cancelar a assinatura neste momento.'
    });
  }
};
