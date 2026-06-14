/**
 * Orquestra o acesso do aluno: turma → lista (Firestore) → autocomplete + validação manual → confirmação.
 * Mensagens e loading via AcessoAlunoFeedback (sem alert).
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  var F = window.FirebaseApp || {};
  var TF = window.TurmasFirestore;
  var FB = window.AcessoAlunoFeedback;

  if (!S || !TF || !FB) return;

  var isLogout = window.location.search.indexOf("logout=1") !== -1;

  if (isLogout) {
    if (SessaoApp && typeof SessaoApp.limparSessaoAluno === "function") {
      SessaoApp.limparSessaoAluno();
    } else if (S && typeof S.limparSessaoAluno === "function") {
      S.limparSessaoAluno();
    }
    try {
      window.history.replaceState({}, "", "acesso-aluno.html");
    } catch (e) {}
  } else {
    var atual = S.sessaoAtual();
    if (atual && atual.tipo === "aluno") {
      S.irPara(S.urls.painelAluno);
      return;
    }

    var lerPersistida =
      SessaoApp && SessaoApp.lerSessaoAlunoPersistente
        ? SessaoApp.lerSessaoAlunoPersistente
        : S.lerSessaoAlunoPersistente;
    var garantirSessao =
      SessaoApp && SessaoApp.garantirSessaoAluno
        ? SessaoApp.garantirSessaoAluno
        : S.garantirSessaoAluno;

    if (lerPersistida && garantirSessao && F.db && TF) {
      var persistida = lerPersistida();
      if (persistida) {
        garantirSessao(F.db, TF).then(function (restaurada) {
          if (restaurada) S.irPara(S.urls.painelAluno);
        });
      }
    }
  }

  var stepAluno = document.getElementById("step-aluno");
  var stepConfirm = document.getElementById("step-confirm");
  var inpTurma = document.getElementById("alu-turma");
  var btnCarregar = document.getElementById("alu-carregar-turma");
  var btnValidarNome = document.getElementById("alu-validar-nome");
  var inpBusca = document.getElementById("alu-busca");
  var listaEl = document.getElementById("alu-lista");
  var inpHiddenDocId = document.getElementById("alu-aluno-doc-id");
  var erroTurma = document.getElementById("alu-turma-erro");
  var erroBusca = document.getElementById("alu-busca-erro");
  var msgGlobal = document.getElementById("alu-msg");
  var spinnerEl = document.getElementById("alu-spinner");
  var textoConfirm = document.getElementById("alu-confirm-pergunta");
  var btnSim = document.getElementById("alu-confirm-sim");
  var btnNao = document.getElementById("alu-confirm-nao");

  if (!btnCarregar || !inpTurma || !inpBusca || !listaEl) return;

  var listaAlunos = [];
  var turmaAtual = "";
  var selecionado = null;
  var destaqueIdx = -1;

  function controlesTurma() {
    return [inpTurma, btnCarregar];
  }

  function controlesNome() {
    return [inpBusca, btnValidarNome].filter(Boolean);
  }

  function controlesConfirm() {
    return [btnSim, btnNao].filter(Boolean);
  }

  function todosControles() {
    return controlesTurma().concat(controlesNome()).concat(controlesConfirm());
  }

  function msgFeedback(texto, estado) {
    FB.aplicar(msgGlobal, spinnerEl, { texto: texto, estado: estado });
  }

  function erroFirebaseAmigavel(err) {
    var code = err && err.code ? String(err.code) : "";
    if (
      code === "unavailable" ||
      code === "deadline-exceeded" ||
      (err && err.message && /network/i.test(err.message))
    ) {
      return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    }
    if (code === "permission-denied") {
      return "Acesso negado pelo servidor. Peça ao professor para revisar as permissões do Firebase.";
    }
    return err && err.message ? err.message : "Algo deu errado. Tente novamente.";
  }

  function limparSelecao() {
    selecionado = null;
    destaqueIdx = -1;
    if (inpHiddenDocId) inpHiddenDocId.value = "";
    if (inpBusca) inpBusca.value = "";
    if (stepConfirm) stepConfirm.hidden = true;
    if (erroBusca) erroBusca.textContent = "";
    inpBusca.classList.remove("combo-input--selecionado");
  }

  function resetFluxo() {
    listaAlunos = [];
    turmaAtual = "";
    limparSelecao();
    limparEstadoTurmaVisual();
    if (stepAluno) stepAluno.hidden = true;
    if (stepConfirm) stepConfirm.hidden = true;
    if (listaEl) {
      listaEl.innerHTML = "";
      listaEl.hidden = true;
    }
    if (inpBusca) inpBusca.setAttribute("aria-expanded", "false");
  }

  function limparEstadoTurmaVisual() {
    if (!inpTurma) return;
    inpTurma.classList.remove("alu-turma--ok", "alu-turma--erro", "alu-turma--shake");
  }

  function aplicarTurmaOk() {
    if (!inpTurma) return;
    limparEstadoTurmaVisual();
    inpTurma.classList.add("alu-turma--ok");
  }

  function aplicarTurmaErroAnimado() {
    if (!inpTurma) return;
    limparEstadoTurmaVisual();
    inpTurma.classList.add("alu-turma--erro");
    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      inpTurma.classList.add("alu-turma--shake");
      var onEnd = function () {
        inpTurma.removeEventListener("animationend", onEnd);
        inpTurma.classList.remove("alu-turma--shake");
      };
      inpTurma.addEventListener("animationend", onEnd);
    }
    inpTurma.focus();
  }

  function filtrarLista(q) {
    var n = TF.normalizarNomeBusca(q);
    if (!n) return listaAlunos.slice();
    return listaAlunos.filter(function (a) {
      return a.nomeNormalizado.indexOf(n) !== -1;
    });
  }

  function renderSugestoes(filtrados) {
    listaEl.innerHTML = "";
    filtrados.slice(0, 80).forEach(function (a) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.id = "alu-opt-" + a.id;
      li.className = "combo-lista__item";
      li.dataset.docId = a.id;
      li.dataset.nome = a.nome;
      li.textContent = a.nome;
      li.addEventListener("mousedown", function (e) {
        e.preventDefault();
        escolherAluno(a);
      });
      listaEl.appendChild(li);
    });
    listaEl.hidden = filtrados.length === 0;
    inpBusca.setAttribute("aria-expanded", filtrados.length > 0 ? "true" : "false");
  }

  function escolherAluno(aluno) {
    selecionado = { id: aluno.id, nome: S.normalizarNomeAluno(aluno.nome) };
    inpHiddenDocId.value = selecionado.id;
    inpBusca.value = selecionado.nome;
    inpBusca.classList.add("combo-input--selecionado");
    listaEl.hidden = true;
    inpBusca.setAttribute("aria-expanded", "false");
    erroBusca.textContent = "";
    stepConfirm.hidden = false;
    textoConfirm.textContent = "Você é " + selecionado.nome + "?";
    msgFeedback("Nome encontrado na turma. Confirme se é você.", "success");
    inpBusca.focus();
  }

  function tentarValidarNomeManual() {
    erroBusca.textContent = "";
    msgFeedback("", "neutral");
    if (!turmaAtual || !listaAlunos.length) {
      erroBusca.textContent = "Primeiro carregue a turma.";
      msgFeedback("Carregue a turma antes de validar o nome.", "error");
      return;
    }
    var res = TF.resolverNomeContraLista(listaAlunos, inpBusca.value);
    if (res.ok && res.aluno) {
      escolherAluno(res.aluno);
      return;
    }
    if (res.motivo === "ambiguo") {
      erroBusca.textContent =
        "Há mais de um nome parecido. Toque na lista abaixo para escolher o seu.";
      msgFeedback("Vários nomes parecidos — escolha na lista.", "error");
      renderSugestoes(res.matches || []);
      listaEl.hidden = false;
      return;
    }
    if (res.motivo === "curto") {
      erroBusca.textContent = "Digite pelo menos 2 letras do nome.";
      msgFeedback("Nome muito curto.", "error");
      return;
    }
    erroBusca.textContent = "Nome não encontrado na turma.";
    msgFeedback("Nome não encontrado na turma.", "error");
    selecionado = null;
    inpHiddenDocId.value = "";
    inpBusca.classList.remove("combo-input--selecionado");
    stepConfirm.hidden = true;
  }

  inpBusca.addEventListener("input", function () {
    selecionado = null;
    inpHiddenDocId.value = "";
    inpBusca.classList.remove("combo-input--selecionado");
    stepConfirm.hidden = true;
    msgFeedback("", "neutral");
    var filtrados = filtrarLista(inpBusca.value);
    renderSugestoes(filtrados);
    destaqueIdx = filtrados.length > 0 ? 0 : -1;
    atualizarDestaqueVisual(filtrados);
  });

  function atualizarDestaqueVisual(filtrados) {
    var items = listaEl.querySelectorAll(".combo-lista__item");
    items.forEach(function (el, i) {
      el.classList.toggle("combo-lista__item--ativo", i === destaqueIdx);
    });
    if (destaqueIdx >= 0 && filtrados[destaqueIdx]) {
      inpBusca.setAttribute("aria-activedescendant", "alu-opt-" + filtrados[destaqueIdx].id);
    } else {
      inpBusca.removeAttribute("aria-activedescendant");
    }
  }

  inpBusca.addEventListener("keydown", function (e) {
    var filtrados = filtrarLista(inpBusca.value);
    if (!listaEl.hidden && filtrados.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        destaqueIdx = Math.min(destaqueIdx + 1, Math.min(filtrados.length, 80) - 1);
        atualizarDestaqueVisual(filtrados);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        destaqueIdx = Math.max(destaqueIdx - 1, 0);
        atualizarDestaqueVisual(filtrados);
      } else if (e.key === "Enter") {
        if (destaqueIdx >= 0 && filtrados[destaqueIdx]) {
          e.preventDefault();
          escolherAluno(filtrados[destaqueIdx]);
        } else {
          e.preventDefault();
          tentarValidarNomeManual();
        }
      } else if (e.key === "Escape") {
        listaEl.hidden = true;
        inpBusca.setAttribute("aria-expanded", "false");
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      tentarValidarNomeManual();
    }
  });

  document.addEventListener("click", function (e) {
    var wrap = document.querySelector(".combo-wrap");
    if (wrap && !wrap.contains(e.target)) {
      listaEl.hidden = true;
      inpBusca.setAttribute("aria-expanded", "false");
    }
  });

  btnCarregar.addEventListener("click", function () {
    erroTurma.textContent = "";
    limparSelecao();
    limparEstadoTurmaVisual();
    msgFeedback("", "neutral");

    var turma = S.normalizarTurmaId(inpTurma.value);
    if (!turma || turma.length < 2) {
      erroTurma.textContent = "Informe o código da turma.";
      msgFeedback("Turma inválida — informe o código.", "error");
      return;
    }

    if (F.initError || !F.db) {
      var det =
        F.initError && F.initError.message ? " (" + F.initError.message + ")" : "";
      var viaFile = window.location.protocol === "file:";
      msgFeedback(
        viaFile
          ? "Abra pelo servidor: http://localhost:5500/acesso-aluno.html (não use arquivo local)."
          : "Não foi possível conectar ao Firebase" + det + ". Recarregue com Ctrl+Shift+R.",
        "error"
      );
      return;
    }

    FB.setBusy(todosControles(), true);
    msgFeedback("Verificando turma…", "loading");

    TF.turmaCadastrada(F.db, turma)
      .then(function (existe) {
        if (!existe) {
          var err = new Error("TURMA_NAO");
          throw err;
        }
        msgFeedback("Turma encontrada. Carregando alunos…", "loading");
        return TF.listarAlunosTurma(F.db, turma);
      })
      .then(function (alunos) {
        if (!alunos.length) {
          throw new Error("SEM_ALUNOS");
        }
        turmaAtual = turma;
        listaAlunos = alunos;
        aplicarTurmaOk();
        stepAluno.hidden = false;
        msgFeedback("Turma encontrada. Busque seu nome ou use «Validar nome».", "success");
        inpBusca.value = "";
        inpBusca.focus();
        renderSugestoes(listaAlunos);
        destaqueIdx = listaAlunos.length > 0 ? 0 : -1;
        atualizarDestaqueVisual(listaAlunos.length > 80 ? listaAlunos.slice(0, 80) : listaAlunos);
      })
      .catch(function (err) {
        resetFluxo();
        if (err && err.message === "TURMA_NAO") {
          var msgTurma = "Ops! Não encontramos essa turma 😅";
          erroTurma.textContent = msgTurma;
          msgFeedback(msgTurma + " Confira o código com o professor.", "error");
          aplicarTurmaErroAnimado();
          return;
        }
        if (err && err.message === "SEM_ALUNOS") {
          msgFeedback("Esta turma ainda não tem alunos cadastrados.", "error");
          return;
        }
        msgFeedback(erroFirebaseAmigavel(err), "error");
      })
      .then(function () {
        FB.setBusy(todosControles(), false);
      });
  });

  if (btnValidarNome) {
    btnValidarNome.addEventListener("click", function () {
      tentarValidarNomeManual();
    });
  }

  if (btnNao) {
    btnNao.addEventListener("click", function () {
      limparSelecao();
      msgFeedback("", "neutral");
      if (listaAlunos.length) renderSugestoes(listaAlunos);
      inpBusca.focus();
    });
  }

  if (btnSim) {
    btnSim.addEventListener("click", function () {
      msgFeedback("", "neutral");
      if (!turmaAtual) {
        msgFeedback("Carregue a turma novamente.", "error");
        return;
      }
      if (!selecionado || !selecionado.id || !selecionado.nome) {
        erroBusca.textContent = "Selecione um nome na lista ou use «Validar nome».";
        msgFeedback("Escolha um nome válido da turma.", "error");
        return;
      }
      if (inpHiddenDocId.value !== selecionado.id) {
        msgFeedback("Seleção inválida. Escolha seu nome novamente.", "error");
        return;
      }

      FB.setBusy(todosControles(), true);
      msgFeedback("Confirmando…", "loading");

      TF.alunoPertenceTurma(F.db, turmaAtual, selecionado.id)
        .then(function (ok) {
          if (!ok) {
            throw new Error("Este cadastro não está mais válido. Atualize a página ou fale com o professor.");
          }
          S.definirSessao({
            tipo: "aluno",
            turmaId: turmaAtual,
            alunoNome: selecionado.nome,
            alunoDocId: selecionado.id,
            entradaEm: new Date().toISOString(),
          });
          msgFeedback("Entrando…", "success");
          S.irPara(S.urls.painelAluno);
        })
        .catch(function (err) {
          msgFeedback(erroFirebaseAmigavel(err), "error");
        })
        .then(function () {
          FB.setBusy(todosControles(), false);
        });
    });
  }

  inpTurma.addEventListener("input", function () {
    erroTurma.textContent = "";
    limparEstadoTurmaVisual();
  });

  inpTurma.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      btnCarregar.click();
    }
  });

  window.requestAnimationFrame(function () {
    if (inpTurma) {
      try {
        inpTurma.focus({ preventScroll: true });
      } catch (e1) {
        inpTurma.focus();
      }
    }
  });
})();
