/*
 * Perto Profissionais — fluxo de agendamentos
 * Este módulo é aditivo: não substitui os módulos atuais de vitrine ou gestão.
 * Escritas de agendamentos e bloqueios são feitas exclusivamente por Callable Functions.
 */

const STATUS_FINAIS = new Set(["cancelado", "recusado", "concluido", "expirado"]);

function escapar(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[caractere]);
}

function dataLocalISO(data = new Date()) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function nomeUsuario(usuario, dados) {
  return usuario?.displayName ||
    dados?.nome ||
    dados?.name ||
    usuario?.email ||
    "Cliente Perto";
}

function erroAmigavel(erro) {
  const codigo = erro?.code || "";
  if (codigo.includes("unauthenticated")) return "Entre na sua conta para continuar.";
  if (codigo.includes("already-exists") || codigo.includes("aborted")) {
    return "Esse horário acabou de ser reservado. Escolha outro horário.";
  }
  if (codigo.includes("failed-precondition")) return erro.message || "Os dados do agendamento mudaram. Atualize os horários.";
  if (codigo.includes("permission-denied")) return "O Firebase bloqueou esta operação. Precisamos conferir as regras.";
  return erro?.message || "Não foi possível concluir a operação. Tente novamente.";
}

function chamar(bridge, nome) {
  if (!bridge?.functions || typeof bridge.httpsCallable !== "function") {
    throw new Error("A integração com Firebase Functions ainda não foi habilitada na ponte do Perto.");
  }
  return bridge.httpsCallable(bridge.functions, nome);
}

