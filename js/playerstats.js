var PlayerStats = (function(){

  var $ = Utils.$;

  var data = {};

  var FIELDS = [
    { key: "wishlistSlots",   label: "Slots de wishlist",        patterns: [/slots?\s+de\s+\$?wishlist/i, /\$?wishlist\s+slots?/i] },
    { key: "rollsPerHour",    label: "Rolls par heure",          patterns: [/rolls?\s+par\s+heure/i, /rolls?\s+per\s+hour/i] },
    { key: "wishlistBoost",   label: "Boost de spawn wishlist",  patterns: [/wishlist\s+spawn/i, /apparition.*wishlist/i, /spawn.*wishlist/i] },
    { key: "firstWishBoost",  label: "Boost première wish",      patterns: [/first\s*wish/i, /\$fw\b/i, /première\s+wish/i] },
    { key: "claimReset",      label: "Reset de claim",           patterns: [/claim\s+reset/i, /reset\s+de\s+claim/i] },
    { key: "rollsReset",      label: "Reset de rolls",           patterns: [/rolls?\s+reset/i, /reset\s+de\s+rolls?/i] },
    { key: "kakeraLoot",      label: "Kakera loot",              patterns: [/kakera\s+loot/i, /butin\s+kakera/i] },
    { key: "kakeraPower",     label: "Pouvoir (power)",          patterns: [/\bpouvoir\b/i, /\bpower\b/i] },
    { key: "powerCost",       label: "Coût en pouvoir",          patterns: [/co[uû]t\s+en\s+pouvoir/i, /power\s+cost/i, /consommation.*pouvoir/i] },
    { key: "kakeraValue",     label: "Valeur des kakera",        patterns: [/valeur.*kakera/i, /kakera\s+value/i] },
    { key: "dailyRolls",      label: "Rolls journaliers",        patterns: [/rolls?\s+journaliers?/i, /daily\s+rolls?/i] },
    { key: "starWishSlots",   label: "Slots de starwish",        patterns: [/starwish\s+slots?/i, /slots?\s+de\s+\$?starwish/i] },
    { key: "bonusRolls",      label: "Rolls bonus",              patterns: [/rolls?\s+bonus/i, /bonus\s+rolls?/i] }
  ];

  function parse(text){
    var found = {};
    var unmatched = [];

    text.split(/\r?\n/).forEach(function(rawLine){
      var line = rawLine.trim();
      if(!line) return;

      var m = line.match(/^(.*?)\s*[:：]\s*([+-]?\s*\d+(?:[.,]\d+)?)\s*(%?)/);
      if(!m){
        m = line.match(/^(.*?)\s+([+-]\s*\d+(?:[.,]\d+)?)\s*(%?)\s*$/);
      }
      if(!m){
        unmatched.push(line);
        return;
      }

      var label = m[1].trim();
      var value = parseFloat(m[2].replace(/\s+/g, "").replace(",", "."));
      var isPercent = m[3] === "%";
      if(isNaN(value)){
        unmatched.push(line);
        return;
      }

      var matchedKey = null;
      for(var i = 0; i < FIELDS.length; i++){
        for(var p = 0; p < FIELDS[i].patterns.length; p++){
          if(FIELDS[i].patterns[p].test(label)){
            matchedKey = FIELDS[i].key;
            break;
          }
        }
        if(matchedKey) break;
      }

      if(matchedKey){
        found[matchedKey] = { value: value, percent: isPercent, label: label };
      } else {
        found["extra:" + label] = { value: value, percent: isPercent, label: label, extra: true };
      }
    });

    return { found: found, unmatched: unmatched };
  }

  function get(key, fallback){
    return data[key] ? data[key].value : fallback;
  }

  var ACCENT = {
    wishlistSlots: "purple", rollsPerHour: "purple", wishlistBoost: "purple",
    firstWishBoost: "purple", bonusRolls: "purple",
    claimReset: "teal", rollsReset: "teal", dailyRolls: "teal",
    kakeraLoot: "orange", kakeraPower: "orange", powerCost: "orange", kakeraValue: "orange",
    starWishSlots: "pink"
  };

  function statCard(label, value){
    return "<div class='stat-card'>" +
      "<div class='sc-label'>" + label + "</div>" +
      "<div class='sc-value'>" + value + "</div></div>";
  }

  function render(result){
    var box = $("statsResult");
    box.innerHTML = "";

    var known = FIELDS.filter(function(f){ return result.found[f.key]; });
    var extras = Object.keys(result.found).filter(function(k){ return result.found[k].extra; });

    if(!known.length && !extras.length){
      box.innerHTML = "<p class='hint' style='grid-column:1/-1'>Aucune valeur reconnue. Le parseur attend des lignes du type « Rolls par heure : +7 ».</p>";
      return;
    }

    var html = "";
    known.forEach(function(f){
      var entry = result.found[f.key];
      var value = (entry.value >= 0 ? "+" : "") + entry.value + (entry.percent ? "%" : "");
      html += statCard(f.label, value, ACCENT[f.key]);
    });
    box.innerHTML = html;

    if(extras.length){
      var extraWrap = document.createElement("div");
      extraWrap.style.gridColumn = "1 / -1";
      extraWrap.style.marginTop = "8px";
      var title = document.createElement("p");
      title.className = "hint";
      title.textContent = "Autres lignes détectées (conservées mais non utilisées) :";
      extraWrap.appendChild(title);
      extras.forEach(function(k){
        var entry = result.found[k];
        var row = document.createElement("div");
        row.className = "stat-row";
        var left = document.createElement("span");
        left.textContent = entry.label;
        var right = document.createElement("b");
        right.style.color = "var(--text-dim)";
        right.textContent = (entry.value >= 0 ? "+" : "") + entry.value + (entry.percent ? "%" : "");
        row.appendChild(left);
        row.appendChild(right);
        extraWrap.appendChild(row);
      });
      box.appendChild(extraWrap);
    }

    if(result.unmatched.length){
      var un = document.createElement("p");
      un.className = "hint";
      un.style.gridColumn = "1 / -1";
      un.style.marginTop = "4px";
      un.textContent = result.unmatched.length + " ligne(s) sans valeur numérique ignorée(s).";
      box.appendChild(un);
    }
  }

  function applyEverywhere(){
    var applied = [];

    var slots = get("wishlistSlots", null);
    if(slots !== null){
      $("wishSlotLimit").value = slots;
      applied.push("limite de wishlist (" + slots + ")");
    }

    var rolls = get("rollsPerHour", null);
    if(rolls !== null){
      $("bwTotalRolls").value = rolls;
      $("srRolls").value = rolls;
      applied.push("rolls par heure (" + rolls + ")");
    }

    var boost = get("wishlistBoost", null);
    if(boost !== null){
      $("bwBaseBonus").value = boost;
      $("srBadgeBoost").value = boost;
      applied.push("boost wishlist (" + boost + "%)");
    }

    var fw = get("firstWishBoost", null);
    if(fw !== null){
      $("srFirstBoost").value = fw;
      applied.push("boost première wish (" + fw + "%)");
    }

    var bonusRolls = get("bonusRolls", null);
    if(bonusRolls !== null){
      $("bwInvestable").value = bonusRolls;
      applied.push("rolls bonus investissables (" + bonusRolls + ")");
    }

    if(!applied.length){
      Utils.setStatus($("statsStatus"),
        "Rien à propager : aucune des valeurs reconnues ne correspond à un champ des autres onglets.", "warn");
      return;
    }

    Utils.setStatus($("statsStatus"),
      "Propagé vers les autres onglets : " + applied.join(", ") + ".", "ok");
  }

  function init(){
    $("statsParseBtn").addEventListener("click", function(){
      var result = parse($("statsInput").value);
      data = result.found;
      render(result);
      var count = Object.keys(result.found).length;
      Utils.setStatus($("statsStatus"),
        count + " valeur(s) extraite(s).", count ? "ok" : "error");
    });

    $("statsApplyBtn").addEventListener("click", applyEverywhere);
  }

  return {
    init: init,
    get: get,
    all: function(){ return data; }
  };
})();
