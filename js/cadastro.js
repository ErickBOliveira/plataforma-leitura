/**
 * Cadastro apenas de professor (Firebase Auth + documento em usuarios).
 */
(function () {
  var S = window.SessaoDemo;
  if (!S) return;
  var F = window.FirebaseApp || {};

  if (window.location.search.indexOf("logout=1") !== -1) {
    S.limparSessao();
    try {
      window.history.replaceState({}, "", "cadastro.html");
    } catch (e) {}
  }

  var s = S.sessaoAtual();
  if (s) {
    if (s.tipo === "professor") S.irParaPainel("professor");
    else S.irParaPainel("aluno");
    return;
  }

  var CODIGO_PROFESSOR = "Ler@2026";

  var form = document.getElementById("form-cadastro");
  if (!form) return;

  var erros = {
    email: document.getElementById("cad-email-erro"),
    senha: document.getElementById("cad-senha-erro"),
    senha2: document.getElementById("cad-senha2-erro"),
    codigo: document.getElementById("cad-codigo-erro"),
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
    var msg = document.getElementById("cad-msg");
    var submit = document.getElementById("cad-submit");
    limparErros();
    setMsg(msg, "");

    var email = S.normalizarEmail(document.getElementById("cad-email").value);
    var senha = document.getElementById("cad-senha").value;
    var senha2 = document.getElementById("cad-senha2").value;
    var codigoEl = document.getElementById("cad-codigo");
    var codigo = codigoEl ? String(codigoEl.value || "").trim() : "";

    var ok = true;
    if (!email) {
      erros.email.textContent = "Informe o e-mail.";
      ok = false;
    } else if (!S.emailValido(email)) {
      erros.email.textContent = "E-mail inválido.";
      ok = false;
    }
    if (!senha) {
      erros.senha.textContent = "Crie uma senha.";
      ok = false;
    } else if (senha.length < 6) {
      erros.senha.textContent = "Mínimo de 6 caracteres.";
      ok = false;
    }
    if (!senha2) {
      erros.senha2.textContent = "Confirme a senha.";
      ok = false;
    } else if (senha2 !== senha) {
      erros.senha2.textContent = "As senhas não coincidem.";
      ok = false;
    }
    if (!codigo) {
      if (erros.codigo) erros.codigo.textContent = "Informe o código institucional.";
      ok = false;
    } else if (codigo !== CODIGO_PROFESSOR) {
      if (erros.codigo) {
        erros.codigo.textContent = "Código institucional inválido. Verifique com a coordenação.";
      }
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
    setMsg(msg, "Criando conta…", "");

    F.auth
      .createUserWithEmailAndPassword(email, senha)
      .then(function (cred) {
        var user = cred.user;
        if (!user || !user.uid) throw new Error("Falha ao criar usuário.");
        return F.db
          .collection("usuarios")
          .doc(user.uid)
          .set({
            email: email,
            tipo: "professor",
            criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          })
          .then(function () {
            S.definirSessao({
              uid: user.uid,
              email: email,
              tipo: "professor",
              loginEm: new Date().toISOString(),
            });
          });
      })
      .then(function () {
        setMsg(msg, "Conta criada! Abrindo painel…", "ok");
        S.irParaPainel("professor");
      })
      .catch(function (err) {
        if (submit) submit.disabled = false;
        var code = (err && err.code) || "";
        var texto = "Não foi possível criar a conta.";
        if (code === "auth/email-already-in-use") texto = "Este e-mail já está cadastrado.";
        else if (code === "auth/invalid-email") texto = "E-mail inválido.";
        else if (code === "auth/weak-password") texto = "Senha fraca. Use pelo menos 6 caracteres.";
        else if (code === "auth/network-request-failed") texto = "Falha de rede. Verifique sua internet.";
        setMsg(msg, texto, "erro");
      });
  });
})();
