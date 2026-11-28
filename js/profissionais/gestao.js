/* =========================================================
   PERTO PROFISSIONAIS — GESTÃO DE ESTABELECIMENTOS
   Cadastro e gerenciamento pelo perfil do usuário
========================================================= */

export function initGestaoProfissionais(bridge) {
  if (!bridge?.db || !bridge?.auth) return false;

  const perfil = document.getElementById("profilePage");
  const acoes = perfil?.querySelector(".profileActions");

  if (!perfil || !acoes) {
    console.error("[Perto Profissionais] Perfil não encontrado.");
    return false;
  }

  if (document.getElementById("ppManageEstablishmentBtn")) {
    return true;
  }

  const db = bridge.db;
  const usuarioAtual = () => bridge.getCurrentUser?.();

  const {
    doc,
    setDoc,
    addDoc,
    collection,
    collectionGroup,
    query,
    where,
    getDocs,
    getDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    runTransaction
  } = bridge.firestore;

  const avisar = mensagem => {
    if (bridge.ui?.toast) bridge.ui.toast(mensagem);
    else alert(mensagem);
  };

  const escapar = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);

     function dataAprovacao(item) {
    const valor = item.aprovadoEm;

    if (valor && typeof valor.toDate === "function") {
      return valor.toDate();
    }

    if (valor instanceof Date) return valor;

    if (typeof valor === "string" || typeof valor === "number") {
      const data = new Date(valor);
      return Number.isNaN(data.getTime()) ? null : data;
    }

    return null;
  }

  function planoPorAprovacao(aprovacao, agora = new Date()) {
    if (!aprovacao || aprovacao.getTime() > agora.getTime()) {
      return null;
    }

    let meses =
      (agora.getUTCFullYear() - aprovacao.getUTCFullYear()) * 12 +
      (agora.getUTCMonth() - aprovacao.getUTCMonth());

    const ultimoDiaDoMes = new Date(
      Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)
    ).getUTCDate();

    const diaAniversario = Math.min(
      aprovacao.getUTCDate(),
      ultimoDiaDoMes
    );

    if (agora.getUTCDate() < diaAniversario) meses--;

    if (meses <= 0) {
      return { nome: "gratis", valor: 0, texto: "Gratuito" };
    }

    if (meses <= 4) {
      return { nome: "intermediario", valor: 29.90, texto: "R$ 29,90/mês" };
    }

    return { nome: "avancado", valor: 49.90, texto: "R$ 49,90/mês" };
  }
   
  // Botão de acesso pelo perfil.
  const botao = document.createElement("button");
  botao.type = "button";
  botao.id = "ppManageEstablishmentBtn";
  botao.className = "profileAction";
  botao.textContent = "💇 Meu estabelecimento";

  acoes.insertBefore(botao, acoes.querySelector("#logoutBtn"));

    // Painel de gestão em página independente.
  const painel = document.createElement("section");
  painel.id = "ppManagementPanel";
  painel.className = "page";
  painel.style.cssText = `
    padding:16px;
    border:1px solid #e2e8f0;
    border-radius:18px;
    background:#fff;
  `;
  painel.innerHTML = `
    <button type="button" id="ppManagementBack"
      style="padding:10px 14px;border-radius:10px;background:#f1f5f9;margin-bottom:15px">
      ← Voltar ao perfil
    </button>

    <h2 style="font-size:21px;margin-bottom:6px">
      Meu estabelecimento
    </h2>

    <p style="font-size:13px;color:#64748b;margin-bottom:18px">
      Cadastre e gerencie seu salão, barbearia ou espaço de beleza.
    </p>

    <button type="button" id="ppNewEstablishment"
      style="width:100%;padding:14px;border-radius:12px;background:#f59e0b;color:#111827;font-weight:800">
      + Cadastrar estabelecimento
    </button>

    <form id="ppEstablishmentForm" style="display:none;margin-top:18px">
      <h3 id="ppFormTitle" style="margin-bottom:14px">
        Novo estabelecimento
      </h3>

      <div style="display:grid;gap:12px">

        <label style="font-size:13px;font-weight:700">
          Nome do estabelecimento *
          <input id="ppName" required maxlength="100"
            placeholder="Ex.: Barbearia do João"
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Categoria *
          <select id="ppCategory" required
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
            <option value="">Selecione</option>
            <option value="barbearia">Barbearia</option>
            <option value="cabelo">Salão / Cabelo</option>
            <option value="unhas">Manicure / Pedicure</option>
            <option value="estetica">Estética</option>
            <option value="maquiagem">Maquiagem</option>
            <option value="outros">Outros cuidados pessoais</option>
          </select>
        </label>

        <label style="font-size:13px;font-weight:700">
          Descrição
          <textarea id="ppDescription" maxlength="600"
            placeholder="Conte um pouco sobre seu estabelecimento"
            style="display:block;width:100%;min-height:85px;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px"></textarea>
        </label>

        <label style="font-size:13px;font-weight:700">
          Cidade *
          <input id="ppCity" required maxlength="100"
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Bairro
          <input id="ppNeighborhood" maxlength="100"
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Endereço
          <input id="ppAddress" required maxlength="200"
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Telefone / WhatsApp
          <input id="ppPhone" type="tel" maxlength="25"
            placeholder="(DDD) 99999-9999"
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Link do logotipo (opcional)
          <input id="ppLogo" type="url" maxlength="1000"
            placeholder="https://..."
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
        </label>

        <label style="font-size:13px;font-weight:700">
          Modalidade de atendimento *
          <select id="ppModality" required
            style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
            <option value="local">Somente no estabelecimento</option>
            <option value="domicilio">Somente a domicílio</option>
            <option value="ambos">No estabelecimento e a domicílio</option>
          </select>
        </label>



        <div style="font-size:13px;font-weight:700">
          <label for="ppLogoInput">Logo do estabelecimento (opcional)</label>
          <input
            id="ppLogoInput"
            type="file"
            accept="image/*"
            style="display:block;width:100%;padding:10px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:400"
          >
          <small style="display:block;margin-top:5px;color:#64748b;font-weight:400">
            Escolha uma imagem da galeria (até 2 MB).
          </small>
          <div id="ppLogoPreviewBox" style="display:none;margin-top:10px">
            <img
              id="ppLogoPreview"
              alt="Prévia da logo"
              style="width:76px;height:76px;object-fit:cover;border-radius:12px;border:1px solid #cbd5e1"
            >
          </div>
        </div>
       </div>
      </div>

      <div style="display:flex;gap:9px;margin-top:18px">
        <button type="button" id="ppCancelForm"
          style="flex:1;padding:13px;border-radius:10px;background:#e2e8f0">
          Cancelar
        </button>

        <button type="submit" id="ppSaveForm"
          style="flex:1;padding:13px;border-radius:10px;background:#f59e0b;font-weight:800">
          Enviar cadastro
        </button>
      </div>

    </form>

    <section id="ppInvitesPanel"
      style="margin-top:20px;padding:14px;border:1px solid #fde68a;border-radius:14px;background:#fffbeb">

      <h3 style="font-size:17px;margin-bottom:8px">
        ✉️ Convites para minha equipe
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:12px">
        Veja os convites recebidos para trabalhar em estabelecimentos parceiros.
      </p>

      <div id="ppInvitesList">
        Carregando convites...
      </div>

    </section>

    <section id="ppMyTeamEstablishments"
      style="margin-top:20px;padding:14px;border:1px solid #bfdbfe;border-radius:14px;background:#eff6ff">

      <h3 style="font-size:17px;margin-bottom:8px">
        💈 Meus estabelecimentos
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:12px">
        Estabelecimentos em que você faz parte da equipe.
      </p>

      <div id="ppMyTeamEstablishmentsList">
        Carregando estabelecimentos...
      </div>

    </section>

    <div id="ppMyEstablishments" style="margin-top:20px">
      Carregando seus estabelecimentos...
    </div>

    <section id="ppServicesPanel" style="display:none;margin-top:20px">
      <button type="button" id="ppServicesBack"
        style="padding:10px 14px;border-radius:10px;background:#f1f5f9;margin-bottom:15px">
        ← Voltar aos estabelecimentos
      </button>

      <h3 id="ppServicesTitle" style="font-size:20px;margin-bottom:6px">
        Serviços e preços
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:16px">
        Cadastre os serviços oferecidos pelo seu estabelecimento.
      </p>

      <form id="ppServiceForm" style="display:grid;gap:12px">
        <input id="ppServiceName" required maxlength="100"
          placeholder="Nome do serviço (ex.: Corte masculino)"
          style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px">

        <textarea id="ppServiceDescription" maxlength="300"
          placeholder="Descrição do serviço (opcional)"
          style="width:100%;min-height:70px;padding:12px;border:1px solid #cbd5e1;border-radius:10px"></textarea>

        <input id="ppServicePrice" type="number" min="0" step="0.01" required
          placeholder="Preço (R$)"
          style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px">

        <input id="ppServiceDuration" type="number" min="5" step="5" required
          placeholder="Duração em minutos (ex.: 30)"
          style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px">

        <button type="submit" id="ppSaveService"
          style="padding:13px;border-radius:10px;background:#f59e0b;font-weight:800">
          + Salvar serviço
        </button>
      </form>

      <div id="ppServicesList" style="margin-top:20px">
        Nenhum serviço carregado.
      </div>
    </section>

    <section id="ppTeamPanel" style="display:none;margin-top:20px">

      <button type="button" id="ppTeamBack"
        style="padding:10px 14px;border-radius:10px;background:#f1f5f9;margin-bottom:15px">
        ← Voltar aos estabelecimentos
      </button>

      <h3 id="ppTeamTitle" style="font-size:20px;margin-bottom:6px">
        Minha equipe
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:16px">
        Cadastre os profissionais que trabalham neste estabelecimento.
      </p>

      <form id="ppTeamForm" style="display:grid;gap:12px">

        <input id="ppTeamName" required maxlength="100"
          placeholder="Nome do profissional"
          style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px">

        <input id="ppTeamEmail" type="email" required maxlength="150"
          placeholder="E-mail da conta do Perto"
          style="width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px">

        <button type="submit" id="ppTeamSave"
          style="padding:13px;border-radius:10px;background:#f59e0b;font-weight:800">
          + Adicionar à equipe
        </button>

      </form>

      <div id="ppTeamList" style="margin-top:20px">
        Nenhum profissional carregado.
      </div>

    </section>

    <section id="ppAvailabilityPanel" style="display:none;margin-top:20px">

      <button type="button" id="ppAvailabilityBack"
        style="padding:10px 14px;border-radius:10px;background:#f1f5f9;margin-bottom:15px">
        ← Voltar aos estabelecimentos
      </button>

      <h3 id="ppAvailabilityTitle" style="font-size:20px;margin-bottom:6px">
        Minha disponibilidade
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:16px">
        Configure seus dias e horários de atendimento.
        Essa configuração será usada para disponibilizar sua agenda nos próximos 14 dias.
      </p>

      <div id="ppAvailabilityDays" style="display:grid;gap:12px">
        Carregando dias da semana...
      </div>

      <button type="button" id="ppSaveAvailability"
        style="width:100%;padding:14px;margin-top:18px;border-radius:10px;background:#f59e0b;font-weight:800">
        Salvar disponibilidade
      </button>

    </section>

    <section id="ppAgendaPanel" style="display:none;margin-top:20px">

      <button type="button" id="ppAgendaBack"
        style="padding:10px 14px;border-radius:10px;background:#f1f5f9;margin-bottom:15px">
        ← Voltar
      </button>

      <h3 id="ppAgendaTitle" style="font-size:20px;margin-bottom:6px">
        Minha agenda
      </h3>

      <p style="font-size:13px;color:#64748b;margin-bottom:16px">
        Consulte seus horários de atendimento nos próximos 14 dias.
      </p>

      <label id="ppAgendaProfessionalLabel"
        style="display:none;font-size:13px;font-weight:700">
        Profissional
        <select id="ppAgendaProfessional"
          style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
          <option value="">Selecione um profissional</option>
        </select>
      </label>

      <label style="display:block;margin-top:14px;font-size:13px;font-weight:700">
        Data da consulta
        <input id="ppAgendaDate" type="date"
          style="display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #cbd5e1;border-radius:10px">
      </label>

      <div id="ppAgendaContent"
        style="margin-top:18px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
        Selecione uma data para consultar os horários.
      </div>

    </section>
  `;

  document.querySelector("main").appendChild(painel);

  const $ = id => painel.querySelector("#" + id);

  let editandoId = null;
  let servicoEditandoId = null;
  let arquivoLogoSelecionado = null;
  let logoUrlAtual = "";
  let estabelecimentoServicosAtual = null;
  let estabelecimentoEquipeAtual = null;
  let estabelecimentoDisponibilidadeAtual = null;

  let estabelecimentoAgendaAtual = null;
  let profissionalAgendaAtual = null;
  let modoAgendaAtual = "profissional";

  function mostrarVisaoPrincipal() {
    $("ppNewEstablishment").style.display = "";
    $("ppEstablishmentForm").style.display = "none";
    $("ppInvitesPanel").style.display = "";
    $("ppMyTeamEstablishments").style.display = "";
    $("ppMyEstablishments").style.display = "";
    $("ppServicesPanel").style.display = "none";
    $("ppTeamPanel").style.display = "none";
    $("ppAvailabilityPanel").style.display = "none";
    $("ppAgendaPanel").style.display = "none";
  }

  function ocultarVisaoPrincipalParaSubtela() {
    $("ppNewEstablishment").style.display = "none";
    $("ppEstablishmentForm").style.display = "none";
    $("ppInvitesPanel").style.display = "none";
    $("ppMyTeamEstablishments").style.display = "none";
    $("ppMyEstablishments").style.display = "none";
    $("ppServicesPanel").style.display = "none";
    $("ppTeamPanel").style.display = "none";
    $("ppAvailabilityPanel").style.display = "none";
    $("ppAgendaPanel").style.display = "none";
     }
     async function carregarServicos() {
    const lista = $("ppServicesList");

    if (!estabelecimentoServicosAtual) {
      lista.textContent = "Selecione um estabelecimento.";
      return;
    }

    lista.textContent = "Carregando serviços...";

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais",
        estabelecimentoServicosAtual.id,
        "servicos"
      );

      const resultado = await getDocs(referencia);
      lista.replaceChildren();

      if (resultado.empty) {
        lista.textContent = "Nenhum serviço cadastrado ainda.";
        return;
      }

      resultado.forEach(documento => {
        const servico = {
          id: documento.id,
          ...documento.data()
        };

        const card = document.createElement("div");
        card.style.cssText =
          "padding:13px;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff";

        card.innerHTML = `
          <strong>${escapar(servico.nome)}</strong>
          <p style="font-size:13px;color:#64748b;margin:6px 0">
            ${escapar(servico.descricao || "Sem descrição")}
          </p>
          <p style="font-size:13px;margin-bottom:10px">
            <strong>R$ ${Number(servico.preco || 0).toFixed(2).replace(".", ",")}</strong>
            · ${escapar(servico.duracao)} minutos
          </p>
          <div style="display:flex;gap:8px">
            <button type="button" data-edit-service
              style="flex:1;padding:9px;border-radius:8px;background:#e2e8f0">
              ✏️ Editar
            </button>
            <button type="button" data-delete-service
              style="flex:1;padding:9px;border-radius:8px;background:#fee2e2;color:#991b1b">
              🗑️ Excluir
            </button>
          </div>
        `;

        card.querySelector("[data-edit-service]").addEventListener("click", () => {
          servicoEditandoId = servico.id;
          $("ppServiceName").value = servico.nome || "";
          $("ppServiceDescription").value = servico.descricao || "";
          $("ppServicePrice").value = servico.preco || "";
          $("ppServiceDuration").value = servico.duracao || "";
          $("ppSaveService").textContent = "Salvar alterações";
          $("ppServiceForm").scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });

        card.querySelector("[data-delete-service]").addEventListener("click", async () => {
          if (!confirm("Deseja excluir este serviço?")) return;

          try {
            await deleteDoc(doc(
              db,
              "estabelecimentosProfissionais",
              estabelecimentoServicosAtual.id,
              "servicos",
              servico.id
            ));

            if (servicoEditandoId === servico.id) {
              servicoEditandoId = null;
              $("ppServiceForm").reset();
              $("ppSaveService").textContent = "+ Salvar serviço";
            }

            avisar("Serviço excluído!");
            await carregarServicos();
          } catch (erro) {
            console.error(erro);
            avisar("Não foi possível excluir o serviço.");
          }
        });

        lista.appendChild(card);
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar serviços:", erro);
      lista.textContent = "Não foi possível carregar os serviços.";
    }
  }

  async function carregarEquipe() {
    const lista = $("ppTeamList");

    if (!estabelecimentoEquipeAtual) {
      lista.textContent = "Selecione um estabelecimento.";
      return;
    }

    lista.textContent = "Carregando equipe...";

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais",
        estabelecimentoEquipeAtual.id,
        "equipe"
      );

      const resultado = await getDocs(referencia);

      lista.replaceChildren();

      if (resultado.empty) {
        lista.textContent = "Nenhum profissional na equipe ainda.";
        return;
      }

      resultado.forEach(documento => {
        const profissional = documento.data();

        const card = document.createElement("div");
        card.style.cssText =
          "padding:13px;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff";

        card.innerHTML = `
          <strong>${escapar(profissional.nome || "Profissional")}</strong>
          <p style="font-size:13px;color:#64748b;margin-top:6px">
            ${escapar(profissional.email || "")}
          </p>
          <p style="font-size:13px;margin-top:6px">
            ${profissional.ativo ? "Ativo" : "Inativo"}
          </p>
        `;

        const botaoAgenda = document.createElement("button");
        botaoAgenda.type = "button";
        botaoAgenda.textContent = "Ver agenda";

        botaoAgenda.style.cssText =
          "width:100%;padding:12px;margin-top:12px;border:0;border-radius:9px;background:#0f172a;color:white;font-weight:800";

        botaoAgenda.addEventListener("click", () => {
          abrirAgenda(
            estabelecimentoEquipeAtual,
            {
              uid: documento.id,
              nome: profissional.nome || "Profissional"
            },
            "proprietario"
          );
        });

        card.appendChild(botaoAgenda);
        lista.appendChild(card);
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar equipe:", erro);
      lista.textContent =
        "Não foi possível carregar a equipe: " +
        (erro.code || erro.message || "erro desconhecido");
    }
  }

  $("ppServiceForm").addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!estabelecimentoServicosAtual) {
      return avisar("Selecione um estabelecimento.");
    }

    const nome = $("ppServiceName").value.trim();
    const descricao = $("ppServiceDescription").value.trim();
    const preco = Number($("ppServicePrice").value);
    const duracao = Number($("ppServiceDuration").value);

    if (
      !nome ||
      !Number.isFinite(preco) ||
      preco <= 0 ||
      !Number.isInteger(duracao) ||
      duracao < 5 ||
      duracao > 480 ||
      duracao % 5 !== 0
    ) {
      return avisar(
        "Informe um nome, preço válido e duração entre 5 e 480 minutos, em intervalos de 5 minutos."
      );
    }

    const salvar = $("ppSaveService");
    salvar.disabled = true;
    salvar.textContent = "Salvando...";

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais",
        estabelecimentoServicosAtual.id,
        "servicos"
      );

      const dados = {
        nome,
        descricao,
        preco: Number(preco.toFixed(2)),
        duracao,
        atualizadoEm: serverTimestamp()
      };

      if (servicoEditandoId) {
        await updateDoc(
          doc(
            db,
            "estabelecimentosProfissionais",
            estabelecimentoServicosAtual.id,
            "servicos",
            servicoEditandoId
          ),
          dados
        );

        avisar("Serviço atualizado!");
      } else {
        await addDoc(referencia, {
          ...dados,
          ativo: true,
          criadoEm: serverTimestamp()
        });

        avisar("Serviço cadastrado!");
      }

      $("ppServiceForm").reset();
      servicoEditandoId = null;
      salvar.textContent = "+ Salvar serviço";

      await carregarServicos();

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao salvar serviço:", erro);
      avisar("Não foi possível salvar. Verifique as regras do Firestore.");
    } finally {
      salvar.disabled = false;
      if (!servicoEditandoId) {
        salvar.textContent = "+ Salvar serviço";
      }
    }
  });

  function limparFormulario() {
  $("ppEstablishmentForm").reset();
  editandoId = null;
  arquivoLogoSelecionado = null;
  logoUrlAtual = "";

  const previewBox = $("ppLogoPreviewBox");
  const previewImg = $("ppLogoPreview");
  if (previewImg) previewImg.removeAttribute("src");
  if (previewBox) previewBox.style.display = "none";

  $("ppFormTitle").textContent = "Novo estabelecimento";
  $("ppSaveForm").textContent = "Enviar cadastro";
  $("ppEstablishmentForm").style.display = "none";
}

