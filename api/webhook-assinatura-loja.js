const crypto = require('crypto');
const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return admin.firestore();

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credencial))
  });
  return admin.firestore();
}

function validarAssinatura(req, recursoId) {
  const segredo = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const assinatura = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];

  if (!segredo || !assinatura || !requestId || !recursoId) return false;

  const partes = {};
  assinatura.split(',').forEach(parte => {
    const [chave, valor] = parte.trim().split('=');
    if (chave && valor) partes[chave] = valor;
  });

  if (!partes.ts || !partes.v1) return false;

  const manifesto =
    `id:${String(recursoId).toLowerCase()};` +
    `request-id:${requestId};` +
    `ts:${partes.ts};`;

  const esperado = crypto.createHmac('sha256', segredo)
    .update(manifesto).digest('hex');

  const recebido = Buffer.from(partes.v1, 'hex');
  const calculado = Buffer.from(esperado, 'hex');

  return recebido.length === calculado.length &&
    crypto.timingSafeEqual(recebido, calculado);
}

async function consultarMP(url, token) {
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) throw new Error('Falha ao consultar Mercado Pago');
  return dados;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Método não permitido');
  }

  try {
    const tipo = String(
      req.query?.type || req.query?.topic || req.body?.type || ''
    );
    const recursoId = String(
      req.query?.['data.id'] || req.body?.data?.id || ''
    );

    if (!validarAssinatura(req, recursoId)) {
      return res.status(401).send('Assinatura inválida');
    }

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) return res.status(500).send('Mercado Pago não configurado');

    const db = iniciarFirebase();

    if (tipo === 'subscription_preapproval') {
      const assinatura = await consultarMP(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(recursoId)}`,
        token
      );

      const uid = String(assinatura.external_reference || '');
      if (!uid || !assinatura.id) {
        return res.status(200).send('Assinatura ignorada');
      }

      const ref = db.collection('mensalidadesLojas').doc(uid);
      const snap = await ref.get();

      if (!snap.exists ||
          String(snap.data().assinaturaId) !== String(assinatura.id)) {
        return res.status(200).send('Assinatura não vinculada ao Perto');
      }

      const registroAtual = snap.data();

if (
  registroAtual.cancelamentoOrigem === 'solicitacao_loja' ||
  Boolean(registroAtual.canceladaEm)
) {
  return res.status(200).send(
    'Assinatura já cancelada no Perto; notificação ignorada'
  );
}

      const atualizacao = {
        status: String(assinatura.status || 'unknown'),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      };

      const proximoVencimento = assinatura.next_payment_date
        ? new Date(assinatura.next_payment_date)
        : null;

      if (proximoVencimento &&
          !Number.isNaN(proximoVencimento.getTime())) {
        const carenciaAte = new Date(proximoVencimento);
        carenciaAte.setDate(carenciaAte.getDate() + 5);

        atualizacao.mensalidadeVenceEm =
          admin.firestore.Timestamp.fromDate(proximoVencimento);
        atualizacao.mensalidadeCarenciaAte =
          admin.firestore.Timestamp.fromDate(carenciaAte);
        atualizacao.vencimentoPendente = false;
      }

      await ref.set(atualizacao, { merge: true });

      return res.status(200).send('Assinatura atualizada');
    }

    if (tipo === 'subscription_authorized_payment') {
      const cobranca = await consultarMP(
        `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(recursoId)}`,
        token
      );

      const assinaturaId = String(
        cobranca.preapproval_id || cobranca.subscription_id || ''
      );

      if (!assinaturaId) {
        return res.status(200).send('Cobrança sem assinatura vinculada');
      }

      const consulta = await db.collection('mensalidadesLojas')
        .where('assinaturaId', '==', assinaturaId).limit(1).get();

      if (consulta.empty) {
        return res.status(200).send('Assinatura não encontrada no Perto');
      }

      const docMensalidade = consulta.docs[0];
      const registro = docMensalidade.data();
      const idCobrancaAtual = String(cobranca.id || recursoId);

      if (
        registro.ultimaCobrancaId === idCobrancaAtual &&
        registro.ultimoPagamentoStatus === 'approved'
      ) {
        return res.status(200).send('Cobrança já processada');
      }

      const statusCobranca = String(
        cobranca.payment?.status || cobranca.status || ''
      ).toLowerCase();
      const valorPago = Number(
        cobranca.payment?.transaction_amount ?? cobranca.transaction_amount
      );
      const valorEsperado = Number(registro.valorAtual);

      if (statusCobranca !== 'approved') {
        await docMensalidade.ref.set({
          ultimoPagamentoStatus: statusCobranca || 'unknown',
          ultimaCobrancaId: String(cobranca.id || recursoId),
          ultimoPagamentoAtualizadoEm:
            admin.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return res.status(200).send('Cobrança ainda não aprovada');
      }

      if (!Number.isFinite(valorPago) ||
          !Number.isFinite(valorEsperado) ||
          Math.abs(valorPago - valorEsperado) >= 0.01) {
        console.error('Valor de mensalidade divergente:', {
          assinaturaId,
          valorPago,
          valorEsperado
        });
        return res.status(200).send('Valor da cobrança não confere');
      }

      const assinaturaAtual = await consultarMP(
        `https://api.mercadopago.com/preapproval/${encodeURIComponent(assinaturaId)}`,
        token
      );

      const proximoVencimento = assinaturaAtual.next_payment_date
        ? new Date(assinaturaAtual.next_payment_date)
        : null;

      const vencimentoValido = proximoVencimento &&
        !Number.isNaN(proximoVencimento.getTime());

      const atualizacao = {
        status: String(assinaturaAtual.status || 'authorized'),
        ultimaCobrancaId: String(cobranca.id || recursoId),
        ultimoPagamentoStatus: 'approved',
        ultimoPagamentoValor: valorPago,
        ultimoPagamentoAprovadoEm:
          admin.firestore.FieldValue.serverTimestamp(),
        vencimentoPendente: !vencimentoValido,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      };

      if (vencimentoValido) {
        const carenciaAte = new Date(proximoVencimento);
        carenciaAte.setDate(carenciaAte.getDate() + 5);

        atualizacao.mensalidadeVenceEm =
          admin.firestore.Timestamp.fromDate(proximoVencimento);
        atualizacao.mensalidadeCarenciaAte =
          admin.firestore.Timestamp.fromDate(carenciaAte);
      }

      await docMensalidade.ref.set(atualizacao, { merge: true });

      if (!vencimentoValido) {
        console.error('Pagamento aprovado; vencimento pendente:', assinaturaId);
        return res.status(200).send(
          'Pagamento aprovado e registrado; vencimento pendente de confirmação'
        );
      }

      const lojaRef = db.collection('lojas').doc(docMensalidade.id);
      const lojaSnap = await lojaRef.get();

      const mensalidadeAtualSnap = await docMensalidade.ref.get();
