/**
 * Feedback visual — toasts e confirmação (sem alert/confirm nativos).
 */
(function (global) {
  var toastRoot = null;
  var modalRoot = null;

  function ensureToastRoot() {
    if (toastRoot) return toastRoot;
    toastRoot = document.createElement("div");
    toastRoot.className = "ui-toast-root";
    toastRoot.setAttribute("aria-live", "polite");
    toastRoot.setAttribute("aria-atomic", "true");
    document.body.appendChild(toastRoot);
    return toastRoot;
  }

  function ensureModalRoot() {
    if (modalRoot) return modalRoot;
    modalRoot = document.createElement("div");
    modalRoot.id = "ui-modal-root";
    modalRoot.className = "ui-modal-root";
    modalRoot.hidden = true;
    modalRoot.innerHTML =
      '<div class="ui-modal-overlay" data-ui-modal-close></div>' +
      '<div class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="ui-modal-titulo">' +
      '<h3 id="ui-modal-titulo" class="ui-modal__titulo"></h3>' +
      '<p id="ui-modal-texto" class="ui-modal__texto"></p>' +
      '<div class="ui-modal__acoes">' +
      '<button type="button" class="btn-secundario" id="ui-modal-cancelar">Cancelar</button>' +
      '<button type="button" class="btn-primario" id="ui-modal-confirmar">Confirmar</button>' +
      "</div></div>";
    document.body.appendChild(modalRoot);
    return modalRoot;
  }

  var UiFeedback = {
    toast: function (texto, tipo) {
      var root = ensureToastRoot();
      var el = document.createElement("div");
      el.className = "ui-toast ui-toast--" + (tipo || "info");
      el.textContent = texto || "";
      root.appendChild(el);
      requestAnimationFrame(function () {
        el.classList.add("is-visible");
      });
      setTimeout(function () {
        el.classList.remove("is-visible");
        setTimeout(function () {
          if (el.parentNode) el.parentNode.removeChild(el);
        }, 320);
      }, 3800);
    },

    /**
     * @param {{ titulo?: string, mensagem: string, confirmarLabel?: string, perigo?: boolean }} opts
     * @returns {Promise<boolean>}
     */
    confirmar: function (opts) {
      opts = opts || {};
      var root = ensureModalRoot();
      var tit = root.querySelector("#ui-modal-titulo");
      var txt = root.querySelector("#ui-modal-texto");
      var btnOk = root.querySelector("#ui-modal-confirmar");
      var btnCancel = root.querySelector("#ui-modal-cancelar");
      if (tit) tit.textContent = opts.titulo || "Confirmar";
      if (txt) txt.textContent = opts.mensagem || "";
      if (btnOk) {
        btnOk.textContent = opts.confirmarLabel || "Confirmar";
        btnOk.className = opts.perigo ? "btn-primario btn-primario--perigo" : "btn-primario";
      }

      root.hidden = false;
      document.body.classList.add("ui-modal-open");

      return new Promise(function (resolve) {
        function fechar(resultado) {
          root.hidden = true;
          document.body.classList.remove("ui-modal-open");
          btnOk.removeEventListener("click", onOk);
          btnCancel.removeEventListener("click", onCancel);
          root.querySelectorAll("[data-ui-modal-close]").forEach(function (el) {
            el.removeEventListener("click", onCancel);
          });
          document.removeEventListener("keydown", onKey);
          resolve(resultado);
        }
        function onOk() {
          fechar(true);
        }
        function onCancel() {
          fechar(false);
        }
        function onKey(e) {
          if (e.key === "Escape") onCancel();
        }
        btnOk.addEventListener("click", onOk);
        btnCancel.addEventListener("click", onCancel);
        root.querySelectorAll("[data-ui-modal-close]").forEach(function (el) {
          el.addEventListener("click", onCancel);
        });
        document.addEventListener("keydown", onKey);
        btnCancel.focus();
      });
    },
  };

  global.UiFeedback = UiFeedback;
})(window);
