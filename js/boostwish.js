var BoostWish = (function(){

  var $ = Utils.$;

  function wishBonus(n){
    if(n <= 0) return 0;
    var tiers = [[5, 20], [15, 15], [100, 10], [200, 5], [Infinity, 1]];
    var bonus = 0, prev = 0;
    for(var i = 0; i < tiers.length; i++){
      if(n <= prev) break;
      bonus += (Math.min(n, tiers[i][0]) - prev) * tiers[i][1];
      prev = tiers[i][0];
    }
    return bonus;
  }

  function starBonus(n){
    if(n <= 0) return 0;
    var tiers = [[100, 10], [200, 5], [Infinity, 1]];
    var bonus = 0, prev = 0;
    for(var i = 0; i < tiers.length; i++){
      if(n <= prev) break;
      bonus += (Math.min(n, tiers[i][0]) - prev) * tiers[i][1];
      prev = tiers[i][0];
    }
    return bonus;
  }

  function statCard(label, value, hint){
    return "<div class='stat-card'>" +
      "<div class='sc-label'>" + label + "</div>" +
      "<div class='sc-value'>" + value + "</div>" +
      "<div class='sc-hint'>" + hint + "</div></div>";
  }

  function spawnRate(wl, wbBadge, wbFirst, disabled, unclaimed, total, personalRare){
    var pool = unclaimed - disabled + Math.pow(1 - unclaimed / total, personalRare) * total;
    if(pool <= 0) return 0;
    return (wl * (1 + wbBadge / 100) + wbFirst / 100) / pool;
  }

  function atLeastKInN(p, k, n){
    if(p <= 0) return 0;
    if(p >= 1) return 1;
    var total = 0;
    for(var z = k; z <= n; z++){
      var logC = 0;
      for(var i = 1; i <= z; i++){
        logC += Math.log(n - z + i) - Math.log(i);
      }
      total += Math.exp(logC + z * Math.log(p) + (n - z) * Math.log(1 - p));
    }
    return Math.min(1, total);
  }

  function renderRate(){
    var wl = parseFloat($("srWishes").value) || 0;
    var wbBadge = parseFloat($("srBadgeBoost").value) || 0;
    var wbFirst = parseFloat($("srFirstBoost").value) || 0;
    var disabled = parseFloat($("srDisabled").value) || 0;
    var unclaimed = parseFloat($("srUnclaimed").value) || 0;
    var total = parseFloat($("srTotal").value) || 1;
    var pr = parseFloat($("srPersonalRare").value) || 0;
    var rolls = parseInt($("srRolls").value, 10) || 1;
    var wanted = parseInt($("srWanted").value, 10) || 1;

    var p = spawnRate(wl, wbBadge, wbFirst, disabled, unclaimed, total, pr);
    var pClamped = Math.max(0, Math.min(1, p));
    var multi = atLeastKInN(pClamped, wanted, rolls);

    var html = "";
    html += statCard("Chance par roll", (pClamped * 100).toFixed(3) + "%", "probabilité d'un wish sur un roll", "teal");
    html += statCard("Sur " + rolls + " rolls", (multi * 100).toFixed(2) + "%", "chance d'au moins " + wanted + " wish(es)", "purple");
    html += statCard("Wishes attendus", (pClamped * rolls).toFixed(2), "en moyenne sur " + rolls + " rolls", "orange");
    html += statCard("Rolls moyens", pClamped > 0 ? Math.round(1 / pClamped) : "∞", "pour obtenir un wish", "blue");
    $("srResult").innerHTML = html;
  }

  function renderOptimizer(){
    var totalRolls = parseInt($("bwTotalRolls").value, 10) || 0;
    var investable = parseInt($("bwInvestable").value, 10) || 0;
    var baseBonus = parseFloat($("bwBaseBonus").value) || 0;
    var current = parseInt($("bwCurrent").value, 10) || 0;

    if(totalRolls <= 0){
      alert("Renseigne un nombre de rolls par heure supérieur à zéro.");
      return;
    }
    investable = Math.min(investable, totalRolls - 1);

    var rows = [];
    var best = { n: 0, score: -1 };
    for(var n = 0; n <= investable; n++){
      var eff = totalRolls - n;
      var mult = 1 + baseBonus / 100 + wishBonus(n) / 100;
      var score = eff * mult;
      rows.push({ n: n, eff: eff, mult: mult, score: score });
      if(score > best.score) best = { n: n, score: score, mult: mult, eff: eff };
    }

    var none = rows[0];
    var currentRow = rows[Math.min(current, rows.length - 1)];
    var gainVsNone = (best.score / none.score - 1) * 100;
    var gainVsCurrent = (best.score / currentRow.score - 1) * 100;

    var html = "";
    html += statCard("Rolls à investir", best.n, "dans $bw, sur " + investable + " investissables", "orange");
    html += statCard("Rolls restants", best.eff + " / h", "non investis, toujours lancés", "teal");
    html += statCard("Bonus wishlist", "+" + wishBonus(best.n) + "%", "apporté par le boost", "purple");
    html += statCard("Multiplicateur", "x" + best.mult.toFixed(2), "sur le taux de spawn wishlist", "purple");
    html += statCard("Bonus starwish", "+" + starBonus(best.n) + "%", "effet secondaire du boost", "pink");
    html += statCard("Gain vs 0 roll", "+" + gainVsNone.toFixed(1) + "%", "sans aucun investissement", "teal");
    html += statCard("Gain vs actuel", (gainVsCurrent >= 0 ? "+" : "") + gainVsCurrent.toFixed(1) + "%",
      "contre tes " + current + " rolls actuels", gainVsCurrent >= 0 ? "teal" : "red");
    $("bwStats").innerHTML = html;
    $("bwCommand").textContent = "$bw " + best.n;

    var chart = $("bwChart");
    chart.innerHTML = "";
    var step = Math.max(1, Math.ceil(investable / 24));
    var marks = [];
    for(var m = 0; m <= investable; m += step) marks.push(m);
    if(marks.indexOf(best.n) === -1) marks.push(best.n);
    marks.sort(function(a, b){ return a - b; });

    marks.forEach(function(m){
      var row = rows[m];
      if(!row) return;
      var line = document.createElement("div");
      line.className = "bar-line" + (m === best.n ? " peak" : "");
      var lbl = document.createElement("div");
      lbl.className = "lbl";
      lbl.textContent = "$bw " + m;
      var bar = document.createElement("div");
      bar.className = "bar";
      var fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = (row.score / best.score * 100).toFixed(1) + "%";
      bar.appendChild(fill);
      var val = document.createElement("div");
      val.className = "val";
      val.textContent = (row.score / best.score * 100).toFixed(0) + "%";
      line.appendChild(lbl);
      line.appendChild(bar);
      line.appendChild(val);
      chart.appendChild(line);
    });

    $("bwResultCard").style.display = "block";
  }

  function init(){
    $("bwCalcBtn").addEventListener("click", renderOptimizer);
    $("bwCopyBtn").addEventListener("click", function(){
      Utils.copyText($("bwCommand").textContent, this);
    });
    $("srCalcBtn").addEventListener("click", renderRate);
    renderRate();
  }

  return { init: init };
})();
