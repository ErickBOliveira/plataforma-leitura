/**
 * Navegação do professor — destaca aba ativa (esquerda) e ação contextual (direita).
 */
(function () {
  var path = (window.location.pathname || "").split("/").pop() || "";

  var navAtivo = {
    "painel-professor.html": "comando",
  };

  var acaoAtiva = {
    "professor-atividade-nova.html": "atividade",
  };

  var nav = navAtivo[path];
  if (nav) {
    document.querySelectorAll(".prof-nav__link[data-prof-nav]").forEach(function (el) {
      if (el.getAttribute("data-prof-nav") !== nav) return;
      el.classList.add("prof-nav__link--ativa");
      if (el.tagName === "A") el.setAttribute("aria-current", "page");
    });
  }

  var acao = acaoAtiva[path];
  if (acao) {
    document.querySelectorAll("[data-prof-acao]").forEach(function (el) {
      if (el.getAttribute("data-prof-acao") !== acao) return;
      el.classList.add("toolbar-btn--ativa");
      if (el.tagName === "A") el.setAttribute("aria-current", "page");
    });
  }
})();
