/**
 * Formulário de atividade: texto + N perguntas com alternativas (múltipla escolha).
 * Rascunho: objeto em memória espelhado em sessionStorage até publicar ou limpar.
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var AFS = window.AtividadesFirestore;
  var TF = window.TurmasFirestore;
  var UI = window.UiFeedback;

  var RASCUNHO_PREFIX = "plataforma_edu_rascunho_atividade_v2_";
  var MODELO_PREFIX = "plataforma_edu_modelo_atividade_v1_";

  var sessao = null;

  SessaoApp.aguardarFirebasePronto(F)
    .then(function () {
      return SessaoApp.garantirSessaoProfessor(F.db, F.auth);
    })
    .then(function (s) {
      if (!s) return;
      sessao = s;
      iniciarAtividadeNova();
    })
    .catch(function () {});

  function iniciarAtividadeNova() {
  var elEmail = document.getElementById("painel-usuario-email");
  if (elEmail) elEmail.textContent = sessao.email;

  var form = document.getElementById("form-atividade");
  var lista = document.getElementById("lista-questoes");
  var inpTitulo = document.getElementById("atv-titulo");
  var inpTurma = document.getElementById("atv-turma");
  var inpTexto = document.getElementById("atv-texto");
  var btnAdd = document.getElementById("btn-add-questao");
  var editoresEnunciado = {};
  var editorMaterialApoio = null;
  var wrapMaterialApoio = document.getElementById("atv-material-apoio-wrap");
  var btnRascunho = document.getElementById("btn-rascunho");
  var btnLimpar = document.getElementById("btn-limpar-rascunho");
  var inpPontosPadrao = document.getElementById("atv-pontos-padrao");
  var elPaginaTitulo = document.getElementById("atv-pagina-titulo");
  var atividadeEditandoId = null;
  var atividadeEditandoMeta = { gabaritoLiberado: false };

  if (!form || !lista || !inpTitulo || !inpTurma) return;

  if (!AFS || typeof AFS.publicar !== "function") {
    document.addEventListener("DOMContentLoaded", function () {
      var aviso =
        "Módulo de atividades desatualizado. Recarregue com Ctrl+Shift+R (js/atividades-firestore.js).";
      if (UI && UI.toast) UI.toast(aviso, "erro");
    });
    return;
  }

  function toast(t, tipo) {
    if (UI && UI.toast) UI.toast(t, tipo || "info");
  }

  function msgFirestore(err) {
    if (!err) return "Erro desconhecido.";
    if (err.code === "permission-denied") {
      return "Sem permissão no Firestore. Saia e entre novamente com seu e-mail de professor.";
    }
    if (err.code === "unavailable") return "Firestore indisponível. Verifique sua internet.";
    if (err.message === "AUTH_OFF") {
      return "Sessão expirada. Faça login novamente.";
    }
    return err.message || String(err);
  }

  /** Garante token Firebase Auth antes de gravar (sessionStorage sozinho não basta). */
  function garantirAuthFirebase() {
    return new Promise(function (resolve, reject) {
      if (F.initError || !F.auth) {
        reject(new Error("Firebase não inicializou. Use um servidor local (ex.: Live Server)."));
        return;
      }

      function concluir(user) {
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
        resolve(user);
      }

      var cur = F.auth.currentUser;
      if (cur && cur.uid) {
        concluir(cur);
        return;
      }

      var finalizado = false;
      var unsub = F.auth.onAuthStateChanged(function (user) {
        if (finalizado) return;
        if (!user || !user.uid) return;
        finalizado = true;
        if (unsub) unsub();
        concluir(user);
      });

      setTimeout(function () {
        if (finalizado) return;
        finalizado = true;
        if (unsub) unsub();
        var atual = F.auth.currentUser;
        if (atual && atual.uid) concluir(atual);
        else reject(new Error("AUTH_OFF"));
      }, 8000);
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

  function scrollParaPrimeiroErro() {
    var alvo =
      document.querySelector(".field-painel__erro:not(:empty)") ||
      document.getElementById("atv-questoes-erro");
    if (alvo && alvo.textContent && alvo.scrollIntoView) {
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var status = document.getElementById("atv-status-acoes");
    if (status && status.textContent && status.scrollIntoView) {
      status.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function textoSeguroDeHtml(html) {
    if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
      return window.RichTextUtils.sanitizeHtml(html || "");
    }
    return String(html || "");
  }

  function temConteudoHtml(html) {
    var raw = String(html || "");
    if (window.RichTextUtils && typeof window.RichTextUtils.stripHtml === "function") {
      if (window.RichTextUtils.stripHtml(raw).trim().length > 0) return true;
    } else if (raw.trim().length > 0) {
      return true;
    }
    return /<img\s[^>]*src\s*=\s*["'][^"']+["']/i.test(raw);
  }

  function destruirEditoresEnunciado() {
    Object.keys(editoresEnunciado).forEach(function (uid) {
      if (editoresEnunciado[uid] && editoresEnunciado[uid].destroy) {
        editoresEnunciado[uid].destroy();
      }
    });
    editoresEnunciado = {};
  }

  function toolbarEnunciadoHtml(uid) {
    return (
      '<div class="rich-editor__toolbar" role="toolbar" aria-label="Ferramentas do enunciado">' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="bold" aria-label="Negrito" title="Negrito"><span aria-hidden="true">B</span></button>' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="italic" aria-label="Itálico" title="Itálico"><span aria-hidden="true">I</span></button>' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="insertUnorderedList" aria-label="Lista" title="Lista"><span aria-hidden="true">•</span></button>' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="insertOrderedList" aria-label="Lista numerada" title="Lista numerada"><span aria-hidden="true">1.</span></button>' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="link" aria-label="Link" title="Link"><span aria-hidden="true">🔗</span></button>' +
      '<button type="button" class="rich-btn rich-btn--compacto" data-cmd="image" aria-label="Inserir imagem" title="Inserir imagem"><span aria-hidden="true">🖼️</span></button>' +
      '<input type="file" id="enun-img-' +
      uid +
      '" class="questao-enunciado-img" accept="image/*" hidden />' +
      "</div>"
    );
  }

  function initEditorEnunciado(wrap, conteudoInicial) {
    if (!wrap || !window.RichTextUtils || typeof window.RichTextUtils.initEditor !== "function") return null;
    var uid = wrap.dataset.questUid;
    var root = wrap.querySelector(".questao-enunciado-editor");
    var area = wrap.querySelector(".questao-enunciado-area");
    var hidden = wrap.querySelector(".questao-enunciado-hidden");
    var fileInput = wrap.querySelector(".questao-enunciado-img");
    var errEl = wrap.querySelector(".questao-enunciado-erro");

    var inst = window.RichTextUtils.initEditor({
      root: root,
      area: area,
      hidden: hidden,
      fileInput: fileInput,
      placeholder: "Trecho, contexto ou pergunta…",
      onChange: function () {
        if (area) area.classList.remove("questao-enunciado--erro");
        atualizarPreview();
      },
      onError: function (msg) {
        if (errEl) errEl.textContent = msg || "";
      },
    });

    if (inst) {
      inst.setContent(conteudoInicial || "");
      editoresEnunciado[uid] = inst;
    }
    return inst;
  }

  function initEditoresNaLista() {
    destruirEditoresEnunciado();
    if (!lista) return;
    lista.querySelectorAll(".questao-editor").forEach(function (wrap) {
      var hidden = wrap.querySelector(".questao-enunciado-hidden");
      var inicial = hidden ? hidden.value : "";
      initEditorEnunciado(wrap, inicial);
    });
  }

  function getMaterialApoioContent() {
    if (editorMaterialApoio && typeof editorMaterialApoio.getContent === "function") {
      return editorMaterialApoio.getContent();
    }
    var hiddenMat = document.getElementById("atv-material-apoio-hidden");
    return hiddenMat ? hiddenMat.value : "";
  }

  function initEditorMaterialApoio(conteudoInicial) {
    if (!window.RichTextUtils || typeof window.RichTextUtils.initEditor !== "function") return;
    var root = document.getElementById("atv-material-apoio-editor");
    if (!root) return;

    if (editorMaterialApoio && editorMaterialApoio.destroy) {
      editorMaterialApoio.destroy();
      editorMaterialApoio = null;
    }

    var area = document.getElementById("atv-material-apoio-area");
    var hidden = document.getElementById("atv-material-apoio-hidden");
    var fileInput = document.getElementById("atv-material-apoio-img");
    var errEl = document.getElementById("atv-material-apoio-erro");

    editorMaterialApoio = window.RichTextUtils.initEditor({
      root: root,
      area: area,
      hidden: hidden,
      fileInput: fileInput,
      placeholder: "Contexto, trecho ou imagem de apoio para as questões…",
      onChange: function () {
        atualizarPreview();
      },
      onError: function (msg) {
        if (errEl) errEl.textContent = msg || "";
      },
    });

    if (editorMaterialApoio) {
      editorMaterialApoio.setContent(conteudoInicial || "");
    }
  }

  function atualizarMaterialApoioAberto(html) {
    if (!wrapMaterialApoio) return;
    if (temConteudoHtml(html)) wrapMaterialApoio.open = true;
  }

  function chaveRascunho() {
    return RASCUNHO_PREFIX + (sessao.uid || S.normalizarEmail(sessao.email));
  }

  function novoQuestUid() {
    return "quid_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function questaoVazia(numAlts) {
    var n = numAlts || 4;
    var alts = [];
    for (var i = 0; i < n; i++) alts.push({ texto: "" });
    return { questUid: novoQuestUid(), enunciado: "", alternativas: alts, corretaIndex: -1 };
  }

  function estadoInicial() {
    return {
      titulo: "",
      turmaId: "",
      texto: "",
      materialApoioHtml: "",
      pontuacaoPadraoQuestao: 10,
      questoes: [questaoVazia(4)],
    };
  }

  function lerRascunhoSession() {
    try {
      var raw = sessionStorage.getItem(chaveRascunho());
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !Array.isArray(o.questoes)) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function salvarRascunhoSession(dados) {
    try {
      sessionStorage.setItem(chaveRascunho(), JSON.stringify(dados));
    } catch (e) {}
  }

  function limparRascunhoSession() {
    try {
      sessionStorage.removeItem(chaveRascunho());
    } catch (e) {}
  }

  function setErro(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg || "";
  }

  function setMsg(el, texto, tipo) {
    if (!el) return;
    el.textContent = texto || "";
    el.className = "form-painel__msg";
    if (tipo === "erro") el.classList.add("form-painel__msg--erro");
    if (tipo === "ok") el.classList.add("form-painel__msg--ok");
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function coletarQuestoesDoDom() {
    var arr = [];
    if (!lista) return arr;
    lista.querySelectorAll(".questao-editor").forEach(function (el) {
      var uid = el.dataset.questUid;
      var enun = "";
      if (editoresEnunciado[uid]) {
        enun = editoresEnunciado[uid].getContent();
      } else {
        var hidden = el.querySelector(".questao-enunciado-hidden");
        enun = hidden ? hidden.value : "";
      }
      enun = String(enun || "").trim();
      var alts = [];
      el.querySelectorAll(".questao-alt-input").forEach(function (inp) {
        alts.push({ texto: inp.value });
      });
      var selGab = el.querySelector(".questao-gabarito-select");
      var c = -1;
      if (selGab && selGab.value !== "") {
        c = parseInt(selGab.value, 10);
        if (isNaN(c)) c = -1;
      }
      var ptsInp = el.querySelector(".questao-pontos-input");
      var pontos = null;
      if (ptsInp && ptsInp.value !== "") {
        var p = parseInt(ptsInp.value, 10);
        if (!isNaN(p) && p > 0) pontos = p;
      }
      var fsId = el.dataset.firestoreId || "";
      arr.push({
        questUid: uid,
        firestoreId: fsId,
        enunciado: enun,
        alternativas: alts,
        corretaIndex: c,
        pontos: pontos,
      });
    });
    return arr;
  }

  function coletarTudo() {
    if (editorMaterialApoio && typeof editorMaterialApoio.sync === "function") {
      editorMaterialApoio.sync();
    }
    var safeHtml = textoSeguroDeHtml(inpTexto ? inpTexto.value : "");
    var turmaVal = inpTurma ? inpTurma.value : "";
    var padraoPts = 10;
    if (inpPontosPadrao && inpPontosPadrao.value !== "") {
      var pp = parseInt(inpPontosPadrao.value, 10);
      if (!isNaN(pp) && pp > 0) padraoPts = pp;
    }
    return {
      titulo: inpTitulo.value.trim(),
      turmaId: turmaVal.trim(),
      texto: safeHtml.trim(),
      materialApoioHtml: String(getMaterialApoioContent() || ""),
      pontuacaoPadraoQuestao: padraoPts,
      questoes: coletarQuestoesDoDom(),
    };
  }

  function enunciadoParaPreview(html) {
    var raw = String(html || "");
    if (!raw.trim()) return "<em>Sem enunciado</em>";
    if (window.RichTextUtils && window.RichTextUtils.sanitizeHtml) {
      return window.RichTextUtils.sanitizeHtml(raw);
    }
    return escapeHtml(raw).replace(/\n/g, "<br>");
  }

  function atualizarPreview() {
    var box = document.getElementById("atv-preview-conteudo");
    if (!box) return;
    var d = coletarTudo();
    var turmaLabel = d.turmaId || "—";
    if (inpTurma && inpTurma.options && inpTurma.selectedIndex >= 0) {
      var opt = inpTurma.options[inpTurma.selectedIndex];
      if (opt && opt.value) turmaLabel = opt.textContent || d.turmaId;
    }

    var html =
      "<h3 class=\"atv-preview__tit\">" +
      escapeHtml(d.titulo || "Sem título") +
      "</h3>" +
      '<p class="atv-preview__meta">Turma: ' +
      escapeHtml(turmaLabel) +
      " · " +
      d.questoes.length +
      " pergunta(s)</p>";

    if (temConteudoHtml(d.texto)) {
      var legado = d.texto;
      if (window.RichTextUtils && window.RichTextUtils.sanitizeHtml) {
        legado = window.RichTextUtils.sanitizeHtml(d.texto);
      }
      html +=
        '<div class="atv-preview__legado painel-texto-leitura atividade-conteudo conteudo-html atv-preview__texto">' +
        legado +
        "</div>";
    }

    if (temConteudoHtml(d.materialApoioHtml)) {
      html +=
        '<section class="atv-preview__material-apoio">' +
        '<h4 class="atv-preview__material-tit">📖 Material de Apoio</h4>' +
        '<div class="atv-preview__material-corpo conteudo-html">' +
        enunciadoParaPreview(d.materialApoioHtml) +
        "</div></section>";
    }

    d.questoes.forEach(function (q, idx) {
      html +=
        '<article class="atv-preview__questao">' +
        '<h4 class="atv-preview__questao-tit">Pergunta ' +
        (idx + 1) +
        "</h4>" +
        '<div class="atv-preview__enun conteudo-html questao-enunciado-conteudo">' +
        enunciadoParaPreview(q.enunciado) +
        "</div>";
      if (q.alternativas && q.alternativas.length) {
        html += '<ul class="atv-preview__alts">';
        q.alternativas.forEach(function (a, j) {
          var t = String((a && a.texto) || "").trim();
          if (!t) return;
          html +=
            "<li><strong>" +
            String.fromCharCode(65 + j) +
            ")</strong> " +
            escapeHtml(t) +
            (q.corretaIndex === j ? ' <span class="atv-preview__gab">(gabarito)</span>' : "") +
            "</li>";
        });
        html += "</ul>";
      }
      html += "</article>";
    });

    if (!d.titulo && !d.turmaId && !d.questoes.some(function (q) { return temConteudoHtml(q.enunciado); })) {
      box.innerHTML = '<p class="lista-vazia">Preencha título, turma e perguntas para ver a prévia.</p>';
      return;
    }

    box.innerHTML = html;
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str != null ? String(str) : "";
    return d.innerHTML;
  }

  function popularSelectTurmas(turmas) {
    if (!inpTurma) return;
    inpTurma.innerHTML = '<option value="">Selecione a turma…</option>';
    (turmas || []).forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.codigo;
      o.textContent = t.nome + " (" + t.codigo + ")";
      inpTurma.appendChild(o);
    });
    if (!turmas.length) {
      inpTurma.innerHTML = '<option value="">Nenhuma turma — crie no painel</option>';
    }
  }

  function carregarTurmasSelect() {
    if (!TF || typeof TF.listarTurmasProfessor !== "function") {
      popularSelectTurmas([]);
      toast("Módulo de turmas desatualizado. Recarregue com Ctrl+Shift+R.", "erro");
      return Promise.resolve();
    }
    if (F.initError || !F.db || !sessao.uid) {
      popularSelectTurmas([]);
      return Promise.resolve();
    }
    return garantirAuthFirebase()
      .then(function () {
        return AFS.listarPorProfessor(F.db, sessao.uid, sessao.email);
      })
      .then(function (atvs) {
        return TF.listarTurmasProfessor(F.db, sessao.uid, atvs);
      })
      .then(function (turmas) {
        popularSelectTurmas(turmas);
      })
      .catch(function (err) {
        popularSelectTurmas([]);
        if (err && err.message === "AUTH_OFF") {
          toast("Sessão expirada. Faça login novamente para publicar.", "erro");
        } else if (err) {
          toast("Não foi possível carregar turmas agora. Tente recarregar a página.", "erro");
        }
      });
  }

  function professorPodeEditar(atv) {
    if (!atv) return false;
    if (sessao.uid && atv.professorId === sessao.uid) return true;
    var emailNorm = S.normalizarEmail(sessao.email || "");
    if (emailNorm && atv.professorEmail) {
      return S.normalizarEmail(atv.professorEmail) === emailNorm;
    }
    return false;
  }

  function atividadeParaFormulario(atv, opts) {
    opts = opts || {};
    var qs = (atv.questoes || []).map(function (q) {
      return {
        questUid: novoQuestUid(),
        firestoreId: q.id || "",
        enunciado: q.enunciado || "",
        alternativas: (q.alternativas || []).map(function (a) {
          return { texto: typeof a === "string" ? a : a.texto || "" };
        }),
        corretaIndex:
          typeof q.indiceCorreta === "number" && q.indiceCorreta >= 0 ? q.indiceCorreta : -1,
        pontos: typeof q.pontos === "number" && q.pontos > 0 ? q.pontos : null,
      };
    });
    if (!qs.length) qs = [questaoVazia(4)];
    var titulo = atv.titulo || "";
    if (opts.copia) titulo = titulo + " (cópia)";
    return {
      titulo: titulo,
      turmaId: atv.turmaId || "",
      texto: atv.texto || "",
      materialApoioHtml: atv.materialApoioHtml || "",
      pontuacaoPadraoQuestao:
        typeof atv.pontuacaoPadraoQuestao === "number" && atv.pontuacaoPadraoQuestao > 0
          ? atv.pontuacaoPadraoQuestao
          : 10,
      questoes: qs,
    };
  }

  function atividadeParaRascunho(atv) {
    return atividadeParaFormulario(atv, { copia: true });
  }

  function configurarModoEdicao(atv) {
    atividadeEditandoId = atv.id;
    atividadeEditandoMeta = { gabaritoLiberado: atv.gabaritoLiberado === true };
    if (elPaginaTitulo) elPaginaTitulo.textContent = "Editar atividade";
    var submit = document.getElementById("atv-submit");
    if (submit) submit.textContent = "Salvar alterações";
  }

  function carregarEdicao() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("edit");
    if (!id || !AFS || !F.db) return Promise.resolve();
    return AFS.obterPorId(F.db, id).then(function (atv) {
      if (!atv) {
        if (UI && UI.toast) UI.toast("Atividade não encontrada.", "erro");
        return;
      }
      if (!professorPodeEditar(atv)) {
        if (UI && UI.toast) UI.toast("Você não pode editar esta atividade.", "erro");
        return;
      }
      configurarModoEdicao(atv);
      aplicarDados(atividadeParaFormulario(atv, {}));
      memoriaParaSession();
      atualizarPreview();
      if (UI && UI.toast) UI.toast("Atividade carregada para edição.", "ok");
    });
  }

  function carregarDuplicar() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("duplicar");
    if (!id || !AFS || !F.db) return Promise.resolve();
    return AFS.obterPorId(F.db, id).then(function (atv) {
      if (!atv) return;
      aplicarDados(atividadeParaRascunho(atv));
      memoriaParaSession();
      atualizarPreview();
      if (UI && UI.toast) UI.toast("Atividade duplicada no formulário. Ajuste e publique.", "ok");
    });
  }

  function limparErrosQuestoes() {
    if (!lista) return;
    lista.querySelectorAll(".questao-editor").forEach(function (wrap) {
      wrap.classList.remove("questao-editor--erro");
      var err = wrap.querySelector(".questao-editor__erro");
      if (err) {
        err.textContent = "";
        err.hidden = true;
      }
      wrap.querySelectorAll(".questao-enunciado--erro, .questao-alt-input--erro, .questao-gabarito-select--erro").forEach(
        function (el) {
          el.classList.remove("questao-enunciado--erro", "questao-alt-input--erro", "questao-gabarito-select--erro");
        }
      );
    });
  }

  function marcarErrosQuestoes(questoes) {
    limparErrosQuestoes();
    if (!lista) return null;
    var primeiroProblema = null;
    var resumo = "";

    lista.querySelectorAll(".questao-editor").forEach(function (wrap, i) {
      var q = questoes[i];
      if (!q) return;
      var problemas = [];

      if (!temConteudoHtml(q.enunciado)) {
        problemas.push("Preencha o enunciado.");
        var areaEnun = wrap.querySelector(".questao-enunciado-area");
        if (areaEnun) areaEnun.classList.add("questao-enunciado--erro");
      }

      var inputsAlt = wrap.querySelectorAll(".questao-alt-input");
      var preenchidas = 0;
      inputsAlt.forEach(function (inp) {
        if (String(inp.value || "").trim()) preenchidas++;
      });
      if (preenchidas < 2) {
        problemas.push("Preencha pelo menos 2 alternativas (campos destacados em vermelho).");
        inputsAlt.forEach(function (inp) {
          if (!String(inp.value || "").trim()) inp.classList.add("questao-alt-input--erro");
        });
      }

      if (q.corretaIndex < 0 || q.corretaIndex >= q.alternativas.length) {
        problemas.push('Escolha o gabarito no menu "Gabarito — resposta correta".');
        var sel = wrap.querySelector(".questao-gabarito-select");
        if (sel) sel.classList.add("questao-gabarito-select--erro");
      } else {
        var txtCorreta = (q.alternativas[q.corretaIndex] && q.alternativas[q.corretaIndex].texto) || "";
        if (!String(txtCorreta).trim()) {
          problemas.push("A alternativa marcada como correta não pode estar vazia.");
          if (inputsAlt[q.corretaIndex]) inputsAlt[q.corretaIndex].classList.add("questao-alt-input--erro");
        }
      }

      if (!problemas.length) return;

      wrap.classList.add("questao-editor--erro");
      var errEl = wrap.querySelector(".questao-editor__erro");
      if (errEl) {
        errEl.textContent = problemas.join(" ");
        errEl.hidden = false;
      }
      if (!primeiroProblema) {
        primeiroProblema = wrap;
        resumo = "Pergunta " + (i + 1) + ": " + problemas[0];
      }
    });

    return { primeiro: primeiroProblema, resumo: resumo };
  }

  function scrollParaQuestaoProblema(wrap) {
    if (wrap && wrap.scrollIntoView) {
      wrap.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function renderQuestoes(questoes) {
    lista.innerHTML = "";
    questoes.forEach(function (q, idx) {
      lista.appendChild(criarBlocoQuestao(q, idx + 1));
    });
    initEditoresNaLista();
  }

  function indiceGabaritoValido(ci, totalAlts) {
    if (typeof ci !== "number" || isNaN(ci) || ci < 0 || ci >= totalAlts) return -1;
    return ci;
  }

  function normalizarQuestaoGabarito(q) {
    if (!q.questUid) q.questUid = novoQuestUid();
    if (!q.alternativas || q.alternativas.length < 2) {
      q.alternativas = [{ texto: "" }, { texto: "" }];
    }
    q.alternativas = q.alternativas.map(function (a) {
      if (typeof a === "string") return { texto: a };
      return { texto: a && a.texto != null ? a.texto : "" };
    });
    q.corretaIndex = indiceGabaritoValido(q.corretaIndex, q.alternativas.length);
  }

  function atualizarOpcoesGabaritoSelect(wrap) {
    var sel = wrap.querySelector(".questao-gabarito-select");
    if (!sel) return;
    var valAntes = sel.value;
    var inputs = wrap.querySelectorAll(".questao-alt-input");
    sel.innerHTML = '<option value="">— Escolha a resposta correta —</option>';
    inputs.forEach(function (inp, j) {
      var o = document.createElement("option");
      o.value = String(j);
      var t = inp.value.trim();
      o.textContent = String.fromCharCode(65 + j) + (t ? " — " + t : " — (preencha o texto)");
      sel.appendChild(o);
    });
    if (valAntes !== "" && parseInt(valAntes, 10) < inputs.length) {
      sel.value = valAntes;
    }
  }

  function atualizarGabaritoVisual(wrap) {
    if (!wrap) return;
    var sel = wrap.querySelector(".questao-gabarito-select");
    var idx = sel && sel.value !== "" ? parseInt(sel.value, 10) : -1;
    if (isNaN(idx)) idx = -1;
    var linhas = wrap.querySelectorAll(".questao-alt-linha");
    linhas.forEach(function (linha, j) {
      linha.classList.remove("questao-alt-linha--gabarito");
      if (idx >= 0 && idx === j) linha.classList.add("questao-alt-linha--gabarito");
    });
    var aviso = wrap.querySelector(".questao-gabarito-aviso");
    if (aviso) {
      if (idx >= 0) {
        aviso.textContent =
          "Gabarito definido: alternativa " + String.fromCharCode(65 + idx) + " é a resposta correta.";
        aviso.classList.remove("questao-gabarito-aviso--pendente");
      } else {
        aviso.textContent =
          'Obrigatório: no menu "Gabarito", escolha qual alternativa é a resposta correta.';
        aviso.classList.add("questao-gabarito-aviso--pendente");
      }
    }
  }

  function criarBlocoQuestao(q, numero) {
    var uid = q.questUid || novoQuestUid();
    var wrap = document.createElement("div");
    wrap.className = "questao-editor";
    wrap.dataset.questUid = uid;

    var ci = indiceGabaritoValido(q.corretaIndex, (q.alternativas || []).length);
    var selOpts = '<option value="">— Escolha a resposta correta —</option>';
    (q.alternativas || [{ texto: "" }, { texto: "" }]).forEach(function (alt, j) {
      var letra = String.fromCharCode(65 + j);
      var t = typeof alt === "string" ? alt : alt && alt.texto != null ? alt.texto : "";
      var prev = t.trim();
      var label = letra + (prev ? " — " + prev : " — (preencha o texto)");
      selOpts +=
        '<option value="' +
        j +
        '"' +
        (ci === j ? " selected" : "") +
        ">" +
        escapeHtml(label) +
        "</option>";
    });

    var altsHtml = "";
    (q.alternativas || [{ texto: "" }, { texto: "" }]).forEach(function (alt, j) {
      var letra = String.fromCharCode(65 + j);
      altsHtml +=
        '<div class="questao-alt-linha' +
        (ci === j ? " questao-alt-linha--gabarito" : "") +
        '" data-alt-idx="' +
        j +
        '">' +
        '<span class="questao-alt-letra" aria-hidden="true">' +
        letra +
        "</span>" +
        '<input type="text" class="questao-alt-input" maxlength="500" value="" placeholder="Texto da alternativa ' +
        letra +
        '" aria-label="Texto da alternativa ' +
        letra +
        '">' +
        '<button type="button" class="btn-mini btn-mini--perigo" data-acao="remover-alt" title="Remover alternativa">×</button>' +
        "</div>";
    });

    if (q.firestoreId) wrap.dataset.firestoreId = q.firestoreId;

    var ptsVal = typeof q.pontos === "number" && q.pontos > 0 ? String(q.pontos) : "";

    wrap.innerHTML =
      '<div class="questao-editor__cab">' +
      "<span class=\"questao-editor__num\">Pergunta " +
      numero +
      "</span>" +
      '<button type="button" class="btn-mini btn-mini--perigo" data-acao="remover-questao">Remover pergunta</button>' +
      "</div>" +
      '<p class="questao-editor__erro" hidden role="alert"></p>' +
      '<div class="questao-enunciado-wrap">' +
      '<label class="questao-label" for="enun-area-' +
      uid +
      '">Enunciado</label>' +
      '<div class="rich-editor rich-editor--compact questao-enunciado-editor" aria-label="Editor do enunciado">' +
      toolbarEnunciadoHtml(uid) +
      '<div id="enun-area-' +
      uid +
      '" class="rich-editor__area questao-enunciado-area" contenteditable="true" role="textbox" aria-multiline="true"></div>' +
      '<p class="questao-enunciado-erro field-painel__erro" role="alert"></p>' +
      "</div>" +
      '<textarea class="questao-enunciado-hidden" data-rich-hidden hidden aria-hidden="true"></textarea>' +
      "</div>" +
      '<div class="questao-pontos-row">' +
      '<label class="questao-label questao-label--inline">Pontos desta questão</label>' +
      '<input type="number" class="questao-pontos-input" min="1" max="100" step="1" value="' +
      ptsVal +
      '" placeholder="Padrão" aria-label="Pontos desta questão (vazio usa o padrão)">' +
      "</div>" +
      '<div class="questao-alts">' +
      '<p class="questao-gabarito-aviso questao-gabarito-aviso--pendente" role="status"></p>' +
      '<div class="questao-gabarito-row">' +
      '<label class="questao-label questao-label--gabarito">Gabarito — resposta correta</label>' +
      '<select class="questao-gabarito-select" aria-label="Selecione a alternativa correta">' +
      selOpts +
      "</select></div>" +
      "<span class=\"questao-label\">Texto das alternativas</span>" +
      '<div class="questao-alts-list">' +
      altsHtml +
      "</div>" +
      '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="add-alt">+ Alternativa</button>' +
      "</div>";

    var hiddenEnun = wrap.querySelector(".questao-enunciado-hidden");
    if (hiddenEnun) hiddenEnun.value = q.enunciado || "";

    var inputs = wrap.querySelectorAll(".questao-alt-input");
    (q.alternativas || []).forEach(function (alt, j) {
      var t = typeof alt === "string" ? alt : alt && alt.texto != null ? alt.texto : "";
      if (inputs[j]) inputs[j].value = t;
    });

    atualizarOpcoesGabaritoSelect(wrap);
    var selEl = wrap.querySelector(".questao-gabarito-select");
    if (selEl && ci >= 0) selEl.value = String(ci);
    atualizarGabaritoVisual(wrap);
    return wrap;
  }

  if (lista) {
    lista.addEventListener("change", function (e) {
      if (e.target && e.target.classList.contains("questao-gabarito-select")) {
        e.target.classList.remove("questao-gabarito-select--erro");
        var w = e.target.closest(".questao-editor");
        if (w) atualizarGabaritoVisual(w);
        atualizarPreview();
      }
    });
    lista.addEventListener("input", function (e) {
      if (e.target && e.target.classList.contains("questao-enunciado-area")) {
        e.target.classList.remove("questao-enunciado--erro");
      }
      if (e.target && e.target.classList.contains("questao-alt-input")) {
        e.target.classList.remove("questao-alt-input--erro");
        var w = e.target.closest(".questao-editor");
        if (w) {
          atualizarOpcoesGabaritoSelect(w);
          atualizarGabaritoVisual(w);
        }
      }
    });
  }

  function aplicarDados(d) {
    inpTitulo.value = d.titulo || "";
    inpTurma.value = d.turmaId || "";
    if (inpPontosPadrao) {
      inpPontosPadrao.value =
        typeof d.pontuacaoPadraoQuestao === "number" && d.pontuacaoPadraoQuestao > 0
          ? String(d.pontuacaoPadraoQuestao)
          : "10";
    }
    if (inpTexto) inpTexto.value = d.texto || "";
    initEditorMaterialApoio(d.materialApoioHtml || "");
    atualizarMaterialApoioAberto(d.materialApoioHtml || "");
    var qs = d.questoes && d.questoes.length ? d.questoes : estadoInicial().questoes;
    qs.forEach(normalizarQuestaoGabarito);
    renderQuestoes(qs);
  }

  function memoriaParaSession() {
    salvarRascunhoSession(coletarTudo());
  }

  lista.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-acao]");
    if (!btn) return;
    var acao = btn.getAttribute("data-acao");
    var blo = btn.closest(".questao-editor");
    if (!blo) return;

    var dados = coletarTudo();

    if (acao === "remover-questao") {
      if (dados.questoes.length <= 1) return;
      var uid = blo.dataset.questUid;
      dados.questoes = dados.questoes.filter(function (q) {
        return q.questUid !== uid;
      });
      aplicarDados(dados);
      memoriaParaSession();
      return;
    }

    if (acao === "add-alt") {
      var uid2 = blo.dataset.questUid;
      dados.questoes.forEach(function (q) {
        if (q.questUid === uid2) {
          if (q.alternativas.length >= 6) return;
          q.alternativas.push({ texto: "" });
          if (q.corretaIndex >= q.alternativas.length) q.corretaIndex = -1;
        }
      });
      aplicarDados(dados);
      memoriaParaSession();
      return;
    }

    if (acao === "remover-alt") {
      var uid3 = blo.dataset.questUid;
      dados.questoes.forEach(function (q) {
        if (q.questUid === uid3 && q.alternativas.length > 2) {
          var linha = btn.closest(".questao-alt-linha");
          var idx = linha ? parseInt(linha.getAttribute("data-alt-idx"), 10) : -1;
          if (idx >= 0) {
            q.alternativas.splice(idx, 1);
            if (q.corretaIndex === idx) q.corretaIndex = -1;
            else if (q.corretaIndex > idx) q.corretaIndex -= 1;
          }
        }
      });
      aplicarDados(dados);
      memoriaParaSession();
    }
  });

  if (btnAdd) {
    btnAdd.addEventListener("click", function () {
      var dados = coletarTudo();
      dados.questoes.push(questaoVazia(4));
      aplicarDados(dados);
      memoriaParaSession();
    });
  }

  if (btnRascunho) {
    btnRascunho.addEventListener("click", function () {
      var msg = document.getElementById("atv-msg");
      memoriaParaSession();
      setMsg(msg, "Rascunho salvo temporariamente (sessionStorage + estado na página).", "ok");
    });
  }

  if (btnLimpar) {
    btnLimpar.addEventListener("click", function () {
      limparRascunhoSession();
      aplicarDados(estadoInicial());
      var msg = document.getElementById("atv-msg");
      setMsg(msg, "Rascunho limpo.", "ok");
    });
  }

  function debouncePreview() {
    atualizarPreview();
  }

  if (inpTitulo) inpTitulo.addEventListener("input", debouncePreview);
  if (inpTurma) inpTurma.addEventListener("change", debouncePreview);
  lista.addEventListener("input", debouncePreview);

  var btnModelo = document.getElementById("btn-salvar-modelo");
  if (btnModelo) {
    btnModelo.addEventListener("click", function () {
      try {
        sessionStorage.setItem(MODELO_PREFIX + sessao.uid, JSON.stringify(coletarTudo()));
        if (UI && UI.toast) UI.toast("Modelo salvo no navegador.", "ok");
      } catch (e) {
        if (UI && UI.toast) UI.toast("Não foi possível salvar o modelo.", "erro");
      }
    });
  }

  function iniciarConteudoFormulario() {
    var paramsUrl = new URLSearchParams(window.location.search);
    if (paramsUrl.get("edit")) {
      return carregarEdicao();
    }
    if (paramsUrl.get("duplicar")) {
      return carregarDuplicar();
    }
    var draft = lerRascunhoSession();
    if (draft) {
      aplicarDados(draft);
    } else {
      var modeloRaw = null;
      try {
        modeloRaw = sessionStorage.getItem(MODELO_PREFIX + sessao.uid);
      } catch (e) {}
      if (modeloRaw) {
        try {
          aplicarDados(JSON.parse(modeloRaw));
        } catch (e2) {
          aplicarDados(estadoInicial());
        }
      } else {
        aplicarDados(estadoInicial());
      }
    }
    atualizarPreview();
  }

  aplicarDados(estadoInicial());
  atualizarPreview();

  carregarTurmasSelect().then(function () {
    iniciarConteudoFormulario();
  });

  function setStatusAcoes(texto, tipo) {
    var el = document.getElementById("atv-status-acoes");
    if (!el) return;
    el.textContent = texto || "";
    el.className = "form-painel__msg form-painel__msg--acoes";
    if (tipo === "erro") el.classList.add("form-painel__msg--erro");
    if (tipo === "ok") el.classList.add("form-painel__msg--ok");
  }

  function publicarAtividade(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var msg = document.getElementById("atv-msg");
    var submit = document.getElementById("atv-submit");
    setErro("atv-titulo-erro", "");
    setErro("atv-turma-erro", "");
    setErro("atv-questoes-erro", "");
    limparErrosQuestoes();
    setMsg(msg, "");
    setStatusAcoes("");

    try {
    var dados = coletarTudo();
    var ok = true;
    if (!dados.titulo) {
      setErro("atv-titulo-erro", "Informe o título.");
      ok = false;
    }
    var turmaNorm = S.normalizarTurmaId(dados.turmaId);
    if (!turmaNorm || turmaNorm.length < 2) {
      setErro("atv-turma-erro", "Selecione uma turma cadastrada.");
      ok = false;
    }
    if (!dados.questoes.length) {
      setErro("atv-questoes-erro", "Adicione pelo menos uma pergunta.");
      ok = false;
    }

    dados.questoes.forEach(function (q, i) {
      if (!temConteudoHtml(q.enunciado)) {
        setErro("atv-questoes-erro", "Preencha o enunciado da pergunta " + (i + 1) + ".");
        ok = false;
      }
      var preenchidas = q.alternativas.filter(function (a) {
        return String(a.texto || "").trim().length > 0;
      });
      if (preenchidas.length < 2) {
        setErro("atv-questoes-erro", "Cada pergunta precisa de pelo menos duas alternativas preenchidas (pergunta " + (i + 1) + ").");
        ok = false;
      }
      if (q.corretaIndex < 0 || q.corretaIndex >= q.alternativas.length) {
        setErro(
          "atv-questoes-erro",
          "Defina o gabarito: marque qual alternativa é a resposta correta (pergunta " +
            (i + 1) +
            ")."
        );
        ok = false;
      }
      var txtCorreta = (q.alternativas[q.corretaIndex] && q.alternativas[q.corretaIndex].texto) || "";
      if (!String(txtCorreta).trim()) {
        setErro("atv-questoes-erro", "A alternativa marcada como correta não pode estar vazia (pergunta " + (i + 1) + ").");
        ok = false;
      }
    });

    if (!ok) {
      var marcacao = marcarErrosQuestoes(dados.questoes);
      if (marcacao && marcacao.resumo) {
        setErro("atv-questoes-erro", marcacao.resumo);
      }
      setMsg(msg, "Corrija os campos destacados.", "erro");
      setStatusAcoes(
        marcacao && marcacao.resumo
          ? marcacao.resumo
          : "Corrija os campos em vermelho antes de publicar.",
        "erro"
      );
      toast(
        marcacao && marcacao.resumo
          ? marcacao.resumo
          : "Revise os campos em vermelho antes de publicar.",
        "erro"
      );
      if (marcacao && marcacao.primeiro) scrollParaQuestaoProblema(marcacao.primeiro);
      else scrollParaPrimeiroErro();
      return;
    }

    limparErrosQuestoes();

    var questoesPublicadas = dados.questoes.map(function (q, ordem) {
      var textos = [];
      var mapa = {};
      q.alternativas.forEach(function (a, j) {
        var t = String(a.texto || "").trim();
        if (t) {
          mapa[j] = textos.length;
          textos.push(t);
        }
      });
      var novoIndice = mapa[q.corretaIndex];
      if (novoIndice === undefined) novoIndice = 0;
      var qid = q.firestoreId
        ? String(q.firestoreId)
        : "q_pub_" + ordem + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
      var enunPub = q.enunciado.trim();
      if (window.RichTextUtils && window.RichTextUtils.prepararHtmlParaFirestore) {
        enunPub = window.RichTextUtils.prepararHtmlParaFirestore(enunPub);
      } else if (window.RichTextUtils && window.RichTextUtils.sanitizeHtml) {
        enunPub = window.RichTextUtils.sanitizeHtml(enunPub);
      }
      var item = {
        id: qid,
        enunciado: enunPub,
        alternativas: textos,
        indiceCorreta: novoIndice,
      };
      if (typeof q.pontos === "number" && q.pontos > 0) item.pontos = q.pontos;
      return item;
    });

    if (F.initError || !F.db || !AFS) {
      setMsg(msg, "Firebase não disponível. Abra o site pelo servidor local (ex.: Live Server).", "erro");
      setStatusAcoes("Firebase indisponível. Use Live Server ou http://localhost.", "erro");
      toast("Firebase indisponível. Abra pelo servidor local.", "erro");
      return;
    }
    if (!sessao.uid) {
      setMsg(
        msg,
        "Sua sessão não tem o ID do professor. Saia e entre novamente com login pelo Firebase.",
        "erro"
      );
      setStatusAcoes("Sessão inválida. Faça login novamente.", "erro");
      toast("Sessão inválida. Faça login novamente.", "erro");
      return;
    }

    var textoPub = dados.texto;
    if (window.RichTextUtils && window.RichTextUtils.prepararHtmlParaFirestore) {
      textoPub = window.RichTextUtils.prepararHtmlParaFirestore(dados.texto);
    } else if (window.RichTextUtils && window.RichTextUtils.sanitizeHtml) {
      textoPub = window.RichTextUtils.sanitizeHtml(dados.texto);
    }

    var materialApoioPub = dados.materialApoioHtml || "";
    if (window.RichTextUtils && window.RichTextUtils.prepararHtmlParaFirestore) {
      materialApoioPub = window.RichTextUtils.prepararHtmlParaFirestore(materialApoioPub);
    } else if (window.RichTextUtils && window.RichTextUtils.sanitizeHtml) {
      materialApoioPub = window.RichTextUtils.sanitizeHtml(materialApoioPub);
    }
    if (!temConteudoHtml(materialApoioPub)) materialApoioPub = "";

    var padraoPts =
      typeof dados.pontuacaoPadraoQuestao === "number" && dados.pontuacaoPadraoQuestao > 0
        ? dados.pontuacaoPadraoQuestao
        : 10;

    var questoesFlat = questoesPublicadas.map(function (q) {
      var o = {
        id: String(q.id),
        enunciado: String(q.enunciado),
        alternativas: q.alternativas.map(String),
        indiceCorreta: Number(q.indiceCorreta),
      };
      if (typeof q.pontos === "number" && q.pontos > 0) o.pontos = q.pontos;
      return o;
    });

    var payload = {
      nome: dados.titulo,
      titulo: dados.titulo,
      turmaId: turmaNorm,
      professorId: sessao.uid,
      professorEmail: sessao.email || "",
      texto: textoPub,
      materialApoioHtml: materialApoioPub,
      questoes: questoesFlat,
      formato: "multipla_escolha",
      pontuacaoPadraoQuestao: padraoPts,
      gabaritoLiberado: atividadeEditandoId
        ? atividadeEditandoMeta.gabaritoLiberado
        : false,
    };

    if (submit) {
      submit.disabled = true;
      submit.classList.add("is-loading");
      submit.setAttribute("aria-busy", "true");
    }
    setMsg(
      msg,
      atividadeEditandoId ? "Salvando alterações…" : "Publicando no Firestore…",
      ""
    );
    setStatusAcoes(
      atividadeEditandoId ? "Salvando alterações…" : "Publicando atividade…",
      ""
    );

    garantirAuthFirebase()
      .then(function () {
        return atividadeEditandoId
          ? AFS.atualizar(F.db, atividadeEditandoId, payload)
          : AFS.publicar(F.db, payload);
      })
      .then(function () {
        if (!atividadeEditandoId) limparRascunhoSession();
        setMsg(
          msg,
          atividadeEditandoId
            ? "Atividade atualizada! Voltando ao painel…"
            : "Atividade publicada! Voltando ao painel…",
          "ok"
        );
        setStatusAcoes(
          atividadeEditandoId ? "Atividade atualizada!" : "Atividade publicada com sucesso!",
          "ok"
        );
        toast(
          atividadeEditandoId ? "Atividade atualizada!" : "Atividade publicada com sucesso!",
          "ok"
        );
        setTimeout(function () {
          S.irPara(S.urls.painelProfessor);
        }, 650);
      })
      .catch(function (err) {
        if (submit) {
          submit.disabled = false;
          submit.classList.remove("is-loading");
          submit.removeAttribute("aria-busy");
        }
        if (err && err.message === "AUTH_OFF") {
          setMsg(msg, msgFirestore(err), "erro");
          setStatusAcoes("Sessão expirada. Redirecionando para o login…", "erro");
          redirecionarLogin();
          return;
        }
        var det = msgFirestore(err);
        setMsg(msg, "Não foi possível salvar: " + det, "erro");
        setStatusAcoes("Não foi possível salvar: " + det, "erro");
        toast("Não foi possível salvar: " + det, "erro");
      });
    } catch (errSync) {
      if (submit) {
        submit.disabled = false;
        submit.classList.remove("is-loading");
        submit.removeAttribute("aria-busy");
      }
      var detSync = errSync && errSync.message ? errSync.message : "Erro inesperado.";
      setMsg(msg, "Erro ao publicar: " + detSync, "erro");
      setStatusAcoes("Erro ao publicar: " + detSync, "erro");
      toast("Erro ao publicar: " + detSync, "erro");
    }
  }

  form.addEventListener("submit", publicarAtividade);
  }
})();
