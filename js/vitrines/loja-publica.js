/* =========================================================
   PERTO VITRINES — página pública individual de loja
   Recebe acessos ao Firebase, navegação, carrinho e produto
   pelo bridge da aplicação principal.
========================================================= */

export function initPertoVitrineLoja(bridge) {
  if (window.__pertoVitrineLoja) return window.__pertoVitrineLoja;

  if (!bridge || typeof bridge.getStore !== "function") {
    throw new Error("Integração da vitrine pública da loja indisponível.");
  }

  function configurarCabecalhoVitrinePublica(loja) {
    const banner = document.getElementById("storePublicBanner");
    const categorias = document.getElementById("storePublicCategories");
    if (!banner || !categorias) return;

    banner.replaceChildren();
    const urlBanner = loja.configVitrine?.banner || "";

    if (urlBanner) {
      const imagem = document.createElement("img");
      imagem.src = urlBanner;
      imagem.alt = "Banner promocional da loja";
      imagem.loading = "lazy";
      imagem.style.cssText =
        "display:block;width:100%;max-height:220px;object-fit:cover;border-radius:14px;";
      banner.appendChild(imagem);
      banner.style.display = "block";
    } else {
      banner.style.display = "none";
    }

    categorias.replaceChildren();
    const listaCategorias = Array.isArray(loja.categorias) ? loja.categorias : [];

    if (!listaCategorias.length) {
      categorias.style.display = "none";
      return;
    }

    categorias.style.display = "flex";
    categorias.className = "storeCategories";
    const botoes = [];

    function filtrarProdutos(nomeCategoria, botaoAtivo) {
      botoes.forEach(botao => botao.classList.remove("active"));
      botaoAtivo.classList.add("active");

      const painelProdutos = document.getElementById("storeDetailProducts");
      if (!painelProdutos) return;

      painelProdutos.querySelectorAll(".storeProductCard").forEach(card => {
        const categoriaProduto = String(card.dataset.categoria || "")
          .trim()
          .toLowerCase();
        const filtro = String(nomeCategoria || "").trim().toLowerCase();
        card.style.display = !filtro || categoriaProduto === filtro ? "" : "none";
      });
    }

    function criarBotao(nome, texto) {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "storeCategory";
      botao.textContent = texto;
      botao.addEventListener("click", () => filtrarProdutos(nome, botao));
      botoes.push(botao);
      categorias.appendChild(botao);
      return botao;
    }

    const todos = criarBotao("", "✨ Todos");
    listaCategorias.forEach(nomeCategoria => criarBotao(nomeCategoria, nomeCategoria));
    filtrarProdutos("", todos);
  }

  async function abrirLojaPublica(lojaId) {
    bridge.setSelectedStoreId(lojaId);
    document.getElementById("storeCartFloatingBar")?.classList.remove("visible");

    let loja = bridge.getStore(lojaId);
    if (!loja) {
      const lojaDoc = await bridge.getDoc(bridge.doc(bridge.db, "lojas", lojaId));
      if (lojaDoc.exists()) {
        loja = { id: lojaDoc.id, ...lojaDoc.data() };
        bridge.addStore(loja);
      }
    }

    if (!loja) {
      bridge.toast("Não foi possível encontrar esta loja.");
      return;
    }

    configurarCabecalhoVitrinePublica(loja);
    document.getElementById("storeDetailName").textContent = loja.nome || "Loja";
    document.getElementById("storeDetailCategory").textContent =
      "Categoria: " + (loja.categoria || "Outros");
    document.getElementById("storeDetailCity").textContent =
      "📍 " + (loja.cidade || "Cidade não informada");
    document.getElementById("storeDetailDescription").textContent =
      loja.descricao || "Conheça os produtos desta loja.";
    document.getElementById("storeDetailHours").textContent = loja.funciona24h
      ? "🕒 Funcionamento: 24 horas"
      : "🕒 Horário: " + (loja.horario || "Consulte a loja");
    document.getElementById("storeDetailPhone").textContent = loja.telefone
      ? "☎️ " + loja.telefone
      : "";

    const painelProdutos = document.getElementById("storeDetailProducts");
    const configVitrine = loja.configVitrine || {};
    const layoutLista = configVitrine.layout === "lista";
    const colunasGrade = [2, 3, 4].includes(Number(configVitrine.colunas))
      ? Number(configVitrine.colunas)
      : 2;

    painelProdutos.style.display = layoutLista ? "flex" : "grid";
    painelProdutos.style.flexDirection = layoutLista ? "column" : "";
    painelProdutos.style.gridTemplateColumns = layoutLista
      ? ""
      : `repeat(${colunasGrade}, minmax(0, 1fr))`;
    painelProdutos.style.gap = "12px";

    bridge.renderCart(lojaId);
    painelProdutos.innerHTML =
      '<div class="storeEmpty">Carregando produtos da loja...</div>';
    bridge.navigate("storeDetailPage");

    try {
      const consulta = bridge.query(
        bridge.collection(bridge.db, "produtosLoja"),
        bridge.where("lojaId", "==", lojaId),
        bridge.where("ativo", "==", true)
      );
      const resultado = await bridge.getDocs(consulta);

      if (bridge.getSelectedStoreId() !== lojaId) return;

      if (resultado.empty) {
        painelProdutos.innerHTML =
          '<div class="storeEmpty">Esta loja ainda não possui produtos cadastrados.</div>';
        return;
      }

      painelProdutos.replaceChildren();
      resultado.forEach(documento => {
        const produto = documento.data();
        const produtoParaAbrir = {
          ...produto,
          id: documento.id,
          vendedorId: produto.vendedorId || produto.lojaId,
          vendedorNome: produto.lojaNome || loja.nome,
          localizacao: produto.cidade || loja.cidade
        };

        const card = document.createElement("article");
        card.className = "storeCard storeProductCard";
        card.dataset.columns = String(colunasGrade);
        card.dataset.layout = layoutLista ? "lista" : "grade";
        card.dataset.categoria = String(produto.categoria || "Outros").trim();
        card.style.padding = layoutLista ? "5px" : "0";
        card.style.display = layoutLista ? "flex" : "block";
        card.style.alignItems = layoutLista ? "center" : "";
        card.style.gap = layoutLista ? "12px" : "";
        card.style.width = "100%";
        card.style.boxSizing = "border-box";
        card.style.cursor = "pointer";
        card.addEventListener("click", () => bridge.openProduct(produtoParaAbrir));

        let fotosProduto = [];
        if (Array.isArray(produto.imagens)) {
          fotosProduto = produto.imagens.filter(
            url => typeof url === "string" && url.trim() !== ""
          );
        } else if (typeof produto.imagens === "string" && produto.imagens.trim() !== "") {
          fotosProduto = [produto.imagens];
        } else if (typeof produto.imagem === "string" && produto.imagem.trim() !== "") {
          fotosProduto = [produto.imagem];
        }

        if (fotosProduto.length > 0 &&
            (!layoutLista || configVitrine.mostrarImagemLista !== false)) {
          const galeria = document.createElement("div");
          galeria.className = "storeProductGallery";
          const usarMiniatura = layoutLista;
          galeria.style.cssText = usarMiniatura
            ? "display:flex;gap:8px;margin:0 12px 8px 0;flex:0 0 90px;width:90px;"
            : "display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;width:100%;";

          fotosProduto.slice(0, 1).forEach(url => {
            const foto = document.createElement("img");
            foto.src = url;
            foto.alt = produto.nome || "Foto do produto";
            foto.loading = "lazy";
            foto.style.cssText = usarMiniatura
              ? "display:block;width:90px;height:90px;object-fit:cover;background:#f8fafc;border-radius:10px;"
              : "display:block;flex:0 0 100%;width:100%;height:210px;object-fit:contain;background:#fff;border-radius:0;";
            foto.onerror = () => {
              foto.alt = "Não foi possível carregar esta foto";
              foto.style.display = "none";
              console.error("Erro ao carregar foto do produto:", url);
            };
            galeria.appendChild(foto);
          });
          card.appendChild(galeria);
        }

        const conteudo = document.createElement("div");
        conteudo.className = "storeProductContent";
        conteudo.style.flex = "1";
        conteudo.style.minWidth = "0";

        const nome = document.createElement("h3");
        nome.className = "storeProductName";
        nome.textContent = produto.nome || "Produto";
        nome.style.margin = "0 0 8px";

        const preco = document.createElement("p");
        preco.className = "storeProductPrice";
        preco.textContent = bridge.money(produto.preco);
        preco.style.fontSize = layoutLista ? "20px" : "15px";
        preco.style.fontWeight = "700";
        preco.style.margin = "0 0 8px";
        preco.style.color = "#166534";

        const categoria = document.createElement("p");
        categoria.className = "storeProductCategory";
        categoria.textContent = "Categoria: " + (produto.categoria || "Outros");

        const descricao = document.createElement("p");
        descricao.className = "storeProductDescription";
        descricao.textContent = produto.descricao || "Sem descrição.";

        const adicionar = document.createElement("button");
        adicionar.type = "button";
        adicionar.className = "btn btnPrimary storeAddButton";
        adicionar.textContent = "+";
        adicionar.style.cssText =
          "display:flex;align-items:center;justify-content:center;" +
          "width:36px;min-width:36px;height:36px;min-height:36px;" +
          "margin:5px 0 0 auto;padding:0;border-radius:50%;" +
          "font-size:26px;font-weight:600;line-height:1;";
        adicionar.title = "Adicionar ao carrinho";
        adicionar.setAttribute(
          "aria-label",
          "Adicionar " + (produto.nome || "produto") + " ao carrinho"
        );
        adicionar.onclick = evento => {
          evento.stopPropagation();
          bridge.addToCart(lojaId, produtoParaAbrir);
        };

        conteudo.append(nome, preco, categoria, descricao, adicionar);
        card.appendChild(conteudo);
        painelProdutos.appendChild(card);
      });
    } catch (erro) {
      console.error("Erro ao carregar produtos da loja:", erro);
      painelProdutos.innerHTML =
        '<div class="storeEmpty">Não foi possível carregar os produtos. Verifique as regras do Firebase.</div>';
    }
  }

  document.getElementById("storeDetailBackBtn")?.addEventListener("click", () => {
    bridge.navigate("storesPage");
  });

  const api = Object.freeze({ abrirLojaPublica });
  window.__pertoVitrineLoja = api;
  return api;
}
