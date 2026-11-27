/* =========================================================
   PERTO LOJAS — carregamento da vitrine pública
   Usa a sessão e a conexão Firebase já inicializadas pelo app.
========================================================= */

export function initPertoLojas(bridge) {
  if (!bridge?.db || !bridge?.auth) {
    console.error("[Perto Lojas] Ponte Firebase indisponível.");
    return false;
  }

  const firestore = bridge.firestore || {};
  const { collection, getDoc, getDocs, doc, query, where } = firestore;
  if (!collection || !getDocs || !doc || !query || !where) {
    console.error("[Perto Lojas] Recursos Firestore incompletos.");
    return false;
  }

  let lojas = [];
  let carregada = false;
  let cidadeCarregada = "";
  let carregando = null;

  function normalizarCidade(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s*[-,/ ]\s*|\s+/g, " ")
      .replace(/\s+(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\s*$/i, "")
      .trim();
  }

  async function carregarVitrineLojas(forcarAtualizacao = false) {
    const resultados = document.getElementById("storesResults");
    const campoCidade = document.getElementById("storeCity");
    if (!resultados) return;

    const cidadeFiltro = campoCidade?.value.trim() || "";
    const cidadeNormalizada = normalizarCidade(cidadeFiltro);

    if (carregada && cidadeCarregada === cidadeNormalizada && !forcarAtualizacao) return;
    if (carregando && !forcarAtualizacao) return carregando;

    resultados.innerHTML = '<div class="storeEmpty">Carregando lojas...</div>';
    carregando = (async () => {
      try {
        const resultado = await getDocs(query(
          collection(bridge.db, "lojas"),
          where("ativo", "==", true)
        ));

        const lojasAtivas = resultado.docs
          .map(documento => ({ id: documento.id, ...documento.data() }))
          .filter(loja =>
            !cidadeNormalizada || normalizarCidade(loja.cidade) === cidadeNormalizada
          );

        const usuario = bridge.getCurrentUser?.() || bridge.auth.currentUser;
        if (usuario) {
          const minhaLoja = await getDoc(doc(bridge.db, "lojas", usuario.uid));
          if (minhaLoja.exists() && !lojasAtivas.some(loja => loja.id === minhaLoja.id)) {
            const dados = minhaLoja.data();
            if (!cidadeNormalizada || normalizarCidade(dados.cidade) === cidadeNormalizada) {
              lojasAtivas.push({
                id: minhaLoja.id,
                ...dados,
                aguardandoAtivacao: dados.ativo !== true
              });
            }
          }
        }

        lojasAtivas.sort((a, b) =>
          String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR")
        );

        lojas = lojasAtivas;
        cidadeCarregada = cidadeNormalizada;
        carregada = true;
        bridge.onStoresLoaded?.(lojas.slice());
      } catch (erro) {
        console.error("[Perto Lojas] Erro ao carregar a vitrine:", erro);
        carregada = false;
        resultados.innerHTML =
          '<div class="storeEmpty">Não foi possível carregar as lojas. Tente novamente.</div>';
      } finally {
        carregando = null;
      }
    })();

    return carregando;
  }

  window.__pertoLojas = Object.freeze({
    carregarVitrineLojas,
    getLojas: () => lojas.slice(),
    normalizarCidade
  });

  if (window.__pertoLojasSolicitado) {
    delete window.__pertoLojasSolicitado;
    carregarVitrineLojas();
  }

  console.info("[Perto Lojas] Módulo de vitrine inicializado.");
  return true;
}
