/**
 * Coleção Firestore "atividades".
 *
 * Esquema principal (novo): nome, turmaId, professorId, conteudo { texto, questoes, formato }
 * Campos duplicados no topo (titulo, texto, questoes) mantêm compatibilidade com leituras antigas.
 */
(function (global) {
  var AFS = {};

  function tsParaIso(v) {
    if (v == null) return new Date().toISOString();
    if (typeof v === "string") return v;
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return new Date().toISOString();
  }

  function extrairDeDoc(d) {
    var conteudo = d.conteudo && typeof d.conteudo === "object" ? d.conteudo : null;
    var texto =
      conteudo && conteudo.texto != null
        ? String(conteudo.texto)
        : d.texto != null
          ? String(d.texto)
          : "";
    var questoesRaw =
      conteudo && Array.isArray(conteudo.questoes)
        ? conteudo.questoes
        : Array.isArray(d.questoes)
          ? d.questoes
          : [];
    var formato =
      (conteudo && conteudo.formato) || d.formato || "multipla_escolha";
    var titulo =
      d.nome != null && String(d.nome).trim()
        ? String(d.nome)
        : d.titulo != null
          ? String(d.titulo)
          : "";
    var turmaId = d.turmaId != null ? String(d.turmaId).trim() : "";
    var pontPadrao =
      typeof d.pontuacaoPadraoQuestao === "number" && d.pontuacaoPadraoQuestao > 0
        ? d.pontuacaoPadraoQuestao
        : conteudo && typeof conteudo.pontuacaoPadraoQuestao === "number" && conteudo.pontuacaoPadraoQuestao > 0
          ? conteudo.pontuacaoPadraoQuestao
          : 10;
    var gabarito =
      d.gabaritoLiberado === true ||
      (conteudo && conteudo.gabaritoLiberado === true);
    var materialApoioHtml =
      d.materialApoioHtml != null
        ? String(d.materialApoioHtml)
        : conteudo && conteudo.materialApoioHtml != null
          ? String(conteudo.materialApoioHtml)
          : "";
    return {
      titulo: titulo,
      texto: texto,
      materialApoioHtml: materialApoioHtml,
      questoes: questoesRaw,
      formato: formato,
      nome: titulo,
      turmaId: turmaId,
      pontuacaoPadraoQuestao: pontPadrao,
      gabaritoLiberado: gabarito,
    };
  }

  /**
   * Converte documento Firestore no formato usado pelo app (id, questoes normalizadas, etc.).
   */
  AFS.docParaAtividade = function (doc) {
    if (!doc || !doc.exists) return null;
    var d = doc.data() || {};
    var ex = extrairDeDoc(d);
    var questoes = Array.isArray(ex.questoes) ? ex.questoes : [];
    return {
      id: doc.id,
      titulo: ex.titulo,
      texto: ex.texto,
      materialApoioHtml: ex.materialApoioHtml,
      questoes: questoes.map(function (q) {
        return {
          id: q.id,
          enunciado: q.enunciado != null ? String(q.enunciado) : "",
          alternativas: Array.isArray(q.alternativas) ? q.alternativas.map(String) : [],
          indiceCorreta: typeof q.indiceCorreta === "number" ? q.indiceCorreta : 0,
          pontos: typeof q.pontos === "number" && q.pontos > 0 ? q.pontos : null,
        };
      }),
      formato: ex.formato,
      nome: ex.nome,
      turmaId: ex.turmaId,
      professorId: d.professorId != null ? String(d.professorId) : "",
      professorEmail: d.professorEmail != null ? String(d.professorEmail) : "",
      criadoEm: tsParaIso(d.criadoEm),
      gabaritoLiberado: ex.gabaritoLiberado === true,
      pontuacaoPadraoQuestao: ex.pontuacaoPadraoQuestao,
    };
  };

  AFS.listarTodas = function (db) {
    return db
      .collection("atividades")
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var a = AFS.docParaAtividade(doc);
          if (a) out.push(a);
        });
        return out;
      });
  };

  /** Atividades visíveis para alunos de uma turma (código definido pelo professor ao publicar). */
  AFS.listarPorTurma = function (db, turmaId) {
    var t = String(turmaId || "").trim();
    if (!t) return Promise.resolve([]);
    return db
      .collection("atividades")
      .where("turmaId", "==", t)
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var a = AFS.docParaAtividade(doc);
          if (a) out.push(a);
        });
        return out;
      });
  };

  function filtrarAtividadesProfessor(lista, professorId, professorEmail) {
    var pid = String(professorId || "");
    var emailNorm =
      professorEmail && global.SessaoDemo && global.SessaoDemo.normalizarEmail
        ? global.SessaoDemo.normalizarEmail(professorEmail)
        : String(professorEmail || "").trim().toLowerCase();
    return (lista || []).filter(function (a) {
      if (pid && a.professorId === pid) return true;
      if (emailNorm && a.professorEmail) {
        var ae = String(a.professorEmail).trim().toLowerCase();
        return ae === emailNorm;
      }
      return false;
    });
  }

  AFS.listarPorProfessor = function (db, professorId, professorEmail) {
    if (!professorId && !professorEmail) return Promise.resolve([]);
    return db
      .collection("atividades")
      .where("professorId", "==", professorId)
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var a = AFS.docParaAtividade(doc);
          if (a) out.push(a);
        });
        if (out.length) return out;
        return AFS.listarPorProfessorLegado(db, professorId, professorEmail);
      })
      .catch(function (err) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[AtividadesFirestore] query professorId:", err && err.message ? err.message : err);
        }
        return AFS.listarPorProfessorLegado(db, professorId, professorEmail);
      });
  };

  /** Atividades antigas só com professorEmail ou leitura sem índice composto. */
  AFS.listarPorProfessorLegado = function (db, professorId, professorEmail) {
    return db
      .collection("atividades")
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var a = AFS.docParaAtividade(doc);
          if (a) out.push(a);
        });
        return filtrarAtividadesProfessor(out, professorId, professorEmail);
      })
      .catch(function () {
        return [];
      });
  };

  AFS.obterPorId = function (db, id) {
    if (!id) return Promise.resolve(null);
    return db
      .collection("atividades")
      .doc(id)
      .get()
      .then(function (doc) {
        return AFS.docParaAtividade(doc);
      });
  };

  /** Remove undefined e garante tipos aceitos pelo Firestore. */
  function questoesParaFirestore(questoes, pontuacaoPadrao) {
    var padrao =
      typeof pontuacaoPadrao === "number" && pontuacaoPadrao > 0 ? pontuacaoPadrao : 10;
    return (questoes || []).map(function (q, i) {
      var alts = Array.isArray(q.alternativas) ? q.alternativas : [];
      var pts =
        typeof q.pontos === "number" && q.pontos > 0 ? Math.round(q.pontos) : padrao;
      return {
        id: String(q.id || "q_" + i),
        enunciado: String(q.enunciado != null ? q.enunciado : ""),
        alternativas: alts.map(function (a) {
          return typeof a === "string" ? a : String((a && a.texto) || "");
        }),
        indiceCorreta:
          typeof q.indiceCorreta === "number" && !isNaN(q.indiceCorreta) ? q.indiceCorreta : 0,
        pontos: pts,
      };
    });
  }

  function montarDocumentoAtividade(payload, opts) {
    var p = payload || {};
    var RT = global.RichTextUtils;
    var textoRaw = p.texto != null ? String(p.texto) : "";
    var texto =
      RT && RT.prepararHtmlParaFirestore
        ? RT.prepararHtmlParaFirestore(textoRaw)
        : textoRaw.replace(/\u0000/g, "");
    var materialRaw = p.materialApoioHtml != null ? String(p.materialApoioHtml) : "";
    var materialApoioHtml =
      RT && RT.prepararHtmlParaFirestore
        ? RT.prepararHtmlParaFirestore(materialRaw)
        : materialRaw.replace(/\u0000/g, "");

    var padraoPts =
      typeof p.pontuacaoPadraoQuestao === "number" && p.pontuacaoPadraoQuestao > 0
        ? Math.round(p.pontuacaoPadraoQuestao)
        : 10;
    var questoes = questoesParaFirestore(p.questoes, padraoPts);
    var gabaritoLiberado = opts && opts.forcarGabaritoLiberado != null
      ? !!opts.forcarGabaritoLiberado
      : p.gabaritoLiberado === true;

    var doc = {
      nome: String(p.nome || p.titulo || "").trim(),
      titulo: String(p.titulo || p.nome || "").trim(),
      turmaId: String(p.turmaId || "").trim(),
      professorId: String(p.professorId || ""),
      professorEmail: String(p.professorEmail || ""),
      texto: texto,
      questoes: questoes,
      formato: String(p.formato || "multipla_escolha"),
      pontuacaoPadraoQuestao: padraoPts,
      gabaritoLiberado: gabaritoLiberado,
    };

    doc.conteudo = {
      texto: texto,
      questoes: JSON.parse(JSON.stringify(questoes)),
      formato: doc.formato,
      pontuacaoPadraoQuestao: padraoPts,
      gabaritoLiberado: gabaritoLiberado,
    };

    if (Object.prototype.hasOwnProperty.call(p, "materialApoioHtml")) {
      doc.materialApoioHtml = materialApoioHtml;
      doc.conteudo.materialApoioHtml = materialApoioHtml;
    } else if (materialApoioHtml) {
      doc.materialApoioHtml = materialApoioHtml;
      doc.conteudo.materialApoioHtml = materialApoioHtml;
    }

    return doc;
  }

  AFS.publicar = function (db, payload) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firebase Firestore indisponível."));
    }
    var doc = montarDocumentoAtividade(payload, { forcarGabaritoLiberado: false });
    doc.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection("atividades").add(doc);
  };

  AFS.atualizar = function (db, id, payload) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firebase Firestore indisponível."));
    }
    var doc = montarDocumentoAtividade(payload, {});
    delete doc.criadoEm;
    return db.collection("atividades").doc(String(id)).set(doc, { merge: true });
  };

  AFS.excluir = function (db, id) {
    if (!id) return Promise.reject(new Error("Atividade inválida."));
    return db.collection("atividades").doc(String(id)).delete();
  };

  AFS.definirGabaritoLiberado = function (db, id, liberado) {
    if (!id) return Promise.reject(new Error("Atividade inválida."));
    return db.collection("atividades").doc(String(id)).update({
      gabaritoLiberado: !!liberado,
    });
  };

  global.AtividadesFirestore = AFS;
})(window);
