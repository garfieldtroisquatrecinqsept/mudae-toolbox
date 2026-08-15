var HaremSort = (function(){

  var $ = Utils.$;

  var items = [];
  var dragIndex = null;

  function parseCharacters(text){
    return text.split(/\r?\n/)
      .map(function(line){
        return line
          .replace(/^[\-\*\u2022\u00b7\d\.\)\s]+/, "")
          .replace(/\s*[\u00b7\u2022]\s*\(\d+\).*$/, "")
          .replace(/\s*-\s*https?:\/\/\S+$/, "")
          .trim();
      })
      .filter(function(l){ return l.length > 0; })
      .map(function(name){ return { kind: "character", name: name }; });
  }

  function parseSeries(text){
    var out = [];
    text.split(/\r?\n/).forEach(function(rawLine){
      var line = rawLine.replace(/^[\-\*\u2022\d\.\)\s]+/, "").trim();
      if(!line) return;
      var m = line.match(/^(.*?)\s*-\s*(\d+)\s*\/\s*(\d+)\s*$/);
      if(m){
        out.push({ kind: "series", name: m[1].trim(), owned: parseInt(m[2], 10), total: parseInt(m[3], 10) });
      } else {
        out.push({ kind: "series", name: line, owned: null, total: null });
      }
    });
    return out;
  }

  function addItems(newItems, replaceKind){
    if(replaceKind){
      items = items.filter(function(i){ return i.kind !== replaceKind; });
    }
    var seen = {};
    items.forEach(function(i){ seen[i.kind + "::" + i.name.toLowerCase()] = true; });
    newItems.forEach(function(i){
      var key = i.kind + "::" + i.name.toLowerCase();
      if(seen[key]) return;
      seen[key] = true;
      items.push(i);
    });
  }

  function render(){
    var container = $("sortList");
    container.innerHTML = "";

    items.forEach(function(item, index){
      var row = document.createElement("div");
      row.className = "wish-item sort-" + item.kind;
      row.draggable = true;

      var rank = document.createElement("div");
      rank.className = "rank";
      rank.textContent = index + 1;

      var grip = document.createElement("div");
      grip.className = "grip";
      grip.textContent = "⣿";

      var name = document.createElement("div");
      name.className = "wname";
      name.textContent = item.name;

      var badges = document.createElement("div");
      badges.className = "badges";

      var kindBadge = document.createElement("span");
      kindBadge.className = "badge " + (item.kind === "series" ? "kind-series" : "kind-char");
      kindBadge.textContent = item.kind === "series" ? "Série" : "Perso";
      badges.appendChild(kindBadge);

      if(item.kind === "series" && item.owned !== null){
        var b = document.createElement("span");
        b.className = "badge " + (item.owned === item.total ? "star" : "wish");
        b.textContent = item.owned + " / " + item.total;
        badges.appendChild(b);
      }

      var del = document.createElement("button");
      del.className = "small-btn";
      del.textContent = "×";
      del.title = "Retirer de la liste";
      del.addEventListener("click", function(e){
        e.stopPropagation();
        items.splice(index, 1);
        render();
        generate();
      });

      row.appendChild(rank);
      row.appendChild(grip);
      row.appendChild(name);
      row.appendChild(badges);
      row.appendChild(del);

      row.addEventListener("dragstart", function(){
        dragIndex = index;
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", function(){
        dragIndex = null;
        row.classList.remove("dragging");
        container.querySelectorAll(".wish-item").forEach(function(el){
          el.classList.remove("drop-target");
        });
      });
      row.addEventListener("dragover", function(e){
        e.preventDefault();
        if(dragIndex === null || dragIndex === index) return;
        row.classList.add("drop-target");
      });
      row.addEventListener("dragleave", function(){
        row.classList.remove("drop-target");
      });
      row.addEventListener("drop", function(e){
        e.preventDefault();
        row.classList.remove("drop-target");
        if(dragIndex === null || dragIndex === index) return;
        var moved = items.splice(dragIndex, 1)[0];
        items.splice(index, 0, moved);
        dragIndex = null;
        render();
        generate();
      });

      container.appendChild(row);
    });

    var chars = items.filter(function(i){ return i.kind === "character"; }).length;
    var sers = items.length - chars;
    $("sortCount").textContent = items.length
      ? items.length + " entrée(s) : " + chars + " personnage(s), " + sers + " série(s)"
      : "";
  }

  function runsOf(list){
    var runs = [];
    list.forEach(function(item){
      var last = runs[runs.length - 1];
      if(last && last.kind === item.kind) last.names.push(item.name);
      else runs.push({ kind: item.kind, names: [item.name] });
    });
    return runs;
  }

  function chunk(names, size){
    var out = [];
    for(var i = 0; i < names.length; i += size) out.push(names.slice(i, i + size));
    return out;
  }

  function generate(){
    var mode = $("sortMode").value;
    var perCommand = parseInt($("sortChunk").value, 10) || 20;
    var anchored = $("sortAnchored").checked;
    var anchor = $("sortAnchor").value.trim();
    var lines = [];

    if(mode === "abc"){
      lines.push("$sm abc");
    } else if(mode === "reverse"){
      lines.push("$sm reverse");
    } else if(mode === "flag"){
      var flag = $("sortFlag").value.trim();
      if(!flag) lines.push("# Renseigne un flag, par exemple : mmw re:zero");
      else lines.push("$sm$" + flag.replace(/^\$/, ""));
    } else if(mode === "note"){
      var noteNames = items.map(function(i){ return i.name; });
      if(!noteNames.length){
        lines.push("# Liste vide.");
      } else {
        chunk(noteNames, perCommand).forEach(function(group){
          lines.push((anchored ? "$smp" : "$sm") + " note " + group.join(" $ "));
        });
      }
    } else {
      if(!items.length){
        lines.push("# Liste vide : importe des personnages ou des séries plus haut.");
      } else if(anchored){
        if(!anchor){
          lines.push("# $smp attend un point de référence : renseigne-le au-dessus.");
        } else {
          var flat = runsOf(items);
          var previous = anchor;
          flat.forEach(function(run){
            var keyword = run.kind === "series" ? "series " : "";
            chunk(run.names, perCommand).forEach(function(group){
              lines.push("$smp " + keyword + previous + " $ " + group.join(" $ "));
              previous = group[group.length - 1];
            });
          });
        }
      } else {
        var runs = runsOf(items);
        lines.push("# À envoyer dans cet ordre : chaque $sm remonte en tête,");
        lines.push("# donc le dernier bloc envoyé se retrouve au sommet.");
        runs.slice().reverse().forEach(function(run){
          var keyword = run.kind === "series" ? "series " : "";
          chunk(run.names, perCommand).slice().reverse().forEach(function(group){
            lines.push("$sm " + keyword + group.join(" $ "));
          });
        });
      }
    }

    $("sortOutput").textContent = lines.join("\n");
  }

  function updateModeUi(){
    var mode = $("sortMode").value;
    var isList = ["order", "note"].indexOf(mode) !== -1;
    $("sortFlagWrap").style.display = mode === "flag" ? "block" : "none";
    $("sortAnchorWrap").style.display = isList ? "block" : "none";
    $("sortChunkWrap").style.display = isList ? "block" : "none";
  }

  function init(){
    $("sortCharParse").addEventListener("click", function(){
      var parsed = parseCharacters($("sortCharInput").value);
      addItems(parsed, $("sortReplace").checked ? "character" : null);
      render();
      generate();
      Utils.setStatus($("sortStatus"),
        parsed.length + " personnage(s) ajouté(s) au trieur.", parsed.length ? "ok" : "error");
    });

    $("sortSeriesParse").addEventListener("click", function(){
      var parsed = parseSeries($("sortSeriesInput").value);
      addItems(parsed, $("sortReplace").checked ? "series" : null);
      render();
      generate();
      Utils.setStatus($("sortStatus"),
        parsed.length + " série(s) ajoutée(s) au trieur.", parsed.length ? "ok" : "error");
    });

    $("sortClear").addEventListener("click", function(){
      items = [];
      render();
      generate();
    });

    $("sortAbc").addEventListener("click", function(){
      items.sort(function(a, b){ return a.name.localeCompare(b.name); });
      render();
      generate();
    });

    $("sortReverseList").addEventListener("click", function(){
      items.reverse();
      render();
      generate();
    });

    $("sortGroupKind").addEventListener("click", function(){
      var sers = items.filter(function(i){ return i.kind === "series"; });
      var chars = items.filter(function(i){ return i.kind === "character"; });
      items = sers.concat(chars);
      render();
      generate();
    });

    $("sortByCompletion").addEventListener("click", function(){
      items.sort(function(a, b){
        var ra = a.kind === "series" && a.total ? a.owned / a.total : -1;
        var rb = b.kind === "series" && b.total ? b.owned / b.total : -1;
        return rb - ra;
      });
      render();
      generate();
    });

    ["sortMode", "sortAnchored", "sortAnchor", "sortFlag", "sortChunk"].forEach(function(id){
      $(id).addEventListener("input", function(){ updateModeUi(); generate(); });
      $(id).addEventListener("change", function(){ updateModeUi(); generate(); });
    });

    $("sortCopyBtn").addEventListener("click", function(){
      Utils.copyText($("sortOutput").textContent, this);
    });

    $("sortCopyCleanBtn").addEventListener("click", function(){
      var clean = $("sortOutput").textContent.split("\n")
        .filter(function(l){ return l.trim() && l.trim().charAt(0) !== "#"; })
        .join("\n");
      Utils.copyText(clean, this);
    });

    updateModeUi();
    generate();
  }

  return { init: init };
})();
