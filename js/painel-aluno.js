(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var TF = window.TurmasFirestore;
  var AFS = window.AtividadesFirestore;
  var RFS = window.RespostasFirestore;
  var GAM = window.Gamificacao;

  SessaoApp.garantirSessaoAluno(F.db, TF).then(function (sessao) {
    if (!sessao) return;
    iniciarPainel(sessao);
  });

  function iniciarPainel(sessao) {
  var elUsuario = document.getElementById("painel-usuario-email");
  if (elUsuario) {
    elUsuario.textContent = sessao.alunoNome + " · Turma " + sessao.turmaId;
  }

  var btnSair = document.getElementById("btn-sair");
  if (btnSair) {
    btnSair.addEventListener("click", function () {
      SessaoApp.limparSessaoAluno();
      window.location.replace(S.urls.acessoAluno + "?logout=1");
    });
  }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function temResposta(r) {
    if (!r) return false;
    if (r.texto && String(r.texto).trim()) return true;
    if (r.respostasQuestoes && r.respostasQuestoes.length) return true;
    return false;
  }

  function carregarRespostasTurma(atividades) {
    var turmaN = S.normalizarTurmaId(sessao.turmaId);
    if (!RFS || !atividades || !atividades.length) return Promise.resolve([]);
    return Promise.all(
      atividades.map(function (a) {
        return RFS.listarPorAtividade(F.db, a.id);
      })
    ).then(function (arrs) {
      var todas = [];
      arrs.forEach(function (arr) {
        arr.forEach(function (r) {
          if (S.normalizarTurmaId(r.turmaId || "") === turmaN) todas.push(r);
        });
      });
      return todas;
    });
  }

  function carregarGamificacaoAluno(atividades) {
    var sec = document.getElementById("aluno-gamificacao");
    if (!sec || !GAM || !TF || !F.db) return;

    var atvs = atividades || [];
    Promise.all([
      TF.listarAlunosTurma(F.db, sessao.turmaId),
      carregarRespostasTurma(atvs),
    ])
      .then(function (pares) {
        var alunos = pares[0];
        var respostasTurma = pares[1];
        var stats = GAM.statsPorAlunos(alunos, respostasTurma);
        var pos = GAM.posicaoDoAluno(stats, sessao.alunoDocId);
        sec.hidden = false;

        var elPos = document.getElementById("alu-posicao");
        var elPts = document.getElementById("alu-pontos");
        var elMed = document.getElementById("alu-medalha");
        var elMsg = document.getElementById("alu-gamificacao-msg");
        var elPct = document.getElementById("alu-progresso-pct");
        var elFill = document.getElementById("alu-progresso-fill");

        var meuStats = pos && pos.stats ? pos.stats : null;
        if (!meuStats) {
          meuStats = stats.find(function (s) {
            return s.alunoDocId === sessao.alunoDocId;
          });
        }

        if (!pos && meuStats) {
          if (elPos) elPos.textContent = "—";
        } else if (pos) {
          if (elPos) elPos.textContent = pos.posicao + "º de " + pos.total;
        } else {
          if (elPos) elPos.textContent = "—";
        }

        if (meuStats) {
          if (elPts) elPts.textContent = String(meuStats.pontos);
          if (elMed) elMed.textContent = meuStats.medalha.emoji + " " + meuStats.medalha.nome;
          var prox = meuStats.proximaMedalha;
          if (elMsg && prox) {
            var falta = prox.minPontos - meuStats.pontos;
            elMsg.textContent =
              falta > 0
                ? "Faltam " + falta + " pontos para a medalha «" + prox.nome + "»!"
                : "Você já conquistou todas as medalhas disponíveis!";
          }
          var pctTurma =
            atvs.length > 0
              ? Math.round((meuStats.respostasCount / atvs.length) * 100)
              : 0;
          if (elPct) elPct.textContent = pctTurma + "%";
          if (elFill) elFill.style.width = pctTurma + "%";
        } else if (elMsg) {
          elMsg.textContent = "Complete atividades para ganhar pontos e medalhas!";
        }
      })
      .catch(function () {
        if (sec) sec.hidden = true;
      });
  }

  function renderLista() {
    var ul = document.getElementById("lista-atividades-aluno");
    var vazio = document.getElementById("vazio-atividades-aluno");
    if (!ul) return;

    if (F.initError || !F.db) {
      var viaFile = window.location.protocol === "file:";
      ul.innerHTML =
        '<li class="item-atividade"><p class="painel-alerta painel-alerta--erro">' +
        (viaFile
          ? "Abra pelo servidor: http://localhost:5500/painel-aluno.html"
          : "Firebase não carregou. Recarregue com Ctrl+Shift+R (http://localhost:5500).") +
        "</p></li>";
      if (vazio) vazio.hidden = true;
      return;
    }
    if (!AFS || !RFS || !TF) {
      ul.innerHTML =
        '<li class="item-atividade"><p class="painel-alerta painel-alerta--erro">Módulos da plataforma não carregaram. Recarregue a página.</p></li>';
      if (vazio) vazio.hidden = true;
      return;
    }

    ul.innerHTML =
      '<li class="item-atividade"><p class="lista-vazia">Verificando sessão…</p></li>';
    if (vazio) vazio.hidden = true;

    TF.alunoPertenceTurma(F.db, sessao.turmaId, sessao.alunoDocId)
      .then(function (autorizado) {
        if (!autorizado) {
          SessaoApp.limparSessaoAluno();
          window.location.replace(S.urls.acessoAluno);
          return null;
        }
        ul.innerHTML =
          '<li class="item-atividade"><p class="lista-vazia">Carregando atividades…</p></li>';
        return Promise.all([
          AFS.listarPorTurma(F.db, sessao.turmaId),
          RFS.listarPorTurmaEAlunoDoc(F.db, sessao.turmaId, sessao.alunoDocId),
        ]);
      })
      .then(function (pares) {
        if (!pares) return;
        var todas = pares[0];
        var respostasDoAluno = pares[1];
        var porAtividade = {};
        respostasDoAluno.forEach(function (r) {
          porAtividade[r.atividadeId] = r;
        });

        todas.sort(function (a, b) {
          return new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
        });
        ul.innerHTML = "";

        carregarGamificacaoAluno(todas);

        if (todas.length === 0) {
          if (vazio) vazio.hidden = false;
          return;
        }
        if (vazio) vazio.hidden = true;

        var uidsProf = [];
        todas.forEach(function (a) {
          var uid = a.professorId ? String(a.professorId).trim() : "";
          if (uid && uidsProf.indexOf(uid) < 0) uidsProf.push(uid);
        });

        var prefetch =
          S.prefetchNomesProfessores && typeof S.prefetchNomesProfessores === "function"
            ? S.prefetchNomesProfessores(F.db, uidsProf)
            : Promise.resolve();

        prefetch.then(function () {
        todas.forEach(function (a) {
          var profLabel =
            S.rotuloProfessorParaAluno && typeof S.rotuloProfessorParaAluno === "function"
              ? S.rotuloProfessorParaAluno(a)
              : "Professor";
          var resp = porAtividade[a.id];
          var respondida = temResposta(resp);
          var notaLinha = "";
          if (
            respondida &&
            a.questoes &&
            a.questoes.length &&
            resp.respostasQuestoes &&
            resp.respostasQuestoes.length
          ) {
            var pont =
              resp.pontuacao ||
              S.corrigirAtividadeObjetiva(a, resp.respostasQuestoes);
            if (!resp.pontuacao) {
              RFS.atualizarPontuacao(
                F.db,
                sessao.turmaId,
                sessao.alunoDocId,
                a.id,
                pont
              ).catch(function () {});
            }
            var gabHint =
              a.gabaritoLiberado !== true
                ? ' · <span class="item-atividade__gabarito-pend">Gabarito pendente</span>'
                : "";
            notaLinha =
              '<span class="item-atividade__nota" title="Correção automática">' +
              pont.acertos +
              "/" +
              pont.total +
              " · " +
              pont.percentual +
              "% · " +
              pont.nota10 +
              "/10" +
              gabHint +
              "</span>";
          } else if (respondida && resp.texto && !resp.respostasQuestoes) {
            notaLinha =
              '<span class="item-atividade__nota item-atividade__nota--na">Sem nota automática</span>';
          }
          var li = document.createElement("li");
          li.className = "item-atividade item-atividade--aluno";
          var status = respondida
            ? '<span class="item-atividade__status item-atividade__status--ok">Respondida</span>'
            : '<span class="item-atividade__status">Pendente</span>';
          var href = S.urls.responderAtividade + "?id=" + encodeURIComponent(a.id);
          var btnClass = respondida ? "btn-responder btn-responder--sec" : "btn-responder";
          var btnLabel = respondida ? "Ver resultado" : "Responder";
          var extra = respondida
            ? '<span class="item-atividade__feito">Enviada em ' +
              new Date(resp.enviadoEm).toLocaleString("pt-BR") +
              "</span>"
            : "";

          var temTrecho =
            S.temConteudoHtml && typeof S.temConteudoHtml === "function"
              ? S.temConteudoHtml(a.texto)
              : String(a.texto || "").trim().length > 0;
          var trechoHtml = "";
          if (temTrecho) {
            var textoPreview = a.texto;
            if (window.RichTextUtils && typeof window.RichTextUtils.stripHtml === "function") {
              textoPreview = window.RichTextUtils.stripHtml(a.texto);
            }
            textoPreview = String(textoPreview || "").trim();
            if (textoPreview) {
              trechoHtml =
                '<p class="item-atividade__trecho">' +
                escapeHtml(textoPreview.length > 140 ? textoPreview.slice(0, 140) + "…" : textoPreview) +
                "</p>";
            }
          }

          li.innerHTML =
            '<div class="item-atividade__linha">' +
            '<div class="item-atividade__corpo">' +
            "<strong class=\"item-atividade__titulo\">" +
            escapeHtml(a.titulo) +
            "</strong>" +
            '<span class="item-atividade__meta">' +
            escapeHtml(profLabel) +
            "</span>" +
            (notaLinha ? "<br>" + notaLinha : "") +
            "</div>" +
            status +
            "</div>" +
            trechoHtml +
            '<div class="item-atividade__acoes">' +
            extra +
            '<a class="' +
            btnClass +
            '" href="' +
            href +
            '">' +
            btnLabel +
            "</a></div>";
          ul.appendChild(li);
        });
        });
      })
      .catch(function () {
        ul.innerHTML =
          '<li class="item-atividade"><p class="painel-alerta painel-alerta--erro">Não foi possível carregar. Verifique turma, lista de alunos e regras do Firestore.</p></li>';
      });
  }

  renderLista();
  }
})();
