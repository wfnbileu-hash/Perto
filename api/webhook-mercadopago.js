
const crypto = require('crypto');
const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return admin.firestore();

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!credencial) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');
  }

  const serviceAccount = JSON.parse(credencial);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return admin.firestore();
}

function validarAssinatura(req) {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const assinatura = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const pagamentoId = req.query?.['data.id'] || req.body?.data?.id;

  if (!segredo || !assinatura || !requestId || !pagamentoId) {
    return false;
  }

  const partes = {};

  assinatura.split(',').forEach(parte => {
    const [chave, valor] = parte.trim().split('=');
    if (chave && valor) partes[chave] = valor;
  });

  if (!partes.ts || !partes.v1) return false;

  const manifesto =
    `id:${String(pagamentoId).toLowerCase()};` +
    `request-id:${requestId};` +
    `ts:${partes.ts};`;

  const esperado = crypto
    .createHmac('sha256', segredo)
    .update(manifesto)
    .digest('hex');

  const recebido = Buffer.from(partes.v1, 'hex');
  const calculado = Buffer.from(esperado, 'hex');

  return recebido.length === calculado.length &&
    crypto.timingSafeEqual(recebido, calculado);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Método não permitido');
  }

  try {
    if (!validarAssinatura(req)) {
      return res.status(401).send('Assinatura inválida');
    }

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;

    if (!token) {
      return res.status(500).send('Mercado Pago não configurado');
    }

    const pagamentoId = req.query?.['data.id'] || req.body?.data?.id;

    const resposta = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(pagamentoId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!resposta.ok) {
      return res.status(502).send('Não foi possível consultar o pagamento');
    }

    const pagamento = await resposta.json();

    if (pagamento.status !== 'approved') {
      return res.status(200).send('Pagamento ainda não aprovado');
    }

    const referencia = pagamento.external_reference;

    if (!referencia) {
      return res.status(400).send('Referência do pagamento ausente');
    }

    const db = iniciarFirebase();
    const pagamentoRef = db.collection('pagamentosTurbo').doc(referencia);
    const registro = await pagamentoRef.get();

    if (!registro.exists) {
      return res.status(404).send('Pagamento não localizado');
    }

    const dados = registro.data();

    if (
      pagamento.currency_id !== 'BRL' ||
      Number(pagamento.transaction_amount) !== Number(dados.valor)
    ) {
      return res.status(400).send('Valor ou moeda não conferem');
    }

    const planos = {
      basico: { valor: 4.90, dias: 1 },
      destaque: { valor: 9.90, dias: 3 },
      turbo: { valor: 19.90, dias: 7 }
    };

    const plano = planos[dados.plano];

    if (
      !plano ||
      Number(dados.valor) !== plano.valor ||
      Number(dados.dias) !== plano.dias
    ) {
      return res.status(400).send('Plano inválido');
    }

    await db.runTransaction(async transacao => {
      const pagamentoAtual = await transacao.get(pagamentoRef);

      if (!pagamentoAtual.exists) {
        throw new Error('Registro de pagamento ausente');
      }

      if (pagamentoAtual.data().status === 'aprovado') {
        return;
      }

      const produtoRef = db.collection('produtos').doc(dados.produtoId);
      const produto = await transacao.get(produtoRef);

      if (!produto.exists) {
        throw new Error('Anúncio não encontrado');
      }

      if (produto.data().vendedorId !== dados.vendedorId) {
        throw new Error('Vendedor não confere');
      }

      const agora = new Date();
      const atual = produto.data();
      const fimAtual = atual.turbinadoAte?.toDate?.();
      const inicio = atual.turbinado && fimAtual && fimAtual > agora
        ? fimAtual
        : agora;

      const turbinadoAte = new Date(
        inicio.getTime() + plano.dias * 24 * 60 * 60 * 1000
      );

      transacao.update(produtoRef, {
        turbinado: true,
        planoTurbo: dados.plano,
        turbinadoAte: admin.firestore.Timestamp.fromDate(turbinadoAte),
        turbinadoEm: admin.firestore.FieldValue.serverTimestamp(),
        prioridade: 1
      });

      transacao.update(pagamentoRef, {
        status: 'aprovado',
        mercadoPagoPagamentoId: String(pagamentoId),
        aprovadoEm: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return res.status(200).send('Pagamento processado');
  } catch (erro) {
    console.error('Erro no webhook Mercado Pago:', erro);
    return res.status(500).send('Erro ao processar pagamento');
  }
};
