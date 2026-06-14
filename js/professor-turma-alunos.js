/**
 * Gerenciamento de alunos por turma — CRUD, busca, importação, stats gamificados.
 */
(function () {
  var S = window.SessaoDemo;
  var F = window.FirebaseApp || {};
  var TF = window.TurmasFirestore;
  var AFS = window.AtividadesFirestore;
  var RFS = window.RespostasFirestore;
  var UI = window.UiFeedback;
  var GAM = window.Gamificacao;

  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  if (
    !TF ||
    typeof TF.listarAlunosTurma !== "function" ||
    typeof TF.adicionarAluno !== "function" ||
    typeof TF.importarAlunos !== "function"
  ) {
    document.addEventListener("DOMContentLoaded", function () {
      var msg =
        "Módulo de turmas desatualizado. Recarregue com Ctrl+Shift+R (js/turmas-firestore.js).";
      if (UI && UI.toast) UI.toast(msg, "erro");
    });
    return;
  }

  var sessao = null;
  var params = new URLSearchParams(window.location.search);
  var turmaId = S.normalizarTurmaId(params.get("turma") || "");

  SessaoApp.aguardarFirebasePronto(F)
    .then(function () {
      return SessaoApp.garantirSessaoProfessor(F.db, F.auth);
    })
    .then(function (s) {
      if (!s) return;
      sessao = s;
      if (!turmaId) {
        S.irPara(S.urls.painelProfessor);
        return;
      }
      iniciarTurmaAlunos();
    })
    .catch(function () {});

  function iniciarTurmaAlunos() {

  var listaAlunosCache = [];
  var statsCache = [];
  var alunoEditandoId = null;
  var ordenacaoAlunos = "nome";
  var isImportando = false;
  var IMPORT_BTN_LABEL = "Cadastrar alunos";
  var metaTurmaNome = turmaId;

  var elEmail = document.getElementById("painel-usuario-email");
  if (elEmail) elEmail.textContent = sessao.email;

  var elCodigoLabel = document.getElementById("turma-codigo-label");
  if (elCodigoLabel) elCodigoLabel.textContent = turmaId;
  var titCab = document.getElementById("turma-titulo-cab");
  var elImportTurmaLabel = document.getElementById("importar-turma-nome-label");

  function toast(t, tipo) {
    if (UI && UI.toast) UI.toast(t, tipo || "info");
  }

  function confirmar(opts) {
    if (UI && UI.confirmar) return UI.confirmar(opts);
    return Promise.resolve(window.confirm(opts.mensagem));
  }

  function msgFirestore(err) {
    if (!err) return "Erro desconhecido.";
    if (err.code === "permission-denied") {
      return "Sem permissão no Firestore. Faça login novamente.";
    }
    return err.message || String(err);
  }

  function garantirAuthFirebase() {
    return new Promise(function (resolve, reject) {
      if (F.initError || !F.auth) {
        reject(new Error("Firebase não inicializou."));
        return;
      }
      var done = false;
      function ok(user) {
        if (done) return;
        done = true;
        if (unsub) unsub();
        if (!user || !user.uid) {
          reject(new Error("AUTH_OFF"));
          return;
        }
        resolve(user);
      }
      var unsub = F.auth.onAuthStateChanged(ok);
      setTimeout(function () {
        if (done) return;
        var cur = F.auth.currentUser;
        if (cur) ok(cur);
        else {
          done = true;
          if (unsub) unsub();
          reject(new Error("AUTH_OFF"));
        }
      }, 6000);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s != null ? String(s) : "";
    return d.innerHTML;
  }

  function iniciais(nome) {
    var p = String(nome || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    if (p.length === 1 && p[0].length >= 2) return p[0].slice(0, 2).toUpperCase();
    return "?";
  }

  function indicadorDesempenho(st) {
    if (!st || !st.respostasCount) {
      return { cls: "aluno-desempenho--neutro", label: "Sem respostas ainda", emoji: "⚪" };
    }
    var media = st.media;
    if (media != null && media >= 90) {
      return { cls: "aluno-desempenho--excelente", label: "Excelente aproveitamento", emoji: "🟢" };
    }
    if (media != null && media >= 70) {
      return { cls: "aluno-desempenho--bom", label: "Bom desempenho", emoji: "🟡" };
    }
    if (media != null) {
      return { cls: "aluno-desempenho--atencao", label: "Precisa de apoio", emoji: "🟠" };
    }
    return { cls: "aluno-desempenho--participando", label: "Participando", emoji: "🔵" };
  }

  function carregarMetaTurma() {
    if (!F.db) return Promise.resolve();
    return TF.obterTurma(F.db, turmaId).then(function (t) {
      metaTurmaNome = t && t.nome ? t.nome : turmaId;
      if (titCab) titCab.textContent = metaTurmaNome;
      if (elImportTurmaLabel) elImportTurmaLabel.textContent = metaTurmaNome + " (" + turmaId + ")";
    });
  }

  function filtrarLista(q) {
    var n = TF.normalizarNomeBusca(q);
    if (!n) return listaAlunosCache.slice();
    return listaAlunosCache.filter(function (a) {
      return a.nomeNormalizado.indexOf(n) !== -1;
    });
  }

  function statsDeAluno(aluno) {
    return statsCache.find(function (s) {
      return s.alunoDocId === aluno.id;
    });
  }

  function ordenarAlunos(lista) {
    var arr = lista.slice();
    if (ordenacaoAlunos === "pontos") {
      arr.sort(function (a, b) {
        var sa = statsDeAluno(a);
        var sb = statsDeAluno(b);
        var diff = (sb ? sb.pontos : 0) - (sa ? sa.pontos : 0);
        if (diff !== 0) return diff;
        return String(a.nome).localeCompare(String(b.nome), "pt-BR");
      });
      return arr;
    }
    if (ordenacaoAlunos === "ativos") {
      arr.sort(function (a, b) {
        var sa = statsDeAluno(a);
        var sb = statsDeAluno(b);
        var diff = (sb ? sb.respostasCount : 0) - (sa ? sa.respostasCount : 0);
        if (diff !== 0) return diff;
        return String(a.nome).localeCompare(String(b.nome), "pt-BR");
      });
      return arr;
    }
    arr.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome), "pt-BR");
    });
    return arr;
  }

  function renderLista(filtrados) {
    var ul = document.getElementById("lista-alunos-turma");
    var vazio = document.getElementById("vazio-alunos");
    var vazioBusca = document.getElementById("vazio-alunos-busca");
    var cont = document.getElementById("turma-contador");
    if (!ul) return;

    if (cont) {
      cont.textContent =
        listaAlunosCache.length +
        " aluno" +
        (listaAlunosCache.length !== 1 ? "s" : "") +
        " cadastrado" +
        (listaAlunosCache.length !== 1 ? "s" : "");
    }

    if (!listaAlunosCache.length) {
      ul.innerHTML = "";
      if (vazio) vazio.hidden = false;
      if (vazioBusca) vazioBusca.hidden = true;
      return;
    }

    if (vazio) vazio.hidden = true;

    if (!filtrados.length) {
      ul.innerHTML = "";
      if (vazioBusca) vazioBusca.hidden = false;
      return;
    }

    if (vazioBusca) vazioBusca.hidden = true;
    ul.innerHTML = "";

    ordenarAlunos(filtrados).forEach(function (aluno) {
      var st = statsDeAluno(aluno);
      var pontos = st ? st.pontos : 0;
      var media = st && st.media != null ? st.media : null;
      var mediaTxt = media != null ? String(media) : "—";
      var resp = st ? st.respostasCount : 0;
      var medal = st && st.medalha ? st.medalha.emoji + " " + st.medalha.nome : "📖 Leitor iniciante";
      var des = indicadorDesempenho(st);

      var li = document.createElement("li");
      li.className = "aluno-card";
      li.innerHTML =
        '<div class="aluno-card__avatar" aria-hidden="true">' +
        escapeHtml(iniciais(aluno.nome)) +
        "</div>" +
        '<div class="aluno-card__corpo">' +
        '<div class="aluno-card__topo">' +
        '<strong class="aluno-card__nome">' +
        escapeHtml(aluno.nome) +
        "</strong>" +
        '<span class="aluno-desempenho ' +
        escapeHtml(des.cls) +
        '" title="' +
        escapeHtml(des.label) +
        '">' +
        '<span aria-hidden="true">' +
        des.emoji +
        "</span> " +
        escapeHtml(des.label) +
        "</span>" +
        "</div>" +
        '<div class="aluno-card__kpis">' +
        "<span><strong>" +
        pontos +
        "</strong> pts / XP</span>" +
        "<span>Medalha: <strong>" +
        escapeHtml(medal) +
        "</strong></span>" +
        "<span><strong>" +
        resp +
        "</strong> atividade" +
        (resp !== 1 ? "s" : "") +
        " respondida" +
        (resp !== 1 ? "s" : "") +
        "</span>" +
        (media != null
          ? "<span>Média <strong>" + escapeHtml(mediaTxt) + "</strong></span>"
          : "") +
        "</div>" +
        "</div>" +
        '<div class="aluno-card__acoes">' +
        '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="editar" data-id="' +
        escapeHtml(aluno.id) +
        '">Editar</button>' +
        '<button type="button" class="btn-link-perigo" data-acao="remover" data-id="' +
        escapeHtml(aluno.id) +
        '" data-nome="' +
        escapeHtml(aluno.nome) +
        '">Remover aluno</button>' +
        "</div>";
      ul.appendChild(li);
    });

    ul.querySelectorAll('[data-acao="editar"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        abrirModalAluno(btn.getAttribute("data-id"));
      });
    });
    ul.querySelectorAll('[data-acao="remover"]').forEach(function (btn) {
      btn.addEventListener("click", function () {
        removerAluno(btn.getAttribute("data-id"), btn.getAttribute("data-nome"));
      });
    });
  }

  function aplicarFiltroBuscaOrdem() {
    var q = document.getElementById("busca-aluno");
    renderLista(filtrarLista(q ? q.value : ""));
  }

  function carregarDados() {
    var sk = document.getElementById("lista-alunos-loading");
    if (sk) sk.hidden = false;
    if (F.initError || !F.db) {
      if (sk) sk.hidden = true;
      toast("Firebase indisponível.", "erro");
      return;
    }

    garantirAuthFirebase()
      .then(function () {
        return Promise.all([
          TF.listarAlunosTurma(F.db, turmaId),
          AFS.listarPorProfessor(F.db, sessao.uid, sessao.email),
        ]);
      })
      .then(function (res) {
        listaAlunosCache = res[0];
        var atvs = res[1].filter(function (a) {
          return S.normalizarTurmaId(a.turmaId || "") === turmaId;
        });
        if (!atvs.length) {
          statsCache = GAM ? GAM.statsPorAlunos(listaAlunosCache, []) : [];
          return;
        }
        return Promise.all(
          atvs.map(function (a) {
            return RFS.listarPorAtividade(F.db, a.id).catch(function () {
              return [];
            });
          })
        ).then(function (arrs) {
          var respostas = [];
          arrs.forEach(function (arr) {
            arr.forEach(function (r) {
              if (S.normalizarTurmaId(r.turmaId || "") === turmaId) respostas.push(r);
            });
          });
          statsCache = GAM ? GAM.statsPorAlunos(listaAlunosCache, respostas) : [];
        });
      })
      .then(function () {
        if (sk) sk.hidden = true;
        aplicarFiltroBuscaOrdem();
      })
      .catch(function (err) {
        if (sk) sk.hidden = true;
        if (err && err.message === "AUTH_OFF") {
          toast("Sessão expirada. Faça login novamente.", "erro");
          setTimeout(function () {
            S.limparSessao();
            S.irPara(S.urls.login);
          }, 1200);
          return;
        }
        toast(msgFirestore(err), "erro");
      });
  }

  function abrirModalAluno(docId) {
    var modal = document.getElementById("modal-aluno");
    var tit = document.getElementById("modal-aluno-titulo");
    var inp = document.getElementById("modal-aluno-nome");
    var msg = document.getElementById("modal-aluno-msg");
    alunoEditandoId = docId || null;
    if (msg) msg.textContent = "";
    if (tit) tit.textContent = docId ? "Editar aluno" : "Adicionar aluno";
    if (inp) {
      if (docId) {
        var a = listaAlunosCache.find(function (x) {
          return x.id === docId;
        });
        inp.value = a ? a.nome : "";
      } else inp.value = "";
    }
    if (modal) {
      modal.hidden = false;
      document.body.classList.add("ui-modal-open");
      if (inp) inp.focus();
    }
  }

  function fecharModalAluno() {
    var modal = document.getElementById("modal-aluno");
    if (modal) modal.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
    alunoEditandoId = null;
  }

  function abrirModalImportar() {
    var modal = document.getElementById("modal-importar-alunos-turma");
    var msg = document.getElementById("importar-msg");
    var ta = document.getElementById("importar-texto");
    if (msg) {
      msg.textContent = "";
      msg.className = "form-painel__msg";
    }
    if (ta) {
      ta.value = "";
      ta.disabled = false;
    }
    setEstadoImportacao(false);
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("ui-modal-open");
    if (ta) ta.focus();
  }

  function fecharModalImportar() {
    var modal = document.getElementById("modal-importar-alunos-turma");
    if (modal) modal.hidden = true;
    setEstadoImportacao(false);
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  function setEstadoImportacao(ativo) {
    isImportando = !!ativo;
    var btn = document.getElementById("btn-importar-confirmar");
    var cancel = document.getElementById("btn-importar-cancelar");
    var ta = document.getElementById("importar-texto");
    if (btn) {
      btn.disabled = isImportando;
      btn.classList.toggle("is-loading", isImportando);
      if (isImportando) {
        btn.innerHTML =
          '<span class="monitor-spinner monitor-spinner--btn" aria-hidden="true"></span> Cadastrando…';
      } else {
        btn.textContent = IMPORT_BTN_LABEL;
      }
      btn.setAttribute("aria-busy", isImportando ? "true" : "false");
    }
    if (cancel) cancel.disabled = isImportando;
    if (ta) ta.disabled = isImportando;
  }

  function processarLinhasImportacao(raw) {
    return String(raw || "")
      .split("\n")
      .map(function (linha) {
        return linha.replace(/\s+/g, " ").trim();
      })
      .filter(function (linha) {
        return linha.length >= 2;
      });
  }

  function removerAluno(id, nome) {
    confirmar({
      titulo: "Remover aluno?",
      mensagem:
        "Tem certeza que deseja remover este aluno da turma? Ele perderá o acesso às atividades desta área.",
      confirmarLabel: "Remover",
      perigo: true,
    }).then(function (ok) {
      if (!ok) return;
      garantirAuthFirebase()
        .then(function () {
          return TF.removerAluno(F.db, turmaId, sessao.uid, id);
        })
        .then(function () {
          listaAlunosCache = listaAlunosCache.filter(function (a) {
            return a.id !== id;
          });
          statsCache = statsCache.filter(function (s) {
            return s.alunoDocId !== id;
          });
          toast("Aluno removido com sucesso.", "ok");
          aplicarFiltroBuscaOrdem();
        })
        .catch(function (e) {
          toast(msgFirestore(e), "erro");
        });
    });
  }

  function onClick(el, fn) {
    if (el) el.addEventListener("click", fn);
  }

  onClick(document.getElementById("btn-add-aluno"), function () {
    abrirModalAluno(null);
  });

  onClick(document.getElementById("modal-aluno-cancelar"), fecharModalAluno);

  var modalAluno = document.getElementById("modal-aluno");
  if (modalAluno) {
    modalAluno.addEventListener("click", function (ev) {
      if (ev.target === modalAluno) fecharModalAluno();
    });
  }

  var formAluno = document.getElementById("form-aluno-modal");
  if (formAluno) {
    formAluno.addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = document.getElementById("modal-aluno-nome");
      var msg = document.getElementById("modal-aluno-msg");
      var nomeVal = nome ? nome.value : "";
      if (!nomeVal || String(nomeVal).trim().length < 2) {
        if (msg) msg.textContent = "Informe o nome completo (mín. 2 caracteres).";
        toast("Nome do aluno inválido.", "erro");
        return;
      }
      if (msg) msg.textContent = "Salvando…";
      var submit = document.getElementById("modal-aluno-salvar");
      if (submit) {
        submit.disabled = true;
        submit.classList.add("is-loading");
      }

      garantirAuthFirebase()
        .then(function () {
          return alunoEditandoId
            ? TF.atualizarNomeAluno(F.db, turmaId, sessao.uid, alunoEditandoId, nomeVal)
            : TF.adicionarAluno(F.db, turmaId, sessao.uid, nomeVal);
        })
        .then(function () {
          if (msg) msg.textContent = "";
          toast(alunoEditandoId ? "Aluno atualizado." : "Aluno cadastrado!", "ok");
          fecharModalAluno();
          carregarDados();
        })
        .catch(function (err) {
          if (err && err.message === "AUTH_OFF") {
            toast("Sessão expirada. Faça login novamente.", "erro");
            S.irPara(S.urls.login);
            return;
          }
          var texto = msgFirestore(err);
          if (msg) msg.textContent = texto;
          toast(texto, "erro");
        })
        .then(function () {
          if (submit) {
            submit.disabled = false;
            submit.classList.remove("is-loading");
          }
        });
    });
  }

  onClick(document.getElementById("btn-importar-lista"), abrirModalImportar);
  onClick(document.getElementById("btn-importar-cancelar"), function () {
    if (!isImportando) fecharModalImportar();
  });

  var modalImport = document.getElementById("modal-importar-alunos-turma");
  if (modalImport) {
    modalImport.addEventListener("click", function (ev) {
      if (ev.target === modalImport && !isImportando) fecharModalImportar();
    });
  }

  onClick(document.getElementById("btn-importar-confirmar"), function () {
    if (isImportando) return;
    var ta = document.getElementById("importar-texto");
    var msg = document.getElementById("importar-msg");
    var linhas = processarLinhasImportacao(ta ? ta.value : "");

    if (msg) {
      msg.textContent = "";
      msg.className = "form-painel__msg";
    }
    if (!linhas.length) {
      if (msg) {
        msg.textContent = "Digite pelo menos um nome válido (mín. 2 caracteres por linha).";
        msg.className = "form-painel__msg form-painel__msg--erro";
      }
      toast("Nenhum nome válido na lista.", "erro");
      return;
    }

    setEstadoImportacao(true);
    if (msg) msg.textContent = "Cadastrando alunos…";

    garantirAuthFirebase()
      .then(function () {
        return TF.importarAlunos(F.db, turmaId, sessao.uid, linhas);
      })
      .then(function (r) {
        if (msg) msg.textContent = "";
        var n = r && typeof r.adicionados === "number" ? r.adicionados : 0;
        if (n > 0) {
          toast(n + " aluno(s) cadastrado(s) com sucesso!", "ok");
        } else {
          toast("Nenhum aluno novo (nomes já cadastrados ou duplicados na lista).", "info");
        }
        fecharModalImportar();
        if (ta) ta.value = "";
        carregarDados();
      })
      .catch(function (err) {
        if (err && err.message === "AUTH_OFF") {
          toast("Sessão expirada. Faça login novamente.", "erro");
          S.irPara(S.urls.login);
          return;
        }
        var texto = msgFirestore(err);
        if (msg) {
          msg.textContent = texto;
          msg.className = "form-painel__msg form-painel__msg--erro";
        }
        toast(texto, "erro");
      })
      .then(function () {
        setEstadoImportacao(false);
      });
  });

  function initAlunosToolbar() {
    var inpBusca = document.getElementById("busca-aluno");
    var selOrdem = document.getElementById("alunos-ordenacao");

    if (inpBusca && !inpBusca._ok) {
      inpBusca._ok = true;
      inpBusca.addEventListener("input", function () {
        aplicarFiltroBuscaOrdem();
      });
    }

    if (selOrdem && !selOrdem._ok) {
      selOrdem._ok = true;
      selOrdem.addEventListener("change", function () {
        ordenacaoAlunos = selOrdem.value || "nome";
        aplicarFiltroBuscaOrdem();
      });
    }
  }

  initAlunosToolbar();

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (isImportando) return;
    var mImp = document.getElementById("modal-importar-alunos-turma");
    var mAl = document.getElementById("modal-aluno");
    if (mImp && !mImp.hidden) fecharModalImportar();
    else if (mAl && !mAl.hidden) fecharModalAluno();
  });

  onClick(document.getElementById("btn-sair"), function () {
    S.limparSessao();
    try {
      if (F.auth && F.auth.signOut) F.auth.signOut();
    } catch (e) {}
    S.irPara(S.urls.login);
  });

  carregarMetaTurma();
  carregarDados();
  }
})();
