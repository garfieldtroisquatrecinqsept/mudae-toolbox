var BoostWish = (function(){

  var $ = Utils.$;

  /* Boost de spawn wishlist gagné par roll investi, rendement dégressif. */
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

  /* Boost star wish (le personnage en tête de wishlist) gagné en parallèle. */
  function starWishBonus(n){
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

  /* Un nombre de wishes attendus est souvent bien en dessous de 1 :
     un arrondi fixe à 2 décimales afficherait « 0.01 contre 0.01 »
     et masquerait totalement l'écart qu'on cherche à comparer. */
  function fmtWishes(x){
    if(x >= 10) return x.toFixed(1);
    if(x >= 1) return x.toFixed(2);
    if(x > 0) return x.toPrecision(3);
    return "0";
  }

  function everyNRolls(expected, rollsLeft){
    if(expected <= 0) return "jamais à ce rythme";
    var rolls = Math.round(rollsLeft / expected);
    var hours = Math.round(1 / expected);
    return "≈ 1 wish tous les " + rolls + " rolls (" + hours + " h)";
  }

  function statCard(label, value, hint){
    return "<div class='stat-card'>" +
      "<div class='sc-label'>" + label + "</div>" +
      "<div class='sc-value'>" + value + "</div>" +
      "<div class='sc-hint'>" + hint + "</div></div>";
  }

  /* Probabilité qu'un roll donné soit un wish. Le boost star wish entre
     comme terme additif (il ne concerne qu'un personnage), le boost
     wishlist multiplie l'ensemble de la liste. */
  function spawnRate(wl, wbWishlist, wbStar, disabled, unclaimed, total, personalRare, wishProtection){
    var pool = unclaimed - disabled + Math.pow(1 - unclaimed / total, personalRare) * total;
    var protection = wishProtection > 0 ? 1 / wishProtection : 0;
    if(pool <= 0) return protection;
    return (wl * (1 + wbWishlist / 100) + wbStar / 100) / pool + protection;
  }

  /* Arbitrage : investir monte la chance par roll mais retire des rolls.
     On maximise donc le nombre de wishes attendus = chance x rolls restants. */
  function optimize(cfg){
    var rows = [], best = null;
    for(var i = 0; i <= cfg.investable; i++){
      var wbW = cfg.wbWishlistBase + wishBonus(i);
      var wbS = cfg.wbStarBase + starWishBonus(i);
      var p = spawnRate(cfg.wl, wbW, wbS, cfg.disabled, cfg.unclaimed,
                        cfg.total, cfg.pr, cfg.wishProtection);
      var pClamped = Math.max(0, Math.min(1, p));
      var rollsLeft = cfg.totalRolls - i;
      var row = {
        i: i, wbW: wbW, wbS: wbS, p: pClamped,
        rollsLeft: rollsLeft, expected: pClamped * rollsLeft
      };
      rows.push(row);
      if(!best || row.expected > best.expected) best = row;
    }
    var none = rows[0];
    return {
      rows: rows, best: best, none: none,
      gain: none.expected > 0 ? (best.expected / none.expected - 1) * 100 : 0
    };
  }

  /* Rejoue le calcul avec un autre nombre de rolls bonus. Ces rolls font
     partie du total : en gagner davantage augmente aussi les rolls
     disponibles, d'où le recalcul de totalRolls à partir des rolls non
     bonus (base = total - bonus). */
  function withBonusRolls(cfg, bonus){
    var baseRolls = cfg.totalRolls - cfg.investable;
    return {
      wl: cfg.wl, wbWishlistBase: cfg.wbWishlistBase, wbStarBase: cfg.wbStarBase,
      disabled: cfg.disabled, unclaimed: cfg.unclaimed, total: cfg.total,
      pr: cfg.pr, wishProtection: cfg.wishProtection,
      totalRolls: baseRolls + bonus, investable: bonus
    };
  }

  /* À partir de combien de rolls bonus $bw dépasse-t-il le seuil visé ?
     C'est le levier dominant : plus tu peux investir, plus le boost
     acheté compense les rolls sacrifiés. La taille de la wishlist joue
     beaucoup moins (son effet plafonne vite). */
  function bonusRollsThreshold(cfg, targetGain){
    for(var b = cfg.investable + 1; b <= 400; b++){
      if(optimize(withBonusRolls(cfg, b)).gain >= targetGain) return b;
    }
    return null;
  }

  var WORTH_IT = 10;   // seuil de gain, en %, à partir duquel $bw vaut le détour

  /* Verdict en langage clair : est-ce que ça vaut le coup maintenant, et
     sinon à partir de quelle taille de wishlist ça le devient. */
  function renderVerdict(cfg, gain, best){
    var el = $("bwStatus");

    if(best.i === 0){
      Utils.setStatus(el,
        "N'investis rien. Chaque roll placé dans $bw te coûte plus qu'il ne te rapporte.", "warn");
      return;
    }

    if(gain >= WORTH_IT){
      Utils.setStatus(el,
        "Ça vaut le coup : $bw " + best.i + " te rapporte " + gain.toFixed(0) +
        "% de wishes en plus.", "ok");
      return;
    }

    var needed = bonusRollsThreshold(cfg, WORTH_IT);
    var msg = "Pas vraiment rentable : +" + gain.toFixed(1) + "% seulement. ";
    if(needed){
      msg += "$bw dépasse +" + WORTH_IT + "% à partir d'environ " + needed +
             " rolls bonus investissables (tu en as " + cfg.investable + ").";
    } else {
      msg += "Ton boost wishlist est déjà si élevé que $bw n'y ajoute plus grand-chose.";
    }
    Utils.setStatus(el, msg, "warn");
  }

  function renderOptimizer(){
    var wl = parseFloat($("srWishes").value) || 0;
    var wbWishlistBase = parseFloat($("srBadgeBoost").value) || 0;
    var wbStarBase = parseFloat($("srStarBoost").value) || 0;
    var disabled = parseFloat($("srDisabled").value) || 0;
    var unclaimed = parseFloat($("srUnclaimed").value) || 0;
    var total = parseFloat($("srTotal").value) || 1;
    var pr = parseFloat($("srPersonalRare").value) || 0;
    var wishProtection = parseFloat($("srWishProtection").value) || 0;
    var totalRolls = parseInt($("srRolls").value, 10) || 0;

    var investable = parseInt($("bwInvestable").value, 10) || 0;
    var current = parseInt($("bwCurrent").value, 10) || 0;

    if(totalRolls <= 0){
      Utils.setStatus($("bwStatus"),
        "Renseigne tes rolls disponibles dans Mes stats (ou dans les réglages avancés).", "error");
      return;
    }
    investable = Math.max(0, Math.min(investable, totalRolls));

    var cfg = {
      wl: wl, wbWishlistBase: wbWishlistBase, wbStarBase: wbStarBase,
      disabled: disabled, unclaimed: unclaimed, total: total,
      pr: pr, wishProtection: wishProtection,
      totalRolls: totalRolls, investable: investable
    };

    var res = optimize(cfg);
    var rows = res.rows, best = res.best, none = res.none, gain = res.gain;
    var currentRow = rows[Math.min(current, rows.length - 1)];
    var gainVsCurrent = currentRow.expected > 0 ? (best.expected / currentRow.expected - 1) * 100 : 0;

    var html = "";
    html += statCard("Rolls à investir", best.i, "sur " + investable + " investissables");
    html += statCard("Wishes attendus", fmtWishes(best.expected),
      everyNRolls(best.expected, best.rollsLeft));
    html += statCard("Chance par roll", (best.p * 100).toFixed(3) + "%",
      "sur " + best.rollsLeft + " rolls restants");
    html += statCard("Gain", "+" + gain.toFixed(gain < 10 ? 1 : 0) + "%",
      current > 0 ? (gainVsCurrent >= 0 ? "+" : "") + gainVsCurrent.toFixed(1) + "% vs tes " + current + " actuels"
                  : "contre " + fmtWishes(none.expected) + " sans investir");
    $("bwStats").innerHTML = html;

    $("bwCommand").textContent = "$bw " + best.i;
    $("bwBoosts").textContent =
      "Boost wishlist +" + best.wbW + "% (dont +" + wishBonus(best.i) + "% via $bw) · " +
      "boost star wish +" + best.wbS + "% (dont +" + starWishBonus(best.i) + "%)";

    var chart = $("bwChart");
    chart.innerHTML = "";
    var step = Math.max(1, Math.ceil(investable / 24));
    var marks = [];
    for(var m = 0; m <= investable; m += step) marks.push(m);
    if(marks.indexOf(best.i) === -1) marks.push(best.i);
    marks.sort(function(a, b){ return a - b; });

    marks.forEach(function(m){
      var row = rows[m];
      if(!row) return;
      var ratio = best.expected > 0 ? row.expected / best.expected : 0;
      var line = document.createElement("div");
      line.className = "bar-line" + (m === best.i ? " peak" : "");
      var lbl = document.createElement("div");
      lbl.className = "lbl";
      lbl.textContent = "$bw " + m;
      var bar = document.createElement("div");
      bar.className = "bar";
      var fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = (ratio * 100).toFixed(1) + "%";
      bar.appendChild(fill);
      var val = document.createElement("div");
      val.className = "val";
      val.textContent = fmtWishes(row.expected);
      line.appendChild(lbl);
      line.appendChild(bar);
      line.appendChild(val);
      chart.appendChild(line);
    });

    renderVerdict(cfg, gain, best);
    $("bwResultCard").style.display = "block";
  }

  function init(){
    $("bwCalcBtn").addEventListener("click", renderOptimizer);
    $("bwCopyBtn").addEventListener("click", function(){
      Utils.copyText($("bwCommand").textContent, this);
    });
  }

  return { init: init };
})();
