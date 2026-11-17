
/* =========================================================
   PERTO PROFISSIONAIS
   Marketplace público de beleza e cuidados pessoais
========================================================= */

export function initPertoProfissionais(bridge) {
  if (!bridge || !bridge.db || !bridge.auth) {
    console.error("[Perto Profissionais] Ponte Firebase indisponível.");
    return false;
  }

  const servicesPage = document.getElementById("servicesPage");
  const servicesMenu = document.getElementById("servicesMenu");

  if (!servicesPage || !servicesMenu) {
    console.error("[Perto Profissionais] Área Serviços não encontrada.");
    return false;
  }

  if (document.getElementById("pertoProfissionaisCard")) {
    return true;
  }

  const { db } = bridge;
  const { collection, query, where, getDocs } = bridge.firestore;

  if (!collection || !query || !where || !getDocs) {
    console.error("[Perto Profissionais] Recursos Firestore incompletos.");
    return false;
  }

  // Carrega o CSS independente.
  if (!document.querySelector("[data-perto-profissionais-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./css/profissionais.css";
    css.dataset.pertoProfissionaisCss = "true";
    document.head.appendChild(css);
  }

  // Estilos dos estabelecimentos reais.
  if (!document.getElementById("ppDataStyles")) {
    const style = document.createElement("style");
    style.id = "ppDataStyles";

    style.textContent = `
      .pp-establishment-list {
        display: grid;
        gap: 13px;
      }

      .pp-establishment-card {
        display: flex;
        align-items: center;
        gap: 13px;
        width: 100%;
        padding: 13px;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        background: #fff;
        text-align: left;
        overflow: hidden;
      }

      .pp-establishment-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 76px;
        height: 76px;
        border-radius: 14px;
        background: #f1f5f9;
        overflow: hidden;
        font-size: 30px;
      }

      .pp-establishment-logo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .pp-establishment-info {
        flex: 1;
        min-width: 0;
      }

      .pp-establishment-info strong {
        display: block;
        color: #0f172a;
        font-size: 14px;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      .pp-establishment-category {
        display: inline-block;
        margin-top: 5px;
        color: #92400e;
        font-size: 11px;
        font-weight: 800;
      }

      .pp-establishment-location {
        display: block;
        margin-top: 6px;
        color: #64748b;
        font-size: 11px;
      }

      .pp-establishment-description {
        display: block;
        margin-top: 6px;
        color: #475569;
        font-size: 11px;
        line-height: 1.4;
      }

      .pp-loading {
        padding: 24px 15px;
        border-radius: 15px;
        background: #f8fafc;
        color: #64748b;
        text-align: center;
        font-size: 13px;
      }

      .pp-retry-button {
        margin-top: 12px;
        padding: 10px 16px;
        border-radius: 10px;
        background: #0f172a;
        color: #fff;
        font-weight: 800;
      }
    `;

    document.head.appendChild(style);
  }

  // Cartão de entrada.
  const card = document.createElement("button");
  card.type = "button";
  card.id = "pertoProfissionaisCard";
  card.className = "serviceCard pp-entry-card";

  card.innerHTML = `
    <div class="serviceIcon">💇</div>
    <h3>Perto Profissionais</h3>
    <p>Encontre salões, barbearias e profissionais perto de você.</p>
    <span class="pp-entry-link">Explorar serviços →</span>
  `;

  // Vitrine pública.
  const painel = document.createElement("section");
  painel.id = "pertoProfissionaisRoot";
  painel.className = "pp-root";
  painel.hidden = true;

  painel.innerHTML = `
    <button type="button" id="ppBackButton" class="pp-back-button">
      ← Voltar para Serviços
    </button>

    <header class="pp-hero">
      <div class="pp-hero-content">
        <span class="pp-eyebrow">PERTO PROFISSIONAIS</span>
        <h2>Sua beleza começa por perto.</h2>
        <p>
          Descubra salões, barbearias e profissionais.
          Escolha seu serviço e encontre quem combina com você.
        </p>
      </div>
      <div class="pp-hero-icon">✨</div>
    </header>

    <div class="pp-search-box">
      <span>🔎</span>
      <input
        id="ppSearchInput"
        type="search"
        placeholder="O que você está procurando?"
        aria-label="Buscar serviços e profissionais"
      >
    </div>

    <section class="pp-section">
      <div class="pp-section-heading">
        <h3>Explore por categoria</h3>
      </div>

      <div class="pp-categories" id="ppCategories">
        <button class="pp-category active" data-category="todos">
          <span>✨</span>
          <small>Todos</small>
        </button>

        <button class="pp-category" data-category="barbearia">
          <span>💈</span>
          <small>Barbearia</small>
        </button>

        <button class="pp-category" data-category="cabelo">
          <span>💇</span>
          <small>Cabelo</small>
        </button>

        <button class="pp-category" data-category="unhas">
          <span>💅</span>
          <small>Unhas</small>
        </button>

        <button class="pp-category" data-category="estetica">
          <span>🧖</span>
          <small>Estética</small>
        </button>

        <button class="pp-category" data-category="maquiagem">
          <span>💄</span>
          <small>Maquiagem</small>
        </button>
      </div>
    </section>

    <section class="pp-section">
      <div class="pp-section-heading">
        <div>
          <h3>Estabelecimentos perto de você</h3>
          <p>Descubra lugares para cuidar de você.</p>
        </div>
      </div>

      <div id="ppEstablishments" class="pp-establishment-list">
        <div class="pp-loading">
          Os estabelecimentos aparecerão aqui.
        </div>
      </div>
    </section>

    <section class="pp-section">
      <div class="pp-section-heading">
        <div>
          <h3>Profissionais autônomos</h3>
          <p>Encontre especialistas independentes.</p>
        </div>
      </div>

      <div class="pp-empty-state" id="ppIndependent">
        <span>✂️</span>
        <strong>Novos profissionais em breve</strong>
        <p>
          Estamos preparando o espaço para profissionais
          que atendem por conta própria.
        </p>
      </div>
    </section>

    <footer class="pp-footer">
      <strong>Perto Profissionais</strong>
      <p>Beleza, cuidado e praticidade perto de você.</p>
    </footer>
  `;

  servicesMenu.appendChild(card);
  servicesPage.appendChild(painel);

  const listaEstabelecimentos = painel.querySelector("#ppEstablishments");
  const busca = painel.querySelector("#ppSearchInput");
  const categorias = painel.querySelectorAll(".pp-category");

  let estabelecimentos = [];
  let estabelecimentosCarregados = false;
  let categoriaAtual = "todos";
  let termoBusca = "";

  // Protege os textos exibidos no HTML.
  const escapar = valor => {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);
  };

  // Normaliza textos para pesquisa.
  const normalizar = valor => {
    return String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  // Verifica se a categoria corresponde ao filtro.
  function correspondeCategoria(estabelecimento) {
    if (categoriaAtual === "todos") return true;

    const categoria = normalizar(estabelecimento.categoria);

    const equivalencias = {
      barbearia: ["barbearia", "barbeiro", "barber"],
      cabelo: [
        "cabelo",
        "cabeleireiro",
        "salao",
        "cabeleireira"
      ],
      unhas: [
        "unha",
        "manicure",
        "pedicure",
        "nail"
      ],
      estetica: [
        "estetica",
        "esteticista",
        "limpeza de pele",
        "depilacao"
      ],
      maquiagem: [
        "maquiagem",
        "maquiador",
        "makeup",
        "make up"
      ]
    };

    const termos = equivalencias[categoriaAtual] || [categoriaAtual];

    return termos.some(termo => categoria.includes(termo));
  }

  // Verifica se corresponde à busca.
  function correspondeBusca(estabelecimento) {
    if (!termoBusca) return true;

    const conteudo = normalizar([
      estabelecimento.nome,
      estabelecimento.categoria,
      estabelecimento.cidade,
      estabelecimento.bairro,
      estabelecimento.descricao,
      estabelecimento.endereco
    ].join(" "));

    return conteudo.includes(normalizar(termoBusca));
  }

  // Exibe os estabelecimentos encontrados.
  function renderizarEstabelecimentos() {
    const filtrados = estabelecimentos.filter(estabelecimento =>
      correspondeCategoria(estabelecimento) &&
      correspondeBusca(estabelecimento)
    );

    if (!filtrados.length) {
      listaEstabelecimentos.innerHTML = `
        <div class="pp-empty-state">
          <span>🔎</span>
          <strong>Nenhum estabelecimento encontrado.</strong>
          <p>
            Tente outra categoria ou palavra na busca.
          </p>
        </div>
      `;
      return;
    }

    listaEstabelecimentos.innerHTML = filtrados.map(estabelecimento => {
      const nome = escapar(estabelecimento.nome || "Estabelecimento");
      const categoria = escapar(estabelecimento.categoria || "Beleza e cuidados");
      const cidade = escapar(estabelecimento.cidade || "");
      const bairro = escapar(estabelecimento.bairro || "");
      const descricao = escapar(estabelecimento.descricao || "");

      const localizacao = [bairro, cidade]
        .filter(Boolean)
        .join(" • ");

      const logo = estabelecimento.logoURL &&
        /^https?:\/\//i.test(estabelecimento.logoURL)
        ? `
          <img
            src="${escapar(estabelecimento.logoURL)}"
            alt="Logo de ${nome}"
            loading="lazy"
          >
        `
        : "💇";

      return `
        <article class="pp-establishment-card">
          <div class="pp-establishment-logo">
            ${logo}
          </div>

          <div class="pp-establishment-info">
            <strong>${nome}</strong>
            <span class="pp-establishment-category">
              ${categoria}
            </span>

            ${localizacao ? `
              <span class="pp-establishment-location">
                📍 ${localizacao}
              </span>
            ` : ""}

            ${descricao ? `
              <span class="pp-establishment-description">
                ${descricao}
              </span>
            ` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  // Busca estabelecimentos aprovados no Firebase.
  async function carregarEstabelecimentos(forcarAtualizacao = false) {
    if (estabelecimentosCarregados && !forcarAtualizacao) {
      renderizarEstabelecimentos();
      return;
    }

    listaEstabelecimentos.innerHTML = `
      <div class="pp-loading">
        ⏳ Carregando estabelecimentos...
      </div>
    `;

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais"
      );

      const consulta = query(
        referencia,
        where("ativo", "==", true)
      );

      const resultado = await getDocs(consulta);

      estabelecimentos = resultado.docs
        .map(documento => ({
          id: documento.id,
          ...documento.data()
        }))
        .filter(item => item.ativo === true);

      estabelecimentos.sort((a, b) =>
        String(a.nome || "").localeCompare(
          String(b.nome || ""),
          "pt-BR"
        )
      );

      estabelecimentosCarregados = true;

      renderizarEstabelecimentos();

      console.info(
        "[Perto Profissionais] Estabelecimentos carregados:",
        estabelecimentos.length
      );

    } catch (erro) {
      console.error(
        "[Perto Profissionais] Erro ao carregar estabelecimentos:",
        erro
      );

      estabelecimentosCarregados = false;

      listaEstabelecimentos.innerHTML = `
        <div class="pp-empty-state">
          <span>⚠️</span>
          <strong>Não foi possível carregar os estabelecimentos.</strong>
          <p>
            Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            id="ppRetryButton"
            class="pp-retry-button"
          >
            Tentar novamente
          </button>
        </div>
      `;

      listaEstabelecimentos
        .querySelector("#ppRetryButton")
        .addEventListener("click", () => {
          carregarEstabelecimentos(true);
        });
    }
  }

  // Abre a vitrine.
  card.addEventListener("click", () => {
    servicesMenu.style.display = "none";
    painel.hidden = false;

    carregarEstabelecimentos();

    painel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  // Volta ao menu anterior.
  painel.querySelector("#ppBackButton").addEventListener("click", () => {
    painel.hidden = true;
    servicesMenu.style.display = "";

    servicesMenu.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  // Seleção e funcionamento das categorias.
  categorias.forEach(botao => {
    botao.addEventListener("click", () => {
      categorias.forEach(item => item.classList.remove("active"));

      botao.classList.add("active");
      categoriaAtual = botao.dataset.category;

      renderizarEstabelecimentos();
    });
  });

  // Busca por nome, categoria, cidade, bairro e descrição.
  busca.addEventListener("input", () => {
    termoBusca = busca.value.trim();
    renderizarEstabelecimentos();
  });

  console.info("[Perto Profissionais] Marketplace carregado.");

  return true;
}