export async function montarAgendamentoCliente(container, estabelecimento, bridge) {
  if (!container || !estabelecimento?.id || !bridge?.db) return;

  const usuario = bridge.getCurrentUser?.();
  if (!usuario) {
    container.innerHTML = `
      <div class="pp-booking-card">
        <h3>Agende seu atendimento</h3>
        <p>Entre na sua conta do Perto para escolher o serviço e reservar um horário.</p>
      </div>`;
    return;
  }

  const firestore = bridge.firestore || {};
  const { collection, getDocs, query, where } = firestore;
  if (!collection || !getDocs || !query || !where) {
    container.textContent = "Não foi possível preparar o agendamento. Recursos do Firebase indisponíveis.";
    return;
  }

  const modalidade = estabelecimento.modalidadeAtendimento || "local";
  const opcoesModalidade = modalidade === "ambos"
    ? `<option value="local">No estabelecimento</option><option value="domicilio">A domicílio</option>`
    : modalidade === "domicilio"
      ? `<option value="domicilio">A domicílio</option>`
      : `<option value="local">No estabelecimento</option>`;

  container.innerHTML = `
    <section class="pp-booking-card">
      <h3>📅 Agende seu atendimento</h3>
      <p class="pp-booking-help">Escolha o serviço, o profissional, a data e um horário disponível.</p>

      <label>Serviço
        <select id="ppBookService"><option value="">Carregando serviços...</option></select>
      </label>

      <label>Profissional
        <select id="ppBookProfessional"><option value="">Carregando equipe...</option></select>
      </label>

      <label>Data
        <input id="ppBookDate" type="date">
      </label>

      <label>Modalidade
        <select id="ppBookModality">${opcoesModalidade}</select>
      </label>

      <div id="ppBookTimes" class="pp-booking-times">
        Selecione serviço, profissional e data.
      </div>

      <button type="button" id="ppBookSubmit" class="pp-booking-submit" disabled>
        Confirmar agendamento
      </button>
      <p id="ppBookFeedback" class="pp-booking-feedback" role="status"></p>

      <button type="button" id="ppShowMyBookings" class="pp-booking-secondary">
        Meus agendamentos
      </button>
      <div id="ppMyBookings" class="pp-my-bookings" hidden></div>
    </section>
  `;

  const $ = id => container.querySelector("#" + id);
  const hoje = dataLocalISO();
  const limite = new Date();
  limite.setDate(limite.getDate() + 14);
  $("ppBookDate").min = hoje;
  $("ppBookDate").max = dataLocalISO(limite);
  $("ppBookDate").value = hoje;

  let servicos = [];
  let equipe = [];
  let horarios = [];
  let carregandoHorarios = 0;

  const feedback = (mensagem, erro = false) => {
    $("ppBookFeedback").textContent = mensagem;
    $("ppBookFeedback").style.color = erro ? "#b91c1c" : "#047857";
  };

  try {
    const servicosSnap = await getDocs(
      collection(bridge.db, "estabelecimentosProfissionais", estabelecimento.id, "servicos")
    );
    const listarEquipe = chamar(bridge, "listarProfissionaisEstabelecimento");
    const equipeResposta = await listarEquipe({ estabelecimentoId: estabelecimento.id });

    servicos = servicosSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.ativo === true)
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

    equipe = Array.isArray(equipeResposta.data?.profissionais)
      ? equipeResposta.data.profissionais
      : [];

    $("ppBookService").innerHTML = `<option value="">Selecione um serviço</option>` +
      servicos.map(s => `<option value="${escapar(s.id)}">${escapar(s.nome)} — R$ ${Number(s.preco || 0).toFixed(2).replace(".", ",")} (${Number(s.duracao || 0)} min)</option>`).join("");

    $("ppBookProfessional").innerHTML = `<option value="">Selecione um profissional</option>` +
      equipe.map(p => `<option value="${escapar(p.uid)}">${escapar(p.nome || "Profissional")}</option>`).join("");

    if (!servicos.length) {
      feedback("Este estabelecimento ainda não possui serviços ativos.", true);
    } else if (!equipe.length) {
      feedback("Este estabelecimento ainda não possui profissionais ativos na equipe.", true);
    }
  } catch (erro) {
    console.error("[Perto Profissionais] Erro ao preparar agendamento:", erro);
    feedback(erroAmigavel(erro), true);
  }

  async function carregarHorarios() {
    const requisicaoAtual = ++requisicaoHorarios;
    $("ppBookSubmit").disabled = true;
    horarios = [];
    const servicoId = $("ppBookService").value;
    const profissionalId = $("ppBookProfessional").value;
    const data = $("ppBookDate").value;

    if (!servicoId || !profissionalId || !data) {
      $("ppBookTimes").textContent = "Selecione serviço, profissional e data.";
      return;
    }

    if (data < $("ppBookDate").min || data > $("ppBookDate").max) {
      $("ppBookTimes").textContent = "Escolha uma data dentro dos próximos 14 dias.";
      return;
    }

    $("ppBookTimes").textContent = "Consultando horários disponíveis...";

    try {
      const listar = chamar(bridge, "listarHorariosProfissionais");
      const resposta = await listar({
        estabelecimentoId: estabelecimento.id,
        servicoId,
        profissionalId,
        data
      });
      
     if (requisicaoAtual !== requisicaoHorarios) return;
      horarios = Array.isArray(resposta.data?.horarios) ? resposta.data.horarios : [];

      if (!horarios.length) {
        $("ppBookTimes").textContent = "Não há horários disponíveis para esta data. Tente outro dia ou profissional.";
        return;
      }

      $("ppBookTimes").innerHTML = `
        <strong>Horários disponíveis</strong>
        <div class="pp-time-grid">
          ${horarios.map(h => `
            <label class="pp-time-option">
              <input type="radio" name="ppBookTime" value="${escapar(h.inicio)}">
              <span>${escapar(h.inicio)}</span>
            </label>
          `).join("")}
        </div>
      `;

      $("ppBookTimes").querySelectorAll('input[name="ppBookTime"]').forEach(input => {
        input.addEventListener("change", () => {
          $("ppBookSubmit").disabled = false;
          $("ppBookSubmit").textContent = "Confirmar agendamento";
        });
      });
      if (requisicaoAtual !== requisicaoHorarios) return;
    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao consultar horários:", erro);
      $("ppBookTimes").textContent = erroAmigavel(erro);
      feedback(erroAmigavel(erro), true);
  }

  $("ppBookService").addEventListener("change", carregarHorarios);
  $("ppBookProfessional").addEventListener("change", carregarHorarios);
  $("ppBookDate").addEventListener("change", carregarHorarios);

  $("ppBookSubmit").addEventListener("click", async () => {
    const inicio = $("ppBookTimes").querySelector('input[name="ppBookTime"]:checked')?.value;
    const servicoId = $("ppBookService").value;
    const profissionalId = $("ppBookProfessional").value;
    const data = $("ppBookDate").value;
    const modalidadeEscolhida = $("ppBookModality").value;

    if (!inicio || !servicoId || !profissionalId || !data) {
      feedback("Selecione todos os dados e um horário.", true);
      return;
    }

    const botao = $("ppBookSubmit");
    botao.disabled = true;
    botao.textContent = "Enviando pedido...";

    try {
      const criar = chamar(bridge, "criarAgendamentoProfissional");
      const resposta = await criar({
        estabelecimentoId: estabelecimento.id,
        servicoId,
        profissionalId,
        data,
        inicio,
        modalidadeAtendimento: modalidadeEscolhida,
        clienteNome: nomeUsuario(usuario, bridge.getCurrentUserData?.())
      });

      const status = resposta.data?.status === "pendente"
        ? "Seu pedido foi enviado e aguarda a confirmação do profissional."
        : "Seu horário foi confirmado!";

      feedback(status);
      botao.textContent = "Agendamento realizado";
      await carregarHorarios();
      await carregarMeusAgendamentos();
    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao criar agendamento:", erro);
      feedback(erroAmigavel(erro), true);
      botao.disabled = false;
      botao.textContent = "Confirmar agendamento";
      await carregarHorarios();
    }
  });

  async function carregarMeusAgendamentos() {
    const area = $("ppMyBookings");
    area.hidden = false;
    area.textContent = "Carregando seus agendamentos...";

    try {
      const { collectionGroup } = firestore;
      if (!collectionGroup) throw new Error("Consulta de agendamentos indisponível.");

      const consulta = query(
        collectionGroup(bridge.db, "agendamentos"),
        where("clienteId", "==", usuario.uid)
      );
      const snapshot = await getDocs(consulta);
      const itens = snapshot.docs
        .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
        .sort((a, b) => `${a.data || ""} ${a.inicio || ""}`.localeCompare(`${b.data || ""} ${b.inicio || ""}`));

      area.replaceChildren();

      if (!itens.length) {
        area.textContent = "Você ainda não possui agendamentos.";
        return;
      }

      itens.forEach(item => {
        const card = document.createElement("article");
        card.className = "pp-booking-item";

        const titulo = document.createElement("strong");
        titulo.textContent = item.estabelecimentoNome || "Estabelecimento";

        const resumo = document.createElement("p");
        resumo.textContent = `${item.servicoNome || "Serviço"} · ${item.data || ""} às ${item.inicio || ""} · ${item.profissionalNome || "Profissional"}`;

        const status = document.createElement("p");
        status.textContent = `Status: ${item.status || "em análise"}`;

        card.append(titulo, resumo, status);

        if (!STATUS_FINAIS.has(item.status) && ["pendente", "confirmado"].includes(item.status)) {
          const cancelar = document.createElement("button");
          cancelar.type = "button";
          cancelar.className = "pp-booking-secondary";
          cancelar.textContent = "Cancelar agendamento";
          cancelar.addEventListener("click", async () => {
            if (!confirm("Deseja cancelar este agendamento?")) return;
            cancelar.disabled = true;
            try {
              const fn = chamar(bridge, "cancelarAgendamentoProfissional");
              await fn({
                estabelecimentoId: item.ref.parent.parent.id,
                agendamentoId: item.id
              });
              await carregarMeusAgendamentos();
              await carregarHorarios();
            } catch (erro) {
              feedback(erroAmigavel(erro), true);
              cancelar.disabled = false;
            }
          });
          card.appendChild(cancelar);
        }

        area.appendChild(card);
      });
    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar meus agendamentos:", erro);
      area.textContent = erroAmigavel(erro);
    }
  }

  $("ppShowMyBookings").addEventListener("click", carregarMeusAgendamentos);
}
const requisicoesAgendaGestao = new WeakMap();
export async function renderizarAgendaGestao(container, dados, bridge) {
  if (!container || !dados?.estabelecimentoId || !dados?.profissionalId || !dados?.data) return;
  const requisicaoAtual =
  (requisicoesAgendaGestao.get(container) || 0) + 1;

requisicoesAgendaGestao.set(container, requisicaoAtual);

  const { collection, getDocs, query, where } = bridge.firestore || {};
  if (!collection || !getDocs || !query || !where) {
    container.textContent = "Recursos de consulta da agenda indisponíveis.";
    return;
  }

  container.innerHTML = `<div class="pp-agenda-list"><strong>Agendamentos do dia</strong><p>Carregando...</p></div>`;

  try {
    const consulta = query(
      collection(bridge.db, "estabelecimentosProfissionais", dados.estabelecimentoId, "agendamentos"),
      where("data", "==", dados.data),
      where("profissionalId", "==", dados.profissionalId)
    );
    const snapshot = await getDocs(consulta);
    if (requisicoesAgendaGestao.get(container) !== requisicaoAtual) return;
    const itens = snapshot.docs
      .map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      .sort((a, b) => String(a.inicio || "").localeCompare(String(b.inicio || "")));

    container.replaceChildren();
    const titulo = document.createElement("strong");
    titulo.textContent = `Agendamentos — ${dados.data.split("-").reverse().join("/")}`;
    container.appendChild(titulo);

    if (!itens.length) {
      const vazio = document.createElement("p");
      vazio.textContent = "Nenhum agendamento para este profissional nesta data.";
      container.appendChild(vazio);
      return;
    }

    for (const item of itens) {
      const card = document.createElement("article");
      card.className = "pp-booking-item";

      const nome = document.createElement("strong");
      nome.textContent = `${item.inicio || "--:--"}–${item.fim || "--:--"} · ${item.clienteNome || "Cliente"}`;

      const detalhes = document.createElement("p");
      detalhes.textContent = `${item.servicoNome || "Serviço"} · ${item.modalidadeAtendimento === "domicilio" ? "A domicílio" : "No estabelecimento"}`;

      const status = document.createElement("p");
      status.textContent = `Status: ${item.status || "indefinido"}`;

      card.append(nome, detalhes, status);

      const acoes = document.createElement("div");
      acoes.className = "pp-booking-actions";

      const criarAcao = (rotulo, novoStatus) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "pp-booking-secondary";
        botao.textContent = rotulo;
        botao.addEventListener("click", async () => {
          botao.disabled = true;
          try {
            const fn = chamar(bridge, "atualizarAgendamentoProfissional");
            await fn({
              estabelecimentoId: dados.estabelecimentoId,
              agendamentoId: item.id,
              novoStatus
            });
            await renderizarAgendaGestao(container, dados, bridge);
          } catch (erro) {
            console.error("[Perto Profissionais] Erro ao atualizar agendamento:", erro);
            alert(erroAmigavel(erro));
            botao.disabled = false;
          }
        });
        acoes.appendChild(botao);
      };

      if (item.status === "pendente") {
        criarAcao("Confirmar", "confirmado");
        criarAcao("Recusar", "recusado");
      }
      if (item.status === "confirmado") {
        criarAcao("Marcar como concluído", "concluido");
      }
      if (["pendente", "confirmado"].includes(item.status)) {
        criarAcao("Cancelar", "cancelado");
      }

      if (acoes.childElementCount) card.appendChild(acoes);
      container.appendChild(card);
    }
  } catch (erro) {
    if (requisicoesAgendaGestao.get(container) !== requisicaoAtual) return;
    console.error("[Perto Profissionais] Erro ao carregar agenda:", erro);
    container.textContent = erroAmigavel(erro);
  }
}
