/**
 * Home — menu mobile, ano no rodapé, popover «Entrar», header por Firebase Auth + menu conta / Sair, revelar passos.
 */
(function () {
  var ano = document.getElementById("ano-atual");
  if (ano) {
    ano.textContent = String(new Date().getFullYear());
  }

  var btnMenu = document.getElementById("btn-menu");
  var nav = document.getElementById("nav-principal");
  if (btnMenu && nav) {
    btnMenu.addEventListener("click", function () {
      var aberto = nav.classList.toggle("is-open");
      btnMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
    });

    nav.querySelectorAll('a:not([href="#"])').forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 720px)").matches) {
          nav.classList.remove("is-open");
          btnMenu.setAttribute("aria-expanded", "false");
        }
      });
    });
  }

  document.querySelectorAll('a.nav__anchor[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var hash = anchor.getAttribute("href");
      if (!hash || hash.length < 2) return;
      var target = document.querySelector(hash);
      if (target) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        history.pushState(null, "", hash);
        if (window.matchMedia("(max-width: 720px)").matches && nav && btnMenu) {
          nav.classList.remove("is-open");
          btnMenu.setAttribute("aria-expanded", "false");
        }
      }
    });
  });

  var slotAuth = document.getElementById("nav-acesso-slot");
  var wrapGuest = document.getElementById("header-entrar-guest");
  var wrapUser = document.getElementById("header-auth-user");
  var btnUserMenu = document.getElementById("btn-header-user-menu");
  var menuUser = document.getElementById("header-user-menu");
  var elIniciais = document.getElementById("header-prof-iniciais");
  var elNome = document.getElementById("header-prof-nome");

  var btnDropdown = null;
  var painel = null;
  var overlay = null;
  var acessoDropdownInited = false;
  var menuUsuarioInited = false;

  var FA = window.FirebaseApp;
  var S = window.SessaoDemo;

  function fecharAcessoUI() {
    var b = document.getElementById("btn-acesso-dropdown");
    var p = document.getElementById("painel-acesso");
    var o = document.getElementById("acesso-overlay");
    if (b) b.setAttribute("aria-expanded", "false");
    if (p) {
      p.classList.remove("is-open");
      p.hidden = true;
    }
    if (o) {
      o.classList.remove("is-open");
      setTimeout(function () {
        if (o) o.hidden = true;
      }, 260);
    }
  }

  function setAcessoAberto(aberto) {
    if (!btnDropdown || !painel) return;
    btnDropdown.setAttribute("aria-expanded", aberto ? "true" : "false");
    if (aberto) {
      painel.hidden = false;
      if (overlay) {
        overlay.hidden = false;
        requestAnimationFrame(function () {
          overlay.classList.add("is-open");
        });
      }
      painel.classList.add("is-open");
    } else {
      painel.classList.remove("is-open");
      if (overlay) {
        overlay.classList.remove("is-open");
        setTimeout(function () {
          if (overlay) overlay.hidden = true;
        }, 260);
      }
      painel.hidden = true;
    }
  }

  function setMenuUsuarioAberto(aberto) {
    var btn = document.getElementById("btn-header-user-menu");
    var menu = document.getElementById("header-user-menu");
    if (!btn || !menu) return;
    btn.setAttribute("aria-expanded", aberto ? "true" : "false");
    menu.hidden = !aberto;
  }

  function fecharMenuUsuario() {
    setMenuUsuarioAberto(false);
  }

  function initEntrarDropdown() {
    if (acessoDropdownInited) return;
    acessoDropdownInited = true;
    btnDropdown = document.getElementById("btn-acesso-dropdown");
    painel = document.getElementById("painel-acesso");
    overlay = document.getElementById("acesso-overlay");

    if (btnDropdown && painel) {
      btnDropdown.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var ja = btnDropdown.getAttribute("aria-expanded") === "true";
        setAcessoAberto(!ja);
      });

      if (overlay) {
        overlay.addEventListener("click", function () {
          setAcessoAberto(false);
        });
      }

      document.addEventListener("click", function (ev) {
        if (!painel || !btnDropdown || btnDropdown.getAttribute("aria-expanded") !== "true") return;
        var t = ev.target;
        if (painel.contains(t) || btnDropdown.contains(t)) return;
        setAcessoAberto(false);
      });

      painel.addEventListener("click", function (e) {
        e.stopPropagation();
      });

      painel.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          setAcessoAberto(false);
        });
      });
    }
  }

  function initMenuUsuario() {
    if (menuUsuarioInited) return;
    menuUsuarioInited = true;
    var btn = document.getElementById("btn-header-user-menu");
    var menu = document.getElementById("header-user-menu");
    var sair = document.getElementById("btn-header-sair");
    if (!btn || !menu) return;

    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var ja = btn.getAttribute("aria-expanded") === "true";
      setMenuUsuarioAberto(!ja);
    });

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });

    menu.querySelectorAll('a[href="painel-professor.html"]').forEach(function (a) {
      a.addEventListener("click", function () {
        setMenuUsuarioAberto(false);
      });
    });

    if (sair) {
      sair.addEventListener("click", function () {
        fazerLogout();
      });
    }

    document.addEventListener("click", function (ev) {
      if (btn.getAttribute("aria-expanded") !== "true") return;
      var t = ev.target;
      if (btn.contains(t) || menu.contains(t)) return;
      setMenuUsuarioAberto(false);
    });
  }

  function initEscapeGlobal() {
    if (initEscapeGlobal.done) return;
    initEscapeGlobal.done = true;
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var btnU = document.getElementById("btn-header-user-menu");
      var menuU = document.getElementById("header-user-menu");
      if (btnU && menuU && !menuU.hidden) {
        setMenuUsuarioAberto(false);
        btnU.focus();
        e.preventDefault();
        return;
      }
      var btnD = document.getElementById("btn-acesso-dropdown");
      if (btnD && btnD.getAttribute("aria-expanded") === "true") {
        setAcessoAberto(false);
        btnD.focus();
        e.preventDefault();
      }
    });
  }

  function registroProfessorDeUser(user) {
    if (!user) return {};
    return {
      displayName: user.displayName,
      professorEmail: user.email,
      professorId: user.uid,
    };
  }

  function nomeAmigavelProfessor(user) {
    if (!user) return "";
    if (S && typeof S.nomeProfessorParaAluno === "function") {
      return S.nomeProfessorParaAluno(registroProfessorDeUser(user), { fallback: "" });
    }
    var dn = user.displayName && String(user.displayName).trim();
    return dn || "";
  }

  function iniciaisDeNome(nome) {
    var parts = String(nome || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      var a = parts[0][0] || "";
      var b = parts[parts.length - 1][0] || "";
      return (a + b).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (parts.length === 1 && parts[0].length === 1) return (parts[0][0] + "•").toUpperCase();
    return "P";
  }

  function iniciaisDeFirebaseUser(user) {
    if (!user) return "•";
    var nome = nomeAmigavelProfessor(user);
    if (nome) return iniciaisDeNome(nome);
    return "P";
  }

  function aplicarNomeNoHeader(nome) {
    var exibir = nome && String(nome).trim() ? String(nome).trim() : "Meu painel";
    if (elNome) elNome.textContent = exibir;
    if (btnUserMenu) {
      btnUserMenu.setAttribute("aria-label", "Menu da conta: " + exibir);
    }
  }

  function preencherUsuarioNoHeader(user) {
    if (!elIniciais) return;
    elIniciais.textContent = iniciaisDeFirebaseUser(user);

    var nomeSync = nomeAmigavelProfessor(user);
    aplicarNomeNoHeader(nomeSync);

    if (user && user.uid && FA && FA.db && S && typeof S.prefetchNomesProfessores === "function") {
      S.prefetchNomesProfessores(FA.db, [user.uid]).then(function () {
        var nomeAtualizado = nomeAmigavelProfessor(user);
        if (nomeAtualizado) {
          aplicarNomeNoHeader(nomeAtualizado);
          if (elIniciais) elIniciais.textContent = iniciaisDeNome(nomeAtualizado);
        }
      });
    }
  }

  function fazerLogout() {
    fecharMenuUsuario();
    var auth = FA && !FA.initError && FA.auth;
    if (!auth) return;
    auth
      .signOut()
      .then(function () {
        if (S && typeof S.limparSessao === "function") {
          S.limparSessao();
        }
      })
      .catch(function () {});
  }

  /**
   * Só após o primeiro onAuthStateChanged (ou fallback): exibe Entrar OU conta.
   */
  function applyAuthUI(user) {
    initEscapeGlobal();
    if (slotAuth) slotAuth.classList.remove("nav__acesso-slot--auth-pending");

    if (!user) {
      if (wrapGuest) wrapGuest.hidden = false;
      if (wrapUser) wrapUser.hidden = true;
      fecharMenuUsuario();
      fecharAcessoUI();
      initEntrarDropdown();
      return;
    }

    if (wrapGuest) wrapGuest.hidden = true;
    if (wrapUser) wrapUser.hidden = false;
    fecharAcessoUI();
    preencherUsuarioNoHeader(user);
    initMenuUsuario();
    fecharMenuUsuario();
  }

  function applyAuthFallbackGuest() {
    initEscapeGlobal();
    if (slotAuth) slotAuth.classList.remove("nav__acesso-slot--auth-pending");
    if (wrapGuest) wrapGuest.hidden = false;
    if (wrapUser) wrapUser.hidden = true;
    fecharMenuUsuario();
    fecharAcessoUI();
    initEntrarDropdown();
  }

  if (FA && !FA.initError && FA.auth) {
    FA.auth.onAuthStateChanged(function (user) {
      applyAuthUI(user);
    });
  } else {
    applyAuthFallbackGuest();
  }

  var revelar = document.querySelectorAll(".js-reveal");
  if (revelar.length && "IntersectionObserver" in window) {
    var reduce =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      revelar.forEach(function (el) {
        el.classList.add("is-inview");
      });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              en.target.classList.add("is-inview");
            }
          });
        },
        { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
      );
      revelar.forEach(function (el) {
        io.observe(el);
      });
    }
  } else if (revelar.length) {
    revelar.forEach(function (el) {
      el.classList.add("is-inview");
    });
  }
})();
