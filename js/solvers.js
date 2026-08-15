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

  function ocColorFor(r, c, rr, rc){
    var dr = r - rr, dc = c - rc;
    if(dr === 0 && dc === 0) return "red";
    var chebyshev = Math.max(Math.abs(dr), Math.abs(dc));
    if(chebyshev === 1){
      return (Math.abs(dr) === 1 && Math.abs(dc) === 1) ? "yellow" : "orange";
    }
    if(dr === 0 || dc === 0) return "green";
    if(Math.abs(dr) === Math.abs(dc)) return "teal";
    return "blue";
  }

  function ocCandidatePositions(){
    var all = [];
    for(var i = 0; i < 25; i++) all.push(i);
    if($("ocExcludeCenter").checked){
      return all.filter(function(i){ return i !== 12; });
    }
    return all;
  }

  function ocSolve(grid){
    return ocCandidatePositions().filter(function(pos){
      var rr = Math.floor(pos / 5), rc = pos % 5;
      for(var r = 0; r < 5; r++){
        for(var c = 0; c < 5; c++){
          var idx = r * 5 + c;
          if(grid[idx] === null) continue;
          if(ocColorFor(r, c, rr, rc) !== grid[idx]) return false;
        }
      }
      return true;
    });
  }

  function ocBestMove(grid, candidates){
    var best = null, bestScore = Infinity;
    for(var i = 0; i < 25; i++){
      if(grid[i] !== null) continue;
      var r = Math.floor(i / 5), c = i % 5;
      var groups = {};
      candidates.forEach(function(cand){
        var color = ocColorFor(r, c, Math.floor(cand / 5), cand % 5);
        groups[color] = (groups[color] || 0) + 1;
      });
      var worst = 0;
      Object.keys(groups).forEach(function(k){
        if(groups[k] > worst) worst = groups[k];
      });
      if(worst < bestScore){
        bestScore = worst;
        best = i;
      }
    }
    return best;
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
    var candidates = ocSolve(ocState);
    var pool = ocCandidatePositions().length;

    var html = "<div class='stat-grid'>";
    html += miniStat("Clics utilisés", clicks + " / 5", "teal");
    html += miniStat("Positions possibles", candidates.length + " / " + pool, "orange");
    html += "</div>";

    document.querySelectorAll("#ocGrid .cell").forEach(function(cell, idx){
      cell.classList.remove("candidate", "best");
      cell.textContent = "";
      if(ocState[idx] === null && candidates.indexOf(idx) !== -1){
        cell.classList.add("candidate");
        cell.textContent = Math.round(100 / candidates.length) + "%";
      }
    });

    if(candidates.length === 0){
      html += "<div style='color:var(--red-ink);margin-top:8px;'>Aucune position ne correspond à ces couleurs, vérifie tes saisies.</div>";
    } else if(candidates.length === 1){
      html += "<div style='color:var(--teal-ink);margin-top:8px;'>La sphère rouge est en ligne " +
        (Math.floor(candidates[0] / 5) + 1) + ", colonne " + (candidates[0] % 5 + 1) + ".</div>";
      document.querySelectorAll("#ocGrid .cell")[candidates[0]].classList.add("best");
    } else {
      var best = ocBestMove(ocState, candidates);
      if(best !== null){
        html += "<div style='margin-top:6px;'>Prochain clic conseillé : <b>ligne " +
          (Math.floor(best / 5) + 1) + ", colonne " + (best % 5 + 1) + "</b></div>";
        document.querySelectorAll("#ocGrid .cell")[best].classList.add("best");
      }
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
    $("ocExcludeCenter").addEventListener("change", renderOc);
    $("otBudget").addEventListener("input", renderOt);
  }

  return { init: init };
})();
