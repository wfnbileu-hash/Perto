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

           const versaoMP = Number(assinatura.version);
      
      if (!Number.isSafeInteger(versaoMP) || versaoMP < 0) {
        return res.status(200).send('Versão da assinatura inválida');
      }
      
      const atualizacao = {
        status: String(assinatura.status || 'unknown'),
        versaoAssinaturaMP: versaoMP,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      };
      
      const proximoVencimento = assinatura.next_payment_date ?
        new Date(assinatura.next_payment_date) :
        null;
      
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
      
      const resultado = await db.runTransaction(async transacao => {
        const mensalidadeAtual = await transacao.get(ref);
        
        if (!mensalidadeAtual.exists) {
          return 'nao_encontrada';
        }
        
        const dadosAtuais = mensalidadeAtual.data();
        
        if (
          String(dadosAtuais.assinaturaId) !== String(assinatura.id)
        ) {
          return 'nao_vinculada';
        }
        
        const versaoSalva = Number(dadosAtuais.versaoAssinaturaMP);
        
        if (
          Number.isSafeInteger(versaoSalva) &&
          versaoSalva > versaoMP
        ) {
          return 'antiga';
        }
        
        transacao.set(ref, atualizacao, { merge: true });
        return 'atualizada';
      });
      
      if (resultado === 'antiga') {
        return res.status(200).send('Notificação antiga ignorada');
      }
      
      if (resultado !== 'atualizada') {
        return res.status(200).send('Assinatura não vinculada ao Perto');
      }
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
        const pagamentoJaAprovado = await db.runTransaction(async transacao => {
          const mensalidadeAtual = await transacao.get(docMensalidade.ref);

          if (!mensalidadeAtual.exists) {
            throw new Error('Mensalidade da loja não encontrada');
          }

          const dadosAtuais = mensalidadeAtual.data();

          if (
            dadosAtuais.ultimaCobrancaId === idCobrancaAtual &&
            dadosAtuais.ultimoPagamentoStatus === 'approved'
          ) {
            return true;
          }

          transacao.set(docMensalidade.ref, {
            ultimoPagamentoStatus: statusCobranca || 'unknown',
            ultimaCobrancaId: idCobrancaAtual,
            ultimoPagamentoAtualizadoEm:
              admin.firestore.FieldValue.serverTimestamp(),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });

          return false;
        });

        if (pagamentoJaAprovado) {
          return res.status(200).send(
            'Notificação antiga ignorada; pagamento já aprovado'
          );
        }

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

       const versaoAssinaturaMP = Number(assinaturaAtual.version);
      const versaoValida = Number.isSafeInteger(versaoAssinaturaMP) &&
        versaoAssinaturaMP >= 0;

      const atualizacao = {
        ultimaCobrancaId: String(cobranca.id || recursoId),
        ultimoPagamentoStatus: 'approved',
        ultimoPagamentoValor: valorPago,
        ultimoPagamentoAprovadoEm:
          admin.firestore.FieldValue.serverTimestamp(),
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      };

      if (versaoValida) {
        atualizacao.status = String(assinaturaAtual.status || 'authorized');
        atualizacao.versaoAssinaturaMP = versaoAssinaturaMP;
      }

      if (vencimentoValido) {
        const carenciaAte = new Date(proximoVencimento);
        carenciaAte.setDate(carenciaAte.getDate() + 5);

        atualizacao.mensalidadeVenceEm =
          admin.firestore.Timestamp.fromDate(proximoVencimento);
        atualizacao.mensalidadeCarenciaAte =
          admin.firestore.Timestamp.fromDate(carenciaAte);
        atualizacao.vencimentoPendente = false;
      } else {
        atualizacao.vencimentoPendente = true;
      }

      await db.runTransaction(async transacao => {
        const mensalidadeAtual = await transacao.get(docMensalidade.ref);

        if (!mensalidadeAtual.exists) {
          throw new Error('Mensalidade da loja não encontrada');
        }

        const dadosAtuais = mensalidadeAtual.data();

        if (
          dadosAtuais.ultimaCobrancaId === idCobrancaAtual &&
          dadosAtuais.ultimoPagamentoStatus === 'approved'
        ) {
          return;
        }

        const versaoSalva = Number(dadosAtuais.versaoAssinaturaMP);
        const atualizacaoSegura = { ...atualizacao };

        if (
          versaoValida &&
          Number.isSafeInteger(versaoSalva) &&
          versaoSalva > versaoAssinaturaMP
        ) {
          delete atualizacaoSegura.status;
          delete atualizacaoSegura.versaoAssinaturaMP;
          delete atualizacaoSegura.mensalidadeVenceEm;
          delete atualizacaoSegura.mensalidadeCarenciaAte;
          delete atualizacaoSegura.vencimentoPendente;
        }

        transacao.set(
          docMensalidade.ref,
          atualizacaoSegura,
          { merge: true }
        );
      });

