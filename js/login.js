/**
 * Login apenas para professores (Firebase Auth + perfil em usuarios).
 */
(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S) return;
  var F = window.FirebaseApp || {};

  var isLogout = window.location.search.indexOf("logout=1") !== -1;

  if (isLogout) {
    S.limparSessao();
    try {
      if (F.auth && F.auth.signOut) F.auth.signOut().catch(function () {});
      window.history.replaceState({}, "", "login.html");
    } catch (e) {}
  } else {
    var sAluno = S.sessaoAtual();
    if (sAluno && sAluno.tipo === "aluno") {
      S.irParaPainel("aluno");
      return;
    }

    if (SessaoApp && SessaoApp.garantirSessaoProfessor && F.auth) {
      SessaoApp.aguardarFirebasePronto(F)
        .then(function () {
          return SessaoApp.garantirSessaoProfessor(F.db, F.auth, {
            redirecionarSeAusente: false,
          });
        })
        .then(function (restaurada) {
          if (restaurada) S.irParaPainel("professor");
        })
        .catch(function () {});
    }
  }

  var form = document.getElementById("form-login");
  if (!form) return;

  var erros = {
    email: document.getElementById("login-email-erro"),
    senha: document.getElementById("login-senha-erro"),
  };

  function limparErros() {
    Object.keys(erros).forEach(function (k) {
      if (erros[k]) erros[k].textContent = "";
    });
  }

  function setMsg(el, texto, tipo) {
    if (!el) return;
    el.textContent = texto || "";
    el.className = "form__msg";
    if (tipo === "erro") el.classList.add("form__msg--erro");
    if (tipo === "ok") el.classList.add("form__msg--ok");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var msg = document.getElementById("login-msg");
    var submit = document.getElementById("login-submit");
    limparErros();
    setMsg(msg, "");

    var email = S.normalizarEmail(document.getElementById("login-email").value);
    var senha = document.getElementById("login-senha").value;

    var ok = true;
    if (!email) {
      erros.email.textContent = "Informe o e-mail.";
      ok = false;
    } else if (!S.emailValido(email)) {
      erros.email.textContent = "E-mail inválido.";
      ok = false;
    }
    if (!senha) {
      erros.senha.textContent = "Informe a senha.";
      ok = false;
    } else if (senha.length < 6) {
      erros.senha.textContent = "Senha com pelo menos 6 caracteres.";
      ok = false;
    }
    if (!ok) {
      setMsg(msg, "Corrija os campos destacados.", "erro");
      return;
    }

    if (F.initError || !F.auth || !F.db) {
      setMsg(msg, "Firebase não inicializou. Abra pelo servidor local (HTTP) e tente novamente.", "erro");
      return;
    }

    if (submit) submit.disabled = true;
    setMsg(msg, "Entrando…", "");

    F.auth
      .signInWithEmailAndPassword(email, senha)
      .then(function (cred) {
        var user = cred.user;
        if (!user || !user.uid) throw new Error("Falha ao autenticar.");
        return F.db
          .collection("usuarios")
          .doc(user.uid)
          .get()
          .then(function (doc) {
            if (!doc.exists) {
              throw new Error("Perfil não encontrado no Firestore (coleção 'usuarios').");
            }
            var data = doc.data() || {};
            var tipoSalvo = data.tipo === "professor" ? "professor" : "aluno";
            if (tipoSalvo !== "professor") {
              var msgTipo =
                "Este acesso é só para professor. Alunos entram em «Sou aluno» (nome e turma), sem senha.";
              var err = new Error(msgTipo);
              err._userFacing = msgTipo;
              return F.auth.signOut().then(function () {
                throw err;
              });
            }
            S.definirSessao({
              uid: user.uid,
              email: email,
              tipo: "professor",
              loginEm: new Date().toISOString(),
            });
          });
      })
      .then(function () {
        setMsg(msg, "Abrindo painel…", "ok");
        S.irParaPainel("professor");
      })
      .catch(function (err) {
        if (submit) submit.disabled = false;
        var code = (err && err.code) || "";
        var texto = (err && err._userFacing) || "Não foi possível entrar.";
        if (code === "auth/user-not-found") texto = "Não há cadastro para este e-mail.";
        else if (code === "auth/wrong-password") texto = "Senha incorreta.";
        else if (code === "auth/invalid-credential") texto = "E-mail ou senha incorretos.";
        else if (code === "auth/too-many-requests") texto = "Muitas tentativas. Aguarde e tente novamente.";
        else if (code === "auth/network-request-failed") texto = "Falha de rede. Verifique sua internet.";
        setMsg(msg, texto, "erro");
      });
  });

  /* --- Redefinição de senha (Firebase Auth / e-mail) --- */
  var btnToggleRec = document.getElementById("btn-toggle-recuperar");
  var blocoRec = document.getElementById("bloco-recuperar");
  var formRec = document.getElementById("form-recuperar-senha");
  var recEmailErro = document.getElementById("recuperar-email-erro");
  var loginEmailEl = document.getElementById("login-email");

  function setMsgRec(el, texto, tipo) {
    if (!el) return;
    el.textContent = texto || "";
    el.className = "form__msg";
    if (tipo === "erro") el.classList.add("form__msg--erro");
    if (tipo === "ok") el.classList.add("form__msg--ok");
  }

  if (btnToggleRec && blocoRec) {
    btnToggleRec.addEventListener("click", function () {
      var visivel = blocoRec.hidden;
      blocoRec.hidden = !visivel;
      btnToggleRec.setAttribute("aria-expanded", visivel ? "true" : "false");
      if (visivel) {
        var recEmail = document.getElementById("recuperar-email");
        if (recEmail && loginEmailEl && loginEmailEl.value.trim()) {
          recEmail.value = loginEmailEl.value.trim();
        }
        if (recEmail) recEmail.focus();
      }
    });
  }

  var btnToggleSenha = document.getElementById("btn-toggle-senha");
  var inpSenha = document.getElementById("login-senha");
  if (btnToggleSenha && inpSenha) {
    btnToggleSenha.addEventListener("click", function () {
      var mostrando = inpSenha.type === "text";
      inpSenha.type = mostrando ? "password" : "text";
      btnToggleSenha.setAttribute("aria-pressed", mostrando ? "false" : "true");
      btnToggleSenha.setAttribute("aria-label", mostrando ? "Mostrar senha" : "Ocultar senha");
      btnToggleSenha.setAttribute("title", mostrando ? "Mostrar senha" : "Ocultar senha");
    });
  }

  if (formRec) {
    formRec.addEventListener("submit", function (e) {
      e.preventDefault();
      var recMsg = document.getElementById("recuperar-msg");
      var recSubmit = document.getElementById("recuperar-submit");
      if (recEmailErro) recEmailErro.textContent = "";
      setMsgRec(recMsg, "");

      var emailRec = S.normalizarEmail(document.getElementById("recuperar-email").value);

      var okEmail = true;
      if (!emailRec) {
        if (recEmailErro) recEmailErro.textContent = "Informe o e-mail.";
        okEmail = false;
      } else if (!S.emailValido(emailRec)) {
        if (recEmailErro) recEmailErro.textContent = "E-mail inválido.";
        okEmail = false;
      }
      if (!okEmail) {
        setMsgRec(recMsg, "Corrija o e-mail acima.", "erro");
        return;
      }

      if (F.initError || !F.auth) {
        setMsgRec(
          recMsg,
          "Firebase não inicializou. Abra pelo servidor local (HTTP) e tente novamente.",
          "erro"
        );
        return;
      }

      if (recSubmit) recSubmit.disabled = true;
      setMsgRec(recMsg, "Enviando…", "");

      F.auth
        .sendPasswordResetEmail(emailRec)
        .then(function () {
          setMsgRec(
            recMsg,
            "Se esse e-mail estiver cadastrado, você receberá um link para redefinir a senha em instantes. Verifique também a pasta de spam.",
            "ok"
          );
        })
        .catch(function (err) {
          var code = (err && err.code) || "";
          var texto =
            "Não foi possível enviar o e-mail agora. Tente de novo mais tarde ou confira sua conexão.";
          if (code === "auth/invalid-email") texto = "Este e-mail não é válido.";
          else if (code === "auth/missing-email") texto = "Informe o e-mail.";
          else if (code === "auth/too-many-requests") texto = "Muitas tentativas. Aguarde alguns minutos.";
          else if (code === "auth/network-request-failed") texto = "Falha de rede. Verifique sua internet.";
          setMsgRec(recMsg, texto, "erro");
        })
        .then(function () {
          if (recSubmit) recSubmit.disabled = false;
        });
    });
  }
})();
