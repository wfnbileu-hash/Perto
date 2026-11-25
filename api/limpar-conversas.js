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
    const limite = admin.firestore.Timestamp.fromMillis(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    const conversasAntigas = await db.collection('conversas')
      .where('atualizadoEm', '<=', limite)
      .limit(25)
      .get();

    let removidas = 0;

    for (const conversa of conversasAntigas.docs) {
      // Remove também mensagens, ofertas e quaisquer outras subcoleções.
      await db.recursiveDelete(conversa.ref);
      removidas++;
    }

    return res.status(200).json({
      sucesso: true,
      conversasRemovidas: removidas,
      limiteInatividadeDias: 7
    });
  } catch (erro) {
    console.error('Erro ao limpar conversas antigas:', erro);
    return res.status(500).send('Erro ao limpar conversas antigas');
  }
};
