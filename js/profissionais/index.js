/* =========================================================
   PERTO PROFISSIONAIS
   Marketplace público de beleza e cuidados pessoais
========================================================= */

import { initGestaoProfissionais } from "./gestao.js";
import { montarAgendamentoCliente } from "./agendamentos.js";

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

  if (!document.querySelector("[data-perto-profissionais-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "./css/profissionais.css";
    css.dataset.pertoProfissionaisCss = "true";
    document.head.appendChild(css);
  }

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

            .pp-booking-card {
        margin-top: 16px;
        padding: 18px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        background: #ffffff;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.04);
      }

      .pp-booking-card h3 {
        margin: 0 0 6px;
        color: #0f172a;
        font-size: 18px;
        font-weight: 800;
      }

      .pp-booking-help {
        margin: 0 0 16px;
        color: #64748b;
        font-size: 13px;
        line-height: 1.45;
      }

      .pp-booking-card label {
        display: block;
        margin-bottom: 14px;
        color: #1e293b;
        font-size: 13px;
        font-weight: 700;
      }

      .pp-booking-card select,
      .pp-booking-card input[type="date"] {
        display: block;
        width: 100%;
        box-sizing: border-box;
        margin-top: 6px;
        padding: 12px 14px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #f8fafc;
        color: #0f172a;
        font-size: 14px;
        font-family: inherit;
      }

      .pp-booking-card select:focus,
      .pp-booking-card input[type="date"]:focus {
        outline: none;
        border-color: #f59e0b;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
      }

      .pp-booking-times {
        margin-top: 6px;
        padding: 14px;
        border: 1px dashed #cbd5e1;
        border-radius: 14px;
        background: #f8fafc;
        color: #475569;
        font-size: 13px;
        line-height: 1.4;
      }

      .pp-booking-times strong {
        display: block;
        margin-bottom: 10px;
        color: #0f172a;
        font-size: 13px;
      }

      .pp-time-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .pp-booking-card .pp-time-option {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 10px 6px;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        background: #ffffff;
        color: #0f172a;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .pp-time-option input[type="radio"] {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .pp-time-option:has(input[type="radio"]:checked) {
        border-color: #0f172a;
        background: #0f172a;
        color: #ffffff;
      }

      .pp-booking-submit {
        display: block;
        width: 100%;
        margin-top: 16px;
        padding: 14px 16px;
        border: 0;
        border-radius: 12px;
        background: #f59e0b;
        color: #111827;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }

      .pp-booking-submit:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .pp-booking-feedback {
        min-height: 18px;
        margin: 10px 0 0;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.4;
      }

      .pp-booking-secondary {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 12px 16px;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        background: #f1f5f9;
        color: #0f172a;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .pp-my-bookings {
        margin-top: 14px;
        display: grid;
        gap: 10px;
      }

      .pp-booking-item {
        padding: 13px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
        font-size: 13px;
      }

      .pp-booking-item p {
        margin: 6px 0 0;
        color: #475569;
      }
    `;

    document.head.appendChild(style);
  }
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

  servicesMenu.prepend(card);
  servicesPage.appendChild(painel);

  const listaEstabelecimentos = painel.querySelector("#ppEstablishments");
  const busca = painel.querySelector("#ppSearchInput");
  const categorias = painel.querySelectorAll(".pp-category");

  let estabelecimentos = [];
  let estabelecimentosCarregados = false;
  let categoriaAtual = "todos";
  let termoBusca = "";

  const escapar = valor => {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[caractere]);
  };

  const normalizar = valor => {
    return String(valor ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };
     const detalhesEstabelecimento = document.createElement("section");
  detalhesEstabelecimento.className = "pp-section";
  detalhesEstabelecimento.hidden = true;
  painel.appendChild(detalhesEstabelecimento);

  async function carregarServicosPublicos(estabelecimentoId) {
    const lista = detalhesEstabelecimento.querySelector(
      "#ppPublicServicesList"
    );

    if (!lista) return;

    lista.innerHTML = `<p>⏳ Carregando serviços e preços...</p>`;

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais",
        estabelecimentoId,
        "servicos"
      );

      const resultado = await getDocs(referencia);

      const servicos = resultado.docs
        .map(documento => ({
          id: documento.id,
          ...documento.data()
        }))
        .filter(servico => servico.ativo === true)
        .sort((a, b) =>
          String(a.nome || "").localeCompare(
            String(b.nome || ""),
            "pt-BR"
          )
        );

      if (!servicos.length) {
        lista.innerHTML = `<p>Nenhum serviço cadastrado no momento.</p>`;
        return;
      }

      lista.innerHTML = servicos.map(servico => `
            lista.innerHTML = servicos.map((servico) => {
        const descricaoLimpa = String(servico.descricao || "").trim();
        const precoFormatado = Number(servico.preco || 0)
          .toFixed(2)
          .replace(".", ",");

        return `
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            gap:10px;
            padding:10px 12px;
            margin-top:6px;
            border:1px solid #e2e8f0;
            border-radius:10px;
            background:#fff;
          ">
            <div style="min-width:0;flex:1;">
              <div style="font-weight:700;font-size:14px;color:#0f172a;">
                ${escapar(servico.nome)}
              </div>
              ${
                descricaoLimpa
                  ? `<div style="font-size:12px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${escapar(descricaoLimpa)}
                    </div>`
                  : ""
              }
            </div>

            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;font-size:13px;color:#047857;">
                R$ ${precoFormatado}
              </div>
              <div style="font-size:11px;color:#64748b;">
                ${escapar(servico.duracao)} min
              </div>
            </div>
          </div>
        `;
      }).join("");

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar serviços:", erro);
      lista.innerHTML = `<p>Não foi possível carregar os serviços.</p>`;
    }
  }

  function abrirDetalhesEstabelecimento(estabelecimento) {
    painel.querySelectorAll(
      ".pp-hero, .pp-search-box, .pp-section, .pp-footer"
    ).forEach(elemento => {
      if (elemento !== detalhesEstabelecimento) {
        elemento.style.display = "none";
      }
    });

    const nome = escapar(estabelecimento.nome || "Estabelecimento");
    const categoria = escapar(estabelecimento.categoria || "Beleza e cuidados");
    const descricao = escapar(estabelecimento.descricao || "Nenhuma descrição cadastrada.");
    const endereco = escapar(estabelecimento.endereco || "Endereço não informado");
    const bairro = escapar(estabelecimento.bairro || "");
    const cidade = escapar(estabelecimento.cidade || "");
    const telefone = escapar(estabelecimento.telefone || "Não informado");

    const logo = estabelecimento.logoURL &&
      /^https?:\/\//i.test(estabelecimento.logoURL)
      ? `<img src="${escapar(estabelecimento.logoURL)}" alt="Logo de ${nome}" style="width:100%;height:100%;object-fit:cover;border-radius:16px">`
      : "💇";

    const modalidade = estabelecimento.modalidadeAtendimento === "local"
      ? "Atendimento no estabelecimento"
      : estabelecimento.modalidadeAtendimento === "domicilio"
        ? "Atendimento a domicílio"
        : estabelecimento.modalidadeAtendimento === "ambos"
          ? "No estabelecimento e a domicílio"
          : "Modalidade não informada";

    detalhesEstabelecimento.hidden = false;

    detalhesEstabelecimento.innerHTML = `
      <button type="button" id="ppBackToEstablishments"
        style="padding:10px 14px;border:0;border-radius:10px;background:#f1f5f9;font-weight:700;margin-bottom:16px">
        ← Voltar aos estabelecimentos
      </button>

      <div style="text-align:center;padding:20px 10px">
        <div style="width:110px;height:110px;margin:auto;border-radius:18px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:42px;overflow:hidden">
          ${logo}
        </div>

        <h2 style="margin:14px 0 5px">${nome}</h2>
        <strong style="color:#92400e">${categoria}</strong>
      </div>

      <div class="pp-empty-state" style="text-align:left">
        <h3>Sobre o estabelecimento</h3>
        <p>${descricao}</p>
        <p>📍 ${endereco}</p>
        <p>${bairro}${bairro && cidade ? " • " : ""}${cidade}</p>
        <p>📞 ${telefone}</p>
        <p>🏠 ${modalidade}</p>
      </div>

      <div class="pp-empty-state" style="margin-top:15px;text-align:left">
        <h3>Serviços e preços</h3>
        <div id="ppPublicServicesList">
          <p>Carregando serviços...</p>
        </div>
      </div>

      <div id="ppBookingContainer" style="margin-top:15px"></div>
    `;

    carregarServicosPublicos(estabelecimento.id);

    const containerAgendamento = detalhesEstabelecimento.querySelector("#ppBookingContainer");
    if (containerAgendamento && typeof montarAgendamentoCliente === "function") {
      montarAgendamentoCliente(containerAgendamento, estabelecimento, bridge);
    }

    detalhesEstabelecimento.querySelector(
      "#ppBackToEstablishments"
    ).addEventListener("click", () => {
      detalhesEstabelecimento.hidden = true;

      painel.querySelectorAll(
        ".pp-hero, .pp-search-box, .pp-section, .pp-footer"
      ).forEach(elemento => {
        if (elemento !== detalhesEstabelecimento) {
          elemento.style.display = "";
        }
      });
    });

    detalhesEstabelecimento.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
     listaEstabelecimentos.addEventListener("click", evento => {
    const cartao = evento.target.closest("[data-establishment-id]");
    if (!cartao) return;

    const estabelecimento = estabelecimentos.find(item =>
      item.id === cartao.dataset.establishmentId
    );

    if (estabelecimento) {
      abrirDetalhesEstabelecimento(estabelecimento);
    }
  });

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
        <button
          type="button"
          class="pp-establishment-card"
          data-establishment-id="${escapar(estabelecimento.id)}"
        >
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
        </button>
      `;
    }).join("");
  }

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

  card.addEventListener("click", () => {
    servicesMenu.style.display = "none";
    painel.hidden = false;

    carregarEstabelecimentos();

    painel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  painel.querySelector("#ppBackButton").addEventListener("click", () => {
    painel.hidden = true;
    servicesMenu.style.display = "";

    servicesMenu.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  categorias.forEach(botao => {
    botao.addEventListener("click", () => {
      categorias.forEach(item => item.classList.remove("active"));

      botao.classList.add("active");
      categoriaAtual = botao.dataset.category;

      renderizarEstabelecimentos();
    });
  });

  busca.addEventListener("input", () => {
    termoBusca = busca.value.trim();
    renderizarEstabelecimentos();
  });

  console.info("[Perto Profissionais] Marketplace carregado.");

  initGestaoProfissionais(bridge);

  return true;
}
