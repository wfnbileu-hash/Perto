/* =========================================================
   PERTO VITRINES — destaques e lojas parceiras da página inicial
   Reutiliza o Firebase e as funções públicas já inicializadas pelo app.
========================================================= */

export function initPertoVitrines(firebaseBridge) {
  if (window.__pertoHomeShowcaseInstalled) return true;
  window.__pertoHomeShowcaseInstalled = true;

  const esc = valor => String(valor ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caractere]);

  const money = valor => Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });

  const imgOf = produto =>
    (Array.isArray(produto.imagens) ? produto.imagens[0] : "") || produto.imagem || "";

  if (!document.querySelector("[data-perto-vitrines-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./css/vitrines.css";
    css.dataset.pertoVitrinesCss = "true";
    document.head.appendChild(css);
  }

  window.carregarDestaquesHome = async function() {
    const trilha = document.getElementById("homeFeaturedTrack");
    if (!trilha) return;

    try {
      const firebase = window.__pertoHomeFirebase || firebaseBridge;
      if (!firebase) {
        trilha.innerHTML = '<p class="homeShowcaseEmpty">Destaques das lojas em breve.</p>';
        return;
      }

      const resultado = await firebase.getDocs(
        firebase.query(
          firebase.collection(firebase.db, "produtosLoja"),
          firebase.where("ativo", "==", true)
        )
      );

      const produtos = resultado.docs
        .map(documento => ({ id: documento.id, ...documento.data() }))
        .filter(produto =>
          produto.ativo !== false && (produto.destaque === true || produto.promocao === true)
        )
        .slice(0, 30);

      if (!produtos.length) {
        trilha.innerHTML = '<p class="homeShowcaseEmpty">Em breve, novidades e ofertas das lojas parceiras.</p>';
        return;
      }

      trilha.innerHTML = produtos.map(produto => {
        const imagem = imgOf(produto);
        return `<article class="homeFeaturedCard" data-produto-home="${esc(produto.id)}">${imagem
          ? `<img src="${esc(imagem)}" alt="${esc(produto.nome || "Produto")}" loading="lazy">`
          : '<div style="height:180px;background:#fff"></div>'}<div class="homeFeaturedInfo"><span class="homeFeaturedTag">${produto.promocao ? "OFERTA" : "EM DESTAQUE"}</span><strong>${esc(produto.nome || "Produto")}</strong><span class="homePrice">${money(produto.preco)}</span></div></article>`;
      }).join("");

      trilha.querySelectorAll("[data-produto-home]").forEach(cartao => {
        cartao.addEventListener("click", () => {
          const produto = produtos.find(item => item.id === cartao.dataset.produtoHome);
          if (!produto) return;

          if (typeof window.openProduct === "function") {
            window.openProduct({
              ...produto,
              vendedorId: produto.vendedorId || produto.lojaId
            });
          } else if (produto.lojaId && typeof window.abrirLojaPublica === "function") {
            window.abrirLojaPublica(produto.lojaId);
          }
        });
      });

      if (trilha.dataset.autoScroll !== "1") {
        trilha.dataset.autoScroll = "1";
        let direcao = 1;
        setInterval(() => {
          if (!trilha.isConnected || trilha.scrollWidth <= trilha.clientWidth + 4) return;
          const maximo = trilha.scrollWidth - trilha.clientWidth;
          if (trilha.scrollLeft >= maximo - 3) direcao = -1;
          if (trilha.scrollLeft <= 3) direcao = 1;
          trilha.scrollBy({ left: direcao * 210, behavior: "smooth" });
        }, 4500);
      }
    } catch (erro) {
      console.error(erro);
      trilha.innerHTML = '<p class="homeShowcaseEmpty">Não foi possível carregar os destaques agora.</p>';
    }
  };

  window.carregarLojasParceirasHome = async function() {
    const trilha = document.getElementById("homePartnerTrack");
    if (!trilha) return;

    const mensagem = texto => `<p class="homeShowcaseEmpty">${texto}</p>`;

    try {
      const firebase = window.__pertoHomeFirebase || firebaseBridge;
      if (!firebase) {
        trilha.innerHTML = mensagem("Lojas parceiras em breve.");
        return;
      }

      const resultado = await firebase.getDocs(
        firebase.query(
          firebase.collection(firebase.db, "lojas"),
          firebase.where("ativo", "==", true)
        )
      );

      const lojas = resultado.docs
        .map(documento => ({ id: documento.id, ...documento.data() }))
        .filter(loja => loja.ativo === true && loja.statusAdmin !== "suspensa")
        .slice(0, 30);

      if (!lojas.length) {
        trilha.innerHTML = mensagem("Seja uma das primeiras lojas parceiras!");
        return;
      }

      trilha.innerHTML = lojas.map(loja => `
        <button class="homePartnerLogo" type="button" data-loja-home="${esc(loja.id)}">
          ${loja.logoURL
            ? `<img src="${esc(loja.logoURL)}" alt="${esc(loja.nome || loja.nomeLoja || "Loja")}" loading="lazy">`
            : '<span class="homePartnerPlaceholder">🏪</span>'}
          <span>${esc(loja.nome || loja.nomeLoja || "Loja parceira")}</span>
        </button>
      `).join("");

      trilha.querySelectorAll("[data-loja-home]").forEach(botao => {
        botao.addEventListener("click", () => {
          if (typeof window.abrirLojaPublica === "function") {
            window.abrirLojaPublica(botao.dataset.lojaHome);
          } else if (typeof window.showInternalPage === "function") {
            window.showInternalPage("storesPage");
          }
        });
      });
    } catch (erro) {
      console.error(erro);
      trilha.innerHTML = mensagem("Não foi possível carregar as lojas agora.");
    }
  };

  window.alternarDestaqueProduto = async function(id, campo, valor) {
    try {
      const perto = window.__pertoProfissionais;
      const firestore = perto?.firestore;

      if (
        !perto?.db ||
        !firestore?.doc ||
        !firestore?.updateDoc ||
        !firestore?.serverTimestamp
      ) {
        alert("Não foi possível acessar o banco de dados. Atualize a página e tente novamente.");
        return;
      }

      if (!["destaque", "promocao"].includes(campo)) {
        alert("Tipo de atualização inválido.");
        return;
      }

      await firestore.updateDoc(
        firestore.doc(perto.db, "produtosLoja", id),
        {
          [campo]: valor,
          atualizadoEm: firestore.serverTimestamp()
        }
      );

      if (typeof window.carregarDestaquesHome === "function") {
        window.carregarDestaquesHome();
      }
    } catch (erro) {
      console.error(erro);
      alert("Não foi possível atualizar o destaque/promoção. Verifique as permissões e tente novamente.");
    }
  };

  const carregarVitrines = () => {
    window.carregarDestaquesHome();
    window.carregarLojasParceirasHome();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", carregarVitrines, { once: true });
  } else {
    carregarVitrines();
  }

  document.addEventListener("click", evento => {
    if (!evento.target.closest("#homePartnerSeeAll")) return;

    const botaoLojas = document.getElementById("homeStores");
    if (botaoLojas) {
      botaoLojas.click();
    } else if (typeof window.showInternalPage === "function") {
      window.showInternalPage("storesPage");
    }
  });

  console.info("[Perto Vitrines] Vitrines da página inicial inicializadas.");
  return true;
}
