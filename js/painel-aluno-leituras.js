/**
 * Módulo 📚 Leituras — painel do aluno (listagem e visualização).
 * Complementar às atividades; não altera ranking, gamificação ou login.
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var LFS = window.LeiturasFirestore;
  var TF = window.TurmasFirestore;

  var elLista = document.getElementById("lista-leituras-aluno");
  var elVazio = document.getElementById("vazio-leituras-aluno");
  var elLoading = document.getElementById("leituras-aluno-loading");
  var modal = document.getElementById("modal-leitura-aluno");
  var elModalTitulo = document.getElementById("modal-leitura-aluno-titulo");
  var elModalDesc = document.getElementById("modal-leitura-aluno-desc");
  var elModalCorpo = document.getElementById("modal-leitura-aluno-corpo");
  var btnFecharModal = document.getElementById("modal-leitura-aluno-fechar");

  if (!elLista) return;

  var LIMITE_NOVO_DIAS = 7;
  var leiturasCache = [];
  var carregando = false;
  var carregou = false;
  var sessao = null;

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
    if (tipo === "link") return "Material externo";
    return "Texto de leitura";
  }

  function iconeTipo(tipo) {
    if (tipo === "link") return "🔗";
    return "📝";
  }

  function ehLeituraNova(criadoEm) {
    var dt = new Date(criadoEm);
    if (isNaN(dt.getTime())) return false;
    var limite = Date.now() - LIMITE_NOVO_DIAS * 24 * 60 * 60 * 1000;
    return dt.getTime() >= limite;
  }

  function setLoading(ativo) {
    if (elLoading) {
      elLoading.hidden = !ativo;
      elLoading.setAttribute("aria-hidden", ativo ? "false" : "true");
    }
    if (elLista && ativo) elLista.innerHTML = "";
  }

  function filtrarPublicadas(lista) {
    return (lista || []).filter(function (l) {
      return String(l.status || "").toLowerCase() === "publicado";
    });
  }

  function textoSeguroDeHtml(html) {
    if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
      return window.RichTextUtils.sanitizeHtml(html || "");
    }
    return escapeHtml(html || "");
  }

  function criarCardLeitura(l) {
    var card = document.createElement("article");
    card.className = "leitura-card leitura-card--aluno";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Abrir leitura: " + (l.titulo || "Sem título"));

    var data = new Date(l.criadoEm).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    var novo = ehLeituraNova(l.criadoEm)
      ? '<span class="leitura-card__novo">Novo</span>'
      : "";

    card.innerHTML =
      '<span class="leitura-card__ico" aria-hidden="true">' +
      iconeTipo(l.tipoConteudo) +
      "</span>" +
      '<div class="leitura-card__corpo">' +
      '<h3 class="leitura-card__titulo">' +
      escapeHtml(l.titulo) +
      novo +
      "</h3>" +
      '<p class="leitura-card__meta">' +
      '<span class="leitura-card__tipo">' +
      escapeHtml(labelTipo(l.tipoConteudo)) +
      "</span>" +
      '<span class="leitura-card__sep" aria-hidden="true">·</span>' +
      '<time class="leitura-card__data" datetime="' +
      escapeAttr(l.criadoEm) +
      '">' +
      escapeHtml(data) +
      "</time>" +
      "</p>" +
      (l.descricao
        ? '<p class="leitura-card__desc">' +
          escapeHtml(l.descricao.length > 120 ? l.descricao.slice(0, 120) + "…" : l.descricao) +
          "</p>"
        : "") +
      "</div>";

    function abrir() {
      abrirModalLeitura(l);
    }

    card.addEventListener("click", abrir);
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        abrir();
      }
    });

    return card;
  }

  function renderListaLeituras(lista) {
    elLista.innerHTML = "";
    if (!lista.length) {
      if (elVazio) elVazio.hidden = false;
      return;
    }
    if (elVazio) elVazio.hidden = true;
    lista.forEach(function (l) {
      elLista.appendChild(criarCardLeitura(l));
    });
  }

  function fecharModalLeitura() {
    if (!modal) return;
    modal.hidden = true;
    if (!document.querySelector(".ui-modal-inline:not([hidden])")) {
      document.body.classList.remove("ui-modal-open");
    }
    if (elModalCorpo) elModalCorpo.innerHTML = "";
    if (elModalDesc) {
      elModalDesc.textContent = "";
      elModalDesc.hidden = true;
    }
  }

  function abrirModalLeitura(l) {
    if (!modal || !elModalCorpo || !elModalTitulo) return;

    elModalTitulo.textContent = l.titulo || "Leitura";
    elModalCorpo.innerHTML = "";

    if (elModalDesc) {
      if (l.descricao && l.tipoConteudo === "link") {
        elModalDesc.textContent = l.descricao;
        elModalDesc.hidden = false;
      } else {
        elModalDesc.textContent = "";
        elModalDesc.hidden = true;
      }
    }

    if (l.tipoConteudo === "link") {
      var url = String(l.linkUrl || "").trim();
      var bloco = document.createElement("div");
      bloco.className = "modal-leitura-aluno-link";
      if (url && /^https?:\/\//i.test(url)) {
        bloco.innerHTML =
          '<a class="btn-primario modal-leitura-aluno-link__btn" href="' +
          escapeAttr(url) +
          '" target="_blank" rel="noopener noreferrer">Acessar material</a>' +
          '<p class="modal-leitura-aluno-link-aviso">Este material será aberto em uma nova aba.</p>';
      } else {
        bloco.innerHTML =
          '<p class="painel-alerta painel-alerta--erro">Link indisponível. Avise seu professor.</p>';
      }
      elModalCorpo.appendChild(bloco);
    } else {
      var html = textoSeguroDeHtml(l.conteudoHtml || "");
      if (!html.trim()) {
        elModalCorpo.innerHTML =
          '<p class="lista-vazia lista-vazia--centro">Conteúdo não disponível.</p>';
      } else {
        var cont = document.createElement("div");
        cont.className = "painel-texto-leitura leitura-conteudo conteudo-html";
        cont.innerHTML = html;
        elModalCorpo.appendChild(cont);
      }
    }

    modal.hidden = false;
    document.body.classList.add("ui-modal-open");
    if (btnFecharModal) btnFecharModal.focus();
  }

  function carregarLeituras() {
    if (carregando || carregou) return;
    if (F.initError || !F.db || !LFS || !TF) {
      if (elVazio) {
        elVazio.hidden = false;
        elVazio.textContent = "Não foi possível carregar as leituras.";
      }
      return;
    }

    carregando = true;
    setLoading(true);
    if (elVazio) elVazio.hidden = true;

    TF.alunoPertenceTurma(F.db, sessao.turmaId, sessao.alunoDocId)
      .then(function (autorizado) {
        if (!autorizado) {
          SessaoApp.limparSessaoAluno();
          window.location.replace(S.urls.acessoAluno);
          return null;
        }
        return LFS.listarPorTurma(F.db, sessao.turmaId);
      })
      .then(function (lista) {
        if (lista === null) return;
        leiturasCache = filtrarPublicadas(lista);
        renderListaLeituras(leiturasCache);
        carregou = true;
      })
      .catch(function () {
        if (elVazio) {
          elVazio.hidden = false;
          elVazio.textContent = "Não foi possível carregar as leituras.";
        }
      })
      .then(function () {
        carregando = false;
        setLoading(false);
      });
  }

  if (btnFecharModal) {
    btnFecharModal.addEventListener("click", fecharModalLeitura);
  }

  if (modal) {
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) fecharModalLeitura();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (modal && !modal.hidden) fecharModalLeitura();
  });

  SessaoApp.garantirSessaoAluno(F.db, TF).then(function (sessao) {
    if (!sessao) return;
    iniciarLeituras(sessao);
  });

  function iniciarLeituras(s) {
    sessao = s;
    carregarLeituras();
  }
})();
