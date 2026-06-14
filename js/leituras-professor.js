/**
 * Módulo 📚 Leituras — painel do professor (cadastro via Firestore, listagem).
 * Complementar às atividades; não altera fluxos existentes.
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var LFS = window.LeiturasFirestore;
  var TF = window.TurmasFirestore;
  var UI = window.UiFeedback;

  var sessao = null;

  SessaoApp.aguardarFirebasePronto(F)
    .then(function () {
      return SessaoApp.garantirSessaoProfessor(F.db, F.auth);
    })
    .then(function (s) {
      if (!s) return;
      sessao = s;
      iniciarLeiturasProfessor();
    })
    .catch(function () {});

  function iniciarLeiturasProfessor() {

  var LIMITE_PREVIEW = 3;
  var listaLeiturasCache = [];
  var listaTurmasRef = [];
  var turmaFiltroAtual = "";
  var leituraIdEmEdicao = null;

  var elLista = document.getElementById("lista-leituras-prof");
  var elVazio = document.getElementById("vazio-leituras-prof");
  var elLoading = document.getElementById("leituras-loading");
  var selTurmaFiltro = document.getElementById("leituras-turma-select");
  var linkVerTodas = document.getElementById("link-ver-todas-leituras");
  if (!elLista && !document.getElementById("btn-nova-leitura")) return;

  function toast(msg, tipo) {
    if (UI && UI.toast) UI.toast(msg, tipo);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function labelTipo(tipo) {
    if (tipo === "link") return "Material de leitura";
    return "Texto do editor";
  }

  function iconeTipo(tipo) {
    if (tipo === "link") return "📚";
    return "📝";
  }

  function nomeTurmaExibicao(codigo) {
    var t = listaTurmasRef.find(function (x) {
      return x.codigo === codigo;
    });
    return t ? t.nome + " (" + t.codigo + ")" : codigo;
  }

  function setLoadingLista(ativo) {
    if (elLoading) elLoading.hidden = !ativo;
    if (elLista && ativo) elLista.innerHTML = "";
  }

  function filtrarPorTurma(lista, turmaId) {
    var t = String(turmaId || "").trim();
    if (!t) return lista || [];
    return (lista || []).filter(function (l) {
      return l.turmaId === t;
    });
  }

  function atualizarLinkLeituras(totalFiltrado, totalGeral) {
    if (!linkVerTodas) return;
    var total = typeof totalGeral === "number" ? totalGeral : totalFiltrado;
    linkVerTodas.hidden = total === 0;
  }

  function criarMiniCardLeitura(l) {
    var card = document.createElement("article");
    card.className = "leitura-card leitura-card--prof";
    card.dataset.leituraId = l.id;
    var data = new Date(l.criadoEm).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    var statusLabel =
      String(l.status || "").toLowerCase() === "rascunho" ? "Rascunho" : "Publicado";
    card.innerHTML =
      '<div class="leitura-card__top">' +
      '<span class="leitura-card__ico" aria-hidden="true">' +
      iconeTipo(l.tipoConteudo) +
      "</span>" +
      '<div class="leitura-card__corpo">' +
      '<h3 class="leitura-card__titulo">' +
      escapeHtml(l.titulo) +
      "</h3>" +
      '<p class="leitura-card__meta">' +
      '<span class="leitura-card__tipo">' +
      escapeHtml(labelTipo(l.tipoConteudo)) +
      "</span>" +
      '<span class="leitura-card__sep" aria-hidden="true">·</span>' +
      '<span class="leitura-card__turma">' +
      escapeHtml(nomeTurmaExibicao(l.turmaId)) +
      "</span>" +
      '<span class="leitura-card__sep" aria-hidden="true">·</span>' +
      '<time class="leitura-card__data" datetime="' +
      escapeAttr(l.criadoEm) +
      '">' +
      escapeHtml(data) +
      "</time>" +
      '<span class="leitura-card__sep" aria-hidden="true">·</span>' +
      '<span class="leitura-card__status">' +
      escapeHtml(statusLabel) +
      "</span>" +
      "</p>" +
      (l.descricao
        ? '<p class="leitura-card__desc">' +
          escapeHtml(l.descricao.slice(0, 90)) +
          (l.descricao.length > 90 ? "…" : "") +
          "</p>"
        : "") +
      "</div></div>" +
      '<div class="leitura-card__acoes item-atividade__acoes item-atividade__acoes--inline">' +
      '<button type="button" class="btn-secundario btn-secundario--compacto" data-acao="editar-leitura">Editar</button>' +
      '<button type="button" class="btn-mini btn-mini--perigo" data-acao="excluir-leitura">Excluir</button>' +
      "</div>";
    return card;
  }

  function atualizarListasLeiturasVisiveis() {
    renderPreviewFiltrada();
    if (modalTodas && !modalTodas.hidden) {
      var container = document.getElementById("lista-leituras-modal");
      var sub = document.getElementById("modal-leituras-todas-sub");
      if (sub) {
        sub.textContent =
          listaLeiturasCache.length +
          " leitura" +
          (listaLeiturasCache.length > 1 ? "s" : "") +
          " cadastrada" +
          (listaLeiturasCache.length > 1 ? "s" : "") +
          ".";
      }
      renderCardsEmContainer(container, listaLeiturasCache);
    }
  }

  function leituraPorId(id) {
    return listaLeiturasCache.find(function (l) {
      return l.id === id;
    });
  }

  function excluirLeitura(id) {
    var l = leituraPorId(id);
    if (!l || !F.db || !LFS) return;

    var confirmarFn =
      UI && UI.confirmar
        ? UI.confirmar({
            titulo: "Excluir leitura",
            mensagem: "Tem certeza que deseja excluir esta leitura?",
            confirmarLabel: "Excluir",
            perigo: true,
          })
        : Promise.resolve(false);

    confirmarFn
      .then(function (ok) {
        if (!ok) return null;
        return LFS.excluir(F.db, id);
      })
      .then(function (resultado) {
        if (resultado === null) return;
        listaLeiturasCache = listaLeiturasCache.filter(function (x) {
          return x.id !== id;
        });
        atualizarListasLeiturasVisiveis();
        toast("Leitura excluída com sucesso!", "ok");
      })
      .catch(function (err) {
        toast((err && err.message) || "Erro ao excluir leitura.", "erro");
      });
  }

  function tratarAcaoLeitura(btn) {
    var card = btn.closest(".leitura-card");
    if (!card) return;
    var id = card.dataset.leituraId;
    if (!id) return;
    var acao = btn.getAttribute("data-acao");
    if (acao === "editar-leitura") {
      var l = leituraPorId(id);
      if (l) abrirModalEditarLeitura(l);
      return;
    }
    if (acao === "excluir-leitura") {
      excluirLeitura(id);
    }
  }

  function renderCardsEmContainer(container, lista) {
    if (!container) return;
    container.innerHTML = "";
    lista.forEach(function (l) {
      container.appendChild(criarMiniCardLeitura(l));
    });
  }

  function renderPreviewFiltrada() {
    var filtrada = filtrarPorTurma(listaLeiturasCache, turmaFiltroAtual);
    if (!filtrada.length) {
      if (elLista) elLista.innerHTML = "";
      if (elVazio) {
        elVazio.hidden = false;
        elVazio.textContent = turmaFiltroAtual
          ? "Nenhuma leitura cadastrada para esta turma."
          : "Nenhuma leitura cadastrada ainda.";
      }
      atualizarLinkLeituras(0, listaLeiturasCache.length);
      return;
    }
    if (elVazio) elVazio.hidden = true;
    atualizarLinkLeituras(filtrada.length, listaLeiturasCache.length);
    renderCardsEmContainer(elLista, filtrada.slice(0, LIMITE_PREVIEW));
  }

  function popularSelectTurmaFiltro(turmas) {
    if (!selTurmaFiltro) return;
    var valorAnterior = selTurmaFiltro.value;
    selTurmaFiltro.innerHTML = "";
    if (!turmas || !turmas.length) {
      var oVazio = document.createElement("option");
      oVazio.value = "";
      oVazio.textContent = "Nenhuma turma cadastrada";
      selTurmaFiltro.appendChild(oVazio);
      selTurmaFiltro.disabled = true;
      turmaFiltroAtual = "";
      return;
    }
    selTurmaFiltro.disabled = false;
    turmas.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.codigo;
      o.textContent = t.nome + " (" + t.codigo + ")";
      selTurmaFiltro.appendChild(o);
    });
    var existe = turmas.some(function (t) {
      return t.codigo === valorAnterior;
    });
    if (existe) {
      selTurmaFiltro.value = valorAnterior;
    } else {
      selTurmaFiltro.value = turmas[0].codigo;
    }
    turmaFiltroAtual = selTurmaFiltro.value;
  }

  function carregarLeituras() {
    if (F.initError || !F.db || !LFS) return Promise.resolve([]);
    if (!sessao.uid) return Promise.resolve([]);

    setLoadingLista(true);
    if (elVazio) elVazio.hidden = true;

    return LFS.listarPorProfessor(F.db, sessao.uid)
      .then(function (lista) {
        listaLeiturasCache = lista || [];
        renderPreviewFiltrada();
        return listaLeiturasCache;
      })
      .catch(function (err) {
        toast((err && err.message) || "Erro ao carregar leituras.", "erro");
        if (elVazio) {
          elVazio.hidden = false;
          elVazio.textContent = "Não foi possível carregar as leituras.";
        }
        return [];
      })
      .then(function (resultado) {
        setLoadingLista(false);
        return resultado;
      });
  }

  if (selTurmaFiltro) {
    selTurmaFiltro.addEventListener("change", function () {
      turmaFiltroAtual = selTurmaFiltro.value;
      renderPreviewFiltrada();
    });
  }

  /* ---------- Modal Nova Leitura ---------- */
  var modalNova = document.getElementById("modal-leitura-nova");
  var formNova = document.getElementById("form-leitura-nova");
  var inpTitulo = document.getElementById("leit-titulo");
  var inpDescricao = document.getElementById("leit-descricao");
  var selTurma = document.getElementById("leit-turma");
  var selTipo = document.getElementById("leit-tipo");
  var blocoHtml = document.getElementById("leit-bloco-html");
  var blocoLink = document.getElementById("leit-bloco-link");
  var editorHtml = document.getElementById("leit-editor");
  var inpTextoHidden = document.getElementById("leit-texto");
  var inpLink = document.getElementById("leit-link-url");
  var inpPdfImg = document.getElementById("leit-editor-img");
  var msgForm = document.getElementById("leit-msg");
  var btnSalvar = document.getElementById("leit-salvar");
  var toolbarEditor = document.getElementById("leit-editor-toolbar");
  var selStatus = document.getElementById("leit-status");
  var elModalTitulo = document.getElementById("modal-leitura-nova-titulo");
  var salvando = false;
  var LABEL_SALVAR = "Salvar";

  function textoSeguroDeHtml(html) {
    if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
      return window.RichTextUtils.sanitizeHtml(html || "");
    }
    return String(html || "");
  }

  function temConteudoHtml(html) {
    if (window.RichTextUtils && typeof window.RichTextUtils.stripHtml === "function") {
      return window.RichTextUtils.stripHtml(html || "").trim().length > 0;
    }
    return String(html || "").trim().length > 0;
  }

  function syncEditorParaTextarea() {
    if (!editorHtml || !inpTextoHidden) return;
    inpTextoHidden.value = editorHtml.innerHTML || "";
  }

  function htmlParaEditor(raw) {
    var s = String(raw || "");
    if (!s.trim()) return "";
    if (!/<[a-z][\s\S]*>/i.test(s)) {
      var linhas = s.split(/\r?\n/).filter(function (ln) {
        return ln.trim().length > 0;
      });
      if (!linhas.length) return "";
      if (linhas.length === 1) {
        return "<p>" + escapeHtml(linhas[0].trim()) + "</p>";
      }
      return linhas
        .map(function (ln) {
          return "<p>" + escapeHtml(ln.trim()) + "</p>";
        })
        .join("");
    }
    return textoSeguroDeHtml(s);
  }

  function atualizarTituloModal() {
    if (!elModalTitulo) return;
    elModalTitulo.textContent = leituraIdEmEdicao
      ? "📚 Editar Leitura"
      : "📚 Nova Leitura";
  }

  function setErroCampo(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg || "";
  }

  function setMsgForm(texto, tipo) {
    if (!msgForm) return;
    msgForm.textContent = texto || "";
    msgForm.className = "form-painel__msg";
    if (tipo === "erro") msgForm.classList.add("form-painel__msg--erro");
    if (tipo === "ok") msgForm.classList.add("form-painel__msg--ok");
  }

  function atualizarCamposDinamicos() {
    var tipo = tipoSelecionado();
    if (blocoHtml) {
      blocoHtml.hidden = tipo !== "html";
      blocoHtml.setAttribute("aria-hidden", tipo !== "html" ? "true" : "false");
    }
    if (blocoLink) {
      blocoLink.hidden = tipo !== "link";
      blocoLink.setAttribute("aria-hidden", tipo !== "link" ? "true" : "false");
    }
  }

  function tipoSelecionado() {
    return selTipo ? selTipo.value : "html";
  }

  function popularSelectTurmas(turmas) {
    if (!selTurma) return;
    selTurma.innerHTML = "";
    if (!turmas || !turmas.length) {
      var oVazio = document.createElement("option");
      oVazio.value = "";
      oVazio.textContent = "Nenhuma turma cadastrada";
      selTurma.appendChild(oVazio);
      selTurma.disabled = true;
      return;
    }
    selTurma.disabled = false;
    var oPad = document.createElement("option");
    oPad.value = "";
    oPad.textContent = "Selecione a turma…";
    selTurma.appendChild(oPad);
    turmas.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t.codigo;
      o.textContent = t.nome + " (" + t.codigo + ")";
      selTurma.appendChild(o);
    });
    if (turmaFiltroAtual) {
      var ok = turmas.some(function (t) {
        return t.codigo === turmaFiltroAtual;
      });
      if (ok) selTurma.value = turmaFiltroAtual;
    }
  }

  function resetFormLeitura() {
    leituraIdEmEdicao = null;
    if (formNova) formNova.reset();
    if (editorHtml) editorHtml.innerHTML = "";
    if (inpTextoHidden) inpTextoHidden.value = "";
    if (inpLink) inpLink.value = "";
    setErroCampo("leit-titulo-erro", "");
    setErroCampo("leit-descricao-erro", "");
    setErroCampo("leit-turma-erro", "");
    setErroCampo("leit-texto-erro", "");
    setErroCampo("leit-link-erro", "");
    setMsgForm("", null);
    if (selTipo) selTipo.value = "html";
    if (selStatus) selStatus.value = "publicado";
    atualizarCamposDinamicos();
    popularSelectTurmas(listaTurmasRef);
    atualizarTituloModal();
  }

  function preencherFormLeitura(l) {
    if (!l) return;
    if (inpTitulo) inpTitulo.value = l.titulo || "";
    if (inpDescricao) inpDescricao.value = l.descricao || "";
    if (selTurma) selTurma.value = l.turmaId || "";
    if (selTipo) selTipo.value = l.tipoConteudo === "link" ? "link" : "html";
    if (selStatus) {
      selStatus.value =
        String(l.status || "").toLowerCase() === "rascunho" ? "rascunho" : "publicado";
    }
    atualizarCamposDinamicos();
    if (l.tipoConteudo === "link") {
      if (editorHtml) editorHtml.innerHTML = "";
      if (inpTextoHidden) inpTextoHidden.value = "";
      if (inpLink) inpLink.value = l.linkUrl || "";
    } else {
      if (inpLink) inpLink.value = "";
      var htmlEditor = htmlParaEditor(l.conteudoHtml || "");
      if (editorHtml) editorHtml.innerHTML = htmlEditor;
      if (inpTextoHidden) inpTextoHidden.value = htmlEditor;
    }
  }

  function abrirModalNovaLeitura() {
    if (!modalNova) return;
    resetFormLeitura();
    modalNova.hidden = false;
    document.body.classList.add("ui-modal-open");
    if (inpTitulo) inpTitulo.focus();
  }

  function abrirModalEditarLeitura(l) {
    if (!modalNova || !l) return;
    var modalTodasEl = document.getElementById("modal-leituras-todas");
    if (modalTodasEl && !modalTodasEl.hidden) {
      modalTodasEl.hidden = true;
    }
    resetFormLeitura();
    leituraIdEmEdicao = l.id;
    atualizarTituloModal();
    preencherFormLeitura(l);
    modalNova.hidden = false;
    document.body.classList.add("ui-modal-open");
    if (inpTitulo) inpTitulo.focus();
  }

  function fecharModalNovaLeitura(forcar) {
    if (!modalNova) return;
    if (salvando && !forcar) return;
    modalNova.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
    resetFormLeitura();
  }

  function htmlBotaoSalvar(texto) {
    if (!salvando) return escapeHtml(texto || LABEL_SALVAR);
    return (
      '<span class="monitor-spinner monitor-spinner--btn" aria-hidden="true"></span> ' +
      escapeHtml(texto || "Salvando…")
    );
  }

  function setEstadoSalvamento(ativo, textoBotao) {
    salvando = !!ativo;
    if (btnSalvar) {
      btnSalvar.disabled = salvando;
      btnSalvar.classList.toggle("is-loading", salvando);
      btnSalvar.innerHTML = htmlBotaoSalvar(textoBotao || (salvando ? "Salvando…" : LABEL_SALVAR));
      btnSalvar.setAttribute("aria-busy", salvando ? "true" : "false");
    }
    var btnCancel = document.getElementById("leit-cancelar");
    if (btnCancel) btnCancel.disabled = salvando;
    if (inpTitulo) inpTitulo.disabled = salvando;
    if (inpDescricao) inpDescricao.disabled = salvando;
    if (selTurma) selTurma.disabled = salvando || !listaTurmasRef.length;
    if (selTipo) selTipo.disabled = salvando;
    if (selStatus) selStatus.disabled = salvando;
    if (editorHtml) editorHtml.contentEditable = salvando ? "false" : "true";
    if (inpLink) inpLink.disabled = salvando;
    if (toolbarEditor) {
      toolbarEditor.querySelectorAll("button, .rich-btn").forEach(function (btn) {
        btn.disabled = salvando;
      });
    }
  }

  function urlValida(url) {
    return /^https?:\/\/.+/i.test(String(url || "").trim());
  }

  function validarFormulario() {
    var ok = true;
    setErroCampo("leit-titulo-erro", "");
    setErroCampo("leit-descricao-erro", "");
    setErroCampo("leit-turma-erro", "");
    setErroCampo("leit-texto-erro", "");
    setErroCampo("leit-link-erro", "");

    var titulo = inpTitulo ? inpTitulo.value.trim() : "";
    var descricao = inpDescricao ? inpDescricao.value.trim() : "";
    var turmaId = selTurma ? selTurma.value : "";
    var tipo = tipoSelecionado();

    if (titulo.length < 2) {
      setErroCampo("leit-titulo-erro", "Informe um título (mín. 2 caracteres).");
      ok = false;
    }
    if (descricao.length < 2) {
      setErroCampo("leit-descricao-erro", "Informe uma descrição curta (mín. 2 caracteres).");
      ok = false;
    }
    if (!turmaId) {
      setErroCampo("leit-turma-erro", "Selecione uma turma válida.");
      ok = false;
    } else {
      var turmaOk = listaTurmasRef.some(function (t) {
        return t.codigo === turmaId;
      });
      if (!turmaOk) {
        setErroCampo("leit-turma-erro", "Turma inválida. Recarregue a página.");
        ok = false;
      }
    }

    if (tipo === "html") {
      syncEditorParaTextarea();
      if (!temConteudoHtml(inpTextoHidden ? inpTextoHidden.value : "")) {
        setErroCampo("leit-texto-erro", "Escreva o conteúdo no editor.");
        ok = false;
      }
    } else if (tipo === "link") {
      var link = inpLink ? inpLink.value.trim() : "";
      if (!urlValida(link)) {
        setErroCampo("leit-link-erro", "Informe uma URL válida (http:// ou https://).");
        ok = false;
      }
    }

    var status = selStatus ? selStatus.value : "publicado";
    if (status !== "rascunho") status = "publicado";

    return ok
      ? {
          titulo: titulo,
          descricao: descricao,
          turmaId: turmaId,
          tipoConteudo: tipo,
          status: status,
        }
      : null;
  }

  function comprimirImagemArquivo(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var maxW = 900;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error("Dimensões inválidas."));
          return;
        }
        if (w > maxW) {
          h = Math.round(h * (maxW / w));
          w = maxW;
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        var q = 0.82;
        var dataUrl = canvas.toDataURL("image/jpeg", q);
        while (dataUrl.length > 110000 && q > 0.4) {
          q -= 0.07;
          dataUrl = canvas.toDataURL("image/jpeg", q);
        }
        if (dataUrl.length > 120000) {
          reject(new Error("Imagem muito grande. Use arquivo menor ou link https://."));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível abrir esta imagem."));
      };
      img.src = url;
    });
  }

  function inserirImagemNoEditor(dataUrl) {
    if (!dataUrl || !editorHtml) return;
    var htmlImg = '<img src="' + escapeAttr(dataUrl) + '" alt="Imagem" />';
    editorHtml.focus();
    if (typeof document.execCommand === "function") {
      document.execCommand("insertHTML", false, htmlImg);
    }
    syncEditorParaTextarea();
  }

  function wrapSelectionWithTag(tagName) {
    try {
      if (!tagName || typeof window.getSelection !== "function") return;
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      var range = sel.getRangeAt(0);
      if (!range || range.collapsed) return;
      var text = String(range.toString() || "");
      if (!text.trim()) return;
      var node = document.createElement(tagName);
      node.textContent = text;
      range.deleteContents();
      range.insertNode(node);
      sel.removeAllRanges();
      var r2 = document.createRange();
      r2.setStartAfter(node);
      r2.collapse(true);
      sel.addRange(r2);
    } catch (e) {}
  }

  if (toolbarEditor && editorHtml) {
    toolbarEditor.addEventListener("click", function (e) {
      if (salvando) return;
      var btn = e.target.closest("[data-cmd]");
      if (!btn) return;
      var cmd = btn.getAttribute("data-cmd");
      var val = btn.getAttribute("data-value") || null;
      editorHtml.focus();
      if (cmd === "image") {
        if (inpPdfImg) inpPdfImg.click();
        return;
      }
      if (cmd === "highlight") {
        wrapSelectionWithTag("mark");
        syncEditorParaTextarea();
        return;
      }
      if (typeof document.execCommand !== "function") return;
      try {
        if (cmd === "formatBlock") document.execCommand(cmd, false, val || "p");
        else document.execCommand(cmd, false, null);
      } catch (err) {}
      syncEditorParaTextarea();
    });
  }

  if (inpPdfImg) {
    inpPdfImg.addEventListener("change", function () {
      var file = inpPdfImg.files && inpPdfImg.files[0] ? inpPdfImg.files[0] : null;
      inpPdfImg.value = "";
      if (!file) return;
      setErroCampo("leit-texto-erro", "");
      if (file.size > 8 * 1024 * 1024) {
        setErroCampo("leit-texto-erro", "Arquivo muito pesado (máx. 8 MB).");
        return;
      }
      setErroCampo("leit-texto-erro", "Otimizando imagem…");
      comprimirImagemArquivo(file)
        .then(function (dataUrl) {
          setErroCampo("leit-texto-erro", "");
          inserirImagemNoEditor(dataUrl);
          toast("Imagem inserida no editor.", "ok");
        })
        .catch(function (err) {
          setErroCampo("leit-texto-erro", err.message || "Erro na imagem.");
          toast(err.message || "Erro na imagem.", "erro");
        });
    });
  }

  if (editorHtml) {
    editorHtml.addEventListener("input", syncEditorParaTextarea);
    editorHtml.addEventListener("blur", syncEditorParaTextarea);
  }

  if (selTipo) {
    selTipo.addEventListener("change", atualizarCamposDinamicos);
  }

  atualizarCamposDinamicos();

  function salvarLeitura(e) {
    if (e) e.preventDefault();
    if (salvando) return;
    var dados = validarFormulario();
    if (!dados) {
      toast("Revise os campos destacados.", "erro");
      return;
    }
    if (!F.db || !LFS) {
      toast("Firebase não disponível.", "erro");
      return;
    }

    setEstadoSalvamento(true, "Salvando…");
    setMsgForm("Salvando leitura…", null);

    var payload = {
      titulo: dados.titulo,
      descricao: dados.descricao,
      turmaId: dados.turmaId,
      tipoConteudo: dados.tipoConteudo,
      status: dados.status,
      criadoPor: sessao.uid,
    };

    if (dados.tipoConteudo === "html") {
      syncEditorParaTextarea();
      payload.conteudoHtml = textoSeguroDeHtml(inpTextoHidden ? inpTextoHidden.value : "");
    } else if (dados.tipoConteudo === "link") {
      payload.linkUrl = inpLink.value.trim();
    }

    var idEdicao = leituraIdEmEdicao;
    var promessa = idEdicao
      ? LFS.atualizar(F.db, idEdicao, payload)
      : LFS.criar(F.db, payload);

    promessa
      .then(function (ref) {
        setEstadoSalvamento(false);
        setMsgForm("", null);
        toast(
          idEdicao ? "Leitura atualizada com sucesso!" : "Leitura salva com sucesso!",
          "ok"
        );
        if (dados.turmaId && selTurmaFiltro) {
          var temTurma = listaTurmasRef.some(function (t) {
            return t.codigo === dados.turmaId;
          });
          if (temTurma) {
            selTurmaFiltro.value = dados.turmaId;
            turmaFiltroAtual = dados.turmaId;
          }
        }
        if (idEdicao) {
          var idx = listaLeiturasCache.findIndex(function (x) {
            return x.id === idEdicao;
          });
          var atualizada = {
            id: idEdicao,
            titulo: payload.titulo,
            descricao: payload.descricao,
            turmaId: payload.turmaId,
            tipoConteudo: payload.tipoConteudo,
            conteudoHtml: payload.conteudoHtml || "",
            linkUrl: payload.linkUrl || "",
            status: payload.status,
            criadoPor: sessao.uid,
            criadoEm:
              idx >= 0 ? listaLeiturasCache[idx].criadoEm : new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          if (idx >= 0) listaLeiturasCache[idx] = atualizada;
          else listaLeiturasCache.unshift(atualizada);
          listaLeiturasCache = LFS.ordenarPorCriadoEmDesc(listaLeiturasCache);
          atualizarListasLeiturasVisiveis();
        } else {
          var novoId = ref && ref.id ? ref.id : null;
          if (novoId) {
            listaLeiturasCache.unshift({
              id: novoId,
              titulo: payload.titulo,
              descricao: payload.descricao,
              turmaId: payload.turmaId,
              tipoConteudo: payload.tipoConteudo,
              conteudoHtml: payload.conteudoHtml || "",
              linkUrl: payload.linkUrl || "",
              status: payload.status,
              criadoPor: sessao.uid,
              criadoEm: new Date().toISOString(),
              atualizadoEm: new Date().toISOString(),
            });
            listaLeiturasCache = LFS.ordenarPorCriadoEmDesc(listaLeiturasCache);
            atualizarListasLeiturasVisiveis();
          } else {
            carregarLeituras();
          }
        }
        fecharModalNovaLeitura(true);
      })
      .catch(function (err) {
        var msg = (err && err.message) || "Erro ao salvar leitura.";
        setMsgForm(msg, "erro");
        toast(msg, "erro");
        setEstadoSalvamento(false);
      });
  }

  if (formNova) formNova.addEventListener("submit", salvarLeitura);

  var btnNova = document.getElementById("btn-nova-leitura");
  if (btnNova) btnNova.addEventListener("click", abrirModalNovaLeitura);

  var btnCancel = document.getElementById("leit-cancelar");
  if (btnCancel) btnCancel.addEventListener("click", fecharModalNovaLeitura);

  if (modalNova) {
    modalNova.addEventListener("click", function (ev) {
      if (ev.target === modalNova && !salvando) fecharModalNovaLeitura();
    });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-acao='editar-leitura'], [data-acao='excluir-leitura']");
    if (!btn) return;
    if (!e.target.closest("#lista-leituras-prof, #lista-leituras-modal")) return;
    e.preventDefault();
    tratarAcaoLeitura(btn);
  });

  /* ---------- Modal Ver todas ---------- */
  var modalTodas = document.getElementById("modal-leituras-todas");

  function abrirModalTodasLeituras() {
    var container = document.getElementById("lista-leituras-modal");
    var sub = document.getElementById("modal-leituras-todas-sub");
    if (!modalTodas || !container) return;
    if (!listaLeiturasCache.length) {
      toast("Nenhuma leitura cadastrada ainda.", "info");
      return;
    }
    if (sub) {
      sub.textContent =
        listaLeiturasCache.length +
        " leitura" +
        (listaLeiturasCache.length > 1 ? "s" : "") +
        " cadastrada" +
        (listaLeiturasCache.length > 1 ? "s" : "") +
        ".";
    }
    renderCardsEmContainer(container, listaLeiturasCache);
    modalTodas.hidden = false;
    document.body.classList.add("ui-modal-open");
  }

  function fecharModalTodasLeituras() {
    if (modalTodas) modalTodas.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
  }

  if (linkVerTodas) {
    linkVerTodas.addEventListener("click", abrirModalTodasLeituras);
  }

  var btnFecharTodas = document.getElementById("modal-leituras-todas-fechar");
  if (btnFecharTodas) btnFecharTodas.addEventListener("click", fecharModalTodasLeituras);

  var btnNovaModalTodas = document.getElementById("modal-leituras-todas-nova");
  if (btnNovaModalTodas) {
    btnNovaModalTodas.addEventListener("click", function () {
      fecharModalTodasLeituras();
      abrirModalNovaLeitura();
    });
  }

  if (modalTodas) {
    modalTodas.addEventListener("click", function (ev) {
      if (ev.target === modalTodas) fecharModalTodasLeituras();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (modalNova && !modalNova.hidden && !salvando) fecharModalNovaLeitura();
    else if (modalTodas && !modalTodas.hidden) fecharModalTodasLeituras();
  });

  function sincronizarTurmas(turmas) {
    listaTurmasRef = Array.isArray(turmas) ? turmas : [];
    popularSelectTurmaFiltro(listaTurmasRef);
    popularSelectTurmas(listaTurmasRef);
  }

  window.LeiturasProfessor = {
    recarregar: function (turmas) {
      if (Array.isArray(turmas)) sincronizarTurmas(turmas);
      return carregarLeituras();
    },
    definirTurmas: function (turmas) {
      sincronizarTurmas(turmas);
    },
    get leituraIdEmEdicao() {
      return leituraIdEmEdicao;
    },
  };

  if (listaTurmasRef.length === 0 && TF && F.db && sessao.uid) {
    TF.listarTurmasProfessor(F.db, sessao.uid, [])
      .then(function (turmas) {
        sincronizarTurmas(turmas || []);
      })
      .catch(function () {});
  }

  carregarLeituras();
  }
})();
