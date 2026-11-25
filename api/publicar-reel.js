const admin = require('firebase-admin');

function iniciarFirebase() {
  if (admin.apps.length) return;

  const credencial = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!credencial) throw new Error('FIREBASE_SERVICE_ACCOUNT não configurada');

  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(credencial))
  });
}

function validarVideoUrl(valor, uid) {
  try {
    const url = new URL(String(valor || ''));
    if (url.protocol !== 'https:') return false;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be') {
      return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.split('/').filter(Boolean)[0] || '');
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const partes = url.pathname.split('/').filter(Boolean);
      const id = url.searchParams.get('v') ||
        (['embed', 'shorts', 'live'].includes(partes[0]) ? partes[1] : '');
      return /^[A-Za-z0-9_-]{11}$/.test(id || '');
    }
    if (host !== 'firebasestorage.googleapis.com') return false;

    const caminhoDecodificado = decodeURIComponent(url.pathname);
    return caminhoDecodificado.includes(`/o/reels/${uid}/`);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    const autorizacao = req.headers.authorization || '';
    const idToken = autorizacao.startsWith('Bearer ') ? autorizacao.slice(7) : '';
    if (!idToken) {
      return res.status(401).json({ erro: 'Faça login para publicar vídeos.' });
    }

    iniciarFirebase();
    const usuario = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();
    const { reelId, produtoId, produtoColecao, videoUrl, legenda } = req.body || {};

    if (
      typeof reelId !== 'string' || !/^[A-Za-z0-9_-]{1,150}$/.test(reelId) ||
      typeof produtoId !== 'string' || !produtoId.trim() || produtoId.length > 150 ||
      !['produtos', 'produtosLoja'].includes(produtoColecao) ||
      typeof legenda !== 'string' || legenda.length > 300 ||
      !validarVideoUrl(videoUrl, usuario.uid)
    ) {
      return res.status(400).json({ erro: 'Dados do vídeo inválidos.' });
    }

    const [lojaSnap, estabelecimentosSnap] = await Promise.all([
      db.collection('lojas').doc(usuario.uid).get(),
      db.collection('estabelecimentosProfissionais')
        .where('proprietarioId', '==', usuario.uid)
        .get()
    ]);
    const loja = lojaSnap.exists ? lojaSnap.data() : null;
    const lojaAtiva = loja?.ativo === true && loja.statusAdmin !== 'suspensa';
    const estabelecimentoAtivo = estabelecimentosSnap.docs.some(documento => {
      const estabelecimento = documento.data();
      return estabelecimento.ativo === true && estabelecimento.statusAdmin !== 'suspenso';
    });

    if (!lojaAtiva && !estabelecimentoAtivo) {
      return res.status(403).json({
        erro: 'É necessário ter uma loja ou estabelecimento ativo para publicar vídeos.'
      });
    }

    const produtoSnap = await db.collection(produtoColecao).doc(produtoId).get();
    if (!produtoSnap.exists) {
      return res.status(404).json({ erro: 'Anúncio não encontrado.' });
    }
    const produto = produtoSnap.data();

    const produtoDoUsuario = produtoColecao === 'produtosLoja'
      ? lojaAtiva && produto.lojaId === usuario.uid && produto.ativo === true
      : produto.vendedorId === usuario.uid && produto.ativo !== false && produto.status !== 'vendido';

    if (!produtoDoUsuario) {
      return res.status(403).json({
        erro: 'O vídeo deve estar vinculado a um anúncio ativo seu.'
      });
    }

    const reelRef = db.collection('reels').doc(reelId);
    await reelRef.create({
      vendedorId: usuario.uid,
      vendedorNome: String(
        produto.vendedorNome || produto.lojaNome || loja?.nome || 'Vendedor'
      ).slice(0, 100),
      produtoId,
      produtoColecao,
      produtoNome: String(produto.nome || 'Produto anunciado').slice(0, 150),
      produtoPreco: Number(produto.preco) || 0,
      lojaId: produtoColecao === 'produtosLoja' ? usuario.uid : null,
      legenda: legenda.trim(),
      videoUrl,
      ativo: true,
      statusModeracao: 'liberado',
      moderacaoAutomatica: true,
      criadoEm: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({ sucesso: true, reelId });
  } catch (erro) {
    console.error('Erro ao publicar Reel:', erro);
    if (
      erro.code === 'auth/id-token-expired' ||
      erro.code === 'auth/argument-error' ||
      erro.code === 'auth/invalid-id-token'
    ) {
      return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente.' });
    }
    if (erro.code === 6 || erro.code === 'already-exists') {
      return res.status(409).json({
        erro: 'Este vídeo já foi enviado. Atualize a página e tente novamente.'
      });
    }
    return res.status(500).json({ erro: 'Não foi possível publicar o vídeo.' });
  }
};