if (!vencimentoValido) {
        console.error('Pagamento aprovado; vencimento pendente:', assinaturaId);
        return res.status(200).send(
          'Pagamento aprovado e registrado; vencimento pendente de confirmação'
        );
      }

      const lojaRef = db.collection('lojas').doc(docMensalidade.id);
      const lojaSnap = await lojaRef.get();

      if (lojaSnap.exists &&
          String(lojaSnap.data().statusAdmin || '').toLowerCase() !== 'suspensa') {
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

      const referencia = String(pagamento.external_reference || '');
      if (!referencia) {
        return res.status(200).send('Pagamento ignorado');
      }

      // Mensalidades do módulo Perto Profissionais.
      const pagamentoProfissionalRef = db
        .collection('pagamentosMensalidadeProfissionais')
        .doc(referencia);
      const pagamentoProfissionalSnap = await pagamentoProfissionalRef.get();

      if (pagamentoProfissionalSnap.exists) {
        const registro = pagamentoProfissionalSnap.data();
        const estabelecimentoId = String(registro.estabelecimentoId || '');
        const valorPago = Number(pagamento.transaction_amount);
        const valorEsperado = Number(registro.valor);
        const statusMP = String(pagamento.status || '').toLowerCase();

        if (
          !estabelecimentoId ||
          String(registro.pagamentoId) !== String(pagamento.id) ||
          !Number.isFinite(valorPago) ||
          !Number.isFinite(valorEsperado) ||
          Math.abs(valorPago - valorEsperado) >= 0.01 ||
          String(pagamento.currency_id || '') !== 'BRL'
        ) {
          console.error('Dados do Pix Perto Profissionais não conferem.');
          return res.status(200).send('Pagamento profissional não validado');
        }

        
        const mensalidadeRef = db
          .collection('mensalidadesEstabelecimentosProfissionais')
          .doc(estabelecimentoId);

        const estabelecimentoRef = db
          .collection('estabelecimentosProfissionais')
          .doc(estabelecimentoId);

               if (statusMP !== 'approved') {
          await db.runTransaction(async transacao => {
            const pagamentoAtual = await transacao.get(pagamentoProfissionalRef);
            if (!pagamentoAtual.exists) return;
            
            const dadosAtuais = pagamentoAtual.data();
            if (dadosAtuais.processado === true) return;
            
            transacao.set(pagamentoProfissionalRef, {
              status: statusMP || 'unknown',
              atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          });
          
          return res.status(200).send('Pagamento profissional ainda não aprovado');
        }

        await db.runTransaction(async transacao => {
          const [
            pagamentoAtual,
            mensalidadeSnap,
            estabelecimentoSnap
          ] = await Promise.all([
            transacao.get(pagamentoProfissionalRef),
            transacao.get(mensalidadeRef),
            transacao.get(estabelecimentoRef)
          ]);

          
          if (!pagamentoAtual.exists || !mensalidadeSnap.exists) {
            throw new Error('Registro da mensalidade profissional não encontrado');
          }

          const dadosPagamento = pagamentoAtual.data();
if (dadosPagamento.processado === true) return;

          const mensalidade = mensalidadeSnap.data();
          const vencimentoAtual = mensalidade.mensalidadeVenceEm;
          const dataAtual = vencimentoAtual?.toDate ? vencimentoAtual.toDate() : null;
          const inicio = dataAtual && dataAtual > new Date() ? dataAtual : new Date();
          const vencimento = new Date(inicio);
          vencimento.setDate(vencimento.getDate() + 30);
          const carencia = new Date(vencimento);
          carencia.setDate(carencia.getDate() + 5);
          const servidorAgora = admin.firestore.FieldValue.serverTimestamp();

          transacao.set(pagamentoProfissionalRef, {
            status: 'approved',
            processado: true,
            aprovadoEm: servidorAgora,
            atualizadoEm: servidorAgora
          }, { merge: true });

          
          if (estabelecimentoSnap.exists) {
            const estabelecimento = estabelecimentoSnap.data();
            const suspensoPeloAdmin =
              String(estabelecimento.statusAdmin || '').toLowerCase() === 'suspenso';

            if (
              !suspensoPeloAdmin &&
              estabelecimento.motivoDesativacao === 'mensalidade_em_atraso'
            ) {
              transacao.set(estabelecimentoRef, {
                ativo: true,
                motivoDesativacao: admin.firestore.FieldValue.delete(),
                mensalidadeDesativadaEm: admin.firestore.FieldValue.delete(),
                mensalidadeAtualizadaEm: servidorAgora
              }, { merge: true });
            }
          }
          
          transacao.set(mensalidadeRef, {
            status: 'authorized',
            tipoCobranca: 'pix',
            ultimoPagamentoStatus: 'approved',
            ultimoPagamentoId: String(pagamento.id),
            ultimoPagamentoValor: valorPago,
            ultimoPagamentoAprovadoEm: servidorAgora,
            mensalidadeVenceEm: admin.firestore.Timestamp.fromDate(vencimento),
            mensalidadeCarenciaAte: admin.firestore.Timestamp.fromDate(carencia),
            vencimentoPendente: false,
            atualizadoEm: servidorAgora
          }, { merge: true });
        });

        return res.status(200).send('Mensalidade Perto Profissionais atualizada');
      }

      // Primeiro: identificar o novo Pix da mensalidade das lojas.
      const pagamentoRef = db
        .collection('pagamentosMensalidade')
        .doc(referencia);
      const pagamentoSnap = await pagamentoRef.get();

      if (pagamentoSnap.exists) {
        const registroPagamento = pagamentoSnap.data();
        const lojaId = String(registroPagamento.lojaId || '');
        const valorPago = Number(pagamento.transaction_amount);
        const valorEsperado = Number(registroPagamento.valor);
        const statusMP = String(pagamento.status || '').toLowerCase();
        const moeda = String(pagamento.currency_id || '');

        if (
          !lojaId ||
          String(registroPagamento.pagamentoId) !== String(pagamento.id) ||
          !Number.isFinite(valorPago) ||
          !Number.isFinite(valorEsperado) ||
          Math.abs(valorPago - valorEsperado) >= 0.01 ||
          moeda !== 'BRL'
        ) {
          console.error('Dados do Pix da mensalidade não conferem.');
          return res.status(200).send('Pagamento não validado');
        }

        const mensalidadeRef = db
          .collection('mensalidadesLojas')
          .doc(lojaId);
        const lojaRef = db.collection('lojas').doc(lojaId);

        if (statusMP !== 'approved') {
  await db.runTransaction(async transacao => {
    const pagamentoAtual = await transacao.get(pagamentoRef);
    if (!pagamentoAtual.exists) return;
    
    const dadosAtuais = pagamentoAtual.data();
    if (dadosAtuais.processado === true) return;
    
    transacao.set(pagamentoRef, {
      status: statusMP || 'unknown',
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
  
  return res.status(200).send('Pagamento ainda não aprovado');
}
        await db.runTransaction(async (transacao) => {
          const pagamentoAtual = await transacao.get(pagamentoRef);
          const mensalidadeSnap = await transacao.get(mensalidadeRef);
          const lojaSnap = await transacao.get(lojaRef);
          if (!pagamentoAtual.exists || !mensalidadeSnap.exists) {
            throw new Error('Registro da mensalidade não encontrado');
          }

          const dadosPagamento = pagamentoAtual.data();
if (dadosPagamento.processado === true) return;

          const agora = new Date();
          const dadosMensalidade = mensalidadeSnap.data();
          const vencimentoAtual = dadosMensalidade.mensalidadeVenceEm;
          const dataAtual = vencimentoAtual?.toDate ? vencimentoAtual.toDate() : null;
          const inicio = dataAtual && dataAtual > agora ? dataAtual : agora;
          const vencimento = new Date(inicio);
          vencimento.setDate(vencimento.getDate() + 30);
          const carencia = new Date(vencimento);
          carencia.setDate(carencia.getDate() + 5);
          const servidorAgora = admin.firestore.FieldValue.serverTimestamp();

          transacao.set(pagamentoRef, {
            status: 'approved',
            processado: true,
            aprovadoEm: servidorAgora,
            atualizadoEm: servidorAgora
          }, { merge: true });

          transacao.set(mensalidadeRef, {
            lojaId,
            status: 'authorized',
            tipoCobranca: 'pix',
            ultimoPagamentoStatus: 'approved',
            ultimoPagamentoId: String(pagamento.id),
            ultimoPagamentoValor: valorPago,
            ultimoPagamentoAprovadoEm: servidorAgora,
            mensalidadeVenceEm: admin.firestore.Timestamp.fromDate(vencimento),
            mensalidadeCarenciaAte: admin.firestore.Timestamp.fromDate(carencia),
            vencimentoPendente: false,
            atualizadoEm: servidorAgora
          }, { merge: true });

          if (lojaSnap.exists && String(lojaSnap.data().statusAdmin || '').toLowerCase() !== 'suspensa') {
            transacao.set(lojaRef, {
              ativo: true,
              mensalidadeAtualizadaEm: servidorAgora
            }, { merge: true });
          }
        });
        return res.status(200).send('Pix aprovado e mensalidade atualizada');
      }



      // Compatibilidade com pagamentos antigos vinculados diretamente ao UID.
      const uid = referencia;
      const ref = db.collection('mensalidadesLojas').doc(uid);
      const snap = await ref.get();

      if (!snap.exists) {
        return res.status(200).send('Pagamento não vinculado ao Perto');
      }

      const registro = snap.data();
      const valorPago = Number(pagamento.transaction_amount);

      if (
        String(pagamento.status).toLowerCase() === 'approved' &&
        String(pagamento.currency_id || '') === 'BRL' &&
        Number.isFinite(valorPago) &&
        Math.abs(valorPago - Number(registro.valorAtual)) < 0.01
      ) {
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
