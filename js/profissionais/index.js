
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

  // Carrega o CSS independente.
  if (!document.querySelector("[data-perto-profissionais-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./css/profissionais.css";
    css.dataset.pertoProfissionaisCss = "true";
    document.head.appendChild(css);
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

      <div class="pp-empty-state" id="ppEstablishments">
        <span>🏪</span>
        <strong>Estamos preparando esta vitrine!</strong>
        <p>
          Em breve você poderá encontrar salões e barbearias
          próximos de você.
        </p>
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

  // Abre a vitrine.
  card.addEventListener("click", () => {
    servicesMenu.style.display = "none";
    painel.hidden = false;

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

  // Seleção visual de categorias.
  const categorias = painel.querySelectorAll(".pp-category");

  categorias.forEach(botao => {
    botao.addEventListener("click", () => {
      categorias.forEach(item => item.classList.remove("active"));
      botao.classList.add("active");

      painel.dataset.category = botao.dataset.category;
    });
  });

  // Campo de busca: prepara o termo para a futura consulta.
  const busca = painel.querySelector("#ppSearchInput");

  busca.addEventListener("input", () => {
    painel.dataset.search = busca.value.trim();
  });

  servicesMenu.appendChild(card);
  servicesPage.appendChild(painel);

  console.info("[Perto Profissionais] Marketplace carregado.");

  return true;
}
