
/* =========================================================
   PERTO PROFISSIONAIS
   Módulo independente — integração com o Perto principal
========================================================= */

export function initPertoProfissionais(bridge) {
  if (!bridge || !bridge.db || !bridge.auth) {
    console.error(
      "[Perto Profissionais] Integração principal não encontrada."
    );
    return false;
  }

  const servicesPage = document.getElementById("servicesPage");
  const servicesMenu = document.getElementById("servicesMenu");

  if (!servicesPage || !servicesMenu) {
    console.error(
      "[Perto Profissionais] Área de Serviços não encontrada."
    );
    return false;
  }

  // Evita criar o mesmo painel mais de uma vez.
  if (document.getElementById("pertoProfissionaisCard")) {
    return true;
  }

  // Carrega o CSS exclusivo do módulo.
  if (!document.querySelector("[data-perto-profissionais-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./css/profissionais.css";
    css.dataset.pertoProfissionaisCss = "true";
    document.head.appendChild(css);
  }

  // Cartão de entrada no menu atual de Serviços.
  const card = document.createElement("button");
  card.type = "button";
  card.id = "pertoProfissionaisCard";
  card.className = "serviceCard pp-entry-card";
  card.innerHTML = `
    <div class="serviceIcon">💈</div>
    <h3>Perto Profissionais</h3>
    <p>
      Gerencie seu estabelecimento, equipe, serviços
      e agendamentos.
    </p>
    <span class="pp-entry-link">Acessar painel →</span>
  `;

  // Painel independente dentro da área de Serviços.
  const painel = document.createElement("section");
  painel.id = "pertoProfissionaisRoot";
  painel.className = "pp-root";
  painel.hidden = true;

  painel.innerHTML = `
    <button
      type="button"
      id="ppBackButton"
      class="pp-back-button">
      ← Voltar para Serviços
    </button>

    <header class="pp-header">
      <div class="pp-brand-icon">✂️</div>

      <div>
        <span class="pp-eyebrow">ÁREA DE GESTÃO</span>
        <h2>Perto Profissionais</h2>
        <p>
          Seu estabelecimento organizado em um só lugar.
        </p>
      </div>
    </header>

    <div class="pp-status">
      <span class="pp-status-dot"></span>
      Estrutura inicial em implantação
    </div>

    <div class="pp-welcome">
      <h3>Bem-vindo ao seu espaço profissional!</h3>
      <p>
        Estamos preparando uma experiência completa para
        administrar seu estabelecimento e seus atendimentos.
      </p>
    </div>

    <h3 class="pp-section-title">Gestão do estabelecimento</h3>

    <div class="pp-dashboard-grid">
      <article class="pp-module-card">
        <span class="pp-module-icon">🏢</span>
        <strong>Estabelecimento e unidades</strong>
        <p>Cadastro, informações e filiais.</p>
        <span class="pp-module-status">Próxima etapa</span>
      </article>

      <article class="pp-module-card">
        <span class="pp-module-icon">👥</span>
        <strong>Equipe e permissões</strong>
        <p>Organize profissionais e acessos.</p>
        <span class="pp-module-status">Em planejamento</span>
      </article>

      <article class="pp-module-card">
        <span class="pp-module-icon">✂️</span>
        <strong>Serviços e preços</strong>
        <p>Configure os serviços oferecidos.</p>
        <span class="pp-module-status">Em planejamento</span>
      </article>

      <article class="pp-module-card">
        <span class="pp-module-icon">📅</span>
        <strong>Agenda e agendamentos</strong>
        <p>Organize horários e atendimentos.</p>
        <span class="pp-module-status">Em planejamento</span>
      </article>
    </div>

    <div class="pp-next-step">
      <strong>Vamos começar pela base.</strong>
      <p>
        A próxima etapa será o cadastro seguro do estabelecimento,
        já preparado para trabalhar com unidades e filiais.
      </p>
    </div>
  `;

  // Entrada no painel.
  card.addEventListener("click", () => {
    servicesMenu.style.display = "none";
    painel.hidden = false;

    painel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  // Retorno ao menu original.
  painel.querySelector("#ppBackButton").addEventListener("click", () => {
    painel.hidden = true;
    servicesMenu.style.display = "grid";

    servicesMenu.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  servicesMenu.appendChild(card);
  servicesPage.appendChild(painel);

  console.info("[Perto Profissionais] Módulo inicial carregado.");

  return true;
}
