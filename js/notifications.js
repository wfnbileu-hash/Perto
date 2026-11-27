/* Alertas em tempo real de pedidos e agendamentos do Perto. */
export function watchRealtimeAlerts({ db, firestore, uid, email, onAlert }) {
  if (!db || !firestore || !uid || typeof onAlert !== "function") {
    return () => {};
  }

  const {
    collection,
    collectionGroup,
    getDocs,
    onSnapshot,
    query,
    where,
    limit
  } = firestore;

  if (!collection || !onSnapshot || !query || !where || !limit) {
    return () => {};
  }

  const listeners = [];
  const estados = new Map();
  const eventosRecentes = new Map();
  let encerrado = false;

  function alertarUmaVez(chave, evento) {
    const agora = Date.now();
    const ocorridoEm = eventosRecentes.get(chave);
    if (ocorridoEm && agora - ocorridoEm < 30000) return;
    eventosRecentes.set(chave, agora);

    try {
      onAlert(evento);
    } catch (erro) {
      console.warn("[Perto alertas] Não foi possível exibir o alerta:", erro);
    }
  }

  function acompanhar(consulta, tipo, papel) {
    if (encerrado) return;

    try {
      let primeiraLeitura = true;
      const cancelar = onSnapshot(consulta, snapshot => {
        if (encerrado) return;

        snapshot.docChanges().forEach(mudanca => {
          const documento = mudanca.doc;
          const dados = documento.data() || {};
          const caminho = documento.ref?.path || documento.id;
          const chave = `${tipo}:${caminho}:${papel}`;
          const estadoAnterior = estados.get(chave) || "";
          const statusAtual = String(dados.status || "");

          if (mudanca.type === "added") {
            // A primeira leitura apenas registra o estado atual: não alerta itens antigos.
            if (!primeiraLeitura) {
              if (tipo === "pedido" && papel === "loja") {
                const status = (statusAtual || "aguardando_confirmacao").toLowerCase();
                const aceito = ["confirmado", "aceito", "aprovado"].includes(status);
                alertarUmaVez(`novo:${tipo}:${caminho}`, {
                  tipo: "pedido",
                  titulo: aceito ? "✅ Novo pedido aceito automaticamente" : "🛍️ Novo pedido para confirmar",
                  mensagem: `Pedido #${documento.id.slice(-8)}${dados.clienteNome ? ` de ${dados.clienteNome}` : ""}.${aceito ? " Já está aceito." : " Aguarda sua confirmação."}`,
                  id: documento.id,
                  duracaoSomMs: 5000
                });
              } else if (tipo === "agendamento" && papel !== "cliente") {
                const status = (statusAtual || "pendente").toLowerCase();
                const aceito = ["confirmado", "aceito", "aprovado"].includes(status);
                alertarUmaVez(`novo:${tipo}:${caminho}`, {
                  tipo: "agendamento",
                  titulo: aceito ? "✅ Agendamento confirmado automaticamente" : "📅 Novo agendamento para confirmar",
                  mensagem: `${dados.clienteNome || "Um cliente"} · ${dados.servicoNome || "Serviço"} · ${dados.data || ""}${dados.inicio ? ` às ${dados.inicio}` : ""}.${aceito ? " Já está confirmado." : " Aguarda confirmação."}`,
                  id: documento.id
                });
              }
            }
            estados.set(chave, statusAtual);
            return;
          }

          if (mudanca.type === "modified") {
            if (statusAtual && statusAtual !== estadoAnterior) {
              if (tipo === "pedido" && papel === "cliente") {
                const aceito = ["confirmado", "aceito", "aprovado"].includes(statusAtual.toLowerCase());
                alertarUmaVez(`status:${chave}:${statusAtual}`, {
                  tipo: "pedido",
                  titulo: aceito ? "✅ Pedido aceito" : "📦 Atualização do pedido",
                  mensagem: `Seu pedido #${documento.id.slice(-8)}: ${statusAtual.replace(/_/g, " ")}.`,
                  id: documento.id
                });
              } else if (tipo === "agendamento" && papel === "cliente") {
                const aceito = ["confirmado", "aceito", "aprovado"].includes(statusAtual.toLowerCase());
                alertarUmaVez(`status:${chave}:${statusAtual}`, {
                  tipo: "agendamento",
                  titulo: aceito ? "✅ Agendamento confirmado" : "📅 Atualização do agendamento",
                  mensagem: `${dados.estabelecimentoNome || "Seu estabelecimento"} · ${dados.servicoNome || "Serviço"} · ${dados.data || ""}${dados.inicio ? ` às ${dados.inicio}` : ""}: ${statusAtual.replace(/_/g, " ")}.`,
                  id: documento.id
                });
              }
            }
            estados.set(chave, statusAtual);
          } else if (mudanca.type === "removed") {
            estados.delete(chave);
          }
        });

        primeiraLeitura = false;
      }, erro => {
        console.warn(`[Perto alertas] Falha ao observar ${tipo}/${papel}:`, erro);
      });

      listeners.push(cancelar);
    } catch (erro) {
      console.warn(`[Perto alertas] Não foi possível iniciar ${tipo}/${papel}:`, erro);
    }
  }

  function acompanharConsulta(construir, tipo, papel) {
    if (encerrado) return;
    try {
      acompanhar(construir(), tipo, papel);
    } catch (erro) {
      console.warn(`[Perto alertas] Consulta indisponível (${tipo}/${papel}):`, erro);
    }
  }

  // Pedidos recebidos pela loja e atualizações dos pedidos feitos pelo cliente.
  acompanharConsulta(
    () => query(collection(db, "pedidos"), where("lojaId", "==", uid), limit(50)),
    "pedido",
    "loja"
  );
  acompanharConsulta(
    () => query(collection(db, "pedidos"), where("clienteUid", "==", uid), limit(50)),
    "pedido",
    "cliente"
  );

  if (collectionGroup) {
    // Clientes recebem atualizações dos próprios agendamentos.
    acompanharConsulta(
      () => query(collectionGroup(db, "agendamentos"), where("clienteId", "==", uid), limit(50)),
      "agendamento",
      "cliente"
    );

    // Profissionais são descobertos pelos convites aceitos e ouvem somente as agendas
    // dos estabelecimentos aos quais pertencem. Isso evita a consulta collectionGroup
    // de agendamentos que as regras atuais do Firestore estão negando.
    if (email && getDocs) {
      getDocs(query(
        collectionGroup(db, "convites"),
        where("email", "==", email.toLowerCase()),
        limit(50)
      )).then(resultado => {
        if (encerrado) return;
        const estabelecimentos = new Set();
        resultado.forEach(convite => {
          const dados = convite.data() || {};
          if (dados.status === "aceito" && dados.profissionalId === uid && dados.estabelecimentoId) {
            estabelecimentos.add(dados.estabelecimentoId);
          }
        });

        estabelecimentos.forEach(estabelecimentoId => {
          acompanharConsulta(
            () => query(
              collection(db, "estabelecimentosProfissionais", estabelecimentoId, "agendamentos"),
              where("profissionalId", "==", uid),
              limit(50)
            ),
            "agendamento",
            `profissional:${estabelecimentoId}`
          );
        });
      }).catch(erro => {
        console.warn("[Perto alertas] Não foi possível localizar estabelecimentos da equipe:", erro);
      });
    }
  }

  // O proprietário recebe alertas das agendas da equipe de seus estabelecimentos.
  if (getDocs) {
    try {
      getDocs(query(
        collection(db, "estabelecimentosProfissionais"),
        where("proprietarioId", "==", uid),
        limit(50)
      )).then(resultado => {
        if (encerrado) return;
        resultado.forEach(estabelecimento => {
          acompanharConsulta(
            () => query(
              collection(db, "estabelecimentosProfissionais", estabelecimento.id, "agendamentos"),
              limit(50)
            ),
            "agendamento",
            `proprietario:${estabelecimento.id}`
          );
        });
      }).catch(erro => {
        console.warn("[Perto alertas] Não foi possível localizar estabelecimentos do proprietário:", erro);
      });
    } catch (erro) {
      console.warn("[Perto alertas] Não foi possível consultar estabelecimentos do proprietário:", erro);
    }
  }

  return () => {
    encerrado = true;
    listeners.splice(0).forEach(cancelar => {
      try {
        cancelar();
      } catch (erro) {
        console.warn("[Perto alertas] Erro ao encerrar listener:", erro);
      }
    });
    estados.clear();
    eventosRecentes.clear();
  };
}
