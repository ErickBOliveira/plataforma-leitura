/**
 * Firebase: Firestore em todas as páginas que precisam; Auth apenas onde há login/cadastro de professor.
 * window.FirebaseApp: { auth, db } ou initError.
 */
(function (global) {
  var firebase = global.firebase;
  if (!firebase) {
    global.FirebaseApp = { initError: new Error("Firebase SDK não carregado.") };
    return;
  }

  var firebaseConfig = {
    apiKey: "AIzaSyAk8eFY12bT1j0N93VIr6DoX53PWbdKd3M",
    authDomain: "plataforma-leitura.firebaseapp.com",
    projectId: "plataforma-leitura",
    storageBucket: "plataforma-leitura.firebasestorage.app",
    messagingSenderId: "213373643337",
    appId: "1:213373643337:web:606421b8f4633716d52d98",
  };

  try {
    if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
    var app = { db: firebase.firestore() };
    var ready = Promise.resolve(app);

    /* Auth só quando firebase-auth-compat.js foi carregado (login professor). */
    if (typeof firebase.auth === "function") {
      app.auth = firebase.auth();
      ready = Promise.resolve()
        .then(function () {
          if (
            app.auth &&
            typeof app.auth.setPersistence === "function" &&
            firebase.auth.Auth &&
            firebase.auth.Auth.Persistence
          ) {
            return app.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          }
        })
        .then(function () {
          if (app.auth && typeof app.auth.authStateReady === "function") {
            return app.auth.authStateReady();
          }
        })
        .then(function () {
          return app;
        })
        .catch(function () {
          return app;
        });
    }

    app.whenReady = function () {
      return ready;
    };
    global.FirebaseApp = app;
  } catch (e) {
    global.FirebaseApp = { initError: e };
  }
})(window);

