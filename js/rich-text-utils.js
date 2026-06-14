/**
 * HTML seguro para editor e Firestore (plain text legado + HTML novo).
 */
(function (global) {
  var TAGS_PERMITIDAS = {
    p: true,
    br: true,
    strong: true,
    b: true,
    em: true,
    i: true,
    u: true,
    ul: true,
    ol: true,
    li: true,
    h1: true,
    h2: true,
    h3: true,
    blockquote: true,
    a: true,
    img: true,
    span: true,
    div: true,
  };

  function stripHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = String(html || "");
    return (d.textContent || d.innerText || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeHtml(html) {
    var raw = String(html || "");
    if (!raw.trim()) return "";
    var doc = new DOMParser().parseFromString(raw, "text/html");
    var out = document.createElement("div");

    function copiarNo(origem, destino) {
      Array.prototype.slice.call(origem.childNodes).forEach(function (node) {
        if (node.nodeType === Node.TEXT_NODE) {
          destino.appendChild(document.createTextNode(node.textContent));
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        var tag = node.tagName ? node.tagName.toLowerCase() : "";
        if (!TAGS_PERMITIDAS[tag]) {
          copiarNo(node, destino);
          return;
        }
        var el = document.createElement(tag);
        if (tag === "a") {
          var href = node.getAttribute("href") || "";
          if (/^https?:\/\//i.test(href)) el.setAttribute("href", href);
          el.setAttribute("rel", "noopener noreferrer");
          el.setAttribute("target", "_blank");
        }
        if (tag === "img") {
          var src = node.getAttribute("src") || "";
          if (/^https?:\/\//i.test(src)) {
            el.setAttribute("src", src);
            el.setAttribute("alt", node.getAttribute("alt") || "Imagem");
          } else if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(src)) {
            if (src.length <= 120000) {
              el.setAttribute("src", src);
              el.setAttribute("alt", node.getAttribute("alt") || "Imagem");
            } else {
              var aviso = document.createElement("p");
              aviso.className = "rich-img-aviso";
              aviso.textContent =
                "[Imagem muito grande para salvar — use arquivo menor ou link http(s)]";
              destino.appendChild(aviso);
            }
          }
        }
        copiarNo(node, el);
        destino.appendChild(el);
      });
    }

    copiarNo(doc.body, out);
    return out.innerHTML;
  }

  /** Prepara HTML para gravar no Firestore (sem bytes inválidos, limita data URLs). */
  function prepararHtmlParaFirestore(html) {
    var s = sanitizeHtml(html);
    s = s.replace(/\u0000/g, "");
    s = s.replace(/src="data:image\/[^"]{120001,}"/gi, 'src="" data-img-omitida="1"');
    return s;
  }

  function escapeAttr(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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

  /** Reduz foto grande para caber no Firestore (JPEG, largura máx. 900px). */
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
          reject(
            new Error(
              "Mesmo comprimida, a imagem ficou grande demais. Use uma foto menor ou um link https://."
            )
          );
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

  /**
   * Inicializa um editor rico isolado (toolbar + contenteditable + sync opcional).
   * @param {Object} opts
   * @param {HTMLElement} opts.root - container .rich-editor
   * @param {HTMLElement} [opts.area] - área contenteditable
   * @param {HTMLElement} [opts.toolbar] - barra de ferramentas
   * @param {HTMLElement} [opts.hidden] - campo oculto para sincronizar HTML
   * @param {HTMLElement} [opts.fileInput] - input file para imagens
   * @param {Function} [opts.onChange] - callback após alteração
   * @param {Function} [opts.onError] - callback de erro (ex.: imagem)
   * @param {string} [opts.placeholder] - texto placeholder na área vazia
   * @returns {{ sync: Function, getContent: Function, setContent: Function, destroy: Function }}
   */
  function initEditor(opts) {
    opts = opts || {};
    var root = opts.root;
    if (!root) return null;

    var area = opts.area || root.querySelector(".rich-editor__area");
    var toolbar = opts.toolbar || root.querySelector(".rich-editor__toolbar");
    var hidden = opts.hidden || root.querySelector("[data-rich-hidden]") || null;
    var fileInput = opts.fileInput || root.querySelector('input[type="file"]');
    var onChange = typeof opts.onChange === "function" ? opts.onChange : function () {};
    var onError = typeof opts.onError === "function" ? opts.onError : function () {};
    var placeholder = opts.placeholder || "";

    if (!area) return null;

    if (placeholder) {
      area.setAttribute("data-placeholder", placeholder);
      if (!area.classList.contains("rich-editor__area--placeholder")) {
        area.classList.add("rich-editor__area--placeholder");
      }
    }

    function sync() {
      var raw = area.innerHTML || "";
      var safe = sanitizeHtml(raw);
      if (safe !== raw) area.innerHTML = safe;
      if (hidden) hidden.value = safe;
      return safe;
    }

    function getContent() {
      return sync();
    }

    function setContent(html) {
      var safe = sanitizeHtml(html || "");
      area.innerHTML = safe;
      if (hidden) hidden.value = safe;
    }

    function inserirImagem(dataUrl) {
      if (!dataUrl) return;
      var htmlImg = '<img src="' + escapeAttr(dataUrl) + '" alt="Imagem" />';
      area.focus();
      if (typeof document.execCommand === "function") {
        document.execCommand("insertHTML", false, htmlImg);
      }
      sync();
      onChange();
    }

    function onToolbarClick(e) {
      var btn = e.target.closest("[data-cmd]");
      if (!btn || btn.disabled) return;
      e.preventDefault();
      var cmd = btn.getAttribute("data-cmd");
      var val = btn.getAttribute("data-value") || null;

      area.focus();

      if (cmd === "image") {
        if (fileInput) fileInput.click();
        return;
      }

      if (cmd === "link") {
        var url = window.prompt("URL do link (https://…)", "https://");
        if (url && /^https?:\/\//i.test(url.trim())) {
          if (typeof document.execCommand === "function") {
            document.execCommand("createLink", false, url.trim());
          }
        }
        sync();
        onChange();
        return;
      }

      if (cmd === "highlight") {
        wrapSelectionWithTag("mark");
        sync();
        onChange();
        return;
      }

      if (typeof document.execCommand !== "function") return;
      try {
        if (cmd === "formatBlock") document.execCommand(cmd, false, val || "p");
        else document.execCommand(cmd, false, null);
      } catch (err) {}
      sync();
      onChange();
    }

    function onAreaInput() {
      sync();
      onChange();
    }

    function onFileChange() {
      var file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (fileInput) fileInput.value = "";
      if (!file) return;

      if (file.size > 8 * 1024 * 1024) {
        onError("Arquivo muito pesado (máx. 8 MB).");
        return;
      }

      onError("Otimizando imagem…");

      comprimirImagemArquivo(file)
        .then(function (dataUrl) {
          onError("");
          inserirImagem(dataUrl);
        })
        .catch(function (err) {
          onError(err.message || "Não foi possível usar esta imagem.");
        });
    }

    if (toolbar) toolbar.addEventListener("click", onToolbarClick);
    area.addEventListener("input", onAreaInput);
    area.addEventListener("blur", onAreaInput);
    if (fileInput) fileInput.addEventListener("change", onFileChange);

    function destroy() {
      if (toolbar) toolbar.removeEventListener("click", onToolbarClick);
      area.removeEventListener("input", onAreaInput);
      area.removeEventListener("blur", onAreaInput);
      if (fileInput) fileInput.removeEventListener("change", onFileChange);
    }

    return {
      sync: sync,
      getContent: getContent,
      setContent: setContent,
      destroy: destroy,
    };
  }

  global.RichTextUtils = {
    stripHtml: stripHtml,
    sanitizeHtml: sanitizeHtml,
    prepararHtmlParaFirestore: prepararHtmlParaFirestore,
    comprimirImagemArquivo: comprimirImagemArquivo,
    initEditor: initEditor,
  };
})(window);
