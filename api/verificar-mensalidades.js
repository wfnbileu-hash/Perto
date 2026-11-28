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

async function criarLembreteMensalidade(db, {
  tipo,
  entidadeId,
  destinatarioId,
  vencimento,
  valor,
  nome
}) {
  if (!destinatarioId || !vencimento || typeof vencimento.toMillis !== 'function') {
    return false;
  }

  const vencimentoMillis = vencimento.toMillis();
  const diasRestantes = Math.ceil((vencimentoMillis - Date.now()) / 86400000);
  if (diasRestantes > 5) return false;

  const fase = diasRestantes <= 0 ? 'vencimento' : 'proximo_vencimento';
  const chave = crypto.createHash('sha256')
    .update(`${tipo}:${entidadeId}:${vencimentoMillis}:${fase}`)
    .digest('hex');
  const notificacaoRef = db.collection('notificacoes').doc(`mensalidade_${chave}`);
  const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(vencimento.toDate());
  const valorNumerico = Number(valor);
  const valorFormatado = Number.isFinite(valorNumerico)
    ? ` Valor: R$ ${valorNumerico.toFixed(2).replace('.', ',')}.`
    : '';
  const titulo = fase === 'vencimento'
    ? `⚠️ Mensalidade ${diasRestantes < 0 ? 'vencida' : 'vence hoje'}`
    : '🔔 Mensalidade próxima do vencimento';
  const prazo = fase === 'vencimento'
    ? `O vencimento foi ${dataFormatada}.`
    : `Vence em ${diasRestantes} ${diasRestantes === 1 ? 'dia' : 'dias'} (${dataFormatada}).`;
  const destino = tipo === 'mensalidade_loja' ? 'Minha loja' : 'Perto Profissionais';
  const mensagem = `${nome ? `${nome}: ` : ''}${prazo}${valorFormatado} Acesse ${destino} e toque em “Pagar mensalidade” para gerar o Pix.`;

  try {
    await notificacaoRef.create({
      destinatarioId,
      titulo,
      mensagem,
      tipo,
      entidadeId,
      vencimentoEm: vencimento,
      lida: false,
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });
    return true;
  } catch (erro) {
    if (erro.code === 6 || erro.code === 'already-exists') return false;
    throw erro;
  }
}

