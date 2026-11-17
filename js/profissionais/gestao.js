
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
    addDoc,
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    deleteDoc,
    serverTimestamp
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

  // Botão de acesso pelo perfil.
  const botao = document.createElement("button");
  botao.type = "button";
  botao.id = "ppManageEstablishmentBtn";
  botao.className = "profileAction";
  botao.textContent = "💇 Meu estabelecimento";

  acoes.insertBefore(botao, acoes.querySelector("#logoutBtn"));

  // Painel de gestão.
  const painel = document.createElement("section");
  painel.id = "ppManagementPanel";
  painel.style.cssText = `
    display:none;
    margin-top:16px;
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
          <input id="ppAddress" maxlength="200"
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

    <input id="ppServicePrice" type="number" min="0.01" step="0.01" required
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
  `;

  perfil.appendChild(painel);

  const $ = id => painel.querySelector("#" + id);
  let editandoId = null;
   let estabelecimentoServicosAtual = null;

   
  let servicoEditandoId = null;

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

  $("ppServiceForm").addEventListener("submit", async evento => {
    evento.preventDefault();

    if (!estabelecimentoServicosAtual) {
      return avisar("Selecione um estabelecimento.");
    }

    const nome = $("ppServiceName").value.trim();
    const descricao = $("ppServiceDescription").value.trim();
    const preco = Number($("ppServicePrice").value);
    const duracao = Number($("ppServiceDuration").value);

    if (!nome || !Number.isFinite(preco) || preco <= 0 ||
        !Number.isInteger(duracao) || duracao < 5) {
      return avisar("Confira o nome, preço e duração do serviço.");
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
    $("ppLogo").value = item.logoURL || "";
    $("ppModality").value = item.modalidadeAtendimento || "local";

    editandoId = item.id;
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

      resultado.forEach(documento => {
        const item = { id: documento.id, ...documento.data() };

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
        `;
         
card.querySelector("[data-services]").addEventListener("click", () => {
  estabelecimentoServicosAtual = item;

  $("ppServicesTitle").textContent =
    "Serviços e preços — " + (item.nome || "Estabelecimento");

  $("ppNewEstablishment").style.display = "none";
  $("ppEstablishmentForm").style.display = "none";
  $("ppMyEstablishments").style.display = "none";
  $("ppServicesPanel").style.display = "block";

  $("ppServicesPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
});
        card.querySelector("[data-services]").addEventListener("click", async () => {
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
      });

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao carregar cadastros:", erro);
      lista.textContent =
        "Não foi possível carregar seus estabelecimentos. Verifique as permissões do Firebase.";
    }
  }

  botao.addEventListener("click", async () => {
    const usuario = usuarioAtual();

    if (!usuario) {
      avisar("Entre na sua conta para gerenciar estabelecimentos.");
      return;
    }

    painel.style.display = "block";
    await carregarMeusEstabelecimentos();

    painel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("ppManagementBack").addEventListener("click", () => {
    painel.style.display = "none";
    limparFormulario();
  });

   $("ppServicesBack").addEventListener("click", () => {
  $("ppServicesPanel").style.display = "none";
  $("ppNewEstablishment").style.display = "";
  $("ppMyEstablishments").style.display = "block";

  estabelecimentoServicosAtual = null;
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
     await carregarServicos();
  });

  $("ppCancelForm").addEventListener("click", limparFormulario);

  $("ppEstablishmentForm").addEventListener("submit", async evento => {
    evento.preventDefault();

    const usuario = usuarioAtual();
    if (!usuario) return avisar("Sua sessão expirou. Entre novamente.");

    const nome = $("ppName").value.trim();
    const categoria = $("ppCategory").value;
    const cidade = $("ppCity").value.trim();
    const logoURL = $("ppLogo").value.trim();

    if (!nome || !categoria || !cidade) {
      return avisar("Preencha nome, categoria e cidade.");
    }

    if (logoURL && !/^https?:\/\//i.test(logoURL)) {
      return avisar("Informe um link válido para o logotipo.");
    }

    const modalidadeAtendimento = $("ppModality").value;

    const dados = {
      nome,
      categoria,
      descricao: $("ppDescription").value.trim(),
      cidade,
      bairro: $("ppNeighborhood").value.trim(),
      endereco: $("ppAddress").value.trim(),
      telefone: $("ppPhone").value.trim(),
      logoURL,
      modalidadeAtendimento,
      atualizadoEm: serverTimestamp()
    };

    const salvar = $("ppSaveForm");
    salvar.disabled = true;
    salvar.textContent = "Salvando...";

    try {
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
            ativo: false,
            statusAdmin: "aguardando_aprovacao",
            criadoEm: serverTimestamp()
          }
        );

        avisar("Cadastro enviado para aprovação!");
      }

      limparFormulario();
      await carregarMeusEstabelecimentos();

    } catch (erro) {
      console.error("[Perto Profissionais] Erro ao salvar:", erro);
      avisar("Não foi possível salvar. Verifique as regras do Firestore.");
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
