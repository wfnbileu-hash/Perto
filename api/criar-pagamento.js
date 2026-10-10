
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

const planos = {
  basico: {
    titulo: 'Turbinar anúncio - Básico',
    valor: 4.90,
    dias: 1
  },
  destaque: {
    titulo: 'Turbinar anúncio - Destaque',
    valor: 9.90,
    dias: 3
  },
  turbo: {
    titulo: 'Turbinar anúncio - Turbo',
    valor: 19.90,
    dias: 7
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({
      erro: 'Método não permitido'
    });
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
        erro: 'Faça login para turbinar o anúncio'
      });
    }

    const { produtoId, plano: nomePlano } = req.body || {};
    const plano = planos[nomePlano];

    if (
      typeof produtoId !== 'string' ||
      !produtoId.trim() ||
      produtoId.length > 150 ||
      !plano
    ) {
      return res.status(400).json({
        erro: 'Anúncio ou plano inválido'
      });
    }

    iniciarFirebase();

    const usuario = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();

    const produtoRef = db.collection('produtos').doc(produtoId);
    const produtoSnap = await produtoRef.get();

    if (!produtoSnap.exists) {
      return res.status(404).json({
        erro: 'Anúncio não encontrado'
      });
    }

    const produto = produtoSnap.data();

    if (produto.vendedorId !== usuario.uid) {
      return res.status(403).json({
        erro: 'Você só pode turbinar seus próprios anúncios'
      });
    }

    const pagamentoRef = db.collection('pagamentosTurbo').doc();

    await pagamentoRef.set({
      produtoId,
      vendedorId: usuario.uid,
      plano: nomePlano,
      valor: plano.valor,
      dias: plano.dias,
      status: 'pendente',
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    const resposta = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenMP}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [
            {
              id: produtoId,
              title: plano.titulo,
              description: `Destaque do anúncio por ${plano.dias} dia(s)`,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: plano.valor
            }
          ],
          external_reference: pagamentoRef.id,
          notification_url: `${site.replace(/\/$/, '')}/api/webhook-mercadopago`,
          back_urls: {
            success: site,
            failure: site,
            pending: site
          },
          metadata: {
            pagamentoTurboId: pagamentoRef.id,
            produtoId,
            vendedorId: usuario.uid,
            plano: nomePlano
          },
          statement_descriptor: 'PERTO',
          expires: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString()
        })
      }
    );

    const dados = await resposta.json();

    if (!resposta.ok || !dados.init_point) {
      console.error('Erro Mercado Pago:', dados);

      await pagamentoRef.update({
        status: 'erro_criacao',
        erroEm: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(502).json({
        erro: 'Não foi possível criar o pagamento'
      });
    }

    await pagamentoRef.update({
      preferenciaId: String(dados.id)
    });

    return res.status(200).json({
      checkout_url: dados.init_point
    });

  } catch (erro) {
    console.error('Erro ao criar pagamento:', erro);

    if (erro.code === 'auth/id-token-expired' ||
        erro.code === 'auth/argument-error' ||
        erro.code === 'auth/invalid-id-token') {
      return res.status(401).json({
        erro: 'Sua sessão expirou. Entre novamente.'
      });
    }

    return res.status(500).json({
      erro: 'Erro ao preparar o pagamento'
    });
  }
};