const mensalidadeAtual = mensalidadeAtualSnap.data() || {};

const assinaturaCancelada =
  mensalidadeAtual.cancelamentoOrigem === 'solicitacao_loja' ||
  Boolean(mensalidadeAtual.canceladaEm);

if (
  lojaSnap.exists &&
  !assinaturaCancelada &&
  String(lojaSnap.data().statusAdmin || '').toLowerCase() !== 'suspensa'
) {
  await lojaRef.set({
    ativo: true,
    mensalidadeAtualizadaEm:
      admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

      return res.status(200).send('Cobrança aprovada e mensalidade atualizada');
    }

    if (tipo === 'payment') {
      const pagamento = await consultarMP(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(recursoId)}`,
        token
      );

      const uid = String(pagamento.external_reference || '');
      if (!uid) return res.status(200).send('Pagamento ignorado');

      const ref = db.collection('mensalidadesLojas').doc(uid);
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(200).send('Pagamento não vinculado ao Perto');
      }

      const registro = snap.data();
      const valorPago = Number(pagamento.transaction_amount);

      if (String(pagamento.status).toLowerCase() === 'approved' &&
          Number.isFinite(valorPago) &&
          Math.abs(valorPago - Number(registro.valorAtual)) < 0.01) {
        await ref.set({
          ultimoPagamentoStatus: 'approved',
          ultimoPagamentoId: String(pagamento.id || recursoId),
          ultimoPagamentoValor: valorPago,
          ultimoPagamentoAprovadoEm:
            admin.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      return res.status(200).send('Notificação de pagamento processada');
    }

    return res.status(200).send('Evento ignorado');
  } catch (erro) {
    console.error('Erro no webhook de mensalidade:', erro);
    return res.status(500).send('Erro ao processar notificação');
  }
};
