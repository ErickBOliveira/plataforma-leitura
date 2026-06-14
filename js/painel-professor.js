/**
 * Centro de Comando — professor: turmas, KPIs, atividades, monitor, top 3.
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var AFS = window.AtividadesFirestore;
  var TF = window.TurmasFirestore;
  var RFS = window.RespostasFirestore;
  var UI = window.UiFeedback;
  var GAM = window.Gamificacao;

  var sessao = null;

  SessaoApp.aguardarFirebasePronto(F)
    .then(function () {
      return SessaoApp.garantirSessaoProfessor(F.db, F.auth);
    })
    .then(function (s) {
      if (!s) return;
      sessao = s;
      continuarPainelProfessor();
    })
    .catch(function () {});

  function continuarPainelProfessor() {

  if (!TF || typeof TF.listarTurmasProfessor !== "function") {
    document.addEventListener("DOMContentLoaded", function () {
      var msg =
        "Arquivo js/turmas-firestore.js desatualizado no navegador. Pressione Ctrl+Shift+R para recarregar.";
      if (UI && UI.toast) UI.toast(msg, "erro");
      var ul = document.getElementById("lista-atividades-prof");
      if (ul) {
        ul.innerHTML =
          '<li class="item-atividade"><p class="painel-alerta painel-alerta--erro">' +
          msg +
          "</p></li>";
      }
    });
    return;
  }

  var listaAtividadesCache = [];
  var listaTurmasCache = [];
  var LIMITE_TURMAS_PREVIEW = 4;
  var LIMITE_ATIVIDADES_PREVIEW = 3;
  var respostasCacheTotal = [];
  var turmaEditandoCodigo = null;

  var elEmail = document.getElementById("painel-usuario-email");
  var saudacao = document.getElementById("prof-saudacao");

  function capitalizarPalavra(palavra) {
    var p = String(palavra || "").trim();
    if (!p) return "";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }

  var SUFIXOS_EMAIL_IGNORAR = /^(uninter|edu|br|com|gmail|hotmail|outlook|yahoo)$/i;

  var SOBRENOMES_COMUNS = [
    "oliveira", "silva", "santos", "souza", "sousa", "pereira", "costa", "ferreira",
    "rodrigues", "almeida", "nascimento", "lima", "araujo", "carvalho", "ribeiro",
    "martins", "melo", "barbosa", "castro", "gomes", "lopes", "soares", "correia",
    "dias", "cavalcanti", "monteiro", "cardoso", "freitas", "ramos", "teixeira",
  ];

  /** Separa nomes grudados: erickoliveira → Erick Oliveira. */
  function separarNomeGrudado(palavra) {
    var p = String(palavra || "").trim().toLowerCase();
    if (!p) return "";
    if (/\s/.test(p)) {
      return p.split(/\s+/).map(capitalizarPalavra).join(" ");
    }

    var i;
    for (i = 0; i < SOBRENOMES_COMUNS.length; i++) {
      var sob = SOBRENOMES_COMUNS[i];
      if (p.length > sob.length + 2 && p.slice(-sob.length) === sob) {
        var primeiro = p.slice(0, -sob.length);
        if (primeiro.length >= 2) {
          return capitalizarPalavra(primeiro) + " " + capitalizarPalavra(sob);
        }
      }
    }

    if (p.length > 8) {
      for (var len = 4; len <= Math.min(7, p.length - 3); len++) {
        var a = p.slice(0, len);
        var b = p.slice(len);
        if (b.length >= 4) {
          return capitalizarPalavra(a) + " " + capitalizarPalavra(b);
        }
      }
    }

    return capitalizarPalavra(p);
  }

  function formatarParteNome(parte) {
    var raw = String(parte || "").trim();
    if (!raw || SUFIXOS_EMAIL_IGNORAR.test(raw)) return "";
    if (/\s/.test(raw)) {
      return raw.split(/\s+/).map(capitalizarPalavra).join(" ");
    }
    return separarNomeGrudado(raw);
  }

  function nomeDePartes(partes) {
    return (partes || [])
      .map(formatarParteNome)
      .filter(function (x) {
        return x.length > 0;
      })
      .join(" ");
  }

  /** Texto com espaços → "Erick Oliveira". */
  function nomeCompletoDeTexto(str) {
    return nomeDePartes(String(str || "").trim().split(/\s+/));
  }

  /** E-mail → erickoliveira.uninter → Erick Oliveira. */
  function nomeCompletoDoEmail(email) {
    if (!email) return "";
    var local = String(email).split("@")[0] || "";
    return nomeDePartes(local.split("."));
  }

  function nomeProfessor(user) {
    var display = user && user.displayName ? String(user.displayName).trim() : "";
    if (display) {
      if (/\s/.test(display)) return nomeCompletoDeTexto(display);
      var doDisplay = separarNomeGrudado(display);
      if (doDisplay.indexOf(" ") >= 0) return doDisplay;
    }
    var email = (user && user.email) || (sessao && sessao.email) || "";
    var doEmail = nomeCompletoDoEmail(email);
    if (doEmail) return doEmail;
    if (display) return separarNomeGrudado(display);
    return "";
  }

  function atualizarCabecalhoProfessor(user) {
    var nome = nomeProfessor(user);
    if (saudacao) {
      if (nome) {
        saudacao.innerHTML =
          'Olá, Professor <strong class="painel-topo__nome">' +
          escapeHtml(nome) +
          "</strong> 👋";
      } else {
        saudacao.textContent = "Olá, Professor 👋";
      }
    }
    var emailExibir = (user && user.email) || (sessao && sessao.email) || "—";
    if (elEmail) elEmail.textContent = emailExibir;
  }

  atualizarCabecalhoProfessor(null);

  if (F.auth && typeof F.auth.onAuthStateChanged === "function") {
    F.auth.onAuthStateChanged(function (user) {
      if (user) atualizarCabecalhoProfessor(user);
    });
  }

  /* Confirma que o HTML novo carregou (não é cache da versão antiga). */
  var versaoTag = document.getElementById("painel-versao-tag");
  var tituloDash = document.getElementById("titulo-dash-prof");
  if (!versaoTag || !tituloDash || tituloDash.textContent.indexOf("Centro de Comando") === -1) {
    console.warn(
      "[Ler & Aprender] Painel antigo em cache. Use Ctrl+Shift+R ou http://localhost:5500/painel-professor.html"
    );
  }

  var btnSair = document.getElementById("btn-sair");
  if (btnSair) {
    btnSair.addEventListener("click", function () {
      S.limparSessao();
      try {
        if (F.auth && F.auth.signOut) F.auth.signOut();
      } catch (e) {}
      S.irPara(S.urls.login);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s != null ? String(s) : "";
    return d.innerHTML;
  }

  function toast(texto, tipo) {
    if (UI && UI.toast) UI.toast(texto, tipo || "info");
  }

  function msgFirestore(err) {
    if (!err) return "Erro desconhecido.";
    var code = err.code || "";
    if (code === "permission-denied") {
      return "Sem permissão no Firestore. Faça login novamente e confira as regras de segurança.";
    }
    if (code === "unavailable") return "Firestore indisponível. Verifique sua internet.";
    return err.message || String(err);
  }

  /** Garante token Firebase Auth antes de ler/gravar (sessionStorage sozinho não basta). */
  function garantirAuthFirebase() {
    return new Promise(function (resolve, reject) {
      if (F.initError || !F.auth) {
        reject(new Error("Firebase não inicializou. Use http://localhost:5500"));
        return;
      }
      var finalizado = false;
      function ok(user) {
        if (finalizado) return;
        finalizado = true;
        if (unsub) unsub();
        if (!user || !user.uid) {
          reject(new Error("AUTH_OFF"));
          return;
        }
        if (sessao && user.uid !== sessao.uid) {
          S.definirSessao({
            uid: user.uid,
            email: user.email || sessao.email,
            tipo: "professor",
            loginEm: new Date().toISOString(),
          });
        }
        atualizarCabecalhoProfessor(user);
        resolve(user);
      }
      var unsub = F.auth.onAuthStateChanged(ok);
      setTimeout(function () {
        if (finalizado) return;
        var cur = F.auth.currentUser;
        if (cur) ok(cur);
        else {
          finalizado = true;
          if (unsub) unsub();
          reject(new Error("AUTH_OFF"));
        }
      }, 6000);
    });
  }

  function redirecionarLogin() {
    toast("Sessão expirada. Entre novamente com e-mail e senha.", "erro");
    setTimeout(function () {
      S.limparSessao();
      try {
        if (F.auth && F.auth.signOut) F.auth.signOut();
      } catch (e) {}
      S.irPara(S.urls.login);
    }, 1200);
  }

  function confirmar(opts) {
    if (UI && UI.confirmar) return UI.confirmar(opts);
    return Promise.resolve(window.confirm(opts.mensagem));
  }

  function textoPreview(raw) {
    if (window.RichTextUtils && window.RichTextUtils.stripHtml) {
      return window.RichTextUtils.stripHtml(raw || "");
    }
    return String(raw || "");
  }

  /* ---------- Turmas ---------- */
  var RECENTE_TURMA_MS = 30 * 24 * 60 * 60 * 1000;
  var turmasBuscaQuery = "";
  var turmasOrdenacao = "recentes";

  function tsValor(v) {
    if (v == null) return 0;
    if (typeof v.toDate === "function") return v.toDate().getTime();
    if (typeof v === "string" || typeof v === "number") return new Date(v).getTime() || 0;
    return 0;
  }

  function tsTurmaRecente(t) {
    if (t && typeof t._ultimoMovimento === "number") return t._ultimoMovimento;
    return tsValor(t && t.atualizadoEm);
  }

  function normalizarBuscaTurma(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function turmasDaTurmaId(codigo) {
    var turmaN = S.normalizarTurmaId(codigo);
    return listaAtividadesCache.filter(function (a) {
      return S.normalizarTurmaId(a.turmaId || "") === turmaN;
    });
  }

  function respostasDaTurmaId(codigo) {
    var turmaN = S.normalizarTurmaId(codigo);
    return respostasCacheTotal.filter(function (r) {
      return S.normalizarTurmaId(r.turmaId || "") === turmaN;
    });
  }

  function calcMetricasTurma(t) {
    var codigo = t.codigo || t.id;
    var atvs = turmasDaTurmaId(codigo);
    var resps = respostasDaTurmaId(codigo);
    var agora = Date.now();
    var ultAtv = 0;
    var ultResp = 0;
    var atvRecente = false;
    var respRecente = false;

    atvs.forEach(function (a) {
      var ts = tsValor(a.criadoEm);
      if (ts > ultAtv) ultAtv = ts;
      if (agora - ts < RECENTE_TURMA_MS) atvRecente = true;
    });
    resps.forEach(function (r) {
      var ts = tsValor(r.timestamp != null ? r.timestamp : r.enviadoEm);
      if (ts > ultResp) ultResp = ts;
      if (agora - ts < RECENTE_TURMA_MS) respRecente = true;
    });

    var qAlunos = typeof t.quantidadeAlunos === "number" ? t.quantidadeAlunos : 0;
    var qAtv = atvs.length;
    var scoreAtividade = resps.filter(function (r) {
      return agora - tsValor(r.timestamp != null ? r.timestamp : r.enviadoEm) < RECENTE_TURMA_MS;
    }).length * 10 + resps.length;

    var status = "cinza";
    var statusLabel = "Sem atividades";
    if (qAtv === 0) {
      status = "cinza";
      statusLabel = "Sem atividades ou inativa";
    } else if (atvRecente || respRecente) {
      status = "verde";
      statusLabel = "Atividades ou respostas recentes";
    } else {
      status = "amarelo";
      statusLabel = "Sem respostas recentes";
    }

    return {
      quantidadeAlunos: qAlunos,
      quantidadeAtividades: qAtv,
      status: status,
      statusLabel: statusLabel,
      scoreAtividade: scoreAtividade,
      _ultimoMovimento: Math.max(tsValor(t.atualizadoEm), ultAtv, ultResp),
    };
  }

  function enriquecerTurmasCache() {
    listaTurmasCache.forEach(function (t) {
      var m = calcMetricasTurma(t);
      t.quantidadeAlunos = m.quantidadeAlunos;
      t.quantidadeAtividades = m.quantidadeAtividades;
      t.statusVisual = m.status;
      t.statusLabel = m.statusLabel;
      t.scoreAtividade = m.scoreAtividade;
      t._ultimoMovimento = m._ultimoMovimento;
    });
  }

  function turmaPassaBusca(t) {
    var q = normalizarBuscaTurma(turmasBuscaQuery);
    if (!q) return true;
    var nome = normalizarBuscaTurma(t.nome);
    var cod = normalizarBuscaTurma(t.codigo);
    return nome.indexOf(q) !== -1 || cod.indexOf(q) !== -1;
  }

  function ordenarTurmasLista(turmas, modo) {
    var lista = turmas.slice();
    if (modo === "alfabetica") {
      lista.sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome), "pt-BR");
      });
      return lista;
    }
    if (modo === "ativas") {
      lista.sort(function (a, b) {
        var diff = (b.scoreAtividade || 0) - (a.scoreAtividade || 0);
        if (diff !== 0) return diff;
        return String(a.nome).localeCompare(String(b.nome), "pt-BR");
      });
      return lista;
    }
    lista.sort(function (a, b) {
      var diff = tsTurmaRecente(b) - tsTurmaRecente(a);
      if (diff !== 0) return diff;
      return String(a.nome).localeCompare(String(b.nome), "pt-BR");
    });
    return lista;
  }

  function obterTurmasParaExibicao(opts) {
    var incluirArquivadas = opts && opts.incluirArquivadas;
    var limite = opts && typeof opts.limite === "number" ? opts.limite : null;
    var filtradas = listaTurmasCache.filter(function (t) {
      if (!incluirArquivadas && t.arquivada) return false;
      return turmaPassaBusca(t);
    });
    var ordenadas = ordenarTurmasLista(filtradas, turmasOrdenacao);
    if (limite != null) ordenadas = ordenadas.slice(0, limite);
    return ordenadas;
  }

  function emojiStatusTurma(status) {
    if (status === "verde") return "🟢";
    if (status === "amarelo") return "🟡";
    return "⚪";
  }

  function atualizarLinkTurmas(total) {
    var link = document.getElementById("link-ver-todas-turmas");
    if (!link) return;
    var ativas = listaTurmasCache.filter(function (t) {
      return !t.arquivada;
    }).length;
    link.hidden = ativas === 0;
    if (ativas > 0) link.textContent = "Ver todas →";
  }

  function htmlTurmaCard(t) {
    var status = t.statusVisual || "cinza";
    return (
      '<div class="turma-card__topo">' +
      '<span class="turma-card__status turma-card__status--' +
      escapeHtml(status) +
      '" title="' +
      escapeHtml(t.statusLabel || "") +
      '" aria-label="' +
      escapeHtml(t.statusLabel || "") +
      '">' +
      emojiStatusTurma(status) +
      "</span>" +
      (t.arquivada
        ? '<span class="turma-card__badge-arquivada">Arquivada</span>'
        : "") +
      "</div>" +
      '<h3 class="turma-card__nome">' +
      escapeHtml(t.nome) +
      "</h3>" +
      '<div class="turma-card__indicadores">' +
      '<span class="turma-card__chip" title="Alunos cadastrados">' +
      '<span class="turma-card__chip-ico" aria-hidden="true">👥</span>' +
      "<strong>" +
      (t.quantidadeAlunos || 0) +
      "</strong> alunos" +
      "</span>" +
      '<span class="turma-card__chip" title="Atividades vinculadas">' +
      '<span class="turma-card__chip-ico" aria-hidden="true">📚</span>' +
      "<strong>" +
      (t.quantidadeAtividades || 0) +
      "</strong> atividades" +
      "</span>" +
      "</div>" +
      '<p class="turma-card__cod">Código: <strong>' +
      escapeHtml(t.codigo) +
      "</strong></p>" +
      '<div class="turma-card__acoes">' +
      '<a class="btn-primario btn-primario--compacto" href="' +
      S.urls.gerenciarTurma +
      "?turma=" +
      encodeURIComponent(t.codigo) +
      '">Gerenciar turma</a>' +
      '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="editar-turma" data-codigo="' +
      escapeHtml(t.codigo) +
      '">Editar</button>' +
      (t.arquivada
        ? ""
        : '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="arquivar-turma" data-codigo="' +
          escapeHtml(t.codigo) +
          '" data-nome="' +
          escapeHtml(t.nome) +
          '">Arquivar</button>') +
      '<button type="button" class="btn-mini btn-mini--perigo" data-acao="excluir-turma" data-codigo="' +
      escapeHtml(t.codigo) +
      '" data-nome="' +
      escapeHtml(t.nome) +
      '">Excluir</button>' +
      "</div>"
    );
  }

  function vincularAcoesTurmas(grid) {
    if (!grid) return;
    grid.querySelectorAll('[data-acao="editar-turma"]').forEach(function (btn) {
      if (btn._turmaAcaoOk) return;
      btn._turmaAcaoOk = true;
      btn.addEventListener("click", function () {
        abrirModalTurma(btn.getAttribute("data-codigo"));
      });
    });
    grid.querySelectorAll('[data-acao="arquivar-turma"]').forEach(function (btn) {
      if (btn._turmaAcaoOk) return;
      btn._turmaAcaoOk = true;
      btn.addEventListener("click", function () {
        arquivarTurmaConfirm(btn.getAttribute("data-codigo"), btn.getAttribute("data-nome"));
      });
    });
    grid.querySelectorAll('[data-acao="excluir-turma"]').forEach(function (btn) {
      if (btn._turmaAcaoOk) return;
      btn._turmaAcaoOk = true;
      btn.addEventListener("click", function () {
        excluirTurmaConfirm(btn.getAttribute("data-codigo"), btn.getAttribute("data-nome"));
      });
    });
  }

  function renderTurmasEmGrid(grid, turmas) {
    if (!grid) return;
    grid.innerHTML = "";
    turmas.forEach(function (t) {
      var card = document.createElement("article");
      card.className =
        "turma-card turma-card--" + (t.statusVisual || "cinza") + (t.arquivada ? " turma-card--arquivada" : "");
      card.dataset.codigoTurma = t.codigo;
      card.innerHTML = htmlTurmaCard(t);
      grid.appendChild(card);
    });
    vincularAcoesTurmas(grid);
  }

  function renderGridTurmas() {
    var grid = document.getElementById("grid-turmas-prof");
    var vazio = document.getElementById("vazio-turmas-prof");
    var vazioBusca = document.getElementById("vazio-turmas-busca");
    if (!grid) return;

    var ativasTotal = listaTurmasCache.filter(function (t) {
      return !t.arquivada;
    }).length;

    if (!ativasTotal) {
      grid.innerHTML = "";
      if (vazioBusca) vazioBusca.hidden = true;
      if (vazio) vazio.hidden = false;
      atualizarLinkTurmas(0);
      return;
    }

    if (vazio) vazio.hidden = true;
    var lista = obterTurmasParaExibicao({ incluirArquivadas: false, limite: LIMITE_TURMAS_PREVIEW });

    if (!lista.length) {
      grid.innerHTML = "";
      if (vazioBusca) vazioBusca.hidden = !turmasBuscaQuery.trim();
      atualizarLinkTurmas(ativasTotal);
      return;
    }

    if (vazioBusca) vazioBusca.hidden = true;
    atualizarLinkTurmas(ativasTotal);
    renderTurmasEmGrid(grid, lista);
  }

  function abrirModalTurmasTodas() {
    var modal = document.getElementById("modal-turmas-todas");
    var corpo = document.getElementById("modal-turmas-todas-corpo");
    var sub = document.getElementById("modal-turmas-todas-sub");
    if (!modal || !corpo) return;
    if (!listaTurmasCache.length) {
      toast("Nenhuma turma cadastrada ainda.", "info");
      return;
    }
    var ordenadas = obterTurmasParaExibicao({ incluirArquivadas: true });
    if (sub) {
      sub.textContent =
        ordenadas.length +
        " turma" +
        (ordenadas.length > 1 ? "s" : "") +
        " (inclui arquivadas).";
    }
    corpo.innerHTML = '<div class="grid-turmas"></div>';
    renderTurmasEmGrid(corpo.querySelector(".grid-turmas"), ordenadas);
    modal.hidden = false;
    document.body.classList.add("ui-modal-open");
  }

  function atualizarLinkAtividades(total) {
    var link = document.getElementById("link-ver-historico-atv");
    if (!link) return;
    link.hidden = total === 0;
    if (total > 0) link.textContent = "Ver histórico completo →";
  }

  function fecharModalTurmasTodas() {
    var modal = document.getElementById("modal-turmas-todas");
    if (modal) modal.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  function popularSelectRanking(turmas) {
    var sel = document.getElementById("ranking-turma-select");
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione a turma…</option>';
    turmas.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.codigo;
      o.textContent = t.nome + " (" + t.codigo + ")";
      sel.appendChild(o);
    });
  }

  function abrirModalTurma(codigoExistente) {
    var modal = document.getElementById("modal-turma");
    var tit = document.getElementById("modal-turma-titulo");
    var inpNome = document.getElementById("modal-turma-nome");
    var inpCod = document.getElementById("modal-turma-codigo");
    var msg = document.getElementById("modal-turma-msg");
    if (!modal || !inpNome || !inpCod) return;
    turmaEditandoCodigo = codigoExistente || null;
    if (msg) msg.textContent = "";
    if (tit) tit.textContent = turmaEditandoCodigo ? "Editar turma" : "Nova turma";
    if (turmaEditandoCodigo) {
      var t = listaTurmasCache.find(function (x) {
        return x.codigo === turmaEditandoCodigo;
      });
      inpNome.value = t ? t.nome : "";
      inpCod.value = turmaEditandoCodigo;
      inpCod.disabled = true;
    } else {
      inpNome.value = "";
      inpCod.value = "";
      inpCod.disabled = false;
    }
    modal.hidden = false;
    document.body.classList.add("ui-modal-open");
    inpNome.focus();
  }

  function fecharModalTurma() {
    var modal = document.getElementById("modal-turma");
    if (modal) modal.hidden = true;
    document.body.classList.remove("ui-modal-open");
    turmaEditandoCodigo = null;
  }

  function arquivarTurmaConfirm(codigo, nome) {
    confirmar({
      titulo: "Arquivar turma?",
      mensagem:
        "A turma «" +
        (nome || codigo) +
        "» sairá da listagem principal. Você ainda pode vê-la em «Ver todas».",
      confirmarLabel: "Arquivar",
    }).then(function (ok) {
      if (!ok) return;
      TF.arquivarTurma(F.db, codigo, sessao.uid)
        .then(function () {
          toast("Turma arquivada.", "ok");
          var t = listaTurmasCache.find(function (x) {
            return x.codigo === codigo;
          });
          if (t) t.arquivada = true;
          enriquecerTurmasCache();
          renderGridTurmas();
        })
        .catch(function (err) {
          toast(err.message || "Erro ao arquivar.", "erro");
        });
    });
  }

  function excluirTurmaConfirm(codigo, nome) {
    confirmar({
      titulo: "Excluir turma?",
      mensagem: "Tem certeza que deseja excluir esta turma?",
      confirmarLabel: "Excluir",
      perigo: true,
    }).then(function (ok) {
      if (!ok) return;
      TF.excluirTurma(F.db, codigo, sessao.uid)
        .then(function () {
          toast("Turma excluída com sucesso.", "ok");
          listaTurmasCache = listaTurmasCache.filter(function (x) {
            return x.codigo !== codigo;
          });
          enriquecerTurmasCache();
          renderGridTurmas();
          popularSelectRanking(
            listaTurmasCache.filter(function (t) {
              return !t.arquivada;
            })
          );
          atualizarKpis(listaTurmasCache, listaAtividadesCache, respostasCacheTotal);
          if (window.LeiturasProfessor && typeof window.LeiturasProfessor.definirTurmas === "function") {
            window.LeiturasProfessor.definirTurmas(listaTurmasCache);
          }
        })
        .catch(function (err) {
          toast(err.message || "Erro ao excluir.", "erro");
        });
    });
  }

  var btnNovaTurma = document.getElementById("btn-nova-turma");
  if (btnNovaTurma) btnNovaTurma.addEventListener("click", function () {
    abrirModalTurma(null);
  });

  var btnCancelTurma = document.getElementById("modal-turma-cancelar");
  if (btnCancelTurma) btnCancelTurma.addEventListener("click", fecharModalTurma);

  var formTurmaModal = document.getElementById("form-turma-modal");
  if (formTurmaModal) {
    formTurmaModal.addEventListener("submit", function (e) {
      e.preventDefault();
      var nome = document.getElementById("modal-turma-nome").value;
      var cod = document.getElementById("modal-turma-codigo").value;
      var codNorm = S.normalizarTurmaId(cod);
      var msgModal = document.getElementById("modal-turma-msg");
      var submit = document.getElementById("modal-turma-salvar");

      if (!nome || String(nome).trim().length < 2) {
        if (msgModal) msgModal.textContent = "Informe o nome da turma.";
        toast("Informe o nome da turma.", "erro");
        return;
      }
      if (!turmaEditandoCodigo && (!codNorm || codNorm.length < 2)) {
        if (msgModal) msgModal.textContent = "Código da turma inválido (mín. 2 caracteres).";
        toast("Código da turma inválido.", "erro");
        return;
      }
      if (msgModal) msgModal.textContent = "Salvando…";
      if (submit) submit.disabled = true;

      garantirAuthFirebase()
        .then(function () {
          return TF.salvarTurma(
            F.db,
            { nome: nome, codigo: turmaEditandoCodigo || codNorm },
            sessao.uid
          );
        })
        .then(function () {
          if (msgModal) msgModal.textContent = "";
          toast(turmaEditandoCodigo ? "Turma atualizada." : "Turma criada!", "ok");
          fecharModalTurma();
          carregarTudo();
        })
        .catch(function (err) {
          if (err && err.message === "AUTH_OFF") {
            redirecionarLogin();
            return;
          }
          var texto = msgFirestore(err);
          if (msgModal) msgModal.textContent = texto;
          toast(texto, "erro");
        })
        .then(function () {
          if (submit) submit.disabled = false;
        });
    });
  }

  var modalTurmaEl = document.getElementById("modal-turma");
  if (modalTurmaEl) {
    modalTurmaEl.addEventListener("click", function (ev) {
      if (ev.target === modalTurmaEl) fecharModalTurma();
    });
  }

  /* ---------- KPIs ---------- */
  function atualizarKpis(turmas, atividades, respostas) {
    var elTurmas = document.getElementById("dash-kpi-turmas");
    var elAlunos = document.getElementById("dash-kpi-alunos");
    var elAtv = document.getElementById("dash-kpi-total-atividades");
    var elResp = document.getElementById("dash-kpi-respostas");
    var elMedia = document.getElementById("dash-kpi-media");

    var totalAlunos = 0;
    turmas.forEach(function (t) {
      totalAlunos += t.quantidadeAlunos || 0;
    });

    var notas = [];
    (respostas || []).forEach(function (r) {
      if (r.pontuacao && typeof r.pontuacao.nota10 === "number") notas.push(r.pontuacao.nota10);
    });
    var mediaStr = "—";
    if (notas.length) {
      mediaStr = String(
        Math.round((notas.reduce(function (a, b) {
          return a + b;
        }, 0) /
          notas.length) *
          10) /
          10
      );
    }

    if (elTurmas) elTurmas.textContent = String(turmas.length);
    if (elAlunos) elAlunos.textContent = String(totalAlunos);
    if (elAtv) elAtv.textContent = String(atividades.length);
    if (elResp) elResp.textContent = String(respostas.length);
    if (elMedia) elMedia.textContent = mediaStr;
  }

  /* ---------- Atividades ---------- */
  function criarItemAtividadeLi(a) {
    var li = document.createElement("li");
    li.className = "item-atividade";
    li.dataset.atividadeId = a.id;
    var data = new Date(a.criadoEm).toLocaleDateString("pt-BR");
    var nq =
      a.questoes && a.questoes.length
        ? a.questoes.length + " pergunta" + (a.questoes.length > 1 ? "s" : "")
        : "—";
    var turmaLinha = a.turmaId
      ? '<span class="item-atividade__meta">Turma: ' + escapeHtml(a.turmaId) + " · </span>"
      : "";
    var prev = textoPreview(a.texto);
    var gabCls = a.gabaritoLiberado ? "badge-gabarito--ok" : "badge-gabarito--oculto";
    var gabTxt = a.gabaritoLiberado ? "Gabarito liberado" : "Gabarito oculto";
    var btnGabTxt = a.gabaritoLiberado ? "Ocultar gabarito" : "Liberar gabarito";
    li.innerHTML =
      '<div class="item-atividade__corpo">' +
      "<strong class=\"item-atividade__titulo\">" +
      escapeHtml(a.titulo) +
      "</strong>" +
      '<span class="badge-gabarito ' +
      gabCls +
      '">' +
      escapeHtml(gabTxt) +
      "</span>" +
      '<span class="item-atividade__meta">' +
      turmaLinha +
      escapeHtml(data) +
      " · " +
      escapeHtml(nq) +
      "</span></div>" +
      '<p class="item-atividade__trecho">' +
      escapeHtml(prev.length > 120 ? prev.slice(0, 120) + "…" : prev) +
      "</p>" +
      '<div class="item-atividade__acoes item-atividade__acoes--inline">' +
      '<a class="btn-secundario btn-secundario--compacto" href="' +
      S.urls.novaAtividade +
      "?edit=" +
      encodeURIComponent(a.id) +
      '">Editar</a>' +
      '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="gabarito-atv" data-liberado="' +
      (a.gabaritoLiberado ? "1" : "0") +
      '">' +
      escapeHtml(btnGabTxt) +
      "</button>" +
      '<a class="btn-secundario btn-secundario--compacto" href="' +
      S.urls.novaAtividade +
      "?duplicar=" +
      encodeURIComponent(a.id) +
      '">Duplicar</a>' +
      '<button type="button" class="btn-mini btn-mini--perigo" data-acao="excluir-atv">Excluir</button>' +
      "</div>";
    return li;
  }

  function renderListaAtividadesEmUl(ul, lista) {
    if (!ul) return;
    ul.innerHTML = "";
    lista.forEach(function (a) {
      ul.appendChild(criarItemAtividadeLi(a));
    });
  }

  function renderListaAtividades(ul, vazio, lista) {
    if (lista.length === 0) {
      if (ul) ul.innerHTML = "";
      if (vazio) vazio.hidden = false;
      atualizarLinkAtividades(0);
      return;
    }
    if (vazio) vazio.hidden = true;
    atualizarLinkAtividades(lista.length);
    renderListaAtividadesEmUl(ul, lista.slice(0, LIMITE_ATIVIDADES_PREVIEW));
  }

  function abrirModalAtividadesHistorico() {
    var modal = document.getElementById("modal-atividades-historico");
    var ul = document.getElementById("lista-atividades-modal");
    var sub = document.getElementById("modal-atividades-historico-sub");
    if (!modal || !ul) return;
    if (!listaAtividadesCache.length) {
      toast("Nenhuma atividade criada ainda.", "info");
      return;
    }
    if (sub) {
      sub.textContent =
        listaAtividadesCache.length +
        " atividade" +
        (listaAtividadesCache.length > 1 ? "s" : "") +
        " no histórico.";
    }
    renderListaAtividadesEmUl(ul, listaAtividadesCache);
    modal.hidden = false;
    document.body.classList.add("ui-modal-open");
  }

  function fecharModalAtividadesHistorico() {
    var modal = document.getElementById("modal-atividades-historico");
    if (modal) modal.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  function atualizarListasAtividadesVisiveis() {
    renderListaAtividades(
      document.getElementById("lista-atividades-prof"),
      document.getElementById("vazio-atividades-prof"),
      listaAtividadesCache
    );
    var modal = document.getElementById("modal-atividades-historico");
    if (modal && !modal.hidden) {
      renderListaAtividadesEmUl(
        document.getElementById("lista-atividades-modal"),
        listaAtividadesCache
      );
    }
  }

  function tratarAcaoAtividade(btn, li) {
    var id = li && li.dataset.atividadeId;
    if (!id) return;
    var atv = listaAtividadesCache.find(function (x) {
      return x.id === id;
    });
    if (!atv) return;

    if (btn.getAttribute("data-acao") === "excluir-atv") {
      var titulo = atv.titulo || "esta atividade";
      var msg =
        "Excluir \"" +
        titulo +
        "\"? As respostas dos alunos permanecem no sistema, mas a atividade deixa de aparecer nas listas.";
      var confirmarFn = UI && UI.confirmar
        ? UI.confirmar({
            titulo: "Excluir atividade",
            mensagem: msg,
            confirmarLabel: "Excluir",
            perigo: true,
          })
        : Promise.resolve(window.confirm(msg));
      confirmarFn
        .then(function (ok) {
          if (!ok) return null;
          return AFS.excluir(F.db, id);
        })
        .then(function (feito) {
          if (feito === null) return;
          toast("Atividade excluída.", "ok");
          listaAtividadesCache = listaAtividadesCache.filter(function (x) {
            return x.id !== id;
          });
          invalidarRelatorioAtvMap();
          atualizarListasAtividadesVisiveis();
          popularSelectMonitor(listaAtividadesCache);
          carregarTudoKpisOnly();
        })
        .catch(function (err) {
          toast(msgFirestore(err), "erro");
        });
      return;
    }

    if (btn.getAttribute("data-acao") === "gabarito-atv") {
      var liberar = btn.getAttribute("data-liberado") !== "1";
      AFS.definirGabaritoLiberado(F.db, id, liberar)
        .then(function () {
          atv.gabaritoLiberado = liberar;
          toast(liberar ? "Gabarito liberado para os alunos." : "Gabarito oculto para os alunos.", "ok");
          atualizarListasAtividadesVisiveis();
        })
        .catch(function (err) {
          toast(msgFirestore(err), "erro");
        });
    }
  }

  function initListaAtividadesAcoes() {
    if (document._atvAcoesOk) return;
    document._atvAcoesOk = true;
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-acao]");
      if (!btn) return;
      var li = btn.closest(".item-atividade");
      if (!li) return;
      var lista = li.closest(".lista-atividades");
      if (!lista || (lista.id !== "lista-atividades-prof" && lista.id !== "lista-atividades-modal")) {
        return;
      }
      tratarAcaoAtividade(btn, li);
    });
  }

  function htmlMonitorSemAtividades() {
    return (
      '<div class="empty-state empty-state--card lista-vazia--estado">' +
      '<span class="empty-state__ico" aria-hidden="true">📚</span>' +
      '<p class="empty-state__titulo">Nenhum item cadastrado ainda.</p>' +
      '<p class="empty-state__texto">Crie uma atividade para acompanhar o desempenho dos alunos.</p>' +
      "</div>"
    );
  }

  function ocultarMonitorSemAtividades() {
    var semAtv = document.getElementById("monitor-sem-atividades");
    if (!semAtv) return;
    semAtv.hidden = true;
    semAtv.setAttribute("aria-hidden", "true");
    semAtv.style.display = "none";
    semAtv.innerHTML = "";
  }

  function mostrarMonitorSemAtividades() {
    var semAtv = document.getElementById("monitor-sem-atividades");
    if (!semAtv) return;
    semAtv.innerHTML = htmlMonitorSemAtividades();
    semAtv.hidden = false;
    semAtv.setAttribute("aria-hidden", "false");
    semAtv.style.display = "";
  }

  function popularSelectMonitor(lista) {
    var sel = document.getElementById("monitor-atividade");
    var wrap = document.getElementById("monitor-toolbar-wrap");
    var emptyBox = document.getElementById("monitor-empty-state");
    if (!sel) return;

    var temAtividades = (lista || []).length > 0;

    if (temAtividades) {
      ocultarMonitorSemAtividades();
    } else {
      mostrarMonitorSemAtividades();
    }
    if (wrap) wrap.hidden = !temAtividades;

    if (!temAtividades) {
      sel.innerHTML = "";
      esconderMonitorConteudo();
      setMonitorCarregando(false);
      if (emptyBox) emptyBox.hidden = true;
      return;
    }

    sel.innerHTML = '<option value="">Selecione uma atividade…</option>';
    lista.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a.id;
      o.textContent =
        (a.titulo.length > 56 ? a.titulo.slice(0, 54) + "…" : a.titulo) +
        (a.turmaId ? " — " + a.turmaId : "");
      sel.appendChild(o);
    });
  }

  /* ---------- Monitor ---------- */
  var monitorUnsub = null;
  var monitorAtividadeId = null;

  function pararMonitorListener() {
    if (monitorUnsub) {
      monitorUnsub();
      monitorUnsub = null;
    }
    monitorAtividadeId = null;
  }

  function setMonitorCarregando(ativo) {
    var ld = document.getElementById("monitor-loading");
    if (ld) {
      if (ativo) {
        ld.removeAttribute("hidden");
        ld.removeAttribute("aria-hidden");
        ld.style.display = "";
      } else {
        ld.setAttribute("hidden", "");
        ld.setAttribute("aria-hidden", "true");
        ld.style.display = "none";
      }
    }
    if (!ativo) {
      var sk = document.getElementById("monitor-skeleton");
      if (sk) {
        sk.hidden = true;
        sk.style.display = "none";
      }
    }
  }

  function esconderMonitorConteudo() {
    [
      "monitor-stats",
      "monitor-tabela-wrap",
      "monitor-erro",
      "monitor-empty-state",
      "monitor-skeleton",
    ].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    setMonitorCarregando(false);
  }

  function mostrarMonitorEmptyState(titulo, textoOpcional, opts) {
    opts = opts || {};
    if (!listaAtividadesCache.length) return;
    if (!opts.manterInsights) {
      esconderMonitorConteudo();
    } else {
      ["monitor-tabela-wrap", "monitor-erro", "monitor-skeleton"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
      });
      setMonitorCarregando(false);
    }
    var box = document.getElementById("monitor-empty-state");
    var elTit = document.getElementById("monitor-empty-titulo");
    var elTxt = document.getElementById("monitor-empty-texto");
    if (elTit) elTit.textContent = titulo || "Selecione uma atividade";
    if (elTxt) {
      if (textoOpcional) {
        elTxt.textContent = textoOpcional;
        elTxt.hidden = false;
      } else {
        elTxt.textContent = "";
        elTxt.hidden = true;
      }
    }
    if (box) box.hidden = false;
  }

  function renderMonitorVazio() {
    if (!listaAtividadesCache.length) {
      popularSelectMonitor([]);
      return;
    }
    mostrarMonitorEmptyState(
      "Selecione uma atividade",
      "Escolha uma atividade no menu acima para ver acertos, status de apoio e participação."
    );
  }

  function pontuacaoResposta(resp, atv) {
    if (!resp) return null;
    if (resp.pontuacao && typeof resp.pontuacao.acertos === "number") return resp.pontuacao;
    if (resp.respostasQuestoes && atv && S.corrigirAtividadeObjetiva) {
      return S.corrigirAtividadeObjetiva(atv, resp.respostasQuestoes);
    }
    return null;
  }

  function percentualResposta(resp, atv) {
    var pont = pontuacaoResposta(resp, atv);
    if (!pont) return null;
    if (typeof pont.percentual === "number") return pont.percentual;
    if (typeof pont.acertos === "number" && typeof pont.total === "number" && pont.total > 0) {
      return Math.round((pont.acertos / pont.total) * 100);
    }
    return null;
  }

  function acertosResposta(resp, atv) {
    var pont = pontuacaoResposta(resp, atv);
    if (!pont || typeof pont.acertos !== "number" || typeof pont.total !== "number") return null;
    return { acertos: pont.acertos, total: pont.total };
  }

  /** >90% excelente · 70–90% boa · <70% atenção */
  function statusApoioDePercentual(pct) {
    if (pct == null || isNaN(pct)) return null;
    if (pct > 90) {
      return {
        id: "excelente",
        rotulo: "Excelente Aproveitamento",
        emoji: "🌟",
        cls: "monitor-status--excelente",
      };
    }
    if (pct >= 70) {
      return {
        id: "boa",
        rotulo: "Boa Compreensão",
        emoji: "📘",
        cls: "monitor-status--boa",
      };
    }
    return {
      id: "atencao",
      rotulo: "Atenção Pedagógica",
      emoji: "🔍",
      cls: "monitor-status--atencao",
    };
  }

  function htmlBadgeStatusApoio(status) {
    if (!status) return '<span class="monitor-status monitor-status--pend">—</span>';
    return (
      '<span class="monitor-status ' +
      status.cls +
      '">' +
      '<span class="monitor-status__emoji" aria-hidden="true">' +
      status.emoji +
      "</span>" +
      escapeHtml(status.rotulo) +
      "</span>"
    );
  }

  function renderMonitorInsights(alunos, respostas, atv) {
    var stats = document.getElementById("monitor-stats");
    if (!stats) return;

    var totalTurma = alunos.length;
    var percentuais = [];
    var emObservacao = 0;

    respostas.forEach(function (r) {
      var pct = percentualResposta(r, atv);
      if (pct != null) {
        percentuais.push(pct);
        if (pct < 70) emObservacao++;
      }
    });

    var mediaPctStr = "—";
    if (percentuais.length) {
      mediaPctStr =
        String(
          Math.round(
            percentuais.reduce(function (a, b) {
              return a + b;
            }, 0) / percentuais.length
          )
        ) + "%";
    }

    var participacao = respostas.length + " / " + totalTurma + " Alunos";

    stats.hidden = false;
    stats.innerHTML =
      '<div class="monitor-insights__grid">' +
      '<article class="monitor-insight monitor-insight--acertos">' +
      '<span class="monitor-insight__ico" aria-hidden="true">🎯</span>' +
      '<div class="monitor-insight__body">' +
      '<span class="monitor-insight__val">' +
      escapeHtml(mediaPctStr) +
      "</span>" +
      '<span class="monitor-insight__lab">Acertos da Turma</span></div></article>' +
      '<article class="monitor-insight monitor-insight--participacao">' +
      '<span class="monitor-insight__ico" aria-hidden="true">👥</span>' +
      '<div class="monitor-insight__body">' +
      '<span class="monitor-insight__val">' +
      escapeHtml(participacao) +
      "</span>" +
      '<span class="monitor-insight__lab">Participação</span></div></article>' +
      '<article class="monitor-insight monitor-insight--observacao">' +
      '<span class="monitor-insight__ico" aria-hidden="true">⚠️</span>' +
      '<div class="monitor-insight__body">' +
      '<span class="monitor-insight__val">' +
      String(emObservacao) +
      "</span>" +
      '<span class="monitor-insight__lab">Em Observação</span></div></article>' +
      "</div>";
  }

  function renderMonitorTabela(linhas, atv, turmaN) {
    var tbody = document.getElementById("monitor-corpo-tabela");
    var tbl = document.getElementById("monitor-tabela-wrap");
    if (!tbody || !tbl) return;

    tbody.innerHTML = "";
    linhas.forEach(function (row) {
      var tr = document.createElement("tr");
      var pendente = !row.resp;
      var pct = pendente ? null : percentualResposta(row.resp, atv);
      var ac = pendente ? null : acertosResposta(row.resp, atv);
      var status = pendente ? null : statusApoioDePercentual(pct);
      if (pendente) tr.className = "monitor-tabela__row--pend";

      var acertosTxt = "—";
      if (ac) acertosTxt = ac.acertos + " de " + ac.total;

      tr.innerHTML =
        '<td class="monitor-tabela__aluno">' +
        escapeHtml(row.aluno.nome) +
        "</td>" +
        '<td class="monitor-tabela__acertos">' +
        escapeHtml(acertosTxt) +
        "</td>" +
        "<td>" +
        htmlBadgeStatusApoio(status) +
        "</td>" +
        "<td></td>";

      var tdAcao = tr.lastElementChild;
      if (row.resp) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-monitor-liberar";
        btn.textContent = "🔄 Dar Nova Chance";
        btn.addEventListener("click", function () {
          confirmar({
            titulo: "Dar nova chance?",
            mensagem:
              "Remover a resposta de " +
              row.aluno.nome +
              "? O aluno poderá enviar de novo.",
            confirmarLabel: "Liberar",
          }).then(function (ok) {
            if (!ok) return;
            btn.disabled = true;
            RFS.excluirResposta(
              F.db,
              turmaN,
              row.resp.alunoDocId,
              atv.id,
              row.resp.alunoNome
            )
              .then(function () {
                toast("Nova chance liberada.", "ok");
                carregarMonitorParaAtividade(atv);
                carregarRespostasGlobais().then(carregarTudoKpisOnly);
              })
              .catch(function () {
                btn.disabled = false;
                toast("Não foi possível liberar.", "erro");
              });
          });
        });
        tdAcao.appendChild(btn);
      } else {
        tdAcao.innerHTML = '<span class="monitor-tabela__sem-acao">—</span>';
      }
      tbody.appendChild(tr);
    });
    tbl.hidden = false;
  }

  function aplicarMonitorDados(alunos, respostas, atv, turmaN) {
    var er = document.getElementById("monitor-erro");
    if (er) er.hidden = true;

    respostas = (respostas || []).filter(function (r) {
      return S.normalizarTurmaId(r.turmaId || "") === turmaN;
    });

    if (respostas.length === 0) {
      ["monitor-tabela-wrap", "monitor-erro"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.hidden = true;
      });
      renderMonitorInsights(alunos, [], atv);
      mostrarMonitorEmptyState(
        "Nenhum aluno respondeu esta atividade até o momento.",
        null,
        { manterInsights: true }
      );
      return;
    }

    var emptyBox = document.getElementById("monitor-empty-state");
    if (emptyBox) emptyBox.hidden = true;

    var mapaResp = {};
    respostas.forEach(function (r) {
      if (r.alunoDocId) mapaResp[r.alunoDocId] = r;
    });

    var linhas = alunos.slice().map(function (aluno) {
      return { aluno: aluno, resp: mapaResp[aluno.id] };
    });
    linhas.sort(function (a, b) {
      if (a.resp && !b.resp) return -1;
      if (!a.resp && b.resp) return 1;
      return a.aluno.nome.localeCompare(b.aluno.nome, "pt-BR");
    });

    renderMonitorInsights(alunos, respostas, atv);
    renderMonitorTabela(linhas, atv, turmaN);
  }

  function carregarMonitorParaAtividade(atv) {
    var er = document.getElementById("monitor-erro");

    pararMonitorListener();
    esconderMonitorConteudo();
    ocultarMonitorSemAtividades();

    if (!atv || !atv.turmaId || !TF || !RFS) {
      if (er) {
        er.hidden = false;
        er.textContent = "Esta atividade não tem turma vinculada — não é possível monitorar.";
      }
      return;
    }

    setMonitorCarregando(true);
    var turmaN = S.normalizarTurmaId(atv.turmaId);
    monitorAtividadeId = atv.id;

    TF.listarAlunosTurma(F.db, turmaN)
      .then(function (alunos) {
        if (monitorAtividadeId !== atv.id) return;

        var escutar = RFS.escutarPorAtividade;
        if (typeof escutar !== "function") {
          return RFS.listarPorAtividade(F.db, atv.id).then(function (respostas) {
            aplicarMonitorDados(alunos, respostas, atv, turmaN);
          });
        }

        monitorUnsub = escutar(
          F.db,
          atv.id,
          function (respostas) {
            if (monitorAtividadeId !== atv.id) return;
            aplicarMonitorDados(alunos, respostas, atv, turmaN);
            setMonitorCarregando(false);
          },
          function () {
            if (monitorAtividadeId !== atv.id) return;
            if (er) {
              er.hidden = false;
              er.textContent =
                "Erro ao carregar. Verifique conexão, índices do Firestore e permissões.";
            }
            setMonitorCarregando(false);
          }
        );
      })
      .catch(function () {
        if (er) {
          er.hidden = false;
          er.textContent =
            "Erro ao carregar. Verifique conexão, índices do Firestore e permissões.";
        }
      })
      .finally(function () {
        if (monitorAtividadeId === atv.id) setMonitorCarregando(false);
      });
  }

  function initMonitor() {
    var sel = document.getElementById("monitor-atividade");
    if (!sel) return;
    sel.addEventListener("change", function () {
      var id = sel.value;
      if (!id) {
        pararMonitorListener();
        renderMonitorVazio();
        return;
      }
      ocultarMonitorSemAtividades();
      var atv = listaAtividadesCache.find(function (a) {
        return a.id === id;
      });
      if (atv) carregarMonitorParaAtividade(atv);
    });
  }

  /* ---------- Top 3 ---------- */
  function carregarPodium(codigoTurma) {
    var podium = document.getElementById("podium-top3");
    var vazio = document.getElementById("vazio-ranking");
    if (!podium) return;
    if (!codigoTurma) {
      podium.innerHTML = "";
      if (vazio) vazio.hidden = false;
      return;
    }
    var turmaN = S.normalizarTurmaId(codigoTurma);
    var atvsTurma = listaAtividadesCache.filter(function (a) {
      return S.normalizarTurmaId(a.turmaId || "") === turmaN;
    });
    Promise.all([
      TF.listarAlunosTurma(F.db, turmaN),
      Promise.all(
        atvsTurma.map(function (a) {
          return RFS.listarPorAtividade(F.db, a.id);
        })
      ).then(function (arrs) {
        var todas = [];
        arrs.forEach(function (arr) {
          arr.forEach(function (r) {
            if (S.normalizarTurmaId(r.turmaId || "") === turmaN) todas.push(r);
          });
        });
        return todas;
      }),
    ]).then(function (res) {
      var alunos = res[0];
      var respostas = res[1];
      if (!GAM) return;
      var stats = GAM.statsPorAlunos(alunos, respostas);
      var top = GAM.top3Turma(stats);
      if (!top.length) {
        podium.innerHTML = "";
        if (vazio) vazio.hidden = false;
        return;
      }
      if (vazio) vazio.hidden = true;
      var topOrdenado = top.slice().sort(function (a, b) {
        return a.posicao - b.posicao;
      });
      podium.innerHTML = topOrdenado
        .map(function (p) {
          return (
            '<article class="podium-item podium-item--' +
            p.posicao +
            '" aria-label="' +
            p.posicao +
            'º lugar">' +
            '<span class="podium-item__medal" aria-hidden="true">' +
            p.emoji +
            "</span>" +
            '<div class="podium-item__corpo">' +
            '<strong class="podium-item__nome">' +
            escapeHtml(p.nome) +
            "</strong>" +
            '<span class="podium-item__meta">' +
            p.pontos +
            " pts · média " +
            (p.media != null ? p.media : "—") +
            "</span>" +
            '<span class="podium-item__badge">' +
            escapeHtml(p.medalha.emoji + " " + p.medalha.nome) +
            "</span></div></article>"
          );
        })
        .join("");
    });
  }

  var selRanking = document.getElementById("ranking-turma-select");
  if (selRanking) {
    selRanking.addEventListener("change", function () {
      carregarPodium(selRanking.value);
    });
  }

  /* ---------- Carga global ---------- */
  function carregarRespostasGlobais() {
    if (!listaAtividadesCache.length) {
      respostasCacheTotal = [];
      return Promise.resolve([]);
    }
    return Promise.all(
      listaAtividadesCache.map(function (a) {
        return RFS.listarPorAtividade(F.db, a.id).catch(function () {
          return [];
        });
      })
    ).then(function (arrs) {
      var todas = [];
      arrs.forEach(function (arr) {
        arr.forEach(function (r) {
          todas.push(r);
        });
      });
      respostasCacheTotal = todas;
      invalidarRelatorioAtvMap();
      return todas;
    });
  }

  function carregarTudoKpisOnly() {
    atualizarKpis(listaTurmasCache, listaAtividadesCache, respostasCacheTotal);
  }

  function carregarTudo() {
    if (F.initError || !F.db || !AFS || !TF) {
      toast("Firebase não carregado. Use servidor local (python -m http.server).", "erro");
      return;
    }
    if (!sessao.uid) {
      toast("Faça login novamente.", "erro");
      return;
    }

    var ul = document.getElementById("lista-atividades-prof");
    var vazioAtv = document.getElementById("vazio-atividades-prof");
    if (ul) ul.innerHTML = "";
    if (vazioAtv) vazioAtv.hidden = true;

    garantirAuthFirebase()
      .then(function () {
        return AFS.listarPorProfessor(F.db, sessao.uid, sessao.email);
      })
      .then(function (lista) {
        lista.sort(function (a, b) {
          return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
        });
        listaAtividadesCache = lista;
        invalidarRelatorioAtvMap();
        return TF.listarTurmasProfessor(F.db, sessao.uid, lista);
      })
      .then(function (turmas) {
        listaTurmasCache = turmas || [];
        return carregarRespostasGlobais();
      })
      .then(function () {
        enriquecerTurmasCache();
        renderGridTurmas();
        popularSelectRanking(listaTurmasCache);
        if (ul) renderListaAtividades(ul, vazioAtv, listaAtividadesCache);
        popularSelectMonitor(listaAtividadesCache);
        atualizarKpis(listaTurmasCache, listaAtividadesCache, respostasCacheTotal);
        renderMonitorVazio();
        if (selRanking && listaTurmasCache.length) {
          selRanking.value = listaTurmasCache[0].codigo;
          carregarPodium(listaTurmasCache[0].codigo);
        }
        if (window.LeiturasProfessor && typeof window.LeiturasProfessor.recarregar === "function") {
          window.LeiturasProfessor.recarregar(listaTurmasCache);
        }
      })
      .catch(function (err) {
        if (err && err.message === "AUTH_OFF") {
          redirecionarLogin();
          return;
        }
        if (ul) {
          ul.innerHTML =
            '<li class="item-atividade"><p class="painel-alerta painel-alerta--erro">' +
            escapeHtml(msgFirestore(err)) +
            "</p></li>";
        }
        toast(msgFirestore(err), "erro");
      });
  }

  function abrirModalImportar() {
    var modalImp = document.getElementById("modal-importar-turma");
    var sel = document.getElementById("modal-importar-turma-select");
    var ta = document.getElementById("modal-importar-texto");
    var msg = document.getElementById("modal-importar-msg");
    if (!modalImp) return;
    setEstadoImportacao(false);
    if (msg) {
      msg.textContent = "";
      msg.className = "form-painel__msg";
    }
    if (ta) {
      ta.value = "";
      ta.disabled = false;
    }
    if (sel) {
      sel.disabled = false;
      sel.innerHTML = "";
      var turmasAtivas = listaTurmasCache.filter(function (t) {
        return !t.arquivada;
      });
      if (!turmasAtivas.length) {
        var oVazio = document.createElement("option");
        oVazio.value = "";
        oVazio.textContent = "Nenhuma turma disponível";
        sel.appendChild(oVazio);
        sel.disabled = true;
      } else {
        turmasAtivas.forEach(function (t) {
          var o = document.createElement("option");
          o.value = t.codigo;
          o.textContent = t.nome + " (" + t.codigo + ")";
          sel.appendChild(o);
        });
      }
    }
    modalImp.hidden = false;
    document.body.classList.add("ui-modal-open");
    if (ta) ta.focus();
  }

  function fecharModalImportar() {
    var modalImp = document.getElementById("modal-importar-turma");
    if (modalImp) modalImp.hidden = true;
    setEstadoImportacao(false);
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  var IMPORT_BTN_LABEL = "Cadastrar alunos";
  var isImporting = false;

  function setEstadoImportacao(ativo) {
    isImporting = !!ativo;
    var btn = document.getElementById("modal-importar-confirmar");
    var cancel = document.getElementById("modal-importar-cancelar");
    var ta = document.getElementById("modal-importar-texto");
    var sel = document.getElementById("modal-importar-turma-select");
    if (btn) {
      btn.disabled = isImporting;
      btn.classList.toggle("is-loading", isImporting);
      if (isImporting) {
        btn.innerHTML =
          '<span class="monitor-spinner monitor-spinner--btn" aria-hidden="true"></span> Cadastrando…';
      } else {
        btn.textContent = IMPORT_BTN_LABEL;
      }
      btn.setAttribute("aria-busy", isImporting ? "true" : "false");
    }
    if (cancel) cancel.disabled = isImporting;
    if (ta) ta.disabled = isImporting;
    if (sel) sel.disabled = isImporting || (sel.options.length === 1 && !sel.value);
  }

  function atualizarTurmasAposImportacao() {
    return AFS.listarPorProfessor(F.db, sessao.uid, sessao.email).then(function (atvs) {
      listaAtividadesCache = atvs || [];
      invalidarRelatorioAtvMap();
      return TF.listarTurmasProfessor(F.db, sessao.uid, atvs);
    }).then(function (turmas) {
      if (!turmas) return;
      listaTurmasCache = turmas;
      enriquecerTurmasCache();
      renderGridTurmas();
      popularSelectRanking(listaTurmasCache);
      atualizarKpis(listaTurmasCache, listaAtividadesCache, respostasCacheTotal);
      if (window.LeiturasProfessor && typeof window.LeiturasProfessor.definirTurmas === "function") {
        window.LeiturasProfessor.definirTurmas(listaTurmasCache);
      }
    });
  }

  /* ---------- Relatório geral extensivo (cache em memória) ---------- */
  var RELATORIO_TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000;
  var relatorioFiltroTurma = "todas";
  var relatorioFiltroPeriodo = "tudo";
  var relatorioAtvMapCache = null;

  function relatorioMapAtividades() {
    if (relatorioAtvMapCache) return relatorioAtvMapCache;
    var m = {};
    listaAtividadesCache.forEach(function (a) {
      m[a.id] = a;
    });
    relatorioAtvMapCache = m;
    return m;
  }

  function invalidarRelatorioAtvMap() {
    relatorioAtvMapCache = null;
  }

  function respostaDentroPeriodoRelatorio(r, periodo) {
    if (periodo !== "30d") return true;
    var ts = tsValor(r.timestamp != null ? r.timestamp : r.enviadoEm);
    if (!ts) return false;
    return Date.now() - ts <= RELATORIO_TRINTA_DIAS_MS;
  }

  function filtrarRespostasRelatorio(turmaCodigo, periodo) {
    var turmaN =
      turmaCodigo && turmaCodigo !== "todas" ? S.normalizarTurmaId(turmaCodigo) : "";
    return (respostasCacheTotal || []).filter(function (r) {
      if (!respostaDentroPeriodoRelatorio(r, periodo)) return false;
      if (turmaN && S.normalizarTurmaId(r.turmaId || "") !== turmaN) return false;
      return true;
    });
  }

  function filtrarAtividadesRelatorio(turmaCodigo) {
    if (!turmaCodigo || turmaCodigo === "todas") return listaAtividadesCache.slice();
    var turmaN = S.normalizarTurmaId(turmaCodigo);
    return listaAtividadesCache.filter(function (a) {
      return S.normalizarTurmaId(a.turmaId || "") === turmaN;
    });
  }

  function totalAlunosRelatorio(turmaCodigo) {
    if (!turmaCodigo || turmaCodigo === "todas") {
      var n = 0;
      listaTurmasCache.forEach(function (t) {
        n += t.quantidadeAlunos || 0;
      });
      return n;
    }
    var turmaN = S.normalizarTurmaId(turmaCodigo);
    var t = listaTurmasCache.find(function (x) {
      return S.normalizarTurmaId(x.codigo || x.id) === turmaN;
    });
    return t && typeof t.quantidadeAlunos === "number" ? t.quantidadeAlunos : 0;
  }

  function nomeTurmaRelatorio(codigo) {
    if (!codigo) return "—";
    var turmaN = S.normalizarTurmaId(codigo);
    var t = listaTurmasCache.find(function (x) {
      return S.normalizarTurmaId(x.codigo || x.id) === turmaN;
    });
    if (t && t.nome) return t.nome + " (" + codigo + ")";
    return codigo;
  }

  function indicadorDesempenhoRelatorio(pct) {
    if (pct == null || isNaN(pct)) {
      return { emoji: "⚪", rotulo: "Sem dados", cls: "relatorio-indicador--neutro" };
    }
    if (pct >= 90) {
      return { emoji: "🟢", rotulo: "Excelente", cls: "relatorio-indicador--excelente" };
    }
    if (pct >= 70) {
      return { emoji: "🟡", rotulo: "Médio", cls: "relatorio-indicador--medio" };
    }
    return { emoji: "🔴", rotulo: "Precisa atenção", cls: "relatorio-indicador--atencao" };
  }

  function top5AlunosRelatorio(respostas) {
    if (!GAM || !respostas.length) return [];
    var alunosMap = {};
    respostas.forEach(function (r) {
      if (!r.alunoDocId) return;
      if (!alunosMap[r.alunoDocId]) {
        alunosMap[r.alunoDocId] = { id: r.alunoDocId, nome: r.alunoNome || "Aluno" };
      }
    });
    var alunosArr = Object.keys(alunosMap).map(function (k) {
      return alunosMap[k];
    });
    if (!alunosArr.length) return [];
    var stats = GAM.statsPorAlunos(alunosArr, respostas);
    var scored = stats.map(function (s) {
      var part = s.respostasCount * 12;
      var med = s.media != null ? s.media * 8 : 0;
      return { stats: s, score: s.pontos + part + med };
    });
    scored.sort(GAM.compararRanking);
    return scored.slice(0, 5).map(function (x, i) {
      return {
        posicao: i + 1,
        nome: x.stats.nome,
        pontos: x.stats.pontos,
        medalha: x.stats.medalha,
        respostas: x.stats.respostasCount,
        media: x.stats.media,
      };
    });
  }

  function calcularDadosRelatorio(turmaCodigo, periodo) {
    var respostas = filtrarRespostasRelatorio(turmaCodigo, periodo);
    var atvMap = relatorioMapAtividades();
    var atividadesEscopo = filtrarAtividadesRelatorio(turmaCodigo);
    var idsComResposta = {};
    var somaPct = 0;
    var countPct = 0;
    var alunosAtivos = {};

    respostas.forEach(function (r) {
      if (r.atividadeId) idsComResposta[r.atividadeId] = true;
      if (r.alunoDocId) alunosAtivos[r.alunoDocId] = true;
      var atv = atvMap[r.atividadeId];
      var pct = percentualResposta(r, atv);
      if (pct != null) {
        somaPct += pct;
        countPct += 1;
      }
    });

    var mediaAcertos = countPct ? Math.round(somaPct / countPct) : null;
    var totalAlunosCadastrados = totalAlunosRelatorio(turmaCodigo);
    var qAlunosAtivos = Object.keys(alunosAtivos).length;
    var engajamento =
      totalAlunosCadastrados > 0
        ? Math.round((qAlunosAtivos / totalAlunosCadastrados) * 100)
        : qAlunosAtivos > 0
          ? 100
          : 0;

    var linhasAtv = [];
    atividadesEscopo.forEach(function (atv) {
      var respsAtv = [];
      var somaAtv = 0;
      var nAtv = 0;
      respostas.forEach(function (r) {
        if (r.atividadeId !== atv.id) return;
        respsAtv.push(r);
        var pct = percentualResposta(r, atv);
        if (pct != null) {
          somaAtv += pct;
          nAtv += 1;
        }
      });
      if (!respsAtv.length) return;
      var mediaAtv = nAtv ? Math.round(somaAtv / nAtv) : null;
      linhasAtv.push({
        id: atv.id,
        titulo: atv.titulo || atv.nome || "Atividade",
        turmaId: atv.turmaId || "",
        totalRespostas: respsAtv.length,
        mediaAcertos: mediaAtv,
        indicador: indicadorDesempenhoRelatorio(mediaAtv),
      });
    });

    linhasAtv.sort(function (a, b) {
      return b.totalRespostas - a.totalRespostas;
    });

    return {
      respostas: respostas,
      kpis: {
        mediaAcertos: mediaAcertos,
        totalRespostas: respostas.length,
        atividadesRespondidas: Object.keys(idsComResposta).length,
        engajamento: engajamento,
        alunosAtivos: qAlunosAtivos,
      },
      linhasAtv: linhasAtv,
      top5: top5AlunosRelatorio(respostas),
    };
  }

  function htmlRelatorioVazio() {
    return (
      '<div class="relatorio-vazio">' +
      '<span class="relatorio-vazio__ico" aria-hidden="true">📋</span>' +
      "<p>Nenhum dado de desempenho encontrado para os filtros selecionados. 😉</p>" +
      "</div>"
    );
  }

  function htmlRelatorioKpis(kpis) {
    var mediaTxt = kpis.mediaAcertos != null ? kpis.mediaAcertos + "%" : "—";
    return (
      '<section class="relatorio-secao" aria-labelledby="relatorio-kpis-titulo">' +
      '<h4 id="relatorio-kpis-titulo" class="relatorio-secao__titulo">Indicadores educacionais</h4>' +
      '<div class="relatorio-kpi-grid">' +
      '<article class="relatorio-kpi-card relatorio-kpi-card--destaque">' +
      '<span class="relatorio-kpi-card__ico" aria-hidden="true">🎯</span>' +
      '<span class="relatorio-kpi-card__val">' +
      escapeHtml(mediaTxt) +
      "</span>" +
      '<span class="relatorio-kpi-card__lab">Média geral de acertos</span></article>' +
      '<article class="relatorio-kpi-card">' +
      '<span class="relatorio-kpi-card__ico" aria-hidden="true">✅</span>' +
      '<span class="relatorio-kpi-card__val">' +
      kpis.totalRespostas +
      "</span>" +
      '<span class="relatorio-kpi-card__lab">Respostas registradas</span></article>' +
      '<article class="relatorio-kpi-card">' +
      '<span class="relatorio-kpi-card__ico" aria-hidden="true">📝</span>' +
      '<span class="relatorio-kpi-card__val">' +
      kpis.atividadesRespondidas +
      "</span>" +
      '<span class="relatorio-kpi-card__lab">Atividades respondidas</span></article>' +
      '<article class="relatorio-kpi-card">' +
      '<span class="relatorio-kpi-card__ico" aria-hidden="true">📈</span>' +
      '<span class="relatorio-kpi-card__val">' +
      kpis.engajamento +
      "%</span>" +
      '<span class="relatorio-kpi-card__lab">Índice de engajamento</span></article>' +
      '<article class="relatorio-kpi-card">' +
      '<span class="relatorio-kpi-card__ico" aria-hidden="true">👥</span>' +
      '<span class="relatorio-kpi-card__val">' +
      kpis.alunosAtivos +
      "</span>" +
      '<span class="relatorio-kpi-card__lab">Alunos ativos</span></article>' +
      "</div></section>"
    );
  }

  function htmlRelatorioTabela(linhas) {
    if (!linhas.length) return "";
    var rows = linhas
      .map(function (row) {
        var pctTxt = row.mediaAcertos != null ? row.mediaAcertos + "%" : "—";
        return (
          "<tr>" +
          "<td data-label=\"Atividade\"><strong>" +
          escapeHtml(row.titulo) +
          "</strong></td>" +
          '<td data-label="Turma">' +
          escapeHtml(nomeTurmaRelatorio(row.turmaId)) +
          "</td>" +
          '<td data-label="Respostas">' +
          row.totalRespostas +
          "</td>" +
          '<td data-label="Acertos">' +
          escapeHtml(pctTxt) +
          "</td>" +
          '<td data-label="Desempenho"><span class="relatorio-indicador ' +
          row.indicador.cls +
          '">' +
          '<span aria-hidden="true">' +
          row.indicador.emoji +
          "</span> " +
          escapeHtml(row.indicador.rotulo) +
          "</span></td></tr>"
        );
      })
      .join("");
    return (
      '<section class="relatorio-secao" aria-labelledby="relatorio-tabela-titulo">' +
      '<h4 id="relatorio-tabela-titulo" class="relatorio-secao__titulo">Desempenho por atividade</h4>' +
      '<div class="relatorio-tabela-wrap">' +
      '<table class="relatorio-tabela">' +
      "<thead><tr>" +
      "<th>Atividade</th><th>Turma</th><th>Respostas</th><th>Acertos</th><th>Desempenho</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div></section>"
    );
  }

  function htmlRelatorioTop5(top5) {
    if (!top5.length) return "";
    var itens = top5
      .map(function (p) {
        var medal = p.medalha ? p.medalha.emoji + " " + p.medalha.nome : "📖 Leitor iniciante";
        return (
          '<li class="relatorio-top5-item">' +
          '<span class="relatorio-top5-item__pos" aria-hidden="true">' +
          p.posicao +
          "º</span>" +
          '<div class="relatorio-top5-item__corpo">' +
          "<strong>" +
          escapeHtml(p.nome) +
          "</strong>" +
          '<span class="relatorio-top5-item__meta">' +
          p.pontos +
          " pts · " +
          p.respostas +
          " atividade" +
          (p.respostas !== 1 ? "s" : "") +
          " · Medalha: " +
          escapeHtml(medal) +
          "</span></div></li>"
        );
      })
      .join("");
    return (
      '<section class="relatorio-secao" aria-labelledby="relatorio-top5-titulo">' +
      '<h4 id="relatorio-top5-titulo" class="relatorio-secao__titulo">Top 5 alunos</h4>' +
      '<p class="relatorio-secao__hint">Mini-ranking pedagógico com base em XP, participação e média (dados em cache).</p>' +
      '<ol class="relatorio-top5">' +
      itens +
      "</ol></section>"
    );
  }

  function atualizarMetaRelatorio() {
    var meta = document.getElementById("relatorio-meta-linha");
    if (!meta) return;
    var partes = [];
    partes.push(
      "Gerado em " +
        new Date().toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
    );
    if (relatorioFiltroTurma === "todas") partes.push("Turmas: todas");
    else partes.push("Turma: " + nomeTurmaRelatorio(relatorioFiltroTurma));
    partes.push(relatorioFiltroPeriodo === "30d" ? "Período: últimos 30 dias" : "Período: completo");
    meta.textContent = partes.join(" · ");
  }

  function renderRelatorioCorpo() {
    var corpo = document.getElementById("modal-relatorio-corpo");
    if (!corpo) return;
    atualizarMetaRelatorio();
    var dados = calcularDadosRelatorio(relatorioFiltroTurma, relatorioFiltroPeriodo);
    if (!dados.respostas.length) {
      corpo.innerHTML = htmlRelatorioVazio();
      return;
    }
    corpo.innerHTML =
      htmlRelatorioKpis(dados.kpis) +
      htmlRelatorioTabela(dados.linhasAtv) +
      htmlRelatorioTop5(dados.top5);
  }

  function popularFiltroTurmasRelatorio() {
    var sel = document.getElementById("relatorio-filtro-turma");
    if (!sel) return;
    var valAntes = relatorioFiltroTurma || sel.value || "todas";
    sel.innerHTML = '<option value="todas">Todas as turmas</option>';
    listaTurmasCache.forEach(function (t) {
      var cod = t.codigo || t.id;
      if (!cod) return;
      var o = document.createElement("option");
      o.value = cod;
      o.textContent = (t.nome || cod) + " (" + cod + ")";
      sel.appendChild(o);
    });
    if (valAntes !== "todas") {
      var existe = Array.prototype.some.call(sel.options, function (opt) {
        return opt.value === valAntes;
      });
      sel.value = existe ? valAntes : "todas";
    } else {
      sel.value = "todas";
    }
    relatorioFiltroTurma = sel.value;
  }

  function abrirModalRelatorio() {
    var modalRel = document.getElementById("modal-relatorio");
    if (!modalRel) return;
    popularFiltroTurmasRelatorio();
    var selPer = document.getElementById("relatorio-filtro-periodo");
    if (selPer) selPer.value = relatorioFiltroPeriodo;
    renderRelatorioCorpo();
    modalRel.hidden = false;
    document.body.classList.add("ui-modal-open");
  }

  function fecharModalRelatorio() {
    var modalRel = document.getElementById("modal-relatorio");
    if (modalRel) modalRel.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  function initRelatorioGeral() {
    var btnRel = document.getElementById("btn-relatorio-geral");
    var modalRel = document.getElementById("modal-relatorio");
    var selTurma = document.getElementById("relatorio-filtro-turma");
    var selPeriodo = document.getElementById("relatorio-filtro-periodo");
    var btnFechar = document.getElementById("modal-relatorio-fechar");
    var btnMon = document.getElementById("modal-relatorio-monitor");
    var btnPrint = document.getElementById("modal-relatorio-imprimir");

    if (selTurma && !selTurma._ok) {
      selTurma._ok = true;
      selTurma.addEventListener("change", function () {
        relatorioFiltroTurma = selTurma.value || "todas";
        renderRelatorioCorpo();
      });
    }

    if (selPeriodo && !selPeriodo._ok) {
      selPeriodo._ok = true;
      selPeriodo.addEventListener("change", function () {
        relatorioFiltroPeriodo = selPeriodo.value || "tudo";
        renderRelatorioCorpo();
      });
    }

    if (btnRel && !btnRel._ok) {
      btnRel._ok = true;
      btnRel.addEventListener("click", abrirModalRelatorio);
    }

    if (btnFechar && modalRel && !btnFechar._ok) {
      btnFechar._ok = true;
      btnFechar.addEventListener("click", fecharModalRelatorio);
      modalRel.addEventListener("click", function (ev) {
        if (ev.target === modalRel) fecharModalRelatorio();
      });
    }

    if (btnMon && !btnMon._ok) {
      btnMon._ok = true;
      btnMon.addEventListener("click", function () {
        fecharModalRelatorio();
        var sec = document.getElementById("titulo-monitor");
        if (sec && sec.scrollIntoView) sec.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (btnPrint && !btnPrint._ok) {
      btnPrint._ok = true;
      btnPrint.addEventListener("click", function () {
        document.body.classList.add("relatorio-imprimindo");
        window.print();
      });
    }

    if (!window._relatorioPrintHook) {
      window._relatorioPrintHook = true;
      window.addEventListener("afterprint", function () {
        document.body.classList.remove("relatorio-imprimindo");
      });
    }
  }

  function initAcoesRapidas() {
    var btnImport = document.getElementById("btn-acao-importar");
    var modalImp = document.getElementById("modal-importar-turma");

    if (btnImport) {
      btnImport.addEventListener("click", function () {
        if (!listaTurmasCache.length) {
          toast("Cadastre uma turma antes de importar alunos.", "info");
          abrirModalTurma(null);
          return;
        }
        abrirModalImportar();
      });
    }

    var btnImpCancel = document.getElementById("modal-importar-cancelar");
    if (btnImpCancel) {
      btnImpCancel.addEventListener("click", function () {
        if (isImporting) return;
        fecharModalImportar();
      });
    }
    if (modalImp) {
      modalImp.addEventListener("click", function (ev) {
        if (ev.target === modalImp && !isImporting) fecharModalImportar();
      });
    }

    var btnImpConfirm = document.getElementById("modal-importar-confirmar");
    if (btnImpConfirm) {
      btnImpConfirm.addEventListener("click", function () {
        if (isImporting) return;
        var sel = document.getElementById("modal-importar-turma-select");
        var ta = document.getElementById("modal-importar-texto");
        var msg = document.getElementById("modal-importar-msg");
        var cod = sel && sel.value ? S.normalizarTurmaId(sel.value) : "";
        var raw = ta ? ta.value : "";
        var linhas = raw.split(/\r?\n/);

        if (msg) {
          msg.textContent = "";
          msg.className = "form-painel__msg";
        }
        if (!cod) {
          if (msg) {
            msg.textContent = "Selecione uma turma.";
            msg.className = "form-painel__msg form-painel__msg--erro";
          }
          return;
        }
        if (!raw.trim()) {
          if (msg) {
            msg.textContent = "Cole pelo menos um nome na lista.";
            msg.className = "form-painel__msg form-painel__msg--erro";
          }
          return;
        }
        if (!TF || typeof TF.importarAlunos !== "function") {
          toast("Módulo de turmas indisponível.", "erro");
          return;
        }
        if (!sessao.uid) {
          toast("Faça login novamente.", "erro");
          return;
        }

        setEstadoImportacao(true);

        TF.importarAlunos(F.db, cod, sessao.uid, linhas)
          .then(function (res) {
            var n = res && typeof res.adicionados === "number" ? res.adicionados : 0;
            if (ta) ta.value = "";
            fecharModalImportar();
            if (n > 0) {
              toast(
                "🎉 Importação concluída! " + n + " alunos foram adicionados com sucesso.",
                "ok"
              );
            } else {
              toast("Nenhum aluno novo importado (nomes já cadastrados ou inválidos).", "info");
            }
            return atualizarTurmasAposImportacao();
          })
          .catch(function (err) {
            var txt = err && err.message ? err.message : "Não foi possível importar.";
            if (msg) {
              msg.textContent = txt;
              msg.className = "form-painel__msg form-painel__msg--erro";
            } else {
              toast(txt, "erro");
            }
          })
          .finally(function () {
            setEstadoImportacao(false);
          });
      });
    }

    initRelatorioGeral();
  }

  function initTurmasToolbar() {
    var inpBusca = document.getElementById("turmas-busca");
    var selOrdem = document.getElementById("turmas-ordenacao");

    if (inpBusca && !inpBusca._ok) {
      inpBusca._ok = true;
      inpBusca.addEventListener("input", function () {
        turmasBuscaQuery = inpBusca.value;
        renderGridTurmas();
      });
    }

    if (selOrdem && !selOrdem._ok) {
      selOrdem._ok = true;
      selOrdem.addEventListener("change", function () {
        turmasOrdenacao = selOrdem.value || "recentes";
        renderGridTurmas();
      });
    }
  }

  function initDashboardLinks() {
    var linkTurmas = document.getElementById("link-ver-todas-turmas");
    if (linkTurmas && !linkTurmas._ok) {
      linkTurmas._ok = true;
      linkTurmas.addEventListener("click", function () {
        abrirModalTurmasTodas();
      });
    }

    var linkAtv = document.getElementById("link-ver-historico-atv");
    if (linkAtv && !linkAtv._ok) {
      linkAtv._ok = true;
      linkAtv.addEventListener("click", function () {
        abrirModalAtividadesHistorico();
      });
    }

    var modalTurmas = document.getElementById("modal-turmas-todas");
    var btnFecharTurmas = document.getElementById("modal-turmas-todas-fechar");
    var btnNovaTurmaModal = document.getElementById("modal-turmas-todas-nova");
    if (btnFecharTurmas) {
      btnFecharTurmas.addEventListener("click", fecharModalTurmasTodas);
    }
    if (btnNovaTurmaModal) {
      btnNovaTurmaModal.addEventListener("click", function () {
        fecharModalTurmasTodas();
        abrirModalTurma(null);
      });
    }
    if (modalTurmas) {
      modalTurmas.addEventListener("click", function (ev) {
        if (ev.target === modalTurmas) fecharModalTurmasTodas();
      });
    }

    var modalAtv = document.getElementById("modal-atividades-historico");
    var btnFecharAtv = document.getElementById("modal-atividades-historico-fechar");
    if (btnFecharAtv) {
      btnFecharAtv.addEventListener("click", fecharModalAtividadesHistorico);
    }
    if (modalAtv) {
      modalAtv.addEventListener("click", function (ev) {
        if (ev.target === modalAtv) fecharModalAtividadesHistorico();
      });
    }
  }

  initTurmasToolbar();
  initDashboardLinks();
  initMonitor();
  initListaAtividadesAcoes();
  initAcoesRapidas();
  carregarTudo();
  }
})();
