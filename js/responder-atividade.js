(function () {
  var S = window.SessaoDemo;
  var SessaoApp = window.SessaoApp;
  if (!S || !SessaoApp) return;

  var F = window.FirebaseApp || {};
  var TF = window.TurmasFirestore;
  var AFS = window.AtividadesFirestore;
  var RFS = window.RespostasFirestore;

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id");
  var blocoErro = document.getElementById("bloco-erro");
  var blocoConteudo = document.getElementById("bloco-conteudo");
  var area = document.getElementById("area-interacao");

  SessaoApp.garantirSessaoAluno(F.db, TF).then(function (sessao) {
    if (!sessao) return;
    iniciarResponder(sessao);
  });

  function iniciarResponder(sessao) {
  var RASCUNHO_RESP_PREFIX = "rascunho_atividade_";

  function slugChaveRascunho(str) {
    return String(str || "")
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 64);
  }

  function idAlunoRascunho(s) {
    return s.alunoDocId || slugChaveRascunho(s.alunoNome) || "aluno";
  }

  function chaveRascunhoResposta(atvId) {
    return (
      RASCUNHO_RESP_PREFIX +
      slugChaveRascunho(atvId) +
      "_" +
      slugChaveRascunho(idAlunoRascunho(sessao)) +
      "_" +
      slugChaveRascunho(sessao.turmaId)
    );
  }

  function salvarRascunhoResposta(payload) {
    try {
      var obj = {
        atividadeId: id,
        aluno: idAlunoRascunho(sessao),
        turma: sessao.turmaId,
        formato: payload.formato,
        respostas: payload.respostas,
        atualizadoEm: new Date().toISOString(),
      };
      localStorage.setItem(chaveRascunhoResposta(id), JSON.stringify(obj));
    } catch (e) {}
  }

  function lerRascunhoResposta() {
    try {
      var raw = localStorage.getItem(chaveRascunhoResposta(id));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || String(o.atividadeId) !== String(id)) return null;
      if (String(o.turma) !== String(sessao.turmaId)) return null;
      if (String(o.aluno) !== String(idAlunoRascunho(sessao))) return null;
      return o;
    } catch (e) {
      return null;
    }
  }

  function limparRascunhoResposta() {
    try {
      localStorage.removeItem(chaveRascunhoResposta(id));
    } catch (e) {}
  }

  var elEmail = document.getElementById("painel-usuario-email");
  if (elEmail) elEmail.textContent = sessao.alunoNome + " · Turma " + sessao.turmaId;

  if (!id || !area) {
    if (blocoErro) {
      blocoErro.hidden = false;
      blocoErro.className = "painel-alerta painel-alerta--erro";
      blocoErro.textContent = "Nenhuma atividade selecionada. Volte ao painel do aluno.";
    }
    return;
  }

  if (F.initError || !F.db || !AFS || !RFS || !TF) {
    if (blocoErro) {
      blocoErro.hidden = false;
      blocoErro.className = "painel-alerta painel-alerta--erro";
      blocoErro.textContent = "Firebase não carregado. Abra pelo servidor local.";
    }
    return;
  }

  if (blocoConteudo) blocoConteudo.hidden = true;
  if (blocoErro) {
    blocoErro.hidden = false;
    blocoErro.className = "painel-alerta painel-alerta--info";
    blocoErro.textContent = "Carregando atividade…";
  }

  TF.alunoPertenceTurma(F.db, sessao.turmaId, sessao.alunoDocId)
    .then(function (ok) {
      if (!ok) {
        SessaoApp.limparSessaoAluno();
        window.location.replace(S.urls.acessoAluno);
        return Promise.reject(new Error("sessao"));
      }
      return Promise.all([
        AFS.obterPorId(F.db, id),
        RFS.obterPorTurmaAlunoDocAtividade(
          F.db,
          sessao.turmaId,
          sessao.alunoDocId,
          sessao.alunoNome,
          id
        ),
      ]);
    })
    .then(function (resultados) {
      if (!resultados) return;
      var atividade = resultados[0];
      var existente = resultados[1];
      if (!atividade) {
        if (blocoErro) {
          blocoErro.hidden = false;
          blocoErro.className = "painel-alerta painel-alerta--erro";
          blocoErro.textContent = "Atividade não encontrada.";
        }
        return;
      }

      var turmaAtv = S.normalizarTurmaId(atividade.turmaId || "");
      if (!turmaAtv || turmaAtv !== sessao.turmaId) {
        if (blocoErro) {
          blocoErro.hidden = false;
          blocoErro.className = "painel-alerta painel-alerta--erro";
          blocoErro.textContent =
            "Esta atividade não pertence à sua turma. Volte ao painel e escolha uma atividade da lista.";
        }
        return;
      }

      if (blocoErro) blocoErro.hidden = true;
      if (blocoConteudo) blocoConteudo.hidden = false;

      var meta = document.getElementById("atv-meta");
      var dataCriacao =
        " · Criada em " + new Date(atividade.criadoEm).toLocaleString("pt-BR");

      function aplicarMetaProfessor(profLabel) {
        if (meta) meta.textContent = profLabel + dataCriacao;
      }

      if (S.resolverRotuloProfessorParaAluno && typeof S.resolverRotuloProfessorParaAluno === "function") {
        S.resolverRotuloProfessorParaAluno(F.db, atividade).then(aplicarMetaProfessor);
      } else {
        aplicarMetaProfessor(
          S.rotuloProfessorParaAluno ? S.rotuloProfessorParaAluno(atividade) : "Professor"
        );
      }

      var titulo = document.getElementById("atv-titulo");
      if (titulo) titulo.textContent = atividade.titulo;

      var blocoTexto = document.getElementById("atv-bloco-texto");
      var texto = document.getElementById("atv-texto");
      var temTextoGlobal =
        S.temConteudoHtml && typeof S.temConteudoHtml === "function"
          ? S.temConteudoHtml(atividade.texto)
          : String(atividade.texto || "").trim().length > 0;

      if (blocoTexto) blocoTexto.hidden = !temTextoGlobal;

      if (texto) {
        if (temTextoGlobal) {
          if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
            texto.innerHTML = window.RichTextUtils.sanitizeHtml(atividade.texto || "");
          } else {
            texto.textContent = atividade.texto;
          }
        } else {
          texto.innerHTML = "";
        }
      }

      var materialApoioHtml = typeof atividade.materialApoioHtml === "string" ? atividade.materialApoioHtml : "";
      var blocoMaterial = document.getElementById("atv-bloco-material-apoio");
      var elMaterial = document.getElementById("atv-material-apoio");
      var temMaterialApoio =
        S.temConteudoHtml && typeof S.temConteudoHtml === "function"
          ? S.temConteudoHtml(materialApoioHtml)
          : String(materialApoioHtml || "").trim().length > 0;

      if (blocoMaterial) blocoMaterial.hidden = !temMaterialApoio;

      if (elMaterial) {
        if (temMaterialApoio) {
          if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
            elMaterial.innerHTML = window.RichTextUtils.sanitizeHtml(materialApoioHtml);
          } else {
            elMaterial.textContent = materialApoioHtml;
          }
        } else {
          elMaterial.innerHTML = "";
        }
      }

  function escapeHtml(str) {
    var d = document.createElement("div");
    d.textContent = str != null ? String(str) : "";
    return d.innerHTML;
  }

  function letraIndice(i) {
    if (i == null || i < 0) return "—";
    return String.fromCharCode(65 + i);
  }

  function garantirPontuacaoSalva(resp) {
    if (!resp || !resp.respostasQuestoes || !atividade.questoes || !atividade.questoes.length) return resp;
    if (resp.pontuacao && typeof resp.pontuacao.acertos === "number") return resp;
    var pont = S.corrigirAtividadeObjetiva(atividade, resp.respostasQuestoes);
    RFS.atualizarPontuacao(F.db, sessao.turmaId, sessao.alunoDocId, id, pont).catch(function () {});
    resp.pontuacao = pont;
    return resp;
  }

  function montarPainelResultado(pont, enviadoEm, gabaritoLiberado) {
    area.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "resultado-correcao";
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Resultado da correção automática");

    var oculto = gabaritoLiberado !== true;
    var ptsLinha = "";
    if (typeof pont.pontosGanhos === "number" && typeof pont.pontosMaximos === "number" && pont.pontosMaximos > 0) {
      ptsLinha =
        '<p class="resultado-pontuacao__pts">' +
        pont.pontosGanhos +
        " de <strong>" +
        pont.pontosMaximos +
        "</strong> pontos</p>";
    }

    var head = document.createElement("div");
    head.className = "resultado-pontuacao";
    head.innerHTML =
      '<p class="resultado-pontuacao__titulo">Resultado da atividade</p>' +
      '<p class="resultado-pontuacao__valor"><span class="resultado-pontuacao__num">' +
      pont.acertos +
      "</span> de <strong>" +
      pont.total +
      "</strong> acertos</p>" +
      ptsLinha +
      '<p class="resultado-pontuacao__pct">' +
      pont.percentual +
      '% · Nota: <strong class="resultado-pontuacao__nota">' +
      pont.nota10 +
      "</strong> / 10</p>";
    if (oculto) {
      var aviso = document.createElement("p");
      aviso.className = "resultado-pontuacao__aviso";
      aviso.textContent =
        "O gabarito (alternativa correta) será exibido quando o professor liberar. Por enquanto você vê apenas se acertou ou errou cada questão.";
      head.appendChild(aviso);
    }
    if (enviadoEm) {
      var pEnv = document.createElement("p");
      pEnv.className = "resultado-pontuacao__envio";
      pEnv.textContent = "Enviado em " + new Date(enviadoEm).toLocaleString("pt-BR");
      head.appendChild(pEnv);
    }
    wrap.appendChild(head);

    var ul = document.createElement("ul");
    ul.className = "resultado-detalhes";
    pont.detalhes.forEach(function (d, idx) {
      var li = document.createElement("li");
      li.className =
        "resultado-item " + (d.correto ? "resultado-item--ok" : "resultado-item--erro");
      var enunTexto = d.enunciado || "";
      if (window.RichTextUtils && typeof window.RichTextUtils.stripHtml === "function") {
        enunTexto = window.RichTextUtils.stripHtml(enunTexto);
      }
      var enun =
        enunTexto.length > 160 ? enunTexto.slice(0, 160) + "…" : enunTexto;
      var metaHtml = "";
      if (oculto) {
        metaHtml =
          '<p class="resultado-item__meta">Sua escolha: <strong>' +
          letraIndice(d.indiceEscolhido) +
          "</strong></p>";
      } else {
        metaHtml =
          '<p class="resultado-item__meta">Sua escolha: <strong>' +
          letraIndice(d.indiceEscolhido) +
          "</strong> · Correta: <strong>" +
          letraIndice(d.indiceCorreto) +
          "</strong></p>";
      }
      li.innerHTML =
        '<span class="resultado-item__icone" aria-hidden="true">' +
        (d.correto ? "✓" : "✗") +
        "</span>" +
        '<div class="resultado-item__texto">' +
        "<strong>Pergunta " +
        (idx + 1) +
        "</strong>" +
        '<p class="resultado-item__enun">' +
        escapeHtml(enun) +
        "</p>" +
        metaHtml +
        "</div>";
      ul.appendChild(li);
    });
    wrap.appendChild(ul);

    var rod = document.createElement("p");
    rod.className = "resultado-rodape";
    rod.innerHTML =
      '<a class="btn-responder" href="' + S.urls.painelAluno + '">Voltar às atividades</a>';
    wrap.appendChild(rod);

    area.appendChild(wrap);
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function montarJaRespondidoObjetiva(resp) {
    resp = garantirPontuacaoSalva(resp);
    var pont = resp.pontuacao;
    if (!pont) return;
    montarPainelResultado(pont, resp.enviadoEm, atividade.gabaritoLiberado === true);
  }

  function montarJaRespondidoLegado() {
    var raw = existente && existente.texto ? String(existente.texto) : "";
    var txt = raw;
    if (window.RichTextUtils && typeof window.RichTextUtils.stripHtml === "function") {
      txt = window.RichTextUtils.stripHtml(raw);
    }
    var preview = txt.length > 600 ? txt.slice(0, 600) + "…" : txt;
    area.innerHTML =
      '<div class="painel-alerta painel-alerta--info resultado-legado">' +
      "<p><strong>Resposta dissertativa enviada.</strong> Não há correção automática para texto livre nesta demonstração; o professor pode avaliar depois.</p>" +
      '<p class="painel-resumo-resposta">' +
      escapeHtml(preview) +
      "</p>" +
      '<p class="painel-voltar-wrap"><a class="btn-responder btn-responder--sec" href="' +
      S.urls.painelAluno +
      '">Voltar às atividades</a></p>' +
      "</div>";
  }

  function montarFormularioObjetiva() {
    var totalQ = atividade.questoes.length;
    area.innerHTML =
      '<form id="form-resposta" class="form-painel" novalidate>' +
      '<h2 class="painel-subtitulo painel-subtitulo--grande">Responda às perguntas</h2>' +
      '<p class="painel-intro painel-intro--inline">Ao enviar, você verá sua <strong>nota</strong>, quantos acertos teve e se cada questão está certa ou errada. A alternativa correta só aparece quando o professor <strong>liberar o gabarito</strong>.</p>' +
      '<div class="progresso-resposta" role="region" aria-label="Progresso das respostas">' +
      '<div class="progresso-resposta__top">' +
      '<span class="progresso-resposta__label" id="resp-progresso-texto"></span>' +
      '<span class="progresso-resposta__pct" id="resp-progresso-pct">0%</span>' +
      "</div>" +
      '<div class="progresso-resposta__track" aria-hidden="true">' +
      '<div class="progresso-resposta__fill" id="resp-progresso-fill"></div>' +
      "</div></div>" +
      '<div id="questoes-resposta"></div>' +
      '<p class="form-painel__msg" id="resp-msg" role="status" aria-live="polite"></p>' +
      '<div class="form-painel__acoes">' +
      '<a href="painel-aluno.html" class="btn-secundario">Voltar</a>' +
      '<button type="submit" class="btn-primario" id="resp-submit">Enviar respostas</button>' +
      "</div>" +
      "</form>";

    var qContainer = area.querySelector("#questoes-resposta");
    atividade.questoes.forEach(function (q, idx) {
      var fs = document.createElement("fieldset");
      fs.className = "questao-resposta";
      var leg = document.createElement("legend");
      leg.className = "questao-resposta__leg";
      leg.textContent = "Pergunta " + (idx + 1);
      fs.appendChild(leg);
      var p = document.createElement("div");
      p.className = "questao-resposta__enun conteudo-html questao-enunciado-conteudo";
      if (window.RichTextUtils && typeof window.RichTextUtils.sanitizeHtml === "function") {
        p.innerHTML = window.RichTextUtils.sanitizeHtml(q.enunciado || "");
      } else {
        p.textContent = q.enunciado || "";
      }
      fs.appendChild(p);
      var nome = "resp_" + q.id;
      (q.alternativas || []).forEach(function (alt, j) {
        var lab = document.createElement("label");
        lab.className = "questao-resposta__alt";
        var letra = String.fromCharCode(65 + j);
        lab.innerHTML =
          '<input type="radio" name="' +
          nome +
          '" value="' +
          j +
          '"> ' +
          "<span>" +
          letra +
          ") " +
          escapeHtml(alt) +
          "</span>";
        fs.appendChild(lab);
      });
      qContainer.appendChild(fs);
    });

    var form = area.querySelector("#form-resposta");
    var elProgTxt = document.getElementById("resp-progresso-texto");
    var elProgFill = document.getElementById("resp-progresso-fill");
    var elProgPct = document.getElementById("resp-progresso-pct");

    function coletarRespostasDoForm() {
      var respostas = [];
      atividade.questoes.forEach(function (q) {
        var nome = "resp_" + q.id;
        var sel = form.querySelector('input[name="' + nome + '"]:checked');
        if (sel) {
          respostas.push({
            questaoId: q.id,
            indiceEscolhido: parseInt(sel.value, 10),
          });
        }
      });
      return respostas;
    }

    function salvarRascunhoObjetiva() {
      var respostas = coletarRespostasDoForm();
      if (!respostas.length) return;
      salvarRascunhoResposta({
        formato: "multipla_escolha",
        respostas: respostas,
      });
    }

    function restaurarRascunhoObjetiva() {
      var draft = lerRascunhoResposta();
      if (!draft || draft.formato !== "multipla_escolha" || !Array.isArray(draft.respostas)) return;

      var limites = {};
      atividade.questoes.forEach(function (q) {
        limites[q.id] = (q.alternativas || []).length;
      });

      draft.respostas.forEach(function (r) {
        if (!r || !Object.prototype.hasOwnProperty.call(limites, r.questaoId)) return;
        var idx = r.indiceEscolhido;
        var max = limites[r.questaoId];
        if (typeof idx !== "number" || isNaN(idx) || idx < 0 || idx >= max) return;
        var nome = "resp_" + r.questaoId;
        var inp = form.querySelector('input[name="' + nome + '"][value="' + idx + '"]');
        if (inp) inp.checked = true;
      });
    }

    function atualizarProgressoResposta() {
      var n = 0;
      atividade.questoes.forEach(function (q) {
        var nome = "resp_" + q.id;
        if (form.querySelector('input[name="' + nome + '"]:checked')) n++;
      });
      var pct = totalQ > 0 ? Math.round((n / totalQ) * 100) : 0;
      if (elProgTxt) {
        elProgTxt.textContent =
          "Progresso: " + n + " de " + totalQ + " pergunta" + (totalQ !== 1 ? "s" : "") + " respondida" + (n !== 1 ? "s" : "");
      }
      if (elProgFill) elProgFill.style.width = pct + "%";
      if (elProgPct) elProgPct.textContent = pct + "%";
    }

    form.querySelectorAll('input[type="radio"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        salvarRascunhoObjetiva();
        atualizarProgressoResposta();
      });
    });

    restaurarRascunhoObjetiva();
    atualizarProgressoResposta();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = document.getElementById("resp-msg");
      var submit = document.getElementById("resp-submit");
      if (msg) {
        msg.textContent = "";
        msg.className = "form-painel__msg";
      }

      var respostasQuestoes = [];
      var ok = true;
      atividade.questoes.forEach(function (q) {
        var nome = "resp_" + q.id;
        var sel = form.querySelector('input[name="' + nome + '"]:checked');
        if (!sel) ok = false;
        else
          respostasQuestoes.push({
            questaoId: q.id,
            indiceEscolhido: parseInt(sel.value, 10),
          });
      });

      if (!ok) {
        if (msg) {
          msg.textContent = "Marque uma alternativa em cada pergunta.";
          msg.className = "form-painel__msg form-painel__msg--erro";
        }
        return;
      }

      var pont = S.corrigirAtividadeObjetiva(atividade, respostasQuestoes);

      RFS.salvar(F.db, {
        turmaId: sessao.turmaId,
        alunoNome: sessao.alunoNome,
        alunoDocId: sessao.alunoDocId,
        atividadeId: id,
        formato: "multipla_escolha",
        respostasQuestoes: respostasQuestoes,
        pontuacao: pont,
      })
        .then(function () {
          return RFS.obterPorTurmaAlunoDocAtividade(
            F.db,
            sessao.turmaId,
            sessao.alunoDocId,
            sessao.alunoNome,
            id
          );
        })
        .then(function (salva) {
          var enviadoEm = salva && salva.enviadoEm ? salva.enviadoEm : new Date().toISOString();
          limparRascunhoResposta();
          if (submit) submit.disabled = true;
          montarPainelResultado(pont, enviadoEm, atividade.gabaritoLiberado === true);
        })
        .catch(function (err) {
          if (msg) {
            var txt = "Não foi possível salvar sua resposta. Tente novamente.";
            if (err && err.code === "unavailable") txt = "Sem conexão. Verifique a internet e tente de novo.";
            if (err && err.code === "permission-denied") txt = "Permissão negada. Avise o professor.";
            msg.textContent = txt;
            msg.className = "form-painel__msg form-painel__msg--erro";
          }
        });
    });
  }

  function montarFormularioLegado() {
    area.innerHTML =
      '<section class="painel-bloco-texto">' +
      '<h2 class="painel-subtitulo">Pergunta</h2>' +
      '<p id="atv-pergunta" class="painel-pergunta"></p>' +
      "</section>" +
      '<form id="form-resposta" class="form-painel" novalidate>' +
      '<div class="field-painel">' +
      '<label for="resp-texto">Sua resposta</label>' +
      '<textarea id="resp-texto" name="resposta" rows="6" maxlength="4000" placeholder="Escreva sua interpretação..."></textarea>' +
      '<span class="field-painel__erro" id="resp-erro" role="alert"></span>' +
      "</div>" +
      '<p class="form-painel__msg" id="resp-msg" role="status" aria-live="polite"></p>' +
      '<div class="form-painel__acoes">' +
      '<a href="painel-aluno.html" class="btn-secundario">Voltar</a>' +
      '<button type="submit" class="btn-primario" id="resp-submit">Enviar resposta</button>' +
      "</div>" +
      "</form>";

    var pergunta = area.querySelector("#atv-pergunta");
    if (pergunta) pergunta.textContent = atividade.pergunta || "";

    var form = area.querySelector("#form-resposta");
    var ta = document.getElementById("resp-texto");

    function salvarRascunhoLegado() {
      if (!ta) return;
      var texto = ta.value;
      if (!String(texto).trim()) return;
      salvarRascunhoResposta({
        formato: "texto_livre",
        respostas: { texto: texto },
      });
    }

    function restaurarRascunhoLegado() {
      if (!ta) return;
      var draft = lerRascunhoResposta();
      if (!draft || draft.formato !== "texto_livre" || !draft.respostas) return;
      var txt = draft.respostas.texto != null ? String(draft.respostas.texto) : "";
      if (txt) ta.value = txt;
    }

    if (ta) {
      ta.addEventListener("input", salvarRascunhoLegado);
    }
    restaurarRascunhoLegado();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = document.getElementById("resp-msg");
      var submit = document.getElementById("resp-submit");
      var erro = document.getElementById("resp-erro");
      if (erro) erro.textContent = "";
      if (msg) {
        msg.textContent = "";
        msg.className = "form-painel__msg";
      }

      var textoResp = ta.value.trim();
      if (!textoResp) {
        if (erro) erro.textContent = "Escreva sua resposta.";
        if (msg) {
          msg.textContent = "Preencha o campo de resposta.";
          msg.className = "form-painel__msg form-painel__msg--erro";
        }
        return;
      }

      RFS.salvar(F.db, {
        turmaId: sessao.turmaId,
        alunoNome: sessao.alunoNome,
        alunoDocId: sessao.alunoDocId,
        atividadeId: id,
        formato: "texto_livre",
        texto: textoResp,
      })
        .then(function () {
          limparRascunhoResposta();
          if (submit) submit.disabled = true;
          area.innerHTML =
            '<div class="painel-alerta painel-alerta--ok">' +
            "<p><strong>Resposta enviada.</strong> Atividades dissertativas não geram nota automática aqui.</p>" +
            '<p class="painel-voltar-wrap"><a class="btn-responder" href="' +
            S.urls.painelAluno +
            '">Voltar às atividades</a></p>' +
            "</div>";
        })
        .catch(function (err) {
          if (msg) {
            var txt = "Não foi possível salvar sua resposta. Tente novamente.";
            if (err && err.code === "unavailable") txt = "Sem conexão. Verifique a internet e tente de novo.";
            if (err && err.code === "permission-denied") txt = "Permissão negada. Avise o professor.";
            msg.textContent = txt;
            msg.className = "form-painel__msg form-painel__msg--erro";
          }
        });
    });
  }

  function temResposta(r) {
    if (!r) return false;
    if (r.texto && String(r.texto).trim()) return true;
    if (r.respostasQuestoes && r.respostasQuestoes.length) return true;
    return false;
  }

  if (temResposta(existente)) {
    limparRascunhoResposta();
    if (existente.formato === "texto_livre" || (existente.texto && !existente.respostasQuestoes)) {
      montarJaRespondidoLegado();
    } else {
      montarJaRespondidoObjetiva(existente);
    }
    return;
  }

      if (atividade.questoes && atividade.questoes.length) {
        montarFormularioObjetiva();
      } else {
        montarFormularioLegado();
      }
    })
    .catch(function (err) {
      if (err && err.message === "sessao") return;
      if (blocoConteudo) blocoConteudo.hidden = true;
      if (blocoErro) {
        blocoErro.hidden = false;
        blocoErro.className = "painel-alerta painel-alerta--erro";
        blocoErro.textContent = "Não foi possível carregar a atividade.";
      }
    });
  }
})();
