/**
 * Gamificação educativa — pontos, medalhas, top 3 (sem expor ranking completo negativo).
 */
(function (global) {
  var MEDALHAS = [
    { id: "iniciante", nome: "Leitor iniciante", minPontos: 0, emoji: "📖" },
    { id: "super", nome: "Super leitor", minPontos: 50, emoji: "⭐" },
    { id: "mestre", nome: "Mestre da leitura", minPontos: 120, emoji: "🏆" },
    { id: "explorador", nome: "Explorador do conhecimento", minPontos: 200, emoji: "🧭" },
  ];

  function calcularPontosResposta(pontuacao) {
    var base = 10;
    if (!pontuacao || typeof pontuacao.nota10 !== "number") return base;
    var nota = pontuacao.nota10;
    var bonusNota = 0;
    if (nota >= 9) bonusNota = 15;
    else if (nota >= 7) bonusNota = 8;
    else if (nota >= 5) bonusNota = 3;
    return base + bonusNota;
  }

  function medalhaPorPontos(pontos) {
    var m = MEDALHAS[0];
    for (var i = 0; i < MEDALHAS.length; i++) {
      if (pontos >= MEDALHAS[i].minPontos) m = MEDALHAS[i];
    }
    return m;
  }

  function proximaMedalha(pontos) {
    for (var i = 0; i < MEDALHAS.length; i++) {
      if (pontos < MEDALHAS[i].minPontos) return MEDALHAS[i];
    }
    return null;
  }

  /**
   * Agrega respostas por alunoDocId.
   * @param {Array} alunos — { id, nome }
   * @param {Array} respostas — docs normalizados
   */
  function statsPorAlunos(alunos, respostas) {
    var mapa = {};
    (alunos || []).forEach(function (a) {
      mapa[a.id] = {
        alunoDocId: a.id,
        nome: a.nome,
        respostasCount: 0,
        somaNotas: 0,
        notasCount: 0,
        pontos: 0,
      };
    });

    (respostas || []).forEach(function (r) {
      var aid = r.alunoDocId;
      if (!aid) return;
      if (!mapa[aid]) {
        mapa[aid] = {
          alunoDocId: aid,
          nome: r.alunoNome || "Aluno",
          respostasCount: 0,
          somaNotas: 0,
          notasCount: 0,
          pontos: 0,
        };
      }
      var s = mapa[aid];
      s.respostasCount += 1;
      s.pontos += calcularPontosResposta(r.pontuacao);
      if (r.pontuacao && typeof r.pontuacao.nota10 === "number") {
        s.somaNotas += r.pontuacao.nota10;
        s.notasCount += 1;
      }
    });

    var lista = Object.keys(mapa).map(function (k) {
      var s = mapa[k];
      s.media =
        s.notasCount > 0 ? Math.round((s.somaNotas / s.notasCount) * 10) / 10 : null;
      s.medalha = medalhaPorPontos(s.pontos);
      s.proximaMedalha = proximaMedalha(s.pontos);
      return s;
    });

    return lista;
  }

  /** Desempate: score → média → nº de respostas → nome (A–Z). */
  function compararRanking(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var medA = a.stats.media != null ? a.stats.media : -1;
    var medB = b.stats.media != null ? b.stats.media : -1;
    if (medB !== medA) return medB - medA;
    if (b.stats.respostasCount !== a.stats.respostasCount) {
      return b.stats.respostasCount - a.stats.respostasCount;
    }
    var nomeA = String(a.stats.nome || "").toLowerCase();
    var nomeB = String(b.stats.nome || "").toLowerCase();
    return nomeA.localeCompare(nomeB, "pt-BR");
  }

  function pontuarEntrada(stats) {
    var part = stats.respostasCount * 12;
    var med = stats.media != null ? stats.media * 8 : 0;
    return { stats: stats, score: stats.pontos + part + med };
  }

  /** Top 3 por score composto (participação + média + pontos). */
  function top3Turma(statsLista) {
    var scored = (statsLista || []).slice().map(pontuarEntrada);
    scored.sort(compararRanking);
    return scored.slice(0, 3).map(function (x, i) {
      return {
        posicao: i + 1,
        emoji: i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉",
        nome: x.stats.nome,
        pontos: x.stats.pontos,
        media: x.stats.media,
        respostas: x.stats.respostasCount,
        medalha: x.stats.medalha,
        alunoDocId: x.stats.alunoDocId,
      };
    });
  }

  /** Posição do aluno (1-based) sem retornar lista completa para outros. */
  function posicaoDoAluno(statsLista, alunoDocId) {
    var scored = (statsLista || []).slice().map(pontuarEntrada);
    scored.sort(compararRanking);
    for (var i = 0; i < scored.length; i++) {
      if (scored[i].stats.alunoDocId === alunoDocId) {
        return {
          posicao: i + 1,
          total: scored.length,
          stats: scored[i].stats,
          subiu: 0,
        };
      }
    }
    return null;
  }

  global.Gamificacao = {
    MEDALHAS: MEDALHAS,
    compararRanking: compararRanking,
    statsPorAlunos: statsPorAlunos,
    top3Turma: top3Turma,
    posicaoDoAluno: posicaoDoAluno,
    medalhaPorPontos: medalhaPorPontos,
    proximaMedalha: proximaMedalha,
    calcularPontosResposta: calcularPontosResposta,
  };
})(window);