async function emitirLembretes(db) {
  const limite = admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 86400000);
  const [lojas, profissionais] = await Promise.all([
    db.collection('mensalidadesLojas')
      .where('mensalidadeVenceEm', '<=', limite)
      .get(),
    db.collection('mensalidadesEstabelecimentosProfissionais')
      .where('mensalidadeVenceEm', '<=', limite)
      .get()
  ]);

  let criados = 0;

  for (const documento of lojas.docs) {
    const mensalidade = documento.data();
    if (mensalidade.status !== 'authorized') continue;

    if (await criarLembreteMensalidade(db, {
      tipo: 'mensalidade_loja',
      entidadeId: documento.id,
      destinatarioId: documento.id,
      vencimento: mensalidade.mensalidadeVenceEm,
      valor: mensalidade.valorAtual,
      nome: 'Sua loja'
    })) criados++;
  }

  for (const documento of profissionais.docs) {
    const mensalidade = documento.data();
    if (mensalidade.status !== 'authorized') continue;

    if (await criarLembreteMensalidade(db, {
      tipo: 'mensalidade_profissional',
      entidadeId: documento.id,
      destinatarioId: mensalidade.proprietarioId,
      vencimento: mensalidade.mensalidadeVenceEm,
      valor: mensalidade.valorAtual,
      nome: `Estabelecimento ${mensalidade.numeroEstabelecimento || ''}`.trim()
    })) criados++;
  }

  return criados;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).send('Método não permitido');
  }

  const segredo = process.env.CRON_SECRET;
  const autorizacao = req.headers.authorization || '';

  if (!segredo || autorizacao !== `Bearer ${segredo}`) {
    return res.status(401).send('Não autorizado');
  }

  try {
    const db = iniciarFirebase();
    const agora = admin.firestore.Timestamp.now();
    const lembretesCriados = await emitirLembretes(db);

    const vencidas = await db.collection('mensalidadesLojas')
      .where('mensalidadeCarenciaAte', '<=', agora)
      .get();

    let desativadas = 0;
    let ignoradas = 0;

    for (const doc of vencidas.docs) {
      const mensalidadeRef = db.collection('mensalidadesLojas').doc(doc.id);
      const lojaRef = db.collection('lojas').doc(doc.id);

      const resultado = await db.runTransaction(async (transacao) => {
        const [mensalidadeSnap, lojaSnap] = await Promise.all([
          transacao.get(mensalidadeRef),
          transacao.get(lojaRef)
        ]);

        if (!mensalidadeSnap.exists || !lojaSnap.exists) {
          return 'ignorada';
        }

        const mensalidadeAtual = mensalidadeSnap.data();
        const lojaAtual = lojaSnap.data();

        if (mensalidadeAtual.vencimentoPendente === true) {
          return 'ignorada';
        }

        const carenciaAtual = mensalidadeAtual.mensalidadeCarenciaAte;

        if (
          !carenciaAtual ||
          typeof carenciaAtual.toMillis !== 'function' ||
          carenciaAtual.toMillis() > Date.now()
        ) {
          return 'ignorada';
        }

        if (
          String(lojaAtual.statusAdmin || '').toLowerCase() === 'suspensa' ||
          lojaAtual.ativo !== true
        ) {
          return 'ignorada';
        }

        transacao.set(lojaRef, {
          ativo: false,
          mensalidadeDesativadaEm: admin.firestore.FieldValue.serverTimestamp(),
          motivoDesativacao: 'mensalidade_em_atraso'
        }, { merge: true });

        return 'desativada';
      });

      if (resultado === 'desativada') {
        desativadas++;
      } else {
        ignoradas++;
      }
    }

        const profissionaisAtivos = await db.collection('estabelecimentosProfissionais')
      .where('ativo', '==', true)
      .get();
    
    let estabelecimentosDesativados = 0;
    let estabelecimentosIgnorados = 0;
    
    for (const estabelecimentoDoc of profissionaisAtivos.docs) {
      const mensalidadeRef = db.collection('mensalidadesEstabelecimentosProfissionais').doc(estabelecimentoDoc.id);
      const estabelecimentoRef = db.collection('estabelecimentosProfissionais').doc(estabelecimentoDoc.id);
      
      const resultado = await db.runTransaction(async transacao => {
        const [mensalidadeSnap, estabelecimentoSnap] = await Promise.all([
          transacao.get(mensalidadeRef),
          transacao.get(estabelecimentoRef)
        ]);
        
        if (!estabelecimentoSnap.exists) return 'ignorada';
        
        const estabelecimento = estabelecimentoSnap.data();
        const mensalidade = mensalidadeSnap.exists ? mensalidadeSnap.data() : {};
        
        if (
          estabelecimento.ativo !== true ||
          String(estabelecimento.statusAdmin || '').toLowerCase() === 'suspenso' ||
          mensalidade.vencimentoPendente === true
        ) return 'ignorada';
        
        let carenciaMillis = 0;
        
        if (
          mensalidade.mensalidadeCarenciaAte &&
          typeof mensalidade.mensalidadeCarenciaAte.toMillis === 'function'
        ) {
          carenciaMillis = mensalidade.mensalidadeCarenciaAte.toMillis();
          
        } else if (
          mensalidade.mensalidadeVenceEm &&
          typeof mensalidade.mensalidadeVenceEm.toMillis === 'function'
        ) {
          carenciaMillis =
            mensalidade.mensalidadeVenceEm.toMillis() + 5 * 86400000;
          
        } else {
          const aprovacao = estabelecimento.aprovadoEm?.toDate?.();
          
          if (!aprovacao || Number.isNaN(aprovacao.getTime())) {
            return 'ignorada';
          }
          
                    const proximoMes = aprovacao.getUTCMonth() + 1;
          const anoVencimento =
            aprovacao.getUTCFullYear() + Math.floor(proximoMes / 12);
          const mesVencimento = proximoMes % 12;
          
          const ultimoDia = new Date(
            Date.UTC(anoVencimento, mesVencimento + 1, 0)
          ).getUTCDate();
          
          const dia = Math.min(aprovacao.getUTCDate(), ultimoDia);
          
          const primeiroVencimento = new Date(Date.UTC(
            anoVencimento,
            mesVencimento,
            dia,
            aprovacao.getUTCHours(),
            aprovacao.getUTCMinutes(),
            aprovacao.getUTCSeconds(),
            aprovacao.getUTCMilliseconds()
          ));
          carenciaMillis = primeiroVencimento.getTime() + 5 * 86400000;
        }
        
        if (!carenciaMillis || carenciaMillis > Date.now()) {
          return 'aguardando';
        }
        
        transacao.set(estabelecimentoRef, {
          ativo: false,
          mensalidadeDesativadaEm: admin.firestore.FieldValue.serverTimestamp(),
          motivoDesativacao: 'mensalidade_em_atraso'
        }, { merge: true });
        
        return 'desativada';
      });
      
      if (resultado === 'desativada') estabelecimentosDesativados++;
      else estabelecimentosIgnorados++;
    }
    return res.status(200).json({
      sucesso: true,
      lembretesCriados,
      verificadas: vencidas.size + vencidasProfissionais.size,
      desativadas,
      ignoradas,
      estabelecimentosProfissionaisVerificados: profissionaisAtivos.size,
      estabelecimentosProfissionaisDesativados: estabelecimentosDesativados,
      estabelecimentosProfissionaisIgnorados: estabelecimentosIgnorados
    });
  } catch (erro) {
    console.error('Erro ao verificar mensalidades:', erro);
    return res.status(500).send('Erro ao verificar mensalidades');
  }
};
