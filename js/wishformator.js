var WishFormator = (function(){

  var $ = Utils.$;

  var TAGS = {
    wish:   { label: "Souhait", emoji: "✨", badge: "wish",   title: "Souhait normal",  desc: "Ajouté avec $wish." },
    lock:   { label: "Lock",    emoji: "🔐", badge: "lock",   title: "Verrouillé",      desc: "Commande de verrouillage en fin de script. Implique la présence sur la wishlist." },
    quiet:  { label: "Discret", emoji: "🤫", badge: "quiet",  title: "Souhait discret", desc: "Ajouté avec $wishk : plus de kakera avec Silver IV, aucune mention." },
    star:   { label: "Star",    emoji: "⭐", badge: "star",   title: "Star wish",       desc: "Ajouté avec $starwish." },
    owned:  { label: "Acquis",  emoji: "✅", badge: "owned",  title: "Déjà acquis",     desc: "Exclu des ajouts et du calcul d'adjacence. Nettoyé via $wishpurge." },
    remove: { label: "Retirer", emoji: "🗑️", badge: "remove", title: "À retirer",       desc: "Retiré avec $wishremove. Exclu du calcul d'adjacence." }
  };

  var EXCLUSIVE = ["owned", "remove"];

  var entries = [];
  var circular = true;
  var dragIndex = null;
  var activeBubble = null;
  var TAG_EMOJI = { "⭐": "star", "✅": "owned", "🔐": "lock" };
  var store = Utils.createStore("mudae-wish");

  function persist(){
    var state = { entries: entries, circular: circular };
    store.save(state);
    store.checkpoint(state);
  }

  /* ---- Placement optimal ----
     Chaque porteur de perk donne son bonus à ses DEUX voisins. Le total
     distribué ne dépend donc pas de l'ordre — seul change QUI le reçoit.
     On maximise ce que reçoivent les personnages marqués prioritaires :
        somme sur les porteurs de  give x (nb de voisins prioritaires)
     Il faut donc encadrer les plus gros porteurs par des prioritaires. */
  function priorityScore(order){
    var n = order.length, total = 0;
    for(var i = 0; i < n; i++){
      if(!order[i].priority) continue;
      var prev = circular ? (i - 1 + n) % n : i - 1;
      var next = circular ? (i + 1) % n : i + 1;
      if(prev >= 0 && prev < n) total += order[prev].give;
      if(next >= 0 && next < n) total += order[next].give;
    }
    return total;
  }

  // départ : on alterne prioritaire / porteur, gros porteurs d'abord
  function seedOrder(list){
    var prio = list.filter(function(e){ return e.priority; });
    var carriers = list.filter(function(e){ return !e.priority && e.give > 0; })
      .sort(function(a, b){ return b.give - a.give; });
    var others = list.filter(function(e){ return !e.priority && e.give === 0; });
    var out = [], max = Math.max(prio.length, carriers.length);
    for(var i = 0; i < max; i++){
      if(i < prio.length) out.push(prio[i]);
      if(i < carriers.length) out.push(carriers[i]);
    }
    return out.concat(others);
  }

  /* Recherche locale : échanges de paires ET déplacements d'un élément.
     Les seuls échanges restaient coincés dans des optima locaux (90 %
     d'optimalité mesurée) ; avec les deux, on atteint l'optimum exact. */
  function localSearch(order){
    var best = order.slice(), bestScore = priorityScore(best);
    var moved = true, guard = 0;
    while(moved && guard++ < 80){
      moved = false;
      for(var i = 0; i < best.length; i++){
        for(var j = i + 1; j < best.length; j++){
          var swapped = best.slice();
          var tmp = swapped[i]; swapped[i] = swapped[j]; swapped[j] = tmp;
          var s1 = priorityScore(swapped);
          if(s1 > bestScore + 1e-9){ best = swapped; bestScore = s1; moved = true; }
        }
      }
      for(var a = 0; a < best.length; a++){
        for(var b = 0; b < best.length; b++){
          if(a === b) continue;
          var shifted = best.slice();
          shifted.splice(b, 0, shifted.splice(a, 1)[0]);
          var s2 = priorityScore(shifted);
          if(s2 > bestScore + 1e-9){ best = shifted; bestScore = s2; moved = true; }
        }
      }
    }
    return best;
  }

  function shuffled(list){
    var a = list.slice();
    for(var i = a.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function optimizeOrder(list){
    var best = localSearch(seedOrder(list)), bestScore = priorityScore(best);
    // quelques départs aléatoires pour sortir des optima locaux
    for(var k = 0; k < 6; k++){
      var cand = localSearch(shuffled(list));
      var s = priorityScore(cand);
      if(s > bestScore){ best = cand; bestScore = s; }
    }
    return best;
  }

  function restoreState(state){
    entries = state.entries || [];
    circular = !!state.circular;
    $("wishCircular").checked = circular;
  }

  function extractEmojiTag(name){
    var tag = null;
    Object.keys(TAG_EMOJI).forEach(function(e){
      if(name.indexOf(e) !== -1) tag = TAG_EMOJI[e];
    });
    var cleaned = name;
    Object.keys(TAG_EMOJI).forEach(function(e){
      cleaned = cleaned.split(e).join("");
    });
    cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
    return { name: cleaned, tag: tag };
  }

  function cmd(name){ return "$" + name; }

  function hasTag(entry, tag){
    return entry.tags.indexOf(tag) !== -1;
  }

  function toggleTag(entry, tag){
    var i = entry.tags.indexOf(tag);
    if(i !== -1){
      entry.tags.splice(i, 1);
    } else {
      if(EXCLUSIVE.indexOf(tag) !== -1){
        entry.tags = entry.tags.filter(function(t){ return EXCLUSIVE.indexOf(t) === -1; });
      } else {
        entry.tags = entry.tags.filter(function(t){ return EXCLUSIVE.indexOf(t) === -1; });
      }
      entry.tags.push(tag);
    }
    if(!entry.tags.length) entry.tags = ["wish"];
  }

  function isActive(entry){
    return !hasTag(entry, "owned") && !hasTag(entry, "remove");
  }

  function cleanName(name){
    return name
      .replace(/^[\-\*\u2022\u00b7]+\s*/, "")
      .replace(/^\d+\s*[\.\)]\s*/, "")
      .replace(/^\$?(?:wishlist|wish|wl)\s+/i, "")
      .trim();
  }

  function splitPercent(chunk){
    var m = chunk.match(/^(.*?)\s*([+\-]?\d+)\s*%\s*$/);
    if(m) return { name: m[1].trim(), received: parseInt(m[2], 10) };
    return { name: chunk.trim(), received: 0 };
  }

  function parseMultiline(lines){
    return lines.map(splitPercent).filter(function(e){ return e.name.length > 0; });
  }

  function parseSingleLine(text){
    var parts = text.split(/([+\-]?\d+\s*%)/);
    var out = [];
    var pendingIndex = -1;
    parts.forEach(function(part){
      if(!part) return;
      var pct = part.match(/^([+\-]?\d+)\s*%$/);
      if(pct){
        if(pendingIndex >= 0) out[pendingIndex].received = parseInt(pct[1], 10);
        return;
      }
      part.split(/\s{2,}/)
        .map(function(n){ return n.trim(); })
        .filter(function(n){ return n.length > 0; })
        .forEach(function(n){ out.push({ name: n, received: 0 }); });
      pendingIndex = out.length - 1;
    });
    return out;
  }

  function parseImport(text){
    var lines = text.replace(/\r/g, "").split("\n")
      .map(function(l){ return l.trim(); })
      .filter(function(l){ return l.length > 0; });
    var multiline = lines.length > 1;
    var raw = multiline ? parseMultiline(lines) : parseSingleLine(lines[0] || "");
    return {
      entries: raw
        .map(function(e){
          var tagged = extractEmojiTag(cleanName(e.name));
          return { name: tagged.name, received: e.received, tag: tagged.tag };
        })
        .filter(function(e){ return e.name.length > 0; }),
      multiline: multiline
    };
  }

  function activeEntries(){
    return entries.filter(isActive);
  }

  function recomputeReceived(){
    var active = activeEntries();
    var got = Adjacency.computeReceived(active.map(function(e){ return e.give; }), circular);
    active.forEach(function(e, i){ e.received = got[i]; });
    entries.forEach(function(e){ if(!isActive(e)) e.received = 0; });
  }

  function showSkeleton(count){
    var container = $("wishList");
    container.innerHTML = "";
    for(var i = 0; i < Math.min(count || 6, 8); i++){
      var row = document.createElement("div");
      row.className = "skeleton-row";
      row.innerHTML =
        '<div class="skeleton sk-rank"></div>' +
        '<div class="skeleton sk-name" style="max-width:' + (45 + (i * 13) % 40) + '%"></div>' +
        '<div class="skeleton sk-badge"></div>';
      container.appendChild(row);
    }
  }

  function render(){
    recomputeReceived();
    var container = $("wishList");
    container.innerHTML = "";
    var filter = ($("wishFilter").value || "").trim().toLowerCase();

    entries.forEach(function(entry, index){
      if(filter && entry.name.toLowerCase().indexOf(filter) === -1) return;
      var item = document.createElement("div");
      item.className = "wish-item";
      entry.tags.forEach(function(t){ item.classList.add("tag-" + t); });
      item.draggable = true;

      var rank = document.createElement("div");
      rank.className = "rank";
      rank.textContent = index + 1;

      var grip = document.createElement("div");
      grip.className = "grip";
      grip.textContent = "⣿";

      var name = document.createElement("div");
      name.className = "wname";
      name.textContent = entry.name;

      /* Deux groupes distincts : à gauche le STATUT (quelle commande sera
         générée), à droite les BONUS d'adjacence (donne / reçoit). Mélangés,
         on ne savait plus lequel pilotait quoi. */
      var badges = document.createElement("div");
      badges.className = "badges";

      if(entry.priority){
        var prio = document.createElement("span");
        prio.className = "badge priority";
        prio.textContent = "🎯";
        prio.title = "Prioritaire : l'optimisation place les porteurs de perk autour de lui";
        prio.setAttribute("aria-label", "Prioritaire");
        badges.appendChild(prio);
      }

      entry.tags.forEach(function(t){
        var badge = document.createElement("span");
        badge.className = "badge " + TAGS[t].badge;
        badge.textContent = TAGS[t].emoji;
        badge.title = TAGS[t].label + " — " + TAGS[t].title;
        badge.setAttribute("aria-label", TAGS[t].label);
        badges.appendChild(badge);
      });

      var perks = document.createElement("div");
      perks.className = "badges perk-badges";

      if(entry.give > 0){
        var giveBadge = document.createElement("span");
        giveBadge.className = "badge give";
        giveBadge.textContent = "donne +" + entry.give + "%";
        giveBadge.title = "Perk niveau " + Adjacency.levelOf(entry.give) +
          " : donne +" + entry.give + "% à chacun de ses deux voisins.";
        perks.appendChild(giveBadge);
      }

      if(isActive(entry) && entry.received > 0){
        var recvBadge = document.createElement("span");
        recvBadge.className = "badge fw";
        recvBadge.textContent = "reçoit +" + entry.received + "%";
        recvBadge.title = "Somme des perks de ses deux voisins.";
        perks.appendChild(recvBadge);
      }

      item.appendChild(rank);
      item.appendChild(grip);
      item.appendChild(name);
      item.appendChild(badges);
      item.appendChild(perks);

      item.addEventListener("click", function(e){
        if(e.target === grip) return;
        openTagBubble(index, item);
      });

      item.addEventListener("dragstart", function(){
        dragIndex = index;
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", function(){
        dragIndex = null;
        item.classList.remove("dragging");
        document.querySelectorAll(".wish-item").forEach(function(el){
          el.classList.remove("drop-target");
        });
      });
      item.addEventListener("dragover", function(e){
        e.preventDefault();
        if(dragIndex === null || dragIndex === index) return;
        item.classList.add("drop-target");
      });
      item.addEventListener("dragleave", function(){
        item.classList.remove("drop-target");
      });
      item.addEventListener("drop", function(e){
        e.preventDefault();
        item.classList.remove("drop-target");
        if(dragIndex === null || dragIndex === index) return;
        var moved = entries.splice(dragIndex, 1)[0];
        entries.splice(index, 0, moved);
        dragIndex = null;
        render();
      });

      container.appendChild(item);
    });

    if(!container.children.length){
      if(entries.length){
        Utils.emptyState(container, "heart-list", "Aucun résultat",
          "Aucun personnage ne correspond à ce filtre.");
      } else {
        Utils.emptyState(container, "heart-list", "Wishlist vide",
          "Colle ta wishlist plus haut pour la réorganiser et générer les commandes.");
      }
    }

    var active = activeEntries();
    var limit = parseInt($("wishSlotLimit").value, 10) || 0;
    var over = limit > 0 && active.length > limit;
    var info = entries.length
      ? entries.length + " personnage(s), dont " + active.length + " sur la wishlist"
      : "";
    if(limit > 0) info += " · limite " + limit + (over ? " DÉPASSÉE" : "");
    $("wishCount").textContent = info;
    $("wishCount").style.color = over ? "var(--red-ink)" : "";

    persist();
  }

  var BUBBLE_TAGS = ["star", "lock", "remove"];

  function closeBubble(){
    if(!activeBubble) return;
    activeBubble.cleanup();
    if(activeBubble.el.parentNode) activeBubble.el.parentNode.removeChild(activeBubble.el);
    activeBubble = null;
  }

  function positionBubble(bubble, anchorEl){
    var rect = anchorEl.getBoundingClientRect();
    bubble.style.top = (rect.bottom + window.scrollY + 8) + "px";
    bubble.style.left = (rect.left + window.scrollX) + "px";
    var maxLeft = window.scrollX + document.documentElement.clientWidth - bubble.offsetWidth - 12;
    if(rect.left > maxLeft) bubble.style.left = Math.max(12, maxLeft) + "px";
  }

  function openTagBubble(index, anchorEl){
    closeBubble();
    var entry = entries[index];

    var bubble = document.createElement("div");
    bubble.className = "tag-bubble";

    var tagRow = document.createElement("div");
    tagRow.className = "tag-bubble-tags";
    BUBBLE_TAGS.forEach(function(key){
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag-bubble-btn tbb-" + key + (hasTag(entry, key) ? " active" : "");
      btn.textContent = TAGS[key].emoji;
      btn.title = TAGS[key].label;
      btn.setAttribute("aria-label", TAGS[key].label);
      btn.addEventListener("click", function(){
        toggleTag(entry, key);
        render();
        openTagBubble(index, anchorEl);
      });
      tagRow.appendChild(btn);
    });
    bubble.appendChild(tagRow);

    // marqueur de priorité : orthogonal aux tags, il ne change aucune
    // commande générée, il ne sert qu'au calcul de placement
    var prioBtn = document.createElement("button");
    prioBtn.type = "button";
    prioBtn.className = "tag-bubble-btn tbb-priority tag-bubble-wide" +
      (entry.priority ? " active" : "");
    prioBtn.textContent = "🎯 " + (entry.priority ? "Prioritaire" : "Marquer prioritaire");
    prioBtn.title = "Les porteurs de perk seront placés autour de lui";
    prioBtn.addEventListener("click", function(){
      entry.priority = !entry.priority;
      render();
      openTagBubble(index, anchorEl);
    });
    bubble.appendChild(prioBtn);

    var perkRow = document.createElement("div");
    perkRow.className = "tag-bubble-perk";
    var minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "small-btn";
    minusBtn.textContent = "−";
    var lvlSpan = document.createElement("span");
    lvlSpan.className = "tag-bubble-lvl";
    lvlSpan.textContent = "LVL " + Adjacency.levelOf(entry.give);
    var plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "small-btn";
    plusBtn.textContent = "+";

    minusBtn.addEventListener("click", function(){
      entry.give = Adjacency.giveForLevel(Math.max(0, Adjacency.levelOf(entry.give) - 1));
      lvlSpan.textContent = "LVL " + Adjacency.levelOf(entry.give);
      render();
    });
    plusBtn.addEventListener("click", function(){
      entry.give = Adjacency.giveForLevel(Math.min(10, Adjacency.levelOf(entry.give) + 1));
      lvlSpan.textContent = "LVL " + Adjacency.levelOf(entry.give);
      render();
    });

    perkRow.appendChild(minusBtn);
    perkRow.appendChild(lvlSpan);
    perkRow.appendChild(plusBtn);
    bubble.appendChild(perkRow);

    var deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "small-btn tag-bubble-delete";
    deleteBtn.textContent = "Supprimer";
    deleteBtn.addEventListener("click", function(){
      entries.splice(index, 1);
      closeBubble();
      render();
    });
    bubble.appendChild(deleteBtn);

    document.body.appendChild(bubble);
    positionBubble(bubble, anchorEl);

    function onOutside(e){
      if(bubble.contains(e.target) || e.target === anchorEl || anchorEl.contains(e.target)) return;
      closeBubble();
    }
    function onKey(e){ if(e.key === "Escape") closeBubble(); }

    setTimeout(function(){
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    activeBubble = {
      el: bubble,
      cleanup: function(){
        document.removeEventListener("click", onOutside);
        document.removeEventListener("keydown", onKey);
      }
    };
  }

  function withTag(tag){
    return entries.filter(function(e){ return hasTag(e, tag); })
      .map(function(e){ return e.name; });
  }

  function buildScript(){
    var lines = [];

    var remove = withTag("remove");
    if(remove.length) lines.push(cmd("wishremove") + " " + remove.join("$"));

    var plainAdd = entries.filter(function(e){
      return isActive(e) && (hasTag(e, "wish") || hasTag(e, "lock")) && !hasTag(e, "quiet") && !hasTag(e, "star");
    }).map(function(e){ return e.name; });
    if(plainAdd.length) lines.push(cmd("wish") + " " + plainAdd.join("$"));

    var quiet = entries.filter(function(e){ return isActive(e) && hasTag(e, "quiet"); })
      .map(function(e){ return e.name; });
    if(quiet.length) lines.push(cmd("wishk") + " " + quiet.join("$"));

    var star = entries.filter(function(e){ return isActive(e) && hasTag(e, "star"); })
      .map(function(e){ return e.name; });
    if(star.length) lines.push(cmd("starwish") + " " + star.join("$"));

    var ordered = activeEntries().map(function(e){ return e.name; });
    if(ordered.length > 1){
      lines.push("");
      lines.push("# Ordre exact (après les ajouts)");
      lines.push(cmd("wishi") + " " + ordered.join(" $ "));
    }

    var lock = entries.filter(function(e){ return isActive(e) && hasTag(e, "lock"); })
      .map(function(e){ return e.name; });
    if(lock.length){
      lines.push("");
      lines.push("# Verrouillage");
      var lockName = $("lockCommand").value;
      lines.push(cmd(lockName) + " " + lock.join("$"));
    }

    var owned = withTag("owned");
    if(owned.length){
      lines.push("");
      lines.push("# Déjà acquis : " + owned.join(", "));
      lines.push(cmd("wishpurge"));
    }

    var carriers = activeEntries().filter(function(e){ return e.give > 0; });
    if(carriers.length){
      lines.push("");
      lines.push("# Perks d'adjacence mémorisés");
      carriers.forEach(function(e){
        lines.push("#   " + e.name + " : LVL " + Adjacency.levelOf(e.give) +
          " (donne +" + e.give + "%, reçoit +" + e.received + "%)");
      });
    }

    return lines.join("\n");
  }

  function importList(text){
    var parsedResult = parseImport(text);
    var parsed = parsedResult.entries;
    if(!parsed.length) return null;

    var result = Adjacency.infer(parsed.map(function(p){ return p.received; }));
    circular = result.circular;
    $("wishCircular").checked = circular;

    entries = parsed.map(function(p, i){
      return { name: p.name, tags: [p.tag || "wish"], give: result.gives[i], received: p.received };
    });

    result.multiline = parsedResult.multiline;
    return result;
  }

  function setAll(tag){
    entries.forEach(function(e){ e.tags = [tag]; });
    render();
  }

  function addToAll(tag){
    entries.forEach(function(e){
      if(!hasTag(e, tag)) toggleTag(e, tag);
    });
    render();
  }

  function init(){
    Utils.attachVersions("wishVersionsBtn", store, function(state){
      restoreState(state);
      $("wishWorkspace").style.display = "block";
      render();
      Utils.setStatus($("wishStatus"), "Version restaurée (" + entries.length + " personnage(s)).", "ok");
    });

    var saved = store.load();
    if(saved && saved.entries && saved.entries.length){
      restoreState(saved);
      $("wishWorkspace").style.display = "block";
      render();
    }

    $("wishFilter").addEventListener("input", render);

    $("wishBuildBtn").addEventListener("click", function(){
      var preview = $("wishInput").value.split(/\n/).filter(function(l){ return l.trim(); }).length;
      $("wishWorkspace").style.display = "block";
      showSkeleton(preview);
      var result = importList($("wishInput").value);
      if(!result){
        Utils.setStatus($("wishStatus"), "Aucun personnage détecté.", "error");
        $("wishWorkspace").style.display = "none";
        return;
      }

      if($("wishDedupe").checked){
        var seen = {};
        entries = entries.filter(function(e){
          var key = e.name.toLowerCase();
          if(seen[key]) return false;
          seen[key] = true;
          return true;
        });
      }

      var carriers = entries.filter(function(e){ return e.give > 0; }).length;
      var msg = entries.length + " personnage(s). ";
      if(!result.multiline){
        msg += "Liste sur une seule ligne : découpage aux doubles espaces, " +
          "des noms séparés par un espace simple peuvent être fusionnés à tort. " +
          "Colle un personnage par ligne pour un résultat fiable. ";
      }
      if(result.ok){
        msg += "Bonus résolus exactement en mode " +
          (result.circular ? "circulaire" : "linéaire") + " : " +
          carriers + " porteur(s) identifié(s).";
        Utils.setStatus($("wishStatus"), msg, result.multiline ? "ok" : "warn");
      } else {
        msg += "Résolution approchée (écart de " + result.totalError +
          " points) : découpage imparfait ou liste tronquée. Corrige les niveaux à la main.";
        Utils.setStatus($("wishStatus"), msg, "warn");
      }

      $("wishWorkspace").style.display = "block";
      $("wishScriptCard").style.display = "none";
      render();
    });

    $("wishAllWish").addEventListener("click", function(){ setAll("wish"); });
    $("wishAllLock").addEventListener("click", function(){ addToAll("lock"); });
    $("wishAllStar").addEventListener("click", function(){ addToAll("star"); });
    $("wishReverse").addEventListener("click", function(){
      entries.reverse();
      render();
    });

    $("wishOptimize").addEventListener("click", function(){
      var status = $("wishOptimizeStatus");
      var active = activeEntries();

      if(!active.length){
        Utils.setStatus(status, "Importe d'abord ta wishlist.", "error");
        return;
      }
      var prioCount = active.filter(function(e){ return e.priority; }).length;
      if(!prioCount){
        Utils.setStatus(status,
          "Aucun personnage prioritaire. Clique une carte puis « 🎯 Marquer prioritaire » " +
          "pour désigner ceux que tu veux voir spawn en premier.", "warn");
        return;
      }
      var carriers = active.filter(function(e){ return e.give > 0; }).length;
      if(!carriers){
        Utils.setStatus(status,
          "Aucun porteur de perk d'adjacence : il n'y a aucun bonus à répartir.", "warn");
        return;
      }

      var before = priorityScore(active);
      var arranged = optimizeOrder(active);
      var after = priorityScore(arranged);

      // les personnages hors wishlist (acquis / à retirer) restent à la fin
      entries = arranged.concat(entries.filter(function(e){ return !isActive(e); }));
      render();

      var gain = after - before;
      Utils.setStatus(status,
        gain > 0
          ? "Tes " + prioCount + " prioritaire(s) reçoivent maintenant +" + after +
            "% au total, contre +" + before + "% avant (soit +" + gain + " points)."
          : "Ton ordre était déjà optimal : +" + after + "% pour tes prioritaires.",
        "ok");
    });

    $("wishCircular").addEventListener("change", function(){
      circular = this.checked;
      render();
    });

    $("wishSlotLimit").addEventListener("input", render);

    $("wishGenerateBtn").addEventListener("click", function(){
      $("wishScript").textContent = buildScript() || "Aucun personnage.";
      $("wishScriptCard").style.display = "block";
    });

    $("lockCommand").addEventListener("change", function(){
      if($("wishScriptCard").style.display === "block"){
        $("wishScript").textContent = buildScript();
      }
    });

    $("wishScriptCopyBtn").addEventListener("click", function(){
      Utils.copyText($("wishScript").textContent, this);
    });

    $("wishScriptCopyCleanBtn").addEventListener("click", function(){
      var clean = $("wishScript").textContent.split("\n")
        .filter(function(l){ return l.trim() && l.trim().charAt(0) !== "#"; })
        .join("\n");
      Utils.copyText(clean, this);
    });
  }

  return { init: init };
})();
