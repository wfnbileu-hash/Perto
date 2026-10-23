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
      const assinaturaId = String(assinatura.id || '');

      if (!uid || !assinaturaId) {
        return res.status(200).send('Assinatura ignorada');
      }

      const ref = db.collection('mensalidadesLojas').doc(uid);

      const atualizacao = {
        status: String(assinatura.status || 'unknown'),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      };

      const proximoVencimento = assinatura.next_payment_date
        ? new Date(assinatura.next_payment_date)
        : null;

      if (
        proximoVencimento &&
        !Number.isNaN(proximoVencimento.getTime())
      ) {
        const carenciaAte = new Date(proximoVencimento);
        carenciaAte.setDate(carenciaAte.getDate() + 5);

        atualizacao.mensalidadeVenceEm =
          admin.firestore.Timestamp.fromDate(proximoVencimento);
        atualizacao.mensalidadeCarenciaAte =
          admin.firestore.Timestamp.fromDate(carenciaAte);
        atualizacao.vencimentoPendente = false;
      }

      const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);

        if (
          !snap.exists ||
          String(snap.data().assinaturaId || '') !== assinaturaId
        ) {
          return 'Assinatura não vinculada ao Perto';
        }

        const registroAtual = snap.data();

        if (
          registroAtual.cancelamentoOrigem === 'solicitacao_loja' ||
          Boolean(registroAtual.canceladaEm)
        ) {
          return 'Assinatura já cancelada no Perto; notificação ignorada';
        }

        tx.set(ref, atualizacao, { merge: true });
        return 'Assinatura atualizada';
      });

      return res.status(200).send(resultado);
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
        const registroAtualizado = await db.runTransaction(
          async (transacao) => {
            const mensalidadeSnap = await transacao.get(
              docMensalidade.ref
            );

            if (!mensalidadeSnap.exists) return false;

            const mensalidadeAtual = mensalidadeSnap.data();

            if (
              String(mensalidadeAtual.assinaturaId || '') !==
              assinaturaId
            ) {
              return false;
            }

            transacao.set(docMensalidade.ref, {
              ultimoPagamentoStatus: statusCobranca || 'unknown',
              ultimaCobrancaId: idCobrancaAtual,
              ultimoPagamentoAtualizadoEm:
                admin.firestore.FieldValue.serverTimestamp(),
              atualizadoEm:
                admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return true;
          }
        );

        return res.status(200).send(
          registroAtualizado
            ? 'Cobrança ainda não aprovada'
            : 'Notificação de assinatura antiga ignorada'
        );
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
      
      const lojaRef = db.collection('lojas').doc(docMensalidade.id);

      const resultado = await db.runTransaction(async (transacao) => {
        const mensalidadeSnap = await transacao.get(docMensalidade.ref);
        const lojaSnap = await transacao.get(lojaRef);

        if (!mensalidadeSnap.exists) {
          return 'mensalidade_nao_encontrada';
        }

        const mensalidadeAtual = mensalidadeSnap.data();

        // Ignora notificações de uma assinatura antiga.
        if (String(mensalidadeAtual.assinaturaId || '') !== assinaturaId) {
          return 'assinatura_alterada';
        }

        // Impede o processamento duplicado da mesma cobrança.
        if (
          mensalidadeAtual.ultimaCobrancaId === idCobrancaAtual &&
          mensalidadeAtual.ultimoPagamentoStatus === 'approved'
        ) {
          return 'ja_processada';
        }

        const assinaturaCancelada =
          mensalidadeAtual.cancelamentoOrigem === 'solicitacao_loja' ||
          Boolean(mensalidadeAtual.canceladaEm);

        const atualizacao = {
          status: assinaturaCancelada
            ? 'canceled'
            : String(assinaturaAtual.status || 'authorized'),
          ultimaCobrancaId: idCobrancaAtual,
          ultimoPagamentoStatus: 'approved',
          ultimoPagamentoValor: valorPago,
          ultimoPagamentoAprovadoEm:
            admin.firestore.FieldValue.serverTimestamp(),
          vencimentoPendente: !vencimentoValido,
          atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        };

        if (vencimentoValido && !assinaturaCancelada) {
          const carenciaAte = new Date(proximoVencimento);
          carenciaAte.setDate(carenciaAte.getDate() + 5);

          atualizacao.mensalidadeVenceEm =
            admin.firestore.Timestamp.fromDate(proximoVencimento);
          atualizacao.mensalidadeCarenciaAte =
            admin.firestore.Timestamp.fromDate(carenciaAte);
        }

        transacao.set(docMensalidade.ref, atualizacao, { merge: true });

        // Só reativa a loja se a assinatura continuar válida.
        if (
          vencimentoValido &&
          !assinaturaCancelada &&
          lojaSnap.exists &&
          String(lojaSnap.data().statusAdmin || '').toLowerCase() !== 'suspensa'
        ) {
          transacao.set(lojaRef, {
            ativo: true,
            mensalidadeAtualizadaEm:
              admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        }

        if (assinaturaCancelada) return 'assinatura_cancelada';
        if (!vencimentoValido) return 'vencimento_pendente';

        return 'atualizada';
      });

      if (
        resultado === 'assinatura_alterada' ||
        resultado === 'ja_processada' ||
        resultado === 'mensalidade_nao_encontrada'
      ) {
        return res.status(200).send(
          resultado === 'assinatura_alterada'
            ? 'Assinatura antiga ignorada'
            : resultado === 'ja_processada'
              ? 'Cobrança já processada'
              : 'Mensalidade não encontrada'
        );
      }

      if (resultado === 'assinatura_cancelada') {
        return res.status(200).send(
          'Pagamento registrado; assinatura continua cancelada'
        );
      }

      if (resultado === 'vencimento_pendente') {
        console.error('Pagamento aprovado; vencimento pendente:', assinaturaId);
        return res.status(200).send(
          'Pagamento aprovado e registrado; vencimento pendente de confirmação'
        );
      }

      return res.status(200).send(
        'Cobrança aprovada e mensalidade atualizada'
      );

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
