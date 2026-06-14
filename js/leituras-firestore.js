/**
 * Coleção Firestore "leituras" — módulo complementar (independente de atividades).
 *
 * Esquema: titulo, descricao, turmaId, tipoConteudo (html|link),
 * conteudoHtml, linkUrl, status, criadoPor, criadoEm, atualizadoEm
 */
(function (global) {
  var LFS = {};

  function tsParaIso(v) {
    if (v == null) return new Date().toISOString();
    if (typeof v === "string") return v;
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return new Date().toISOString();
  }

  /** Normaliza tipos legados (ex.: pdf com URL no Firestore antigo). */
  function normalizarTipoConteudo(tipo, d) {
    var t = String(tipo || "html").trim();
    if (t === "pdf") return "link";
    if (t === "link" || t === "html") return t;
    return "html";
  }

  LFS.docParaLeitura = function (doc) {
    if (!doc || !doc.exists) return null;
    var d = doc.data() || {};
    var tipoRaw = d.tipoConteudo != null ? String(d.tipoConteudo) : "html";
    var linkUrl = d.linkUrl != null ? String(d.linkUrl) : "";
    if (tipoRaw === "pdf" && !linkUrl && d.pdfUrl != null) {
      linkUrl = String(d.pdfUrl);
    }
    var tipo = normalizarTipoConteudo(tipoRaw, d);
    return {
      id: doc.id,
      titulo: d.titulo != null ? String(d.titulo) : "",
      descricao: d.descricao != null ? String(d.descricao) : "",
      turmaId: d.turmaId != null ? String(d.turmaId).trim() : "",
      tipoConteudo: tipo,
      conteudoHtml: d.conteudoHtml != null ? String(d.conteudoHtml) : "",
      linkUrl: linkUrl,
      status: d.status != null ? String(d.status) : "publicado",
      criadoPor: d.criadoPor != null ? String(d.criadoPor) : "",
      criadoEm: tsParaIso(d.criadoEm),
      atualizadoEm: tsParaIso(d.atualizadoEm),
    };
  };

  function ordenarPorCriadoEmDesc(lista) {
    return (lista || []).slice().sort(function (a, b) {
      return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
    });
  }

  LFS.ordenarPorCriadoEmDesc = ordenarPorCriadoEmDesc;

  LFS.listarPorProfessor = function (db, criadoPor) {
    var uid = String(criadoPor || "");
    if (!uid) return Promise.resolve([]);
    return db
      .collection("leituras")
      .where("criadoPor", "==", uid)
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var l = LFS.docParaLeitura(doc);
          if (l) out.push(l);
        });
        return ordenarPorCriadoEmDesc(out);
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[LeiturasFirestore] query criadoPor:", err && err.message ? err.message : err);
        }
        return LFS.listarPorProfessorLegado(db, uid);
      });
  };

  LFS.listarPorProfessorLegado = function (db, criadoPor) {
    return db
      .collection("leituras")
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var l = LFS.docParaLeitura(doc);
          if (l && l.criadoPor === criadoPor) out.push(l);
        });
        return ordenarPorCriadoEmDesc(out);
      })
      .catch(function () {
        return [];
      });
  };

  /** Leituras do professor, opcionalmente filtradas por turma (ordem: criadoEm desc). */
  LFS.listarPorProfessorETurma = function (db, criadoPor, turmaId) {
    var turma = String(turmaId || "").trim();
    return LFS.listarPorProfessor(db, criadoPor).then(function (lista) {
      if (!turma) return lista;
      return lista.filter(function (l) {
        return l.turmaId === turma;
      });
    });
  };

  LFS.listarPorTurma = function (db, turmaId) {
    var t = String(turmaId || "").trim();
    if (!t) return Promise.resolve([]);
    return db
      .collection("leituras")
      .where("turmaId", "==", t)
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var l = LFS.docParaLeitura(doc);
          if (l) out.push(l);
        });
        return ordenarPorCriadoEmDesc(out);
      });
  };

  function montarDocumentoLeitura(payload) {
    var p = payload || {};
    var RT = global.RichTextUtils;
    var tipo = String(p.tipoConteudo || "html").trim();
    if (tipo !== "link") tipo = "html";

    var doc = {
      titulo: String(p.titulo || "").trim(),
      descricao: String(p.descricao || "").trim(),
      turmaId: String(p.turmaId || "").trim(),
      tipoConteudo: tipo,
      conteudoHtml: "",
      linkUrl: "",
      status: p.status != null ? String(p.status) : "publicado",
      criadoPor: String(p.criadoPor || ""),
    };

    if (tipo === "html") {
      var raw = p.conteudoHtml != null ? String(p.conteudoHtml) : "";
      doc.conteudoHtml =
        RT && RT.prepararHtmlParaFirestore
          ? RT.prepararHtmlParaFirestore(raw)
          : raw.replace(/\u0000/g, "");
    } else {
      doc.linkUrl = String(p.linkUrl || "").trim();
    }

    return doc;
  }

  LFS.criar = function (db, payload) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firebase Firestore indisponível."));
    }
    var doc = montarDocumentoLeitura(payload);
    doc.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    doc.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("leituras").add(doc);
  };

  LFS.atualizar = function (db, id, payload) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firebase Firestore indisponível."));
    }
    var docId = String(id || "").trim();
    if (!docId) return Promise.reject(new Error("Leitura inválida."));
    var doc = montarDocumentoLeitura(payload);
    doc.atualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("leituras").doc(docId).set(doc, { merge: true });
  };

  LFS.excluir = function (db, id) {
    var docId = String(id || "").trim();
    if (!docId) return Promise.reject(new Error("Leitura inválida."));
    return db.collection("leituras").doc(docId).delete();
  };

  global.LeiturasFirestore = LFS;
})(window);