function preencherFormulario(item) {
  $("ppName").value = item.nome || "";
  $("ppCategory").value = item.categoria || "";
  $("ppDescription").value = item.descricao || "";
  $("ppCity").value = item.cidade || "";
  $("ppNeighborhood").value = item.bairro || "";
  $("ppAddress").value = item.endereco || "";
  $("ppPhone").value = item.telefone || "";
  $("ppModality").value = item.modalidadeAtendimento || "local";

  editandoId = item.id;
  arquivoLogoSelecionado = null;
  logoUrlAtual = item.logoURL || "";

  const previewBox = $("ppLogoPreviewBox");
  const previewImg = $("ppLogoPreview");
  if (logoUrlAtual && previewImg && previewBox) {
    previewImg.src = logoUrlAtual;
    previewBox.style.display = "block";
  } else if (previewBox) {
    previewBox.style.display = "none";
  }

  $("ppFormTitle").textContent = "Editar estabelecimento";
  $("ppSaveForm").textContent = "Salvar alterações";
  $("ppEstablishmentForm").style.display = "block";

  $("ppEstablishmentForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

  async function carregarMeusEstabelecimentos() {
    const usuario = usuarioAtual();
    const lista = $("ppMyEstablishments");

    if (!usuario) {
      lista.textContent = "Entre na sua conta para continuar.";
      return;
    }

    lista.textContent = "Carregando seus estabelecimentos...";

    try {
      const consulta = query(
        collection(db, "estabelecimentosProfissionais"),
        where("proprietarioId", "==", usuario.uid)
      );

      const resultado = await getDocs(consulta);
      lista.replaceChildren();

      if (resultado.empty) {
        lista.innerHTML = `
          <div style="padding:20px;text-align:center;background:#f8fafc;border-radius:14px;color:#64748b">
            <div style="font-size:30px">💇</div>
            <strong>Você ainda não cadastrou um estabelecimento.</strong>
            <p style="font-size:12px;margin-top:7px">
              Seu cadastro poderá aparecer na vitrine após a aprovação.
            </p>
          </div>
        `;
        return;
      }

      const documentosOrdenados = resultado.docs.slice().sort((a, b) => {
        const criadoA = a.data().criadoEm?.toMillis?.() || 0;
        const criadoB = b.data().criadoEm?.toMillis?.() || 0;
        return criadoA - criadoB || a.id.localeCompare(b.id);
      });

            for (const [indice, documento] of documentosOrdenados.entries()) {
        const item = { id: documento.id, ...documento.data() };
        const numeroEstabelecimento = indice + 1;
        const plano = planoPorAprovacao(dataAprovacao(item));
        const valorMensalidade = plano?.valor ?? null;
        const planoMensalidade = plano?.texto || "Data de aprovação não registrada";

        const mensalidadeSnap = await getDoc(doc(db, "mensalidadesEstabelecimentosProfissionais", item.id)).catch(() => null);
        const mensalidade = mensalidadeSnap?.exists() ? mensalidadeSnap.data() : {};
        const vencimento = mensalidade.mensalidadeVenceEm?.toDate?.() || null;
        const emDia = mensalidade.status === "authorized" && vencimento && vencimento.getTime() > Date.now();

        const textoMensalidade = !plano
          ? "⚠️ É necessário regularizar a data de aprovação com o administrador."
          : valorMensalidade === 0
            ? "🎉 Primeiro mês gratuito após a aprovação"
            : emDia
              ? `✅ Mensalidade em dia até ${vencimento.toLocaleDateString("pt-BR")}`
              : mensalidade.status === "pending"
                ? "⏳ Aguardando confirmação do pagamento"
                : "⚠️ Mensalidade pendente";


        const card = document.createElement("article");
        card.style.cssText = `
          padding:14px;
          margin-top:12px;
          border:1px solid #e2e8f0;
          border-radius:14px;
          background:#f8fafc;
        `;

        const status = item.ativo === true
          ? "✅ Aprovado e publicado"
          : item.statusAdmin === "suspenso"
            ? "⏸️ Suspenso"
            : "🕒 Aguardando aprovação";

        card.innerHTML = `
          <strong>${escapar(item.nome)}</strong>
          <p style="font-size:12px;color:#64748b;margin-top:5px">
            ${escapar(item.categoria)} · ${escapar(item.cidade)}
          </p>
          <p style="font-size:12px;margin-top:8px">${status}</p>
          <div style="margin-top:9px;padding:10px;border-radius:10px;background:#fff7ed;color:#7c2d12;font-size:12px;line-height:1.5">
            <strong>Estabelecimento nº ${numeroEstabelecimento} · ${planoMensalidade}</strong>
            <div style="margin-top:4px">${textoMensalidade}</div>
          </div>
          <div data-payment-area></div>
          <div style="display:flex;gap:8px;margin-top:12px">
            <button type="button" data-edit
              style="flex:1;padding:10px;border-radius:9px;background:#e2e8f0">
              ✏️ Editar
            </button>
            ${item.ativo === false ? `
              <button type="button" data-delete
                style="flex:1;padding:10px;border-radius:9px;background:#fee2e2;color:#991b1b">
                🗑️ Excluir
              </button>
            ` : ""}
          </div>
          <button type="button" data-services
            style="width:100%;padding:11px;margin-top:9px;border-radius:9px;background:#fef3c7;color:#92400e;font-weight:800">
            ✂️ Gerenciar serviços e preços
          </button>
          <button type="button" data-team
            style="width:100%;padding:11px;margin-top:9px;border-radius:9px;background:#dbeafe;color:#1e40af;font-weight:800">
            👥 Gerenciar equipe
          </button>
                    ${valorMensalidade !== null && valorMensalidade > 0 && !emDia ? `
            <button type="button" data-pay-subscription
              style="width:100%;padding:11px;margin-top:9px;border-radius:9px;background:#dcfce7;color:#166534;font-weight:800">
              💳 Pagar mensalidade · ${planoMensalidade}
            </button>
          ` : ""}
        `;

        card.querySelector("[data-services]").addEventListener("click", async () => {
          estabelecimentoServicosAtual = item;

          $("ppServicesTitle").textContent =
            "Serviços e preços — " + (item.nome || "Estabelecimento");

          ocultarVisaoPrincipalParaSubtela();
          $("ppServicesPanel").style.display = "block";

          $("ppServicesPanel").scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

          await carregarServicos();
        });

        card.querySelector("[data-team]").addEventListener("click", () => {
          estabelecimentoEquipeAtual = item;

          $("ppTeamTitle").textContent =
            "Minha equipe — " + (item.nome || "Estabelecimento");

          ocultarVisaoPrincipalParaSubtela();
          $("ppTeamPanel").style.display = "block";

          $("ppTeamPanel").scrollIntoView({
            behavior: "smooth",
            block: "start"
          });

          carregarEquipe();
        });

        const botaoPagamento = card.querySelector("[data-pay-subscription]");
        if (botaoPagamento) {
          botaoPagamento.addEventListener("click", async () => {
            const usuarioPagamento = usuarioAtual();
            if (!usuarioPagamento) return avisar("Entre na sua conta para pagar a mensalidade.");

            botaoPagamento.disabled = true;
            botaoPagamento.textContent = "Gerando Pix...";
            const areaPagamento = card.querySelector("[data-payment-area]");
            areaPagamento.textContent = "Conectando ao Mercado Pago...";

            try {
              const token = await usuarioPagamento.getIdToken();
              const resposta = await fetch("/api/criar-pagamento-profissional", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ estabelecimentoId: item.id })
              });
              const dados = await resposta.json().catch(() => ({}));
              if (!resposta.ok) throw new Error(dados.erro || "Não foi possível gerar o Pix.");

              areaPagamento.innerHTML = `
                <div style="margin-top:10px;padding:12px;border:1px solid #bbf7d0;border-radius:12px;background:#f0fdf4;text-align:center">
                  <strong>Pix de R$ ${Number(dados.valor).toFixed(2).replace(".", ",")}</strong>
                  <p style="font-size:12px;color:#475569;margin:6px 0">Escaneie o QR Code ou copie o código Pix.</p>
                  <img src="data:image/png;base64,${escapar(dados.qr_code_base64)}" alt="QR Code Pix da mensalidade" style="display:block;width:190px;height:190px;object-fit:contain;margin:8px auto;background:#fff;border-radius:8px">
                  <textarea readonly data-pix-code style="width:100%;min-height:75px;padding:9px;border:1px solid #cbd5e1;border-radius:8px;font-size:11px;word-break:break-all">${escapar(dados.qr_code)}</textarea>
                  <button type="button" data-copy-pix style="width:100%;padding:10px;margin-top:8px;border:0;border-radius:8px;background:#166534;color:#fff;font-weight:800">📋 Copiar código Pix</button>
                </div>
              `;

              areaPagamento.querySelector("[data-copy-pix]").addEventListener("click", async () => {
                const campo = areaPagamento.querySelector("[data-pix-code]");
                try {
                  await navigator.clipboard.writeText(campo.value);
                  avisar("Código Pix copiado!");
                } catch (_) {
                  campo.select();
                  document.execCommand("copy");
                  avisar("Código Pix copiado!");
                }
              });
              
            } catch (erroPagamento) {
              console.error("[Perto Profissionais] Erro ao gerar Pix:", erroPagamento);
              areaPagamento.textContent = erroPagamento.message || "Não foi possível gerar o Pix.";
              avisar(erroPagamento.message || "Não foi possível gerar o Pix.");
            } finally {
              botaoPagamento.disabled = false;
              botaoPagamento.textContent = `💳 Pagar mensalidade · ${planoMensalidade}`;
            }
          });
        }

        card.querySelector("[data-edit]").addEventListener("click", () => {
          preencherFormulario(item);
        });

        const excluir = card.querySelector("[data-delete]");

        if (excluir) {
          excluir.addEventListener("click", async () => {
            if (!confirm("Deseja excluir este cadastro?")) return;

            excluir.disabled = true;

            try {
              await deleteDoc(doc(
                db,
                "estabelecimentosProfissionais",
                item.id
              ));

              avisar("Cadastro excluído.");
              await carregarMeusEstabelecimentos();

            } catch (erro) {
              console.error(erro);
              avisar("Não foi possível excluir. Verifique as regras do Firebase.");
              excluir.disabled = false;
            }
          });
        }

        lista.appendChild(card);
      }


    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar cadastros:", erro);
      lista.textContent =
        "Não foi possível carregar seus estabelecimentos. Verifique as permissões do Firebase.";
    }
  }
     async function carregarConvitesRecebidos() {
    const usuario = usuarioAtual();
    const lista = $("ppInvitesList");

    if (!usuario || !usuario.email) {
      lista.textContent = "Entre na sua conta para consultar convites.";
      return;
    }

    lista.textContent = "Buscando convites...";

    try {
      const consulta = query(
        collectionGroup(db, "convites"),
        where("email", "==", usuario.email.toLowerCase())
      );

      const resultado = await getDocs(consulta);
      lista.replaceChildren();

      const convites = resultado.docs.filter(
        documento => documento.data().status === "pendente"
      );

      if (convites.length === 0) {
        lista.textContent = "Você não tem convites pendentes.";
        return;
      }

      convites.forEach(documento => {
        const convite = documento.data();

        const card = document.createElement("article");
        card.style.cssText =
          "padding:13px;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:12px;background:#fff";

        const titulo = document.createElement("strong");
        titulo.textContent =
          convite.estabelecimentoNome || "Estabelecimento";

        const descricao = document.createElement("p");
        descricao.style.cssText =
          "font-size:13px;color:#64748b;margin-top:6px";
        descricao.textContent =
          "Convite para trabalhar como profissional.";

        const status = document.createElement("p");
        status.style.cssText =
          "font-size:12px;color:#92400e;margin:8px 0";
        status.textContent = "🕒 Aguardando sua aceitação";

        const aceitar = document.createElement("button");
        aceitar.type = "button";
        aceitar.textContent = "Aceitar convite";
        aceitar.style.cssText =
          "padding:10px 16px;border:0;border-radius:9px;background:#0f172a;color:white;font-weight:600;cursor:pointer";

        aceitar.addEventListener("click", async () => {
          aceitar.disabled = true;
          aceitar.textContent = "Aceitando...";

          try {
            const estabelecimentoId = convite.estabelecimentoId;

            if (!estabelecimentoId) {
              throw new Error("Estabelecimento inválido.");
            }

            if (convite.email !== usuario.email.toLowerCase()) {
              throw new Error("Este convite não pertence a esta conta.");
            }

            const membroRef = doc(
              db,
              "estabelecimentosProfissionais",
              estabelecimentoId,
              "equipe",
              usuario.uid
            );

            await runTransaction(db, async transaction => {
              const conviteAtual = await transaction.get(documento.ref);
              const membroAtual = await transaction.get(membroRef);

              if (!conviteAtual.exists()) {
                throw new Error("Convite não encontrado.");
              }

              if (conviteAtual.data().status !== "pendente") {
                throw new Error("Este convite não está mais pendente.");
              }

              if (membroAtual.exists()) {
                throw new Error("Você já faz parte desta equipe.");
              }

              const dadosConvite = conviteAtual.data();

              if (
                dadosConvite.email !== usuario.email.toLowerCase() ||
                dadosConvite.estabelecimentoId !== estabelecimentoId
              ) {
                throw new Error("Convite inválido para esta conta.");
              }

              transaction.update(documento.ref, {
                status: "aceito",
                profissionalId: usuario.uid,
                aceitoEm: serverTimestamp()
              });

              transaction.set(membroRef, {
                uid: usuario.uid,
                nome: usuario.displayName || dadosConvite.nome,
                email: usuario.email.toLowerCase(),
                estabelecimentoId,
                estabelecimentoNome: dadosConvite.estabelecimentoNome,
                conviteId: documento.id,
                funcao: "profissional",
                ativo: true,
                criadoEm: serverTimestamp()
              });
            });

            avisar("Convite aceito! Você agora faz parte da equipe.");
            await carregarConvitesRecebidos();
            await carregarMeusEstabelecimentosEquipe();

          } catch (erro) {
            console.error("[Perto Profissionais] Erro ao aceitar convite:", erro);

            avisar(
              erro.message || "Não foi possível aceitar o convite."
            );

            aceitar.disabled = false;
            aceitar.textContent = "Aceitar convite";
          }
        });

        card.append(
          titulo,
          descricao,
          status,
          aceitar
        );

        lista.appendChild(card);
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao buscar convites:", erro);
      lista.textContent =
        "Erro ao carregar convites: " +
        (erro.code || erro.message || "erro desconhecido");
    }
  }

  async function carregarMeusEstabelecimentosEquipe() {
    const usuario = usuarioAtual();
    const lista = $("ppMyTeamEstablishmentsList");

    if (!usuario || !usuario.email) {
      lista.textContent = "Entre na sua conta para continuar.";
      return;
    }

    lista.textContent = "Carregando estabelecimentos...";

    try {
      const consulta = query(
        collectionGroup(db, "convites"),
        where("email", "==", usuario.email.toLowerCase())
      );

      const resultado = await getDocs(consulta);

      const aceitos = resultado.docs.filter(documento => {
        const convite = documento.data();
        return convite.status === "aceito" && convite.profissionalId === usuario.uid;
      });

      lista.replaceChildren();

      if (aceitos.length === 0) {
        lista.textContent = "Você ainda não faz parte de uma equipe.";
        return;
      }

      aceitos.forEach(documento => {
        const convite = documento.data();

        const card = document.createElement("div");
        card.style.cssText =
          "padding:13px;margin-bottom:10px;border:1px solid #bfdbfe;border-radius:12px;background:#fff";

        card.innerHTML = `
          <strong>${escapar(convite.estabelecimentoNome || "Estabelecimento")}</strong>
          <p style="font-size:13px;color:#64748b;margin-top:6px">
            💈 Profissional da equipe
          </p>
          <p style="font-size:12px;color:#15803d;margin-top:6px">
            ✓ Vínculo confirmado
          </p>
        `;

        const botaoDisponibilidade = document.createElement("button");
        botaoDisponibilidade.type = "button";
        botaoDisponibilidade.textContent = "Configurar minha disponibilidade";
        botaoDisponibilidade.style.cssText =
          "width:100%;padding:12px;margin-top:12px;border:0;border-radius:9px;background:#f59e0b;font-weight:800";

        botaoDisponibilidade.addEventListener("click", () => {
          abrirDisponibilidade({
            id: convite.estabelecimentoId,
            nome: convite.estabelecimentoNome || "Estabelecimento"
          });
        });

        card.appendChild(botaoDisponibilidade);

        // Configuração individual de confirmação de agendamentos.
        const areaConfirmacao = document.createElement("div");
        areaConfirmacao.style.cssText =
          "margin-top:12px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc";

        areaConfirmacao.innerHTML = `
          <strong style="font-size:14px">
            Confirmação de agendamentos
          </strong>

          <p style="font-size:12px;color:#64748b;margin:6px 0 10px">
            Escolha como deseja receber os novos pedidos.
          </p>

          <select data-modo-confirmacao
            style="width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:8px;background:white">
            <option value="automatico">Automática</option>
            <option value="manual">Manual (preciso aceitar)</option>
          </select>

          <button type="button" data-salvar-confirmacao
            style="width:100%;padding:11px;margin-top:9px;border:0;border-radius:8px;background:#0f172a;color:white;font-weight:800">
            Salvar configuração
          </button>

          <small data-status-confirmacao
            style="display:block;margin-top:8px;color:#64748b">
            Carregando configuração...
          </small>
        `;

        const campoModo = areaConfirmacao.querySelector("[data-modo-confirmacao]");
        const botaoSalvarConfirmacao = areaConfirmacao.querySelector("[data-salvar-confirmacao]");
        const statusConfirmacao = areaConfirmacao.querySelector("[data-status-confirmacao]");

        const referenciaConfirmacao = doc(
          db,
          "estabelecimentosProfissionais",
          convite.estabelecimentoId,
          "equipe",
          usuario.uid,
          "configuracoes",
          "agendamento"
        );

        getDoc(referenciaConfirmacao)
          .then(documento => {
            const dados = documento.exists() ? documento.data() : {};
            campoModo.value = dados.modoConfirmacao === "manual" ? "manual" : "automatico";
            statusConfirmacao.textContent =
              "Modo atual: " +
              (campoModo.value === "manual" ? "Manual" : "Automático (padrão)");
          })
          .catch(erro => {
            console.error("[Perto Profissionais] Erro ao carregar confirmação:", erro);
            statusConfirmacao.textContent =
              "Não foi possível carregar. Verifique as permissões.";
          });

        botaoSalvarConfirmacao.addEventListener("click", async () => {
          botaoSalvarConfirmacao.disabled = true;
          botaoSalvarConfirmacao.textContent = "Salvando...";
          statusConfirmacao.textContent = "Salvando configuração...";

          try {
            await setDoc(referenciaConfirmacao, {
              modoConfirmacao: campoModo.value,
              atualizadoEm: serverTimestamp()
            });

            statusConfirmacao.textContent = "Configuração salva com sucesso.";
            avisar("Preferência de confirmação salva!");

          } catch (erro) {
            console.error("[Perto Profissionais] Erro ao salvar confirmação:", erro);
            statusConfirmacao.textContent =
              "Não foi possível salvar. Verifique as permissões.";
            avisar(
              "Erro ao salvar configuração: " +
              (erro.code || erro.message || "erro desconhecido")
            );
          } finally {
            botaoSalvarConfirmacao.disabled = false;
            botaoSalvarConfirmacao.textContent = "Salvar configuração";
          }
        });

        card.appendChild(areaConfirmacao);

        const botaoMinhaAgenda = document.createElement("button");
        botaoMinhaAgenda.type = "button";
        botaoMinhaAgenda.textContent = "Minha agenda";
        botaoMinhaAgenda.style.cssText =
          "width:100%;padding:12px;margin-top:8px;border:0;border-radius:9px;background:#0f172a;color:white;font-weight:800";

        botaoMinhaAgenda.addEventListener("click", () => {
          abrirAgenda(
            {
              id: convite.estabelecimentoId,
              nome: convite.estabelecimentoNome || "Estabelecimento"
            },
            {
              uid: usuario.uid,
              nome: usuario.displayName || usuario.email || "Profissional"
            },
            "profissional"
          );
        });

        card.appendChild(botaoMinhaAgenda);
        lista.appendChild(card);
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar estabelecimentos da equipe:", erro);
      lista.textContent =
        "Erro ao carregar: " +
        (erro.code || erro.message || "erro desconhecido");
    }
             }
     // ==========================================
  // DISPONIBILIDADE DO PROFISSIONAL
  // ==========================================

  const diasDaSemana = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo"
  ];

  // ==========================================
  // CONSULTA DA AGENDA DIÁRIA
  // ==========================================

  async function abrirAgenda(estabelecimento, profissional, modo = "profissional") {
    const usuario = usuarioAtual();

    if (!usuario || !estabelecimento?.id || !profissional?.uid) {
      avisar("Não foi possível identificar a agenda.");
      return;
    }

    estabelecimentoAgendaAtual = estabelecimento;
    profissionalAgendaAtual = profissional;
    modoAgendaAtual = modo;

    $("ppAgendaTitle").textContent =
      modo === "proprietario"
        ? "Agenda — " + (profissional.nome || "Profissional")
        : "Minha agenda";

    $("ppAgendaProfessionalLabel").style.display = "none";

    ocultarVisaoPrincipalParaSubtela();
    $("ppAgendaPanel").style.display = "block";

    const hoje = new Date();
    const limite = new Date(hoje);
    limite.setDate(limite.getDate() + 13);

    const formatarData = data =>
      [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, "0"),
        String(data.getDate()).padStart(2, "0")
      ].join("-");

    const campoData = $("ppAgendaDate");
    campoData.min = formatarData(hoje);
    campoData.max = formatarData(limite);
    campoData.value = campoData.min;

    let solicitacaoAgenda = 0;

    async function carregarDia() {
      const conteudo = $("ppAgendaContent");
      const solicitacaoAtual = ++solicitacaoAgenda;
      const dataSelecionada = campoData.value;

      conteudo.textContent = "Consultando agenda e agendamentos...";

      try {
        const partes = dataSelecionada.split("-").map(Number);
        const data = new Date(partes[0], partes[1] - 1, partes[2]);
        const diaSemana = data.getDay() === 0 ? 7 : data.getDay();
        const dataFormatada = data.toLocaleDateString("pt-BR");

        const disponibilidadeRef = doc(
          db,
          "estabelecimentosProfissionais",
          estabelecimentoAgendaAtual.id,
          "equipe",
          profissionalAgendaAtual.uid,
          "disponibilidade",
          String(diaSemana)
        );

        const agendamentosRef = collection(
          db,
          "estabelecimentosProfissionais",
          estabelecimentoAgendaAtual.id,
          "agendamentos"
        );

        const [disponibilidadeSnap, agendamentosSnap] = await Promise.all([
          getDoc(disponibilidadeRef),
          getDocs(query(
            agendamentosRef,
            where("data", "==", dataSelecionada),
            where("profissionalId", "==", profissionalAgendaAtual.uid)
          ))
        ]);

        if (solicitacaoAtual !== solicitacaoAgenda) return;

        const agendamentos = [];
        agendamentosSnap.forEach(documento => {
          agendamentos.push({
            id: documento.id,
            ...documento.data()
          });
        });

        agendamentos.sort((a, b) =>
          String(a.inicio || "").localeCompare(String(b.inicio || ""))
        );

        const horario = disponibilidadeSnap.exists() ? disponibilidadeSnap.data() : null;
        const expedienteAtivo = horario?.ativo === true;

        const statusTexto = {
          pendente: "Aguardando confirmação",
          confirmado: "Confirmado",
          recusado: "Recusado",
          concluido: "Concluído",
          cancelado: "Cancelado"
        };

        const agendamentosHtml = agendamentos.length
          ? agendamentos.map(item => {
              const status = String(item.status || "pendente");
              const preco = Number(item.preco || 0);
              const enderecoAtendimento = item.enderecoCliente || item.enderecoAtendimento || item.endereco || "";
              const modalidade = String(item.modalidadeAtendimento || item.modalidade || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
              const atendimentoDomicilio = modalidade.includes("domicilio") || Boolean(enderecoAtendimento);
              let botoes = "";
              if (status === "pendente") {
                botoes = `<button type="button" data-agendamento-status="confirmado" data-id="${escapar(item.id)}"
                    style="padding:8px 12px;border:0;border-radius:8px;background:#16a34a;color:#fff;font-weight:700;cursor:pointer">
                    Confirmar
                  </button>
                  <button type="button" data-agendamento-status="recusado" data-id="${escapar(item.id)}"
                    style="padding:8px 12px;border:0;border-radius:8px;background:#dc2626;color:#fff;font-weight:700;cursor:pointer">
                    Recusar
                  </button>
                  <button type="button" data-agendamento-status="cancelado" data-id="${escapar(item.id)}"
                    style="padding:8px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;font-weight:700;cursor:pointer">
                    Cancelar
                  </button>
                `;
              } else if (status === "confirmado") {
                botoes = `
                  <button type="button" data-agendamento-status="concluido" data-id="${escapar(item.id)}"
                    style="padding:8px 12px;border:0;border-radius:8px;background:#0f172a;color:#fff;font-weight:700;cursor:pointer">
                    Concluir
                  </button>
                  <button type="button" data-agendamento-status="cancelado" data-id="${escapar(item.id)}"
                    style="padding:8px 12px;border:0;border-radius:8px;background:#e2e8f0;color:#0f172a;font-weight:700;cursor:pointer">
                    Cancelar
                  </button>
                `;
              }

              return `
                <article style="
                  padding:13px;
                  margin-top:10px;
                  border:1px solid #e2e8f0;
                  border-radius:12px;
                  background:#fff;
                ">
                  <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
                    <strong>${escapar(item.inicio || "--:--")} às ${escapar(item.fim || "--:--")}</strong>
                    <strong style="font-size:12px">${escapar(statusTexto[status] || status)}</strong>
                  </div>

                  <p style="margin-top:10px">
                    <strong>Cliente:</strong>
                    ${escapar(item.clienteNome || "Cliente")}
                  </p>

                  <p style="margin-top:5px">
                    <strong>Serviço:</strong>
                    ${escapar(item.servicoNome || "Serviço")}
                  </p>

                  <p style="margin-top:5px">
                    <strong>Valor:</strong>
                    R$ ${preco.toFixed(2).replace(".", ",")}
                  </p>

                  <p style="margin-top:5px;font-size:13px;color:#64748b">
                    ${atendimentoDomicilio
                      ? "Atendimento a domicílio"
                      : "Atendimento no estabelecimento"}
                  </p>
                  ${atendimentoDomicilio
                    ? `<p style="margin-top:5px"><strong>Endereço do atendimento:</strong> ${escapar(enderecoAtendimento || "Endereço não informado")}</p>`
                    : ""}

                  ${botoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${botoes}</div>` : ""}
                </article>
              `;
            }).join("")
          : `
              <p style="margin-top:12px;padding:12px;background:#fff;border-radius:10px;color:#64748b">
                Nenhum agendamento encontrado para esta data.
              </p>
            `;

        conteudo.innerHTML = `
          <strong>${dataFormatada}</strong>

          ${
            expedienteAtivo
              ? `
                <p style="margin-top:12px">
                  <strong>Atendimento:</strong>
                  ${escapar(horario.inicio)} às ${escapar(horario.fim)}
                </p>

                ${
                  horario.pausaInicio && horario.pausaFim
                    ? `
                      <p style="margin-top:8px">
                        <strong>Pausa:</strong>
                        ${escapar(horario.pausaInicio)} às ${escapar(horario.pausaFim)}
                      </p>
                    `
                    : ""
                }
              `
              : `
                <p style="margin-top:12px;color:#64748b">
                  Não há expediente configurado para este dia.
                </p>
              `
          }

          <h3 style="margin-top:20px;font-size:16px">
            Agendamentos (${agendamentos.length})
          </h3>

          ${agendamentosHtml}
        `;

        conteudo.querySelectorAll("[data-agendamento-status]").forEach(btnAcao => {
          btnAcao.addEventListener("click", async () => {
            const agendamentoId = btnAcao.dataset.id;
            const novoStatus = btnAcao.dataset.agendamentoStatus;

            if (!agendamentoId || !novoStatus || !estabelecimentoAgendaAtual?.id) return;

            const todosBotoesCard = btnAcao.parentElement?.querySelectorAll("button") || [btnAcao];
            todosBotoesCard.forEach(b => { b.disabled = true; });

              try {
              const atualizarAgendamento = bridge.httpsCallable(
                bridge.functions,
                "atualizarAgendamentoProfissional"
              );

              await atualizarAgendamento({
                estabelecimentoId: estabelecimentoAgendaAtual.id,
                agendamentoId,
                novoStatus
              });

              avisar("Status do agendamento atualizado.");
              await carregarDia();
            } catch (erro) {
              console.error("[Perto Profissionais] Erro ao atualizar agendamento:", erro);
              avisar("Não foi possível atualizar o agendamento.");
              todosBotoesCard.forEach(b => { b.disabled = false; });
            }
          });
        });

      } catch (erro) {
        if (solicitacaoAtual !== solicitacaoAgenda) return;

        console.error("[Perto Profissionais] Erro ao consultar agenda:", erro);
        conteudo.textContent =
          "Não foi possível consultar a agenda: " +
          (erro.code || erro.message || "erro desconhecido");
      }
    }

    campoData.onchange = () => {
      if (
        campoData.value >= campoData.min &&
        campoData.value <= campoData.max
      ) {
        carregarDia();
      } else {
        $("ppAgendaContent").textContent =
          "Escolha uma data dentro dos próximos 14 dias.";
      }
    };

    await carregarDia();
  }

  async function abrirDisponibilidade(estabelecimento) {
    const usuario = usuarioAtual();

    if (!usuario || !estabelecimento?.id) {
      avisar("Não foi possível identificar seu estabelecimento.");
      return;
    }

    estabelecimentoDisponibilidadeAtual = estabelecimento;

    $("ppAvailabilityTitle").textContent =
      "Minha disponibilidade — " +
      (estabelecimento.nome || "Estabelecimento");

    ocultarVisaoPrincipalParaSubtela();
    $("ppAvailabilityPanel").style.display = "block";

    const lista = $("ppAvailabilityDays");
    lista.textContent = "Carregando horários...";

    try {
      const referencia = collection(
        db,
        "estabelecimentosProfissionais",
        estabelecimento.id,
        "equipe",
        usuario.uid,
        "disponibilidade"
      );

      const resultado = await getDocs(referencia);
      const horariosSalvos = {};

      resultado.forEach(documento => {
        horariosSalvos[documento.id] = documento.data();
      });

      lista.replaceChildren();

      diasDaSemana.forEach((nome, indice) => {
        const numero = indice + 1;
        const dados = horariosSalvos[String(numero)] || {};

        const card = document.createElement("div");
        card.style.cssText =
          "padding:13px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc";

        card.innerHTML = `
          <label style="display:flex;align-items:center;gap:9px;font-weight:800">
            <input type="checkbox"
              data-ativo
              ${dados.ativo === true ? "checked" : ""}
              style="width:18px;height:18px">
            ${nome}
          </label>

          <div data-horarios
            style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:13px">

            <label style="font-size:12px">
              Início
              <input type="time" data-inicio
                value="${escapar(dados.inicio || "09:00")}"
                style="width:100%;padding:9px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px">
            </label>

            <label style="font-size:12px">
              Término
              <input type="time" data-fim
                value="${escapar(dados.fim || "18:00")}"
                style="width:100%;padding:9px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px">
            </label>

            <label style="font-size:12px">
              Início da pausa
              <input type="time" data-pausa-inicio
                value="${escapar(dados.pausaInicio || "")}"
                style="width:100%;padding:9px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px">
            </label>

            <label style="font-size:12px">
              Fim da pausa
              <input type="time" data-pausa-fim
                value="${escapar(dados.pausaFim || "")}"
                style="width:100%;padding:9px;margin-top:5px;border:1px solid #cbd5e1;border-radius:8px">
            </label>

          </div>
        `;

        const ativo = card.querySelector("[data-ativo]");
        const campos = card.querySelectorAll("[data-horarios] input");

        function atualizarCampos() {
          campos.forEach(campo => {
            campo.disabled = !ativo.checked;
          });
        }

        ativo.addEventListener("change", atualizarCampos);
        atualizarCampos();

        card.dataset.dia = String(numero);
        lista.appendChild(card);
      });

      $("ppAvailabilityPanel").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar disponibilidade:", erro);
      lista.textContent =
        "Erro ao carregar horários: " +
        (erro.code || erro.message || "erro desconhecido");
    }
  }

  $("ppSaveAvailability").addEventListener("click", async () => {
    const usuario = usuarioAtual();
    const estabelecimento = estabelecimentoDisponibilidadeAtual;

    if (!usuario || !estabelecimento) {
      return avisar("Selecione um estabelecimento.");
    }

    const botaoSalvar = $("ppSaveAvailability");
    const cards = [
      ...$("ppAvailabilityDays").querySelectorAll("[data-dia]")
    ];

    const horarios = [];

    for (const card of cards) {
      const ativo = card.querySelector("[data-ativo]").checked;

      const inicio = card.querySelector("[data-inicio]").value;
      const fim = card.querySelector("[data-fim]").value;
      const pausaInicio = card.querySelector("[data-pausa-inicio]").value;
      const pausaFim = card.querySelector("[data-pausa-fim]").value;

      if (ativo) {
        if (!inicio || !fim || inicio >= fim) {
          return avisar("Confira os horários de início e término do expediente.");
        }

        if (
          (pausaInicio && !pausaFim) ||
          (!pausaInicio && pausaFim)
        ) {
          return avisar("Preencha os dois horários da pausa.");
        }

        if (
          pausaInicio &&
          (
            pausaInicio >= pausaFim ||
            pausaInicio < inicio ||
            pausaFim > fim
          )
        ) {
          return avisar("Confira os horários da pausa.");
        }
      }

      horarios.push({
        diaSemana: Number(card.dataset.dia),
        ativo,
        inicio: ativo ? inicio : "",
        fim: ativo ? fim : "",
        pausaInicio: ativo ? pausaInicio : "",
        pausaFim: ativo ? pausaFim : ""
      });
    }

    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando...";

    try {
      await runTransaction(db, async transaction => {
        for (const horario of horarios) {
          const referencia = doc(
            db,
            "estabelecimentosProfissionais",
            estabelecimento.id,
            "equipe",
            usuario.uid,
            "disponibilidade",
            String(horario.diaSemana)
          );

          transaction.set(referencia, {
            ...horario,
            atualizadoEm: serverTimestamp()
          });
        }
      });

      avisar("Disponibilidade salva com sucesso!");

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao salvar disponibilidade:", erro);
      avisar(
        "Não foi possível salvar: " +
        (erro.code || erro.message || "erro desconhecido")
      );
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "Salvar disponibilidade";
    }
  });

  $("ppAvailabilityBack").addEventListener("click", () => {
    estabelecimentoDisponibilidadeAtual = null;
    mostrarVisaoPrincipal();
  });

  $("ppAgendaBack").addEventListener("click", () => {
    $("ppAgendaPanel").style.display = "none";

    if (modoAgendaAtual === "proprietario") {
      $("ppTeamPanel").style.display = "block";
    } else {
      mostrarVisaoPrincipal();
    }

    estabelecimentoAgendaAtual = null;
    profissionalAgendaAtual = null;
  });

  botao.addEventListener("click", async () => {
    const usuario = usuarioAtual();

    if (!usuario) {
      avisar("Entre na sua conta para gerenciar estabelecimentos.");
      return;
    }

        mostrarVisaoPrincipal();
    bridge.ui.navigate("ppManagementPanel");

    await carregarConvitesRecebidos();
    await carregarMeusEstabelecimentosEquipe();
    await carregarMeusEstabelecimentos();
    painel.scrollIntoView({ behavior: "auto", block: "start" });
  });

  $("ppManagementBack").addEventListener("click", () => {
    limparFormulario();
    bridge.ui.navigate("profilePage");
  });

  $("ppTeamBack").addEventListener("click", () => {
    estabelecimentoEquipeAtual = null;
    mostrarVisaoPrincipal();
  });

  $("ppTeamForm").addEventListener("submit", async evento => {
    evento.preventDefault();

    const usuario = usuarioAtual();
    const estabelecimento = estabelecimentoEquipeAtual;

    if (!usuario || !estabelecimento) {
      return avisar("Selecione um estabelecimento válido.");
    }

    if (estabelecimento.proprietarioId !== usuario.uid) {
      return avisar("Somente o proprietário pode convidar profissionais.");
    }

    const nome = $("ppTeamName").value.trim();
    const email = $("ppTeamEmail").value.trim().toLowerCase();

    if (!nome || !email) {
      return avisar("Preencha o nome e o e-mail.");
    }

    const botaoSalvar = $("ppTeamSave");
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Enviando convite...";

    try {
      await addDoc(
        collection(
          db,
          "estabelecimentosProfissionais",
          estabelecimento.id,
          "convites"
        ),
        {
          nome,
          email,
          estabelecimentoId: estabelecimento.id,
          estabelecimentoNome: estabelecimento.nome || "",
          proprietarioId: usuario.uid,
          funcao: "profissional",
          status: "pendente",
          criadoEm: serverTimestamp()
        }
      );

      $("ppTeamName").value = "";
      $("ppTeamEmail").value = "";

      avisar("Convite registrado com sucesso!");

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao convidar:", erro);
      avisar("Não foi possível enviar o convite. Verifique as regras do Firebase.");
    } finally {
      botaoSalvar.disabled = false;
      botaoSalvar.textContent = "+ Adicionar à equipe";
    }
  });

  $("ppServicesBack").addEventListener("click", () => {
    estabelecimentoServicosAtual = null;
    servicoEditandoId = null;
    $("ppServiceForm").reset();
    $("ppSaveService").textContent = "+ Salvar serviço";
    mostrarVisaoPrincipal();
  });

  $("ppNewEstablishment").addEventListener("click", () => {
    limparFormulario();

    const dadosUsuario = bridge.getCurrentUserData?.() || {};
    $("ppCity").value = dadosUsuario.cidade || "";

    $("ppEstablishmentForm").style.display = "block";
    $("ppEstablishmentForm").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  $("ppCancelForm").addEventListener("click", limparFormulario);
  $("ppLogoInput")?.addEventListener("change", evento => {
  const arquivo = evento.target.files?.[0];
  if (!arquivo) return;

  if (!arquivo.type.startsWith("image/")) {
    $("ppLogoInput").value = "";
    return avisar("Selecione um arquivo de imagem válido.");
  }

  const limiteBytes = 2 * 1024 * 1024; // 2 MB
  if (arquivo.size > limiteBytes) {
    $("ppLogoInput").value = "";
    return avisar("A logo deve ter no máximo 2 MB.");
  }

  arquivoLogoSelecionado = arquivo;
  const previewImg = $("ppLogoPreview");
  const previewBox = $("ppLogoPreviewBox");

  if (previewImg && previewBox) {
    previewImg.src = URL.createObjectURL(arquivo);
    previewBox.style.display = "block";
  }
});
   $("ppEstablishmentForm").addEventListener("submit", async evento => {
  evento.preventDefault();

  const usuario = usuarioAtual();
  if (!usuario) return avisar("Sua sessão expirou. Entre novamente.");

  const nome = $("ppName").value.trim();
  const categoria = $("ppCategory").value;
  const cidade = $("ppCity").value.trim();

  const endereco = $("ppAddress").value.trim();
  if (!nome || !categoria || !cidade || !endereco) {
    return avisar("Preencha nome, categoria, cidade e endereço do estabelecimento.");
  }
  const salvar = $("ppSaveForm");
  salvar.disabled = true;
  salvar.textContent = "Salvando...";

  try {
    let logoURL = logoUrlAtual || "";

    if (arquivoLogoSelecionado) {
      const storage = bridge.storage;
      const { ref, uploadBytes, getDownloadURL } = bridge.storageUtils || {};

      if (!storage || !ref || !uploadBytes || !getDownloadURL) {
        throw new Error("Recursos do Firebase Storage não disponíveis no bridge.");
      }

      const extensao = (arquivoLogoSelecionado.name.split(".").pop() || "jpg")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const caminho = `logosEstabelecimentos/${usuario.uid}/${Date.now()}.${extensao || "jpg"}`;
      const arquivoRef = ref(storage, caminho);

      const snapshot = await uploadBytes(arquivoRef, arquivoLogoSelecionado, {
        contentType: arquivoLogoSelecionado.type
      });

      logoURL = await getDownloadURL(snapshot.ref);
    }

    const modalidadeAtendimento = $("ppModality").value;

    const dados = {
      nome,
      categoria,
      descricao: $("ppDescription").value.trim(),
      cidade,
      bairro: $("ppNeighborhood").value.trim(),
      endereco,
      telefone: $("ppPhone").value.trim(),
      logoURL,
      modalidadeAtendimento,
      atualizadoEm: serverTimestamp()
    };

    if (editandoId) {
      await updateDoc(
        doc(db, "estabelecimentosProfissionais", editandoId),
        dados
      );

      avisar("Estabelecimento atualizado!");
    } else {
      await addDoc(
        collection(db, "estabelecimentosProfissionais"),
        {
          proprietarioId: usuario.uid,
          ...dados,
                    atendeDomicilio: modalidadeAtendimento !== "local",
            ativo: true,
            statusAdmin: "aprovada",
            criadoEm: serverTimestamp(),
            aprovadoEm: serverTimestamp()
          }
          );
          
          avisar("Estabelecimento cadastrado e aprovado!");
    }

    limparFormulario();
    await carregarMeusEstabelecimentos();
  } catch (erro) {
    console.error("[Perto Profissionais] Erro ao salvar:", erro);
    avisar(erro.message || "Não foi possível salvar. Verifique as regras do Firebase.");
  } finally {
    salvar.disabled = false;
    salvar.textContent = editandoId
      ? "Salvar alterações"
      : "Enviar cadastro";
  }
});
  console.info("[Perto Profissionais] Gestão preparada.");
  return true;
}
   
   
