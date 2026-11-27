
const admin = require('firebase-admin');

const ADMIN_UID = 'priTvSNohaYXaa0XW0ulUkTtaLI3';

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
        erro: 'Autenticação necessária.'
      });
    }

    iniciarFirebase();

    const usuario = await admin.auth().verifyIdToken(idToken);

    if (usuario.uid !== ADMIN_UID) {
      return res.status(403).json({
        erro: 'Acesso restrito ao administrador.'
      });
    }

    const { reelId } = req.body || {};

    if (
      typeof reelId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(reelId)
    ) {
      return res.status(400).json({
        erro: 'Identificação do vídeo inválida.'
      });
    }

    const db = admin.firestore();
    const reelRef = db.collection('reels').doc(reelId);
    const reelSnap = await reelRef.get();

    if (!reelSnap.exists) {
      return res.status(404).json({
        erro: 'Vídeo não encontrado.'
      });
    }

    const reel = reelSnap.data();
    const videoUrl = String(reel.videoUrl || '');

    // Remove o arquivo original do Firebase Storage.
    if (
      videoUrl.includes('firebasestorage.googleapis.com')
    ) {
      const url = new URL(videoUrl);

      const objectPath = decodeURIComponent(
        url.pathname.split('/o/')[1] || ''
      );

      const prefixo = `reels/${reel.vendedorId}/${reelId}.`;

      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'firebasestorage.googleapis.com' ||
        !objectPath.startsWith(prefixo) ||
        !/\.(mp4|webm|mov)$/.test(objectPath)
      ) {
        return res.status(400).json({
          erro: 'Arquivo do vídeo não reconhecido com segurança.'
        });
      }

      const bucket = admin.storage().bucket(
        'perto-65099.firebasestorage.app'
      );

      await bucket.file(objectPath).delete({
        ignoreNotFound: true
      });
    } else if (
      !videoUrl.includes('youtube.com') &&
      !videoUrl.includes('youtu.be') &&
      !videoUrl.includes('youtube-nocookie.com')
    ) {
      return res.status(400).json({
        erro: 'Origem do vídeo não reconhecida.'
      });
    }

    // Localiza as denúncias vinculadas ao Reel.
    const denuncias = await db.collection('denunciasReels')
      .where('reelId', '==', reelId)
      .get();

    // Exclui denúncias e registro do Reel.
    const documentos = denuncias.docs;

    if (documentos.length === 0) {
      await reelRef.delete();
    } else {
      for (let i = 0; i < documentos.length; i += 450) {
        const lote = db.batch();
        const grupo = documentos.slice(i, i + 450);

        grupo.forEach(documento => {
          lote.delete(documento.ref);
        });

        if (i + 450 >= documentos.length) {
          lote.delete(reelRef);
        }

        await lote.commit();
      }
    }

    return res.status(200).json({
      sucesso: true,
      denunciasExcluidas: documentos.length
    });

  } catch (erro) {
    console.error('Erro ao excluir Reel:', erro);

    if (
      erro.code === 'auth/id-token-expired' ||
      erro.code === 'auth/argument-error' ||
      erro.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({
        erro: 'Sessão inválida ou expirada.'
      });
    }

    return res.status(500).json({
      erro: 'Não foi possível excluir o vídeo.'
    });
  }
};
