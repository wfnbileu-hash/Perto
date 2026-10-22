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

    return res.status(200).json({
      sucesso: true,
      verificadas: vencidas.size,
      desativadas,
      ignoradas
    });
  } catch (erro) {
    console.error('Erro ao verificar mensalidades:', erro);
    return res.status(500).send('Erro ao verificar mensalidades');
  }
};
