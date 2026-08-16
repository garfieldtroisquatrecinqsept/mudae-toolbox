var Solvers = (function(){

  var $ = Utils.$;

  var COLOR_VAR = {
    blue: "var(--blue)",
    teal: "var(--teal)",
    green: "var(--green)",
    yellow: "var(--yellow)",
    orange: "var(--orange)",
    red: "var(--red)",
    purple: "var(--purple)",
    rare: "var(--pink)"
  };

  function miniStat(label, value){
    return "<div class='stat-card'>" +
      "<div class='sc-label'>" + label + "</div>" +
      "<div class='sc-value'>" + value + "</div></div>";
  }

  function updateCell(btn, value){
    if(value === null || value === undefined){
      btn.style.background = "";
      btn.textContent = "";
      btn.classList.remove("candidate", "best");
    } else {
      btn.style.background = COLOR_VAR[value] || "";
    }
  }

  function buildGrid(container, cycle, state, onChange){
    container.innerHTML = "";
    for(var i = 0; i < 25; i++){
      (function(i){
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        updateCell(btn, state[i]);
        btn.addEventListener("click", function(){
          var idx = cycle.indexOf(state[i]);
          state[i] = cycle[(idx + 1) % cycle.length];
          updateCell(btn, state[i]);
          onChange();
        });
        btn.addEventListener("contextmenu", function(e){
          e.preventDefault();
          var idx = cycle.indexOf(state[i]);
          state[i] = cycle[(idx - 1 + cycle.length) % cycle.length];
          updateCell(btn, state[i]);
          onChange();
        });
        container.appendChild(btn);
      })(i);
    }
  }

  /* ---- $ourochest : modèle probabiliste ----
     Les couleurs ne sont PAS une fonction déterministe de la position.
     Le jeu place 1 rouge (jamais au centre), puis TIRE AU SORT :
       - 2 oranges parmi les cases adjacentes à la rouge
       - 3 jaunes  parmi les cases de ses diagonales (à n'importe quelle distance)
       - 4 vertes  parmi les cases de sa ligne/colonne, hors oranges
       - cyan : le reste des lignes, colonnes et diagonales
       - bleu : tout ce qui n'est ni ligne, ni colonne, ni diagonale
     Seuls le rouge et le bleu sont donc certains. Une case adjacente à la
     rouge n'est orange que 2 fois sur le nombre de ses voisines : c'est ce
     qui manquait, et qui faussait les probabilités affichées.
     Dans une grille 5x5 chaque case a toujours 4 autres cases sur sa ligne
     et 4 sur sa colonne, donc |ligne+colonne| vaut toujours 8. */

  function ocRelation(x, red){
    if(x === red) return "self";
    var xr = Math.floor(x / 5), xc = x % 5;
    var rr = Math.floor(red / 5), rc = red % 5;
    var dr = xr - rr, dc = xc - rc;
    if(dr === 0 || dc === 0){
      return Math.max(Math.abs(dr), Math.abs(dc)) === 1 ? "orth" : "line";
    }
    if(Math.abs(dr) === Math.abs(dc)) return "diag";
    return "off";
  }

  var ocCountCache = {};
  function ocCounts(red){
    if(ocCountCache[red]) return ocCountCache[red];
    var orth = 0, diag = 0;
    for(var i = 0; i < 25; i++){
      var rel = ocRelation(i, red);
      if(rel === "orth") orth++;
      else if(rel === "diag") diag++;
    }
    return (ocCountCache[red] = { orth: orth, diag: diag, line: 8 });
  }

  // P(la case x affiche `color` | la rouge est en `red`)
  function ocLikelihood(x, red, color){
    var rel = ocRelation(x, red);
    var n = ocCounts(red);

    if(rel === "self") return color === "red" ? 1 : 0;
    if(rel === "off")  return color === "blue" ? 1 : 0;

    if(rel === "diag"){
      if(color === "yellow") return 3 / n.diag;
      if(color === "teal")   return (n.diag - 3) / n.diag;
      return 0;
    }

    // sur la ligne/colonne : 2 oranges tirées, puis 4 vertes parmi les 6 restantes
    var rest = n.line - 2;
    var pGreen = 4 / rest;
    var pTeal  = (rest - 4) / rest;

    if(rel === "orth"){
      var pOrange = 2 / n.orth;
      var notOrange = 1 - pOrange;
      if(color === "orange") return pOrange;
      if(color === "green")  return notOrange * pGreen;
      if(color === "teal")   return notOrange * pTeal;
      return 0;
    }

    if(color === "green") return pGreen;
    if(color === "teal")  return pTeal;
    return 0;
  }

  /* Distribution de probabilité de la position de la rouge, sachant les
     cases déjà révélées. Les positions ne sont plus équiprobables. */
  function ocPosterior(grid){
    var weights = new Array(25).fill(0), total = 0;
    for(var red = 0; red < 25; red++){
      if(red === 12) continue;              // la rouge n'est jamais au centre
      var l = 1;
      for(var x = 0; x < 25 && l > 0; x++){
        if(grid[x] === null) continue;
        l *= ocLikelihood(x, red, grid[x]);
      }
      weights[red] = l;
      total += l;
    }
    if(total <= 0) return weights;
    return weights.map(function(w){ return w / total; });
  }

  function ocSolve(grid){
    var p = ocPosterior(grid);
    var out = [];
    for(var i = 0; i < 25; i++) if(p[i] > 1e-12) out.push(i);
    return out;
  }

  /* Meilleur clic : celui qui minimise le nombre de clics attendu jusqu'à
     toucher la rouge. Recherche en profondeur limitée — la recommandation
     est identique en profondeur 2, 3 et 4, seule l'estimation du nombre de
     clics s'affine, donc on garde la plus rapide. */
  var OC_COLORS = ["orange", "yellow", "green", "teal", "blue"];

  function ocExpected(belief, depth){
    var live = belief.filter(function(b){ return b.w > 1e-12; });
    if(live.length <= 1) return { clicks: 1, move: live.length ? live[0].i : null };
    if(depth <= 0) return { clicks: 1 + live.length, move: live[0].i };

    var bestMove = null, bestClicks = Infinity;
    for(var i = 0; i < 25; i++){
      var pRed = 0;
      for(var b = 0; b < live.length; b++) if(live[b].i === i) pRed = live[b].w;

      var expected = 1, informative = false;
      for(var c = 0; c < OC_COLORS.length; c++){
        var sub = [], mass = 0;
        for(var k = 0; k < live.length; k++){
          var l = ocLikelihood(i, live[k].i, OC_COLORS[c]);
          if(l > 0){
            var w = live[k].w * l;
            sub.push({ i: live[k].i, w: w });
            mass += w;
          }
        }
        if(mass <= 1e-12) continue;
        if(sub.length < live.length) informative = true;
        for(var s = 0; s < sub.length; s++) sub[s].w /= mass;
        expected += mass * ocExpected(sub, depth - 1).clicks;
      }

      // un clic qui n'apprend rien et ne peut pas gagner est inutile
      if(!informative && pRed <= 1e-12) continue;
      if(expected < bestClicks - 1e-12){
        bestClicks = expected;
        bestMove = i;
      }
    }
    return { clicks: bestClicks, move: bestMove };
  }

  function ocBestMove(grid){
    var p = ocPosterior(grid);
    var belief = [];
    for(var i = 0; i < 25; i++) if(p[i] > 1e-12) belief.push({ i: i, w: p[i] });
    if(!belief.length) return null;
    var depth = belief.length > 8 ? 2 : 3;
    return ocExpected(belief, depth).move;
  }

  function oqNeighbors(idx){
    var r = Math.floor(idx / 5), c = idx % 5, out = [];
    for(var dr = -1; dr <= 1; dr++){
      for(var dc = -1; dc <= 1; dc++){
        if(dr === 0 && dc === 0) continue;
        var nr = r + dr, nc = c + dc;
        if(nr >= 0 && nr < 5 && nc >= 0 && nc < 5) out.push(nr * 5 + nc);
      }
    }
    return out;
  }

  function oqBucket(n){
    if(n === 0) return "blue";
    if(n === 1) return "teal";
    if(n === 2) return "green";
    if(n === 3) return "yellow";
    return "orange";
  }

  function oqSolve(revealed){
    var total = 0;
    var purpleCount = new Array(25).fill(0);
    var keys = Object.keys(revealed).map(Number);
    for(var i = 0; i < 25; i++){
      for(var j = i + 1; j < 25; j++){
        for(var k = j + 1; k < 25; k++){
          for(var l = k + 1; l < 25; l++){
            var set = {};
            set[i] = true; set[j] = true; set[k] = true; set[l] = true;
            var ok = true;
            for(var m = 0; m < keys.length && ok; m++){
              var cell = keys[m], info = revealed[cell];
              if(info.purple){
                if(!set[cell]) ok = false;
              } else if(set[cell]){
                ok = false;
              } else {
                var count = 0;
                oqNeighbors(cell).forEach(function(n){ if(set[n]) count++; });
                if(oqBucket(count) !== info.color) ok = false;
              }
            }
            if(ok){
              total++;
              purpleCount[i]++; purpleCount[j]++; purpleCount[k]++; purpleCount[l]++;
            }
          }
        }
      }
    }
    return { total: total, purpleCount: purpleCount };
  }

  var oqState = new Array(25).fill(null);
  var ocState = new Array(25).fill(null);
  var otState = new Array(25).fill(null);

  var oqCycle = [null, "blue", "teal", "green", "yellow", "orange", "purple"];
  var ocCycle = [null, "blue", "teal", "green", "yellow", "orange", "red"];
  var otCycle = [null, "blue", "teal", "green", "yellow", "rare"];

  function renderOq(){
    var revealed = {}, nonPurple = 0, purples = 0;
    for(var i = 0; i < 25; i++){
      if(oqState[i] === "purple"){
        revealed[i] = { purple: true };
        purples++;
      } else if(oqState[i] !== null){
        revealed[i] = { purple: false, color: oqState[i] };
        nonPurple++;
      }
    }
    var clicks = nonPurple + (purples === 4 ? 1 : 0);
    var result = oqSolve(revealed);

    var html = "<div class='stat-grid'>";
    html += miniStat("Essais utilisés", clicks + " / 7", "teal");
    html += miniStat("Violettes trouvées", Math.min(purples, 3) + " / 3" + (purples >= 4 ? " (+1 rouge)" : ""), "purple");
    html += miniStat("Configurations", result.total, "orange");
    html += "</div>";

    if(purples === 3){
      html += "<div style='color:var(--orange-ink);margin-top:10px;'>La prochaine sphère trouvée devient rouge (150 points) et coûtera un essai.</div>";
    }

    document.querySelectorAll("#oqGrid .cell").forEach(function(cell){
      cell.classList.remove("best");
      cell.textContent = "";
    });

    if(result.total === 0){
      html += "<div style='color:var(--red-ink);margin-top:8px;'>Aucune configuration ne correspond, vérifie tes couleurs.</div>";
    } else if(purples < 4){
      var probs = [];
      for(var idx = 0; idx < 25; idx++){
        if(oqState[idx] === null){
          probs.push({ idx: idx, p: result.purpleCount[idx] / result.total });
        }
      }
      probs.sort(function(a, b){ return b.p - a.p; });

      document.querySelectorAll("#oqGrid .cell").forEach(function(cell, idx){
        if(oqState[idx] !== null) return;
        var entry = probs.filter(function(p){ return p.idx === idx; })[0];
        if(entry) cell.textContent = Math.round(entry.p * 100) + "%";
      });
      if(probs.length) {
        document.querySelectorAll("#oqGrid .cell")[probs[0].idx].classList.add("best");
      }

      html += "<div style='margin-top:8px;'>Meilleures cases :</div>";
      probs.slice(0, 5).forEach(function(p){
        html += "<div class='prob-row'><span>Ligne " + (Math.floor(p.idx / 5) + 1) +
          ", colonne " + (p.idx % 5 + 1) + "</span><span>" + Math.round(p.p * 100) + "%</span></div>";
      });
    } else {
      html += "<div style='color:var(--teal-ink);margin-top:8px;'>Les 4 sphères ont été trouvées.</div>";
    }
    $("oqResult").innerHTML = html;
  }

  function renderOc(){
    var clicks = 0;
    for(var i = 0; i < 25; i++) if(ocState[i] !== null) clicks++;
    var probs = ocPosterior(ocState);
    var candidates = ocSolve(ocState);

    var html = "<div class='stat-grid'>";
    html += miniStat("Clics utilisés", clicks + " / 5", "teal");
    html += miniStat("Positions possibles", candidates.length + " / 24", "orange");
    html += "</div>";

    // les positions ne sont pas équiprobables : chaque case affiche sa
    // propre probabilité, issue du tirage des couleurs
    document.querySelectorAll("#ocGrid .cell").forEach(function(cell, idx){
      cell.classList.remove("candidate", "best");
      cell.textContent = "";
      if(ocState[idx] === null && probs[idx] > 1e-12){
        cell.classList.add("candidate");
        cell.textContent = (probs[idx] * 100).toFixed(1) + "%";
      }
    });

    if(candidates.length === 0){
      html += "<div style='color:var(--red-ink);margin-top:8px;'>Aucune position ne correspond à ces couleurs, vérifie tes saisies.</div>";
    } else if(candidates.length === 1){
      html += "<div style='color:var(--teal-ink);margin-top:8px;'>La sphère rouge est en ligne " +
        (Math.floor(candidates[0] / 5) + 1) + ", colonne " + (candidates[0] % 5 + 1) + ".</div>";
      document.querySelectorAll("#ocGrid .cell")[candidates[0]].classList.add("best");
    } else {
      var move = ocBestMove(ocState);
      if(move !== null){
        html += "<div style='margin-top:6px;'>Prochain clic conseillé : <b>ligne " +
          (Math.floor(move / 5) + 1) + ", colonne " + (move % 5 + 1) + "</b></div>";
        document.querySelectorAll("#ocGrid .cell")[move].classList.add("best");
      }

      var ranked = [];
      for(var j = 0; j < 25; j++) if(probs[j] > 1e-12) ranked.push({ idx: j, p: probs[j] });
      ranked.sort(function(a, b){ return b.p - a.p; });
      html += "<div style='margin-top:8px;'>Positions les plus probables :</div>";
      ranked.slice(0, 5).forEach(function(e){
        html += "<div class='prob-row'><span>Ligne " + (Math.floor(e.idx / 5) + 1) +
          ", colonne " + (e.idx % 5 + 1) + "</span><span>" + (e.p * 100).toFixed(1) + "%</span></div>";
      });
    }
    $("ocResult").innerHTML = html;
  }

  function renderOt(){
    var blues = 0, colored = 0;
    for(var i = 0; i < 25; i++){
      if(otState[i] === "blue") blues++;
      else if(otState[i] !== null) colored++;
    }
    var budget = parseInt($("otBudget").value, 10) || 4;

    var html = "<div class='stat-grid'>";
    html += miniStat("Clics bleus", blues + " / " + budget, "teal");
    html += miniStat("Cases colorées", colored, "orange");
    html += "</div>";
    if(colored < 5){
      html += "<div style='color:var(--teal-ink);margin-top:6px;'>Règle de grâce active jusqu'à 5 cases colorées trouvées.</div>";
    }
    if(blues >= budget){
      html += "<div style='color:var(--orange-ink);margin-top:8px;'>Budget de clics bleus atteint.</div>";
    }
    $("otResult").innerHTML = html;
  }

  function init(){
    document.querySelectorAll("#solverTabs .solver-tab").forEach(function(btn){
      btn.addEventListener("click", function(){
        document.querySelectorAll("#solverTabs .solver-tab").forEach(function(b){
          b.classList.remove("active");
        });
        document.querySelectorAll(".solver-panel").forEach(function(p){
          p.style.display = "none";
        });
        btn.classList.add("active");
        $("solver-" + btn.dataset.solver).style.display = "block";
      });
    });

    buildGrid($("oqGrid"), oqCycle, oqState, renderOq);
    buildGrid($("ocGrid"), ocCycle, ocState, renderOc);
    buildGrid($("otGrid"), otCycle, otState, renderOt);
    renderOq();
    renderOc();
    renderOt();

    $("oqResetBtn").addEventListener("click", function(){
      oqState.fill(null);
      buildGrid($("oqGrid"), oqCycle, oqState, renderOq);
      renderOq();
    });
    $("ocResetBtn").addEventListener("click", function(){
      ocState.fill(null);
      buildGrid($("ocGrid"), ocCycle, ocState, renderOc);
      renderOc();
    });
    $("otResetBtn").addEventListener("click", function(){
      otState.fill(null);
      buildGrid($("otGrid"), otCycle, otState, renderOt);
      renderOt();
    });
    $("otBudget").addEventListener("input", renderOt);
  }

  return { init: init };
})();
