var PlayerStats = (function(){

  var $ = Utils.$;

  var data = {};
  var store = Utils.createStore("mudae-stats", { maxHistory: 5 });

  /* ---- $bonus : le seul format dont la structure est connue
     (lignes « Libellé : +valeur »). Les autres commandes sont
     analysées de façon tolérante, voir plus bas. ---- */
  var FIELDS = [
    { key: "wishlistSlots",   label: "Slots de wishlist",        patterns: [/slots?\s+de\s+\$?wishlist/i, /\$?wishlist\s+slots?/i] },
    { key: "rollsPerHour",    label: "Rolls par heure",          patterns: [/rolls?\s+par\s+heure/i, /rolls?\s+per\s+hour/i] },
    { key: "wishlistBoost",   label: "Boost de spawn wishlist",  patterns: [/wishlist\s+spawn/i, /apparition.*wishlist/i, /spawn.*wishlist/i] },
    /* « Slots de starwish » doit être testé avant « boost star wish », sinon
       le motif large /star\s*wish/ l'attraperait en premier. */
    { key: "starWishSlots",   label: "Slots de starwish",        patterns: [/starwish\s+slots?/i, /slots?\s+de\s+\$?starwish/i, /star\s*wish.*slots?/i] },
    { key: "starWishBoost",   label: "Boost star wish",          patterns: [/star\s*wish/i, /first\s*wish/i, /\$fw\b/i, /première\s+wish/i] },
    { key: "claimReset",      label: "Reset de claim",           patterns: [/claim\s+reset/i, /reset\s+de\s+claim/i] },
    { key: "rollsReset",      label: "Reset de rolls",           patterns: [/rolls?\s+reset/i, /reset\s+de\s+rolls?/i] },
    { key: "kakeraLoot",      label: "Kakera loot",              patterns: [/kakera\s+loot/i, /butin\s+kakera/i] },
    { key: "kakeraPower",     label: "Pouvoir (power)",          patterns: [/\bpouvoir\b/i, /\bpower\b/i] },
    { key: "powerCost",       label: "Coût en pouvoir",          patterns: [/co[uû]t\s+en\s+pouvoir/i, /power\s+cost/i, /consommation.*pouvoir/i] },
    { key: "kakeraValue",     label: "Valeur des kakera",        patterns: [/valeur.*kakera/i, /kakera\s+value/i] },
    { key: "dailyRolls",      label: "Rolls journaliers",        patterns: [/rolls?\s+journaliers?/i, /daily\s+rolls?/i] },
    { key: "bonusRolls",      label: "Rolls bonus",              patterns: [/rolls?\s+bonus/i, /bonus\s+rolls?/i] }
  ];

  function parseBonus(text){
    var found = {};
    text.split(/\r?\n/).forEach(function(rawLine){
      var line = rawLine.trim();
      if(!line) return;

      var m = line.match(/^(.*?)\s*[:：]\s*([+-]?\s*\d+(?:[.,]\d+)?)\s*(%?)/);
      if(!m) m = line.match(/^(.*?)\s+([+-]\s*\d+(?:[.,]\d+)?)\s*(%?)\s*$/);
      if(!m) return;

      var label = m[1].trim();
      var value = parseFloat(m[2].replace(/\s+/g, "").replace(",", "."));
      if(isNaN(value)) return;

      for(var i = 0; i < FIELDS.length; i++){
        for(var p = 0; p < FIELDS[i].patterns.length; p++){
          if(FIELDS[i].patterns[p].test(label)){
            found[FIELDS[i].key] = value;
            return;
          }
        }
      }
    });
    return found;
  }

  /* ---- Analyse tolérante pour les commandes dont le format exact
     n'est pas documenté : on extrait les nombres et on retient le
     plus plausible, puis on affiche ce qui a été retenu pour que
     tu puisses corriger si besoin. ---- */
  function numbersIn(text){
    var cleaned = text.replace(/(\d)[\s ,](\d{3})\b/g, "$1$2");
    var out = [];
    var re = /\d+(?:\.\d+)?/g, m;
    while((m = re.exec(cleaned)) !== null) out.push(parseFloat(m[0]));
    return out;
  }

  /* $left sepere waifu/husbando et animanga/game, avec des milliers
     ecrits « 47.088 ». On lit chaque ligne, on garde les paires
     restant/total par categorie, puis le type de roll choisi decide
     laquelle utiliser. La ligne « Incluant » (personnages des deux
     genres) evite de les compter deux fois quand on additionne
     waifu et husbando. */
  function countOf(raw){
    var digits = raw.replace(/[^\d]/g, "");
    return digits ? parseInt(digits, 10) : null;
  }

  function pairsIn(line){
    var out = [];
    var re = /(\d[\d.\s,]*)\s*\/\s*(\d[\d.\s,]*)/g, m;
    while((m = re.exec(line)) !== null){
      var left = countOf(m[1]), total = countOf(m[2]);
      if(left !== null && total !== null) out.push({ left: left, total: total });
    }
    return out;
  }

  function parseLeftCategories(text){
    var cats = {};
    text.split(/\r?\n/).forEach(function(line){
      var lower = line.toLowerCase();
      var kind = null;
      if(/waifu/.test(lower)) kind = "waifu";
      else if(/husbando/.test(lower)) kind = "husbando";
      else if(/incluant|including|both/.test(lower)) kind = "both";
      else if(/total\s+restant|total\s+left|total\s+remaining/.test(lower)) kind = "total";
      if(!kind) return;

      var pairs = pairsIn(line);
      if(!pairs.length) return;
      cats[kind] = { animanga: pairs[0] || null, game: pairs[1] || null };
    });
    return cats;
  }

  function addPairs(a, b, overlap){
    if(!a || !b) return a || b || null;
    var res = { left: a.left + b.left, total: a.total + b.total };
    if(overlap){
      res.left -= overlap.left;
      res.total -= overlap.total;
    }
    return res;
  }

  var ROLL_TYPES = {
    wa: function(c){ return c.waifu && c.waifu.animanga; },
    wg: function(c){ return c.waifu && c.waifu.game; },
    w:  function(c){ return c.waifu && addPairs(c.waifu.animanga, c.waifu.game); },
    ha: function(c){ return c.husbando && c.husbando.animanga; },
    hg: function(c){ return c.husbando && c.husbando.game; },
    h:  function(c){ return c.husbando && addPairs(c.husbando.animanga, c.husbando.game); },
    ma: function(c){
      if(c.total && c.total.animanga) return c.total.animanga;
      if(c.waifu && c.husbando) return addPairs(c.waifu.animanga, c.husbando.animanga, c.both && c.both.animanga);
      return null;
    },
    mg: function(c){
      if(c.total && c.total.game) return c.total.game;
      if(c.waifu && c.husbando) return addPairs(c.waifu.game, c.husbando.game, c.both && c.both.game);
      return null;
    },
    m: function(c){
      return addPairs(ROLL_TYPES.ma(c), ROLL_TYPES.mg(c));
    }
  };

  function parseLeft(text){
    var cats = parseLeftCategories(text);
    if(Object.keys(cats).length){
      var type = $("statsRollType") ? $("statsRollType").value : "wa";
      var picker = ROLL_TYPES[type] || ROLL_TYPES.wa;
      var pair = picker(cats);
      if(pair) return { srUnclaimed: pair.left, srTotal: pair.total };
    }

    // Repli : une seule paire « restant / total », sans categorie.
    var simple = pairsIn(text);
    if(simple.length) return { srUnclaimed: simple[0].left, srTotal: simple[0].total };

    var nums = numbersIn(text).filter(function(n){ return n > 0; });
    if(nums.length >= 2){
      var sorted = nums.slice().sort(function(x, y){ return y - x; });
      return { srTotal: sorted[0], srUnclaimed: sorted[1] };
    }
    if(nums.length === 1) return { srUnclaimed: nums[0] };
    return {};
  }

  function parseWishes(text){
    var explicit = text.match(/(\d+)\s*(?:wish|souhait)/i) || text.match(/(?:wish|souhait)\w*[^\d\n]{0,20}(\d+)/i);
    if(explicit) return { srWishes: parseInt(explicit[1], 10) };
    var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length; });
    if(lines.length > 1) return { srWishes: lines.length };
    var nums = numbersIn(text);
    if(nums.length === 1) return { srWishes: nums[0] };
    return {};
  }

  function parseFirstNumber(targetId){
    return function(text){
      var nums = numbersIn(text);
      if(!nums.length) return {};
      var out = {};
      out[targetId] = nums[0];
      return out;
    };
  }

  var BLOCKS = [
    { input: "statsInput",          out: "statsOutBonus",    parse: null },
    { input: "statsLeftInput",      out: "statsOutLeft",     parse: parseLeft },
    { input: "statsWishesInput",    out: "statsOutWishes",   parse: parseWishes },
    { input: "statsDisabledInput",  out: "statsOutDisabled", parse: parseFirstNumber("srDisabled") },
    { input: "statsRareInput",      out: "statsOutRare",     parse: parseFirstNumber("srPersonalRare") }
  ];

  var LABELS = {
    srUnclaimed: "non claim", srTotal: "pool total", srWishes: "wishes",
    srDisabled: "désactivés", srPersonalRare: "personal rare"
  };

  function setField(id, value){
    var el = $(id);
    if(el) el.value = value;
  }

  function applyAll(){
    var applied = [];
    var baseSlots = parseFloat($("statsBaseSlots").value) || 0;
    var baseRolls = parseFloat($("statsBaseRolls").value) || 0;

    // --- $bonus ---
    var bonus = parseBonus($("statsInput").value);
    data = bonus;
    var bonusParts = [];

    if(bonus.wishlistSlots != null){
      var slots = baseSlots + bonus.wishlistSlots;
      setField("wishSlotLimit", slots);
      bonusParts.push(baseSlots + " + " + bonus.wishlistSlots + " = " + slots + " slots");
    }
    if(bonus.rollsPerHour != null){
      var rolls = baseRolls + bonus.rollsPerHour;
      setField("srRolls", rolls);
      bonusParts.push(baseRolls + " + " + bonus.rollsPerHour + " = " + rolls + " rolls");
    }
    if(bonus.wishlistBoost != null){
      setField("srBadgeBoost", bonus.wishlistBoost);
      bonusParts.push("boost wishlist " + bonus.wishlistBoost + "%");
    }
    if(bonus.starWishBoost != null){
      setField("srStarBoost", bonus.starWishBoost);
      bonusParts.push("boost star wish " + bonus.starWishBoost + "%");
    }
    if(bonus.bonusRolls != null){
      setField("bwInvestable", bonus.bonusRolls);
      bonusParts.push(bonus.bonusRolls + " rolls bonus");
    }
    $("statsOutBonus").textContent = bonusParts.length ? "✓ " + bonusParts.join(" · ") : "";
    if(bonusParts.length) applied.push("$bonus");

    // --- autres commandes ---
    BLOCKS.slice(1).forEach(function(block){
      var el = $(block.input);
      var outEl = $(block.out);
      if(!el || !outEl) return;
      var raw = el.value.trim();
      if(!raw){ outEl.textContent = ""; return; }

      var result = block.parse(raw);
      var parts = [];
      Object.keys(result).forEach(function(targetId){
        setField(targetId, result[targetId]);
        parts.push((LABELS[targetId] || targetId) + " " + result[targetId]);
      });
      outEl.textContent = parts.length ? "✓ " + parts.join(" · ") : "aucune valeur détectée";
      if(parts.length) applied.push(block.input);
    });

    persistState();

    if(!applied.length){
      Utils.setStatus($("statsStatus"), "Rien à appliquer : colle au moins une sortie de commande.", "warn");
      return;
    }
    Utils.setStatus($("statsStatus"), applied.length + " bloc(s) appliqué(s) au reste du site.", "ok");
  }

  function persistState(){
    var raws = {};
    BLOCKS.forEach(function(b){
      var el = $(b.input);
      if(el) raws[b.input] = el.value;
    });
    store.save({
      raws: raws,
      data: data,
      baseSlots: $("statsBaseSlots").value,
      baseRolls: $("statsBaseRolls").value,
      rollType: $("statsRollType") ? $("statsRollType").value : null
    });
  }

  var nudgeEl = null;

  function dismissNudge(){
    try{ localStorage.setItem("mudae-stats-nudge-seen", "1"); }catch(e){}
    if(nudgeEl && nudgeEl.parentNode) nudgeEl.parentNode.removeChild(nudgeEl);
    nudgeEl = null;
  }

  function showNudge(){
    var btn = $("statsHeroBtn");
    if(!btn) return;
    var seen;
    try{ seen = localStorage.getItem("mudae-stats-nudge-seen"); }catch(e){ seen = "1"; }
    if(seen || Object.keys(data).length) return;

    nudgeEl = document.createElement("div");
    nudgeEl.className = "stats-nudge";
    nudgeEl.innerHTML =
      "Renseigne tes stats : elles se répercutent automatiquement partout sur le site, notamment dans Boostwish." +
      '<button type="button" class="nudge-close" aria-label="Fermer">×</button>';
    document.body.appendChild(nudgeEl);
    var rect = btn.getBoundingClientRect();
    var viewportRight = window.scrollX + document.documentElement.clientWidth;
    nudgeEl.style.top = (rect.bottom + window.scrollY + 12) + "px";
    nudgeEl.style.right = (viewportRight - (rect.right + window.scrollX)) + "px";

    nudgeEl.querySelector(".nudge-close").addEventListener("click", function(e){
      e.stopPropagation();
      dismissNudge();
    });

    setTimeout(dismissNudge, 9000);
  }

  function openModal(){
    $("statsModalBackdrop").style.display = "flex";
    dismissNudge();
  }
  function closeModal(){
    $("statsModalBackdrop").style.display = "none";
  }

  function init(){
    $("statsHeroBtn").addEventListener("click", openModal);
    $("statsModalClose").addEventListener("click", closeModal);
    $("statsModalBackdrop").addEventListener("click", function(e){
      if(e.target === $("statsModalBackdrop")) closeModal();
    });
    document.addEventListener("keydown", function(e){
      if(e.key === "Escape" && $("statsModalBackdrop").style.display !== "none") closeModal();
    });

    $("statsParseBtn").addEventListener("click", applyAll);

    ["statsBaseSlots", "statsBaseRolls", "statsRollType"].forEach(function(id){
      if($(id)) $(id).addEventListener("change", applyAll);
    });

    var saved = store.load();
    if(saved){
      if(saved.baseSlots != null) $("statsBaseSlots").value = saved.baseSlots;
      if(saved.baseRolls != null) $("statsBaseRolls").value = saved.baseRolls;
      if(saved.rollType && $("statsRollType")) $("statsRollType").value = saved.rollType;
      if(saved.raws){
        Object.keys(saved.raws).forEach(function(id){
          var el = $(id);
          if(el) el.value = saved.raws[id];
        });
      }
      data = saved.data || {};
      var hasRaw = saved.raws && Object.keys(saved.raws).some(function(k){
        return (saved.raws[k] || "").trim().length;
      });
      if(hasRaw) applyAll();
    }

    setTimeout(showNudge, 1200);
  }

  return {
    init: init,
    get: function(key, fallback){ return data[key] != null ? data[key] : fallback; },
    all: function(){ return data; }
  };
})();
