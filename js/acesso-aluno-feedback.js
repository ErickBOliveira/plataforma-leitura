/**
 * Feedback visual na página de acesso do aluno (sem alert()).
 * Estados: neutro, carregando, sucesso, erro — com aria-busy e spinner opcional.
 */
(function (global) {
  var CLS_BASE = "alu-feedback";
  var CLS_LOADING = "alu-feedback--loading";
  var CLS_OK = "alu-feedback--ok";
  var CLS_ERR = "alu-feedback--erro";

  function limparClasses(el) {
    if (!el) return;
    el.classList.remove(CLS_LOADING, CLS_OK, CLS_ERR);
  }

  global.AcessoAlunoFeedback = {
    /**
     * @param {HTMLElement} elMsg — elemento da mensagem principal
     * @param {HTMLElement|null} elSpinner — opcional (dots / spinner)
     * @param {{ texto: string, estado: 'neutral'|'loading'|'success'|'error' }} opts
     */
    aplicar: function (elMsg, elSpinner, opts) {
      var texto = (opts && opts.texto) || "";
      var estado = (opts && opts.estado) || "neutral";
      if (elMsg) {
        limparClasses(elMsg);
        elMsg.textContent = texto;
        elMsg.className = "form__msg " + CLS_BASE;
        elMsg.setAttribute("aria-busy", estado === "loading" ? "true" : "false");
        if (estado === "loading") elMsg.classList.add(CLS_LOADING);
        else if (estado === "success") elMsg.classList.add(CLS_OK);
        else if (estado === "error") elMsg.classList.add(CLS_ERR);
      }
      if (elSpinner) {
        elSpinner.hidden = estado !== "loading";
        elSpinner.setAttribute("aria-hidden", estado === "loading" ? "false" : "true");
      }
    },

    /**
     * Desabilita vários controles durante requisição ao Firebase.
     */
    setBusy: function (elements, busy) {
      (elements || []).forEach(function (el) {
        if (!el) return;
        el.disabled = !!busy;
        if (busy) el.setAttribute("data-busy-lock", "1");
        else el.removeAttribute("data-busy-lock");
      });
    },
  };
})(window);
