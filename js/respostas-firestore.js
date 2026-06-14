/**
 * Coleção Firestore "respostas".
 *
 * Campos obrigatórios no documento: alunoNome, turmaId, atividadeId, alunoDocId (controle de acesso).
 * ID do documento: turma + alunoDocId + atividadeId (homônimos não colidem).
 *
 * listarPorTurmaEAlunoDoc usa filtro composto — pode exigir índice no Firebase.
 *
 * Leitura legado: documentos antigos só com slug de nome ainda são consultados em obterPorTurmaAlunoDocAtividade.
 */
(function (global) {
  var RFS = {};

  function tsParaIso(v) {
    if (v == null) return new Date().toISOString();
    if (typeof v === "string") return v;
    if (typeof v.toDate === "function") return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    return new Date().toISOString();
  }

  function slugPart(s, maxLen) {
    var t = String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!t) t = "x";
    var n = maxLen || 40;
    return t.length > n ? t.slice(0, n) : t;
  }

  RFS.docIdResposta = function (turmaId, alunoDocId, atividadeId) {
    return (
      slugPart(turmaId, 28) +
      "__" +
      String(alunoDocId || "").replace(/\//g, "_") +
      "__" +
      String(atividadeId || "").replace(/\//g, "_")
    );
  };

  /** IDs criados antes da migração para alunoDocId (somente leitura). */
  RFS.docIdRespostaLegadoNome = function (turmaId, alunoNome, atividadeId) {
    return (
      slugPart(turmaId, 28) +
      "__" +
      slugPart(alunoNome, 28) +
      "__" +
      String(atividadeId || "").replace(/\//g, "_")
    );
  };

  RFS.docParaResposta = function (doc) {
    if (!doc || !doc.exists) return null;
    var d = doc.data() || {};
    var enviado = tsParaIso(d.timestamp != null ? d.timestamp : d.enviadoEm);
    return {
      id: doc.id,
      alunoNome: d.alunoNome != null ? String(d.alunoNome) : "",
      turmaId: d.turmaId != null ? String(d.turmaId) : "",
      alunoDocId: d.alunoDocId != null ? String(d.alunoDocId) : "",
      alunoId: d.alunoId != null ? String(d.alunoId) : "",
      atividadeId: d.atividadeId != null ? String(d.atividadeId) : "",
      alunoEmail: d.alunoEmail != null ? String(d.alunoEmail) : "",
      formato: d.formato || "multipla_escolha",
      respostasQuestoes: Array.isArray(d.respostasQuestoes) ? d.respostasQuestoes : [],
      texto: d.texto != null ? String(d.texto) : "",
      pontuacao: d.pontuacao && typeof d.pontuacao === "object" ? d.pontuacao : null,
      timestamp: enviado,
      enviadoEm: enviado,
    };
  };

  RFS.obterPorTurmaAlunoDocAtividade = function (db, turmaId, alunoDocId, alunoNome, atividadeId) {
    if (!turmaId || !alunoDocId || !atividadeId) return Promise.resolve(null);
    var idNovo = RFS.docIdResposta(turmaId, alunoDocId, atividadeId);
    return db
      .collection("respostas")
      .doc(idNovo)
      .get()
      .then(function (doc) {
        var r = RFS.docParaResposta(doc);
        if (r && r.atividadeId) return r;
        if (alunoNome) {
          var idLegado = RFS.docIdRespostaLegadoNome(turmaId, alunoNome, atividadeId);
          return db
            .collection("respostas")
            .doc(idLegado)
            .get()
            .then(function (doc2) {
              return RFS.docParaResposta(doc2);
            });
        }
        return null;
      });
  };

  function snapParaListaRespostas(snap) {
    var out = [];
    snap.forEach(function (doc) {
      var r = RFS.docParaResposta(doc);
      if (r) out.push(r);
    });
    return out;
  }

  /** Todas as respostas de uma atividade (painel do professor / relatório). */
  RFS.listarPorAtividade = function (db, atividadeId) {
    var aid = String(atividadeId || "").trim();
    if (!aid) return Promise.resolve([]);
    return db
      .collection("respostas")
      .where("atividadeId", "==", aid)
      .get()
      .then(snapParaListaRespostas);
  };

  /** Atualização em tempo real das respostas de uma atividade. Retorna função para cancelar. */
  RFS.escutarPorAtividade = function (db, atividadeId, onChange, onError) {
    var aid = String(atividadeId || "").trim();
    if (!aid) return function () {};
    return db
      .collection("respostas")
      .where("atividadeId", "==", aid)
      .onSnapshot(
        function (snap) {
          if (typeof onChange === "function") onChange(snapParaListaRespostas(snap));
        },
        function (err) {
          if (typeof onError === "function") onError(err);
        }
      );
  };

  /**
   * Remove resposta atual para o aluno poder enviar de novo.
   * Opcionalmente remove também documento legado (slug por nome), se conhecido.
   */
  RFS.excluirResposta = function (db, turmaId, alunoDocId, atividadeId, alunoNomeLegado) {
    if (!turmaId || !alunoDocId || !atividadeId) return Promise.resolve();
    var refNovo = db.collection("respostas").doc(RFS.docIdResposta(turmaId, alunoDocId, atividadeId));
    return refNovo.delete().then(function () {
      if (!alunoNomeLegado) return;
      return db
        .collection("respostas")
        .doc(RFS.docIdRespostaLegadoNome(turmaId, alunoNomeLegado, atividadeId))
        .delete();
    });
  };

  RFS.listarPorTurmaEAlunoDoc = function (db, turmaId, alunoDocId) {
    if (!turmaId || !alunoDocId) return Promise.resolve([]);
    return db
      .collection("respostas")
      .where("turmaId", "==", String(turmaId))
      .where("alunoDocId", "==", String(alunoDocId))
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var r = RFS.docParaResposta(doc);
          if (r) out.push(r);
        });
        return out;
      });
  };

  function validarPreSalvar(db, data) {
    var TF = global.TurmasFirestore;
    if (!data.turmaId || !data.alunoNome || !data.atividadeId || !data.alunoDocId) {
      return Promise.reject(new Error("Dados de resposta incompletos (turma, aluno ou atividade)."));
    }
    if (!TF || !TF.alunoPertenceTurma) return Promise.resolve(true);
    return TF.alunoPertenceTurma(db, data.turmaId, data.alunoDocId).then(function (ok) {
      if (!ok) {
        return Promise.reject(new Error("Este aluno não está autorizado nesta turma."));
      }
      return true;
    });
  }

  RFS.salvar = function (db, data) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firebase indisponível."));
    }
    return validarPreSalvar(db, data).then(function () {
      var docRef = db
        .collection("respostas")
        .doc(RFS.docIdResposta(data.turmaId, data.alunoDocId, data.atividadeId));
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      var payload = {
        alunoNome: String(data.alunoNome).trim(),
        turmaId: String(data.turmaId).trim(),
        alunoDocId: String(data.alunoDocId).trim(),
        atividadeId: String(data.atividadeId),
        formato: data.formato || "multipla_escolha",
        timestamp: ts,
        enviadoEm: ts,
      };
      if (data.respostasQuestoes != null) payload.respostasQuestoes = data.respostasQuestoes;
      if (data.texto != null) payload.texto = data.texto;
      if (data.pontuacao != null) payload.pontuacao = data.pontuacao;
      return docRef.set(payload);
    });
  };

  RFS.atualizarPontuacao = function (db, turmaId, alunoDocId, atividadeId, pontuacao) {
    if (!turmaId || !alunoDocId || !atividadeId) return Promise.resolve();
    var docRef = db
      .collection("respostas")
      .doc(RFS.docIdResposta(turmaId, alunoDocId, atividadeId));
    return docRef.set({ pontuacao: pontuacao }, { merge: true });
  };

  global.RespostasFirestore = RFS;
})(window);
