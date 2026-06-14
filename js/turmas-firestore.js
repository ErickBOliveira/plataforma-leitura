/**
 * Turmas e alunos autorizados — estrutura Firestore:
 *   turmas/{turmaId}                    → metadados (professorId, atualizadoEm)
 *   turmas/{turmaId}/alunos/{alunoId}   → { nome, nomeNormalizado }
 *
 * O login do aluno só aceita nomes cadastrados nesta subcoleção.
 */
(function (global) {
  var TF = {};

  function nomeExibicao(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  /** Busca case-insensitive e sem acentos (para filtro no autocomplete). */
  TF.normalizarNomeBusca = function (s) {
    return nomeExibicao(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  TF.refTurma = function (db, turmaId) {
    return db.collection("turmas").doc(String(turmaId || ""));
  };

  TF.refAlunos = function (db, turmaId) {
    return TF.refTurma(db, turmaId).collection("alunos");
  };

  /** Documento da turma existe (cadastrada pelo professor). */
  TF.turmaCadastrada = function (db, turmaId) {
    var id = String(turmaId || "").trim();
    if (!id) return Promise.resolve(false);
    return TF.refTurma(db, id)
      .get()
      .then(function (doc) {
        return doc.exists;
      });
  };

  function docParaTurma(doc) {
    if (!doc || !doc.exists) return null;
    var d = doc.data() || {};
    var codigo = doc.id;
    return {
      id: codigo,
      codigo: codigo,
      nome: d.nome != null && String(d.nome).trim() ? String(d.nome).trim() : codigo,
      professorId: d.professorId != null ? String(d.professorId) : "",
      atualizadoEm: d.atualizadoEm,
      arquivada: d.arquivada === true,
      quantidadeAlunos: typeof d.quantidadeAlunos === "number" ? d.quantidadeAlunos : null,
      quantidadeAtividades: typeof d.quantidadeAtividades === "number" ? d.quantidadeAtividades : null,
    };
  }

  /** Metadados da turma ou null. */
  TF.obterTurma = function (db, turmaId) {
    var id = String(turmaId || "").trim();
    if (!id) return Promise.resolve(null);
    return TF.refTurma(db, id).get().then(function (doc) {
      return docParaTurma(doc);
    });
  };

  /**
   * Lista turmas do professor + turmas inferidas de atividades (compatibilidade legado).
   * @param {Array<{turmaId:string}>} [atividadesProfessor]
   */
  TF.listarTurmasProfessor = function (db, professorUid, atividadesProfessor) {
    if (!professorUid) return Promise.resolve([]);
    var porCodigo = {};

    function mergeTurma(t) {
      if (!t || !t.id) return;
      var c = t.id;
      if (!porCodigo[c]) porCodigo[c] = t;
      else {
        porCodigo[c].nome = porCodigo[c].nome || t.nome;
        if (t.professorId) porCodigo[c].professorId = t.professorId;
        if (t.arquivada) porCodigo[c].arquivada = true;
      }
    }

    var pQuery = db
      .collection("turmas")
      .where("professorId", "==", professorUid)
      .get()
      .then(function (snap) {
        snap.forEach(function (doc) {
          mergeTurma(docParaTurma(doc));
        });
      })
      .catch(function (err) {
        /* Índice ausente ou regra restritiva — não derruba o painel; usa turmas das atividades. */
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[TurmasFirestore] listar turmas:", err && err.message ? err.message : err);
        }
        return Promise.resolve();
      });

    return pQuery.then(function () {
      (atividadesProfessor || []).forEach(function (a) {
        var cod = String(a.turmaId || "").trim();
        if (!cod) return;
        if (!porCodigo[cod]) {
          mergeTurma({
            id: cod,
            codigo: cod,
            nome: cod,
            professorId: professorUid,
            atualizadoEm: null,
          });
        }
      });
      var lista = Object.keys(porCodigo).map(function (k) {
        return porCodigo[k];
      });
      lista.sort(function (a, b) {
        return String(a.nome).localeCompare(String(b.nome));
      });
      return Promise.all(
        lista.map(function (turma) {
          return TF.contarAlunosTurma(db, turma.id)
            .then(function (nAlunos) {
              turma.quantidadeAlunos = nAlunos;
              var nAtv = 0;
              (atividadesProfessor || []).forEach(function (a) {
                if (String(a.turmaId || "").trim() === turma.id) nAtv++;
              });
              turma.quantidadeAtividades = nAtv;
              return turma;
            })
            .catch(function () {
              turma.quantidadeAlunos = 0;
              turma.quantidadeAtividades = 0;
              return turma;
            });
        })
      );
    });
  };

  TF.contarAlunosTurma = function (db, turmaId) {
    return TF.listarAlunosTurma(db, turmaId).then(function (arr) {
      return arr.length;
    });
  };

  /** Cria ou atualiza metadados da turma (doc id = código normalizado). */
  TF.salvarTurma = function (db, dados, professorUid) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firestore indisponível."));
    }
    var codigo = String(dados.codigo || dados.id || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
    var nome = nomeExibicao(dados.nome || codigo);
    if (!codigo || codigo.length < 2) {
      return Promise.reject(new Error("Código da turma inválido (mínimo 2 caracteres)."));
    }
    return TF.podeProfessorGerenciarTurma(db, codigo, professorUid).then(function (pode) {
      if (!pode) {
        return Promise.reject(
          new Error("Esta turma já pertence a outro professor. Use outro código.")
        );
      }
      return TF.refTurma(db, codigo).set(
        {
          nome: nome,
          codigo: codigo,
          professorId: professorUid,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }).then(function () {
      return TF.obterTurma(db, codigo);
    });
  };

  TF.excluirTurma = function (db, turmaId, professorUid) {
    var id = String(turmaId || "").trim();
    if (!id) return Promise.reject(new Error("Turma inválida."));
    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) return Promise.reject(new Error("Sem permissão para excluir esta turma."));
      return excluirTodosAlunos(db, id);
    }).then(function () {
      return TF.refTurma(db, id).delete();
    });
  };

  /** Marca turma como arquivada (permanece no Firestore; oculta da listagem principal). */
  TF.arquivarTurma = function (db, turmaId, professorUid) {
    var firebase = global.firebase;
    var id = String(turmaId || "").trim();
    if (!id) return Promise.reject(new Error("Turma inválida."));
    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) return Promise.reject(new Error("Sem permissão para arquivar esta turma."));
      return TF.refTurma(db, id).set(
        {
          arquivada: true,
          professorId: professorUid,
          arquivadaEm: firebase.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  };

  function docAlunoNovo(nome) {
    var firebase = global.firebase;
    var doc = {
      nome: nome,
      nomeNormalizado: TF.normalizarNomeBusca(nome),
      pontos: 0,
      ativo: true,
    };
    if (firebase && firebase.firestore && firebase.firestore.FieldValue) {
      doc.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
    }
    return doc;
  }

  TF.adicionarAluno = function (db, turmaId, professorUid, nomeAluno) {
    var firebase = global.firebase;
    var id = String(turmaId || "").trim();
    var nome = nomeExibicao(nomeAluno);
    if (!id || id.length < 2) return Promise.reject(new Error("Turma inválida."));
    if (nome.length < 2) return Promise.reject(new Error("Nome do aluno muito curto."));
    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) return Promise.reject(new Error("Sem permissão nesta turma."));
      return TF.refTurma(db, id).set(
        {
          professorId: professorUid,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }).then(function () {
      return TF.refAlunos(db, id).add(docAlunoNovo(nome));
    });
  };

  TF.atualizarNomeAluno = function (db, turmaId, professorUid, alunoDocId, novoNome) {
    var id = String(turmaId || "").trim();
    var nome = nomeExibicao(novoNome);
    if (!alunoDocId) return Promise.reject(new Error("Aluno inválido."));
    if (nome.length < 2) return Promise.reject(new Error("Nome inválido."));
    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) return Promise.reject(new Error("Sem permissão nesta turma."));
      return TF.refAlunos(db, id).doc(alunoDocId).update({
        nome: nome,
        nomeNormalizado: TF.normalizarNomeBusca(nome),
      });
    });
  };

  TF.removerAluno = function (db, turmaId, professorUid, alunoDocId) {
    var id = String(turmaId || "").trim();
    if (!alunoDocId) return Promise.reject(new Error("Aluno inválido."));
    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) return Promise.reject(new Error("Sem permissão nesta turma."));
      return TF.refAlunos(db, id).doc(alunoDocId).delete();
    });
  };

  /**
   * Importa nomes (um por linha) sem apagar alunos existentes; ignora duplicados por nomeNormalizado.
   */
  TF.importarAlunos = function (db, turmaId, professorUid, linhasNomes) {
    var firebase = global.firebase;
    var id = String(turmaId || "").trim();
    if (!id || id.length < 2) return Promise.reject(new Error("Turma inválida."));
    var nomesNovos = [];
    var vistos = {};
    (linhasNomes || []).forEach(function (linha) {
      var n = nomeExibicao(linha);
      if (n.length < 2) return;
      var key = TF.normalizarNomeBusca(n);
      if (vistos[key]) return;
      vistos[key] = true;
      nomesNovos.push(n);
    });
    if (!nomesNovos.length) {
      return Promise.reject(new Error("Nenhum nome válido para importar."));
    }
    return TF.podeProfessorGerenciarTurma(db, id, professorUid)
      .then(function (pode) {
        if (!pode) return Promise.reject(new Error("Sem permissão nesta turma."));
        return TF.listarAlunosTurma(db, id);
      })
      .then(function (existentes) {
        var existSet = {};
        existentes.forEach(function (a) {
          existSet[a.nomeNormalizado] = true;
        });
        var paraCriar = nomesNovos.filter(function (n) {
          return !existSet[TF.normalizarNomeBusca(n)];
        });
        return TF.refTurma(db, id)
          .set(
            {
              professorId: professorUid,
              atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
          .then(function () {
            if (!paraCriar.length) return { adicionados: 0, ignorados: nomesNovos.length };
            var batch = db.batch();
            var ref = TF.refAlunos(db, id);
            paraCriar.forEach(function (nome) {
              batch.set(ref.doc(), docAlunoNovo(nome));
            });
            return batch.commit().then(function () {
              return { adicionados: paraCriar.length, ignorados: nomesNovos.length - paraCriar.length };
            });
          });
      });
  };

  /**
   * Lista todos os alunos da turma (para autocomplete no acesso).
   * Ordenação por nome facilita leitura.
   */
  TF.listarAlunosTurma = function (db, turmaId) {
    var id = String(turmaId || "").trim();
    if (!id) return Promise.resolve([]);
    var ref = TF.refAlunos(db, id);
    return ref
      .orderBy("nomeNormalizado")
      .get()
      .then(function (snap) {
        var out = [];
        snap.forEach(function (doc) {
          var d = doc.data() || {};
          out.push({
            id: doc.id,
            nome: d.nome != null ? String(d.nome) : "",
            nomeNormalizado: d.nomeNormalizado != null ? String(d.nomeNormalizado) : "",
          });
        });
        return out;
      })
      .catch(function () {
        return ref.get().then(function (snap2) {
          var out = [];
          snap2.forEach(function (doc) {
            var d = doc.data() || {};
            out.push({
              id: doc.id,
              nome: d.nome != null ? String(d.nome) : "",
              nomeNormalizado:
                d.nomeNormalizado != null
                  ? String(d.nomeNormalizado)
                  : TF.normalizarNomeBusca(d.nome),
            });
          });
          out.sort(function (a, b) {
            return a.nomeNormalizado.localeCompare(b.nomeNormalizado);
          });
          return out;
        });
      });
  };

  /**
   * Valida nome digitado contra a lista já carregada (mesmos dados do Firestore).
   * Retorna um único aluno, ambiguidade ou não encontrado — usado no fallback manual do acesso.
   */
  TF.resolverNomeContraLista = function (listaAlunos, textoDigitado) {
    var t = nomeExibicao(textoDigitado);
    var tn = TF.normalizarNomeBusca(textoDigitado);
    if (!tn || tn.length < 2) {
      return { ok: false, motivo: "curto", matches: [] };
    }
    var porNorm = (listaAlunos || []).filter(function (a) {
      return a.nomeNormalizado === tn;
    });
    if (porNorm.length === 1) return { ok: true, aluno: porNorm[0] };
    if (porNorm.length > 1) return { ok: false, motivo: "ambiguo", matches: porNorm };

    var tl = t.toLowerCase();
    var porDisplay = (listaAlunos || []).filter(function (a) {
      return nomeExibicao(a.nome).toLowerCase() === tl;
    });
    if (porDisplay.length === 1) return { ok: true, aluno: porDisplay[0] };
    if (porDisplay.length > 1) return { ok: false, motivo: "ambiguo", matches: porDisplay };

    return { ok: false, motivo: "nao_encontrado", matches: [] };
  };

  /** Verifica se o documento do aluno existe na subcoleção da turma. */
  TF.alunoPertenceTurma = function (db, turmaId, alunoDocId) {
    var t = String(turmaId || "").trim();
    var aid = String(alunoDocId || "").trim();
    if (!t || !aid) return Promise.resolve(false);
    return TF.refAlunos(db, t)
      .doc(aid)
      .get()
      .then(function (doc) {
        return doc.exists;
      });
  };

  /**
   * Professor pode gravar a turma se ela não existe ou se ele é o professorId registrado.
   */
  TF.podeProfessorGerenciarTurma = function (db, turmaId, professorUid) {
    return TF.obterTurma(db, turmaId).then(function (meta) {
      if (!meta) return true;
      return meta.professorId === professorUid;
    });
  };

  /** Remove todos os documentos da subcoleção alunos (em lotes de exclusão). */
  function excluirTodosAlunos(db, turmaId) {
    var ref = TF.refAlunos(db, turmaId);
    return ref.get().then(function (snap) {
      var deletes = [];
      snap.forEach(function (d) {
        deletes.push(d.ref.delete());
      });
      return Promise.all(deletes);
    });
  }

  /**
   * Substitui a lista de alunos pela nova (uma linha = um aluno).
   * Atualiza ou cria turmas/{turmaId} com professorId.
   */
  TF.substituirAlunosDaTurma = function (db, turmaId, professorUid, linhasNomes) {
    var firebase = global.firebase;
    if (!firebase || !firebase.firestore) {
      return Promise.reject(new Error("Firestore indisponível."));
    }
    var id = String(turmaId || "").trim();
    if (!id || id.length < 2) {
      return Promise.reject(new Error("Código da turma inválido."));
    }
    var nomes = [];
    (linhasNomes || []).forEach(function (linha) {
      var n = nomeExibicao(linha);
      if (n.length >= 2) nomes.push(n);
    });
    if (nomes.length === 0) {
      return Promise.reject(new Error("Informe pelo menos um nome válido (mínimo 2 caracteres por linha)."));
    }

    var turmaRef = TF.refTurma(db, id);
    var alunosRef = TF.refAlunos(db, id);

    return TF.podeProfessorGerenciarTurma(db, id, professorUid).then(function (pode) {
      if (!pode) {
        return Promise.reject(
          new Error("Esta turma já está cadastrada para outro professor. Use outro código ou peça suporte.")
        );
      }
      return excluirTodosAlunos(db, id);
    }).then(function () {
      return turmaRef.set(
        {
          professorId: professorUid,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }).then(function () {
      var commits = [];
      var batch = db.batch();
      var count = 0;
      nomes.forEach(function (nome) {
        var docRef = alunosRef.doc();
        batch.set(docRef, {
          nome: nome,
          nomeNormalizado: TF.normalizarNomeBusca(nome),
        });
        count++;
        if (count >= 450) {
          commits.push(batch.commit());
          batch = db.batch();
          count = 0;
        }
      });
      if (count > 0) commits.push(batch.commit());
      return Promise.all(commits);
    }).then(function () {
      return { turmaId: id, total: nomes.length };
    });
  };

  global.TurmasFirestore = TF;
})(window);
