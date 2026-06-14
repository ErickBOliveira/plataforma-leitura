/**
 * Sessão no navegador + URLs do fluxo.
 *
 * - Professor: Firebase Auth + perfil em Firestore; sessão guarda uid, email, tipo "professor".
 * - Aluno: sem senha; sessão guarda turmaId, alunoNome e alunoDocId (doc em turmas/{turmaId}/alunos).
 */
(function (global) {
  var STORAGE_USERS = "plataforma_edu_usuarios_v1";
  var STORAGE_ATIVIDADES = "plataforma_edu_atividades_v1";
  var STORAGE_RESPOSTAS = "plataforma_edu_respostas_v1";
  var SESSION_KEY = "plataforma_edu_sessao_v1";
  var STORAGE_ALUNO_KEY = "lerEaprender_sessaoAluno";
  var STORAGE_PROFESSOR_KEY = "lerEaprender_sessaoProfessor";
  var CHAVES_ALUNO_AUX = [
    STORAGE_ALUNO_KEY,
    "lerEaprender_sessaoAluno",
    "sessaoAluno",
    "alunoAtual",
    "usuarioAtual",
  ];
  var garantirSessaoAlunoPromise = null;
  var sessaoAlunoRestaurada = null;
  var garantirSessaoProfessorPromise = null;

  var urls = {
    login: "login.html",
    cadastro: "cadastro.html",
    acessoAluno: "acesso-aluno.html",
    painelAluno: "painel-aluno.html",
    painelProfessor: "painel-professor.html",
    novaAtividade: "professor-atividade-nova.html",
    gerenciarTurma: "professor-turma-alunos.html",
    responderAtividade: "responder-atividade.html",
    inicio: "index.html",
  };

  /** Nome exibido e usado nas respostas (espaços colapsados). */
  function normalizarNomeAluno(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ");
  }

  /** Código de turma consistente (maiúsculas, sem espaços extras). */
  function normalizarTurmaId(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  }

  function normalizarEmail(s) {
    return String(s || "").trim().toLowerCase();
  }

  var SUFIXOS_EMAIL_IGNORAR = /^(uninter|edu|br|com|gmail|hotmail|outlook|yahoo)$/i;

  function capitalizarPalavraNome(palavra) {
    var p = String(palavra || "").trim();
    if (!p) return "";
    return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  }

  function pareceEmail(str) {
    return /@/.test(String(str || ""));
  }

  function pareceIdentificadorInterno(str) {
    var v = String(str || "").trim();
    if (!v) return false;
    if (pareceEmail(v)) return false;
    return v.length > 22 && !/\s/.test(v) && /^[a-zA-Z0-9_-]+$/.test(v);
  }

  function nomeDePartesEmail(partes) {
    return (partes || [])
      .map(function (parte) {
        var raw = String(parte || "").trim();
        if (!raw || SUFIXOS_EMAIL_IGNORAR.test(raw)) return "";
        return capitalizarPalavraNome(raw);
      })
      .filter(function (x) {
        return x.length > 0;
      })
      .join(" ");
  }

  /** Converte e-mail em nome amigável sem expor o endereço (ex.: erick.dev.testes@gmail.com → Erick Dev Testes). */
  function nomeAmigavelDeEmail(email) {
    if (!email || !pareceEmail(email)) return "";
    var local = String(email).split("@")[0] || "";
    return nomeDePartesEmail(local.split(/[._-]+/));
  }

  function temConteudoHtml(html) {
    var raw = String(html || "");
    if (global.RichTextUtils && typeof global.RichTextUtils.stripHtml === "function") {
      if (global.RichTextUtils.stripHtml(raw).trim().length > 0) return true;
    } else if (raw.trim().length > 0) {
      return true;
    }
    return /<img\s[^>]*src\s*=\s*["'][^"']+["']/i.test(raw);
  }

  /** Cache em memória: uid do professor → nome amigável (evita leituras repetidas). */
  var cacheNomesProfessor = {};

  function uidProfessorDoRegistro(registro) {
    var r = registro || {};
    return String(r.professorId || r.criadoPor || r.autorId || r.autorUid || "").trim();
  }

  function extrairNomeDePerfilUsuario(data) {
    if (!data || typeof data !== "object") return "";
    var candidatos = [data.displayName, data.nome, data.nomeProfessor, data.professorNome];
    for (var i = 0; i < candidatos.length; i++) {
      var c = candidatos[i];
      if (c == null || c === "") continue;
      var s = String(c).trim();
      if (!s || pareceIdentificadorInterno(s)) continue;
      if (pareceEmail(s)) {
        var derivado = nomeAmigavelDeEmail(s);
        if (derivado) return derivado;
        continue;
      }
      return s;
    }
    if (data.email) {
      var doEmail = nomeAmigavelDeEmail(data.email);
      if (doEmail) return doEmail;
    }
    return "";
  }

  function guardarNomeProfessorCache(uid, nome) {
    var id = String(uid || "").trim();
    var n = String(nome || "").trim();
    if (id && n && n !== "Professor" && n !== "Autor") {
      cacheNomesProfessor[id] = n;
    }
  }

  /**
   * Nome do professor para exibição ao aluno (nunca e-mail, UID ou IDs internos).
   * Não usa o campo "nome" de atividades — lá é o título da atividade.
   */
  function nomeProfessorParaAluno(registro, opts) {
    opts = opts || {};
    var fallback = opts.fallback != null ? String(opts.fallback) : "Professor";
    var r = registro || {};
    var uid = uidProfessorDoRegistro(r);

    if (uid && cacheNomesProfessor[uid]) {
      return cacheNomesProfessor[uid];
    }

    var candidatos = [r.professorNome, r.nomeProfessor, r.displayName, r.autor, r.criadoPorNome];

    for (var i = 0; i < candidatos.length; i++) {
      var c = candidatos[i];
      if (c == null || c === "") continue;
      var s = String(c).trim();
      if (!s || pareceIdentificadorInterno(s)) continue;
      if (r.titulo && s === String(r.titulo).trim()) continue;
      if (r.nome && s === String(r.nome).trim()) continue;
      if (pareceEmail(s)) {
        var derivadoEmail = nomeAmigavelDeEmail(s);
        if (derivadoEmail) {
          guardarNomeProfessorCache(uid, derivadoEmail);
          return derivadoEmail;
        }
        continue;
      }
      guardarNomeProfessorCache(uid, s);
      return s;
    }

    if (r.professorEmail) {
      var doEmail = nomeAmigavelDeEmail(r.professorEmail);
      if (doEmail) {
        guardarNomeProfessorCache(uid, doEmail);
        return doEmail;
      }
    }

    return fallback;
  }

  /** Rótulo completo para o aluno, ex.: "Professor Erick Dev Testes". */
  function rotuloProfessorParaAluno(registro, opts) {
    opts = opts || {};
    var prefixo = opts.prefixo != null ? String(opts.prefixo) : "Professor";
    var nome = nomeProfessorParaAluno(registro, opts);
    if (!nome || nome === "Professor" || nome === "Autor") return nome || "Professor";
    return prefixo + " " + nome;
  }

  /** Busca nome do professor em usuarios/{uid} (Firestore). */
  function buscarNomeProfessorPorUid(db, uid) {
    var id = String(uid || "").trim();
    if (!id) return Promise.resolve("");
    if (cacheNomesProfessor[id]) return Promise.resolve(cacheNomesProfessor[id]);
    if (!db) return Promise.resolve("");

    return db
      .collection("usuarios")
      .doc(id)
      .get()
      .then(function (doc) {
        var nome = doc.exists ? extrairNomeDePerfilUsuario(doc.data()) : "";
        guardarNomeProfessorCache(id, nome);
        return nome;
      })
      .catch(function () {
        return "";
      });
  }

  /** Pré-carrega nomes por uid (lista de atividades/leituras). */
  function prefetchNomesProfessores(db, uids) {
    var pendentes = [];
    (uids || []).forEach(function (uid) {
      var id = String(uid || "").trim();
      if (id && !cacheNomesProfessor[id]) pendentes.push(id);
    });
    if (!pendentes.length || !db) return Promise.resolve();
    return Promise.all(pendentes.map(function (uid) {
      return buscarNomeProfessorPorUid(db, uid);
    })).then(function () {});
  }

  /**
   * Resolve rótulo do professor (síncrono + busca Firestore se necessário).
   */
  function resolverRotuloProfessorParaAluno(db, registro, opts) {
    opts = opts || {};
    var fallback = opts.fallback != null ? String(opts.fallback) : "Professor";
    var nomeSync = nomeProfessorParaAluno(registro, opts);

    if (nomeSync && nomeSync !== fallback) {
      return Promise.resolve(rotuloProfessorParaAluno(registro, opts));
    }

    var uid = uidProfessorDoRegistro(registro);
    if (!uid || !db) {
      return Promise.resolve(rotuloProfessorParaAluno(registro, opts));
    }

    return buscarNomeProfessorPorUid(db, uid).then(function (nomeDb) {
      if (nomeDb) {
        var enriquecido = Object.assign({}, registro, { professorNome: nomeDb });
        return rotuloProfessorParaAluno(enriquecido, opts);
      }
      return rotuloProfessorParaAluno(registro, opts);
    });
  }

  function emailValido(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(s));
  }

  function novoIdAtividade() {
    return "atv_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  function lerAtividades() {
    try {
      var raw = localStorage.getItem(STORAGE_ATIVIDADES);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function salvarAtividades(lista) {
    localStorage.setItem(STORAGE_ATIVIDADES, JSON.stringify(lista));
  }

  function lerRespostas() {
    try {
      var raw = localStorage.getItem(STORAGE_RESPOSTAS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function salvarRespostas(lista) {
    localStorage.setItem(STORAGE_RESPOSTAS, JSON.stringify(lista));
  }

  function atividadesDoProfessor(emailProf) {
    var e = normalizarEmail(emailProf);
    return lerAtividades().filter(function (a) {
      return normalizarEmail(a.professorEmail) === e;
    });
  }

  function respostaDoAluno(atividadeId, emailAluno) {
    var ea = normalizarEmail(emailAluno);
    return lerRespostas().find(function (r) {
      return r.atividadeId === atividadeId && normalizarEmail(r.alunoEmail) === ea;
    });
  }

  function pontosDaQuestao(q, atividade) {
    if (q && typeof q.pontos === "number" && q.pontos > 0) return q.pontos;
    if (
      atividade &&
      typeof atividade.pontuacaoPadraoQuestao === "number" &&
      atividade.pontuacaoPadraoQuestao > 0
    ) {
      return atividade.pontuacaoPadraoQuestao;
    }
    return 10;
  }

  /**
   * Corrige atividade de múltipla escolha (ponderada por pontos por questão).
   */
  function corrigirAtividadeObjetiva(atividade, respostasQuestoes) {
    var questoes = atividade.questoes || [];
    var detalhes = [];
    var acertos = 0;
    var total = questoes.length;
    var pontosGanhos = 0;
    var pontosMaximos = 0;
    var listaResp = respostasQuestoes || [];

    questoes.forEach(function (q) {
      var r = listaResp.find(function (x) {
        return x.questaoId === q.id;
      });
      var escolhido = r ? r.indiceEscolhido : -1;
      var idxCorreto = typeof q.indiceCorreta === "number" ? q.indiceCorreta : 0;
      var correto = escolhido === idxCorreto;
      var pts = pontosDaQuestao(q, atividade);
      pontosMaximos += pts;
      if (correto) {
        acertos++;
        pontosGanhos += pts;
      }
      var alts = q.alternativas || [];
      detalhes.push({
        questaoId: q.id,
        enunciado: q.enunciado || "",
        correto: correto,
        indiceCorreto: idxCorreto,
        indiceEscolhido: escolhido,
        pontosQuestao: pts,
        pontosGanhos: correto ? pts : 0,
        textoCorreta: alts[idxCorreto] != null ? String(alts[idxCorreto]) : "",
        textoEscolhida:
          escolhido >= 0 && alts[escolhido] != null
            ? String(alts[escolhido])
            : escolhido < 0
              ? "(não respondida)"
              : "",
      });
    });

    var percentual =
      pontosMaximos > 0 ? Math.round((pontosGanhos / pontosMaximos) * 100) : 0;
    var nota10 = Math.round((percentual / 10) * 10) / 10;

    return {
      acertos: acertos,
      total: total,
      percentual: percentual,
      nota10: nota10,
      pontosGanhos: pontosGanhos,
      pontosMaximos: pontosMaximos,
      detalhes: detalhes,
    };
  }

  function atualizarRespostaAluno(atividadeId, emailAluno, patch) {
    var lista = lerRespostas();
    var ea = normalizarEmail(emailAluno);
    var i = lista.findIndex(function (r) {
      return r.atividadeId === atividadeId && normalizarEmail(r.alunoEmail) === ea;
    });
    if (i === -1) return false;
    var base = lista[i];
    Object.keys(patch || {}).forEach(function (k) {
      base[k] = patch[k];
    });
    lista[i] = base;
    salvarRespostas(lista);
    return true;
  }

  function lerUsuarios() {
    try {
      var raw = localStorage.getItem(STORAGE_USERS);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function salvarUsuarios(lista) {
    localStorage.setItem(STORAGE_USERS, JSON.stringify(lista));
  }

  function sessaoAtual() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function removerChaveAlunoAux(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    try {
      sessionStorage.removeItem(key);
    } catch (e) {}
  }

  function limparSessaoAlunoPersistente() {
    CHAVES_ALUNO_AUX.forEach(function (key) {
      removerChaveAlunoAux(key);
    });
  }

  function resetarCacheSessaoAluno() {
    garantirSessaoAlunoPromise = null;
    sessaoAlunoRestaurada = null;
  }

  /** Lê sessão persistida do aluno (localStorage). Retorna null se inválida/corrompida. */
  function lerSessaoAlunoPersistente() {
    try {
      var raw = localStorage.getItem(STORAGE_ALUNO_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        limparSessaoAlunoPersistente();
        return null;
      }
      var nome = normalizarNomeAluno(data.nome);
      var turmaId = normalizarTurmaId(data.turmaId);
      if (!nome || !turmaId) {
        limparSessaoAlunoPersistente();
        return null;
      }
      return {
        nome: nome,
        turmaId: turmaId,
        logadoEm:
          typeof data.logadoEm === "string" && data.logadoEm.trim()
            ? data.logadoEm.trim()
            : new Date().toISOString(),
      };
    } catch (e) {
      limparSessaoAlunoPersistente();
      return null;
    }
  }

  /** Salva identificação do aluno no localStorage (após login validado). */
  function salvarSessaoAlunoPersistente(nome, turmaId) {
    var n = normalizarNomeAluno(nome);
    var t = normalizarTurmaId(turmaId);
    if (!n || !t) return false;
    try {
      localStorage.setItem(
        STORAGE_ALUNO_KEY,
        JSON.stringify({
          nome: n,
          turmaId: t,
          logadoEm: new Date().toISOString(),
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function validarSessaoAlunoMemoria(s) {
    if (!s || s.tipo !== "aluno") return null;
    var nomeOk = normalizarNomeAluno(s.alunoNome);
    var turmaOk = normalizarTurmaId(s.turmaId);
    var docOk = String(s.alunoDocId || "").trim();
    if (!nomeOk || !turmaOk || !docOk) return null;
    s.alunoNome = nomeOk;
    s.turmaId = turmaOk;
    s.alunoDocId = docOk;
    return s;
  }

  function salvarSessaoProfessorPersistente(sessao) {
    if (!sessao || sessao.tipo !== "professor") return false;
    var uid = String(sessao.uid || "").trim();
    var email = normalizarEmail(sessao.email || "");
    if (!uid || !email) return false;
    try {
      localStorage.setItem(
        STORAGE_PROFESSOR_KEY,
        JSON.stringify({
          uid: uid,
          email: email,
          logadoEm: new Date().toISOString(),
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function limparSessaoProfessorPersistente() {
    try {
      localStorage.removeItem(STORAGE_PROFESSOR_KEY);
    } catch (e) {}
  }

  function definirSessao(sessao) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
    if (sessao && sessao.tipo === "aluno") {
      salvarSessaoAlunoPersistente(sessao.alunoNome, sessao.turmaId);
    }
    if (sessao && sessao.tipo === "professor") {
      salvarSessaoProfessorPersistente(sessao);
    }
  }

  function limparSessao() {
    sessionStorage.removeItem(SESSION_KEY);
    limparSessaoProfessorPersistente();
    garantirSessaoProfessorPromise = null;
  }

  /** Aguarda Firebase Auth terminar de restaurar sessão persistida (IndexedDB). */
  function aguardarUsuarioFirebase(auth) {
    return new Promise(function (resolve) {
      if (!auth) {
        resolve(null);
        return;
      }
      if (typeof auth.authStateReady === "function") {
        auth
          .authStateReady()
          .then(function () {
            resolve(auth.currentUser || null);
          })
          .catch(function () {
            resolve(auth.currentUser || null);
          });
        return;
      }
      var feito = false;
      var unsub = auth.onAuthStateChanged(function (user) {
        if (feito) return;
        feito = true;
        if (unsub) unsub();
        resolve(user || null);
      });
    });
  }

  function aguardarFirebasePronto(F) {
    F = F || {};
    if (F.initError) return Promise.reject(F.initError);
    if (F.whenReady) return F.whenReady();
    return Promise.resolve(F);
  }

  function validarSessaoProfessorMemoria(s) {
    if (!s || s.tipo !== "professor") return null;
    var uid = String(s.uid || "").trim();
    var email = normalizarEmail(s.email || "");
    if (!uid || !email) return null;
    s.uid = uid;
    s.email = email;
    return s;
  }

  function montarSessaoProfessorDeUser(user, data) {
    return {
      uid: user.uid,
      email: normalizarEmail(user.email || (data && data.email) || ""),
      tipo: "professor",
      loginEm: new Date().toISOString(),
    };
  }

  function restaurarSessaoProfessorDeUser(db, auth, user) {
    if (!user || !user.uid) {
      return Promise.resolve(null);
    }
    if (!db) {
      var local = montarSessaoProfessorDeUser(user, null);
      definirSessao(local);
      return Promise.resolve(local);
    }
    return db
      .collection("usuarios")
      .doc(user.uid)
      .get()
      .then(function (doc) {
        if (!doc.exists) {
          limparSessao();
          if (auth && auth.signOut) auth.signOut().catch(function () {});
          return null;
        }
        var data = doc.data() || {};
        if (data.tipo !== "professor") {
          limparSessao();
          if (auth && auth.signOut) auth.signOut().catch(function () {});
          return null;
        }
        var sessaoProf = montarSessaoProfessorDeUser(user, data);
        definirSessao(sessaoProf);
        return sessaoProf;
      })
      .catch(function () {
        limparSessao();
        return null;
      });
  }

  /**
   * Aguarda Firebase Auth e restaura sessão do professor (sessionStorage + Auth persistido).
   * @param {{ redirecionarSeAusente?: boolean }} opts
   */
  function garantirSessaoProfessor(db, auth, opts) {
    opts = opts || {};
    var redirecionar = opts.redirecionarSeAusente !== false;

    if (redirecionar && garantirSessaoProfessorPromise) {
      return garantirSessaoProfessorPromise;
    }

    var promessa = aguardarUsuarioFirebase(auth).then(function (user) {
      var memoria = validarSessaoProfessorMemoria(sessaoAtual());

      if (user && user.uid) {
        if (memoria && memoria.uid !== user.uid) {
          limparSessao();
          memoria = null;
        }
        if (memoria && memoria.uid === user.uid) {
          return memoria;
        }
        return restaurarSessaoProfessorDeUser(db, auth, user);
      }

      if (memoria) {
        limparSessao();
      }
      if (redirecionar) {
        window.location.replace(urls.login);
      }
      return null;
    });

    if (redirecionar) {
      garantirSessaoProfessorPromise = promessa;
      promessa.then(function (r) {
        if (!r) garantirSessaoProfessorPromise = null;
      });
    }
    return promessa;
  }

  /** Limpa sessão do aluno na memória, storages e caches internos (logout síncrono). */
  function limparSessaoAluno() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
    limparSessaoAlunoPersistente();
    resetarCacheSessaoAluno();
  }

  /**
   * Restaura sessão do aluno a partir do localStorage (resolve alunoDocId no Firestore).
   * Redireciona para acesso-aluno.html se não houver sessão válida.
   */
  function restaurarSessaoAlunoDePersistencia(db, TF) {
    var persisted = lerSessaoAlunoPersistente();
    if (!persisted) {
      limparSessaoAluno();
      window.location.replace(urls.acessoAluno);
      return Promise.resolve(null);
    }
    if (!db || !TF || typeof TF.listarAlunosTurma !== "function") {
      limparSessaoAluno();
      window.location.replace(urls.acessoAluno);
      return Promise.resolve(null);
    }
    return TF.listarAlunosTurma(db, persisted.turmaId)
      .then(function (alunos) {
        var res = TF.resolverNomeContraLista(alunos, persisted.nome);
        if (!res.ok || !res.aluno || !res.aluno.id) {
          limparSessaoAluno();
          window.location.replace(urls.acessoAluno);
          return null;
        }
        var sessao = {
          tipo: "aluno",
          turmaId: persisted.turmaId,
          alunoNome: persisted.nome,
          alunoDocId: String(res.aluno.id).trim(),
          entradaEm: persisted.logadoEm,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
        sessaoAlunoRestaurada = sessao;
        return sessao;
      })
      .catch(function () {
        limparSessaoAluno();
        window.location.replace(urls.acessoAluno);
        return null;
      });
  }

  /**
   * Garante sessão válida do aluno: sessionStorage ou localStorage persistido.
   * Deve ser chamada antes de carregar atividades, leituras, ranking ou gamificação.
   */
  function garantirSessaoAluno(db, TF) {
    if (lerSessaoAlunoPersistente() === null && !validarSessaoAlunoMemoria(sessaoAtual())) {
      resetarCacheSessaoAluno();
    }

    if (garantirSessaoAlunoPromise) return garantirSessaoAlunoPromise;

    var atual = validarSessaoAlunoMemoria(sessaoAtual());
    if (atual) {
      sessaoAlunoRestaurada = atual;
      garantirSessaoAlunoPromise = Promise.resolve(atual);
      return garantirSessaoAlunoPromise;
    }

    if (sessaoAtual()) {
      limparSessaoAluno();
      window.location.replace(urls.acessoAluno);
      garantirSessaoAlunoPromise = Promise.resolve(null);
      return garantirSessaoAlunoPromise;
    }

    var persisted = lerSessaoAlunoPersistente();
    if (!persisted) {
      window.location.replace(urls.acessoAluno);
      garantirSessaoAlunoPromise = Promise.resolve(null);
      return garantirSessaoAlunoPromise;
    }

    garantirSessaoAlunoPromise = restaurarSessaoAlunoDePersistencia(db, TF);
    return garantirSessaoAlunoPromise;
  }

  function irPara(caminho) {
    window.location.href = caminho;
  }

  function irParaPainel(tipo) {
    if (tipo === "professor") irPara(urls.painelProfessor);
    else irPara(urls.painelAluno);
  }

  /**
   * Garante sessão válida para a página atual.
   * - Sem sessão: professor → login; aluno → acesso-aluno.
   * - Sessão com tipo errado: envia ao painel correspondente ao perfil atual.
   */
  function exigirSessao(esperadoTipo) {
    var s = sessaoAtual();
    if (!s) {
      if (esperadoTipo === "aluno") window.location.replace(urls.acessoAluno);
      else window.location.replace(urls.login);
      return null;
    }

    if (esperadoTipo === "aluno") {
      if (s.tipo !== "aluno") {
        irParaPainel(s.tipo);
        return null;
      }
      var valida = validarSessaoAlunoMemoria(s);
      if (!valida) {
        limparSessaoAluno();
        window.location.replace(urls.acessoAluno);
        return null;
      }
      return valida;
    }

    if (esperadoTipo === "professor") {
      if (s.tipo !== "professor" || !s.uid) {
        if (s.tipo === "aluno") irParaPainel("aluno");
        else window.location.replace(urls.login);
        return null;
      }
      return s;
    }

    if (esperadoTipo && s.tipo !== esperadoTipo) {
      irParaPainel(s.tipo);
      return null;
    }
    return s;
  }

  global.SessaoDemo = {
    urls: urls,
    STORAGE_USERS: STORAGE_USERS,
    STORAGE_ATIVIDADES: STORAGE_ATIVIDADES,
    STORAGE_RESPOSTAS: STORAGE_RESPOSTAS,
    SESSION_KEY: SESSION_KEY,
    STORAGE_ALUNO_KEY: STORAGE_ALUNO_KEY,
    normalizarEmail: normalizarEmail,
    emailValido: emailValido,
    lerUsuarios: lerUsuarios,
    salvarUsuarios: salvarUsuarios,
    lerAtividades: lerAtividades,
    salvarAtividades: salvarAtividades,
    lerRespostas: lerRespostas,
    salvarRespostas: salvarRespostas,
    novoIdAtividade: novoIdAtividade,
    atividadesDoProfessor: atividadesDoProfessor,
    respostaDoAluno: respostaDoAluno,
    corrigirAtividadeObjetiva: corrigirAtividadeObjetiva,
    atualizarRespostaAluno: atualizarRespostaAluno,
    sessaoAtual: sessaoAtual,
    definirSessao: definirSessao,
    limparSessao: limparSessao,
    limparSessaoAluno: limparSessaoAluno,
    lerSessaoAlunoPersistente: lerSessaoAlunoPersistente,
    salvarSessaoAlunoPersistente: salvarSessaoAlunoPersistente,
    garantirSessaoAluno: garantirSessaoAluno,
    irPara: irPara,
    irParaPainel: irParaPainel,
    exigirSessao: exigirSessao,
    normalizarNomeAluno: normalizarNomeAluno,
    normalizarTurmaId: normalizarTurmaId,
    temConteudoHtml: temConteudoHtml,
    nomeProfessorParaAluno: nomeProfessorParaAluno,
    rotuloProfessorParaAluno: rotuloProfessorParaAluno,
    resolverRotuloProfessorParaAluno: resolverRotuloProfessorParaAluno,
    prefetchNomesProfessores: prefetchNomesProfessores,
  };

  global.SessaoApp = {
    garantirSessaoAluno: garantirSessaoAluno,
    garantirSessaoProfessor: garantirSessaoProfessor,
    aguardarFirebasePronto: aguardarFirebasePronto,
    limparSessaoAluno: limparSessaoAluno,
    salvarSessaoAlunoPersistente: salvarSessaoAlunoPersistente,
    lerSessaoAlunoPersistente: lerSessaoAlunoPersistente,
  };
})(window);

