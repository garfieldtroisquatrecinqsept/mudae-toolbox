var ColorPicker = (function(){

  var $ = Utils.$;

  var targets = [];

  var PRESETS = [
    "#FF5C72", "#FF9D4D", "#F4D35E", "#4CAF62", "#33D6C0",
    "#4D8DFF", "#B26BFF", "#FF6BCB", "#FFFFFF", "#2B2D31"
  ];

  function parseTargets(text){
    var out = [];
    text.split(/\r?\n/).forEach(function(rawLine){
      var line = rawLine.trim();
      if(!line) return;
      if(/^Harem\s+(?:de|of)\s+/i.test(line)) return;

      var withUrl = line.match(/^(.+?)\s*[\u00b7\u2022\u30fb]\s*.*?\((\d+)\)\s*-\s*(https?:\/\/\S+)\s*$/);
      if(withUrl){
        out.push({
          name: withUrl[1].trim(),
          keys: parseInt(withUrl[2], 10),
          url: Utils.normalizeImageUrl(withUrl[3]),
          color: null
        });
        return;
      }

      var name = line
        .replace(/^[\-\*\u2022\u00b7\d\.\)\s]+/, "")
        .replace(/\s*\(\d+\)\s*$/, "")
        .trim();
      if(name) out.push({ name: name, keys: null, url: null, color: null });
    });
    return out;
  }

  function commandTemplate(){
    return $("colorCommand").value;
  }

  function updateOutput(){
    var template = commandTemplate();
    var lines = targets
      .filter(function(t){ return t.color; })
      .map(function(t){
        return template
          .replace(/\{nom\}/g, t.name)
          .replace(/\{hex\}/g, t.color)
          .replace(/\{hexsans\}/g, t.color.replace("#", ""));
      });
    $("colorOutput").textContent = lines.join("\n");
    $("colorAssigned").textContent = lines.length + " / " + targets.length + " personnage(s) coloré(s)";
  }

  function readableOn(hex){
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#131019" : "#ffffff";
  }

  function kakeraTier(keys){
    if(keys === null || keys === undefined || keys <= 0) return "none";
    if(keys <= 2) return "low";
    if(keys <= 5) return "mid";
    if(keys <= 9) return "high";
    return "top";
  }

  function initials(name){
    var letters = name.trim().split(/\s+/).slice(0, 2).map(function(p){ return p.charAt(0).toUpperCase(); });
    return letters.join("") || "?";
  }

  function makeFallbackAvatar(target){
    var el = document.createElement("div");
    el.className = "harem-avatar-fallback";
    el.textContent = initials(target.name);
    el.title = target.name;
    return el;
  }

  function styleFallbackAvatar(target){
    if(!target.avatarFallbackEl) return;
    var hex = target.color || null;
    target.avatarFallbackEl.style.background = hex ? hex : "";
    target.avatarFallbackEl.style.color = hex ? readableOn(hex) : "";
    target.avatarFallbackEl.style.borderColor = hex || "";
  }

  function applyRowColor(target){
    if(!target.color){
      target.row.style.borderColor = "";
      target.row.style.background = "";
      target.nameEl.style.color = "";
      target.chip.style.display = "none";
      styleFallbackAvatar(target);
      return;
    }
    target.row.style.borderColor = target.color;
    target.row.style.background =
      "linear-gradient(90deg, " + target.color + "22 0%, var(--surface2) 55%)";
    target.nameEl.style.color = target.color;
    target.chip.style.display = "inline-flex";
    target.chip.style.background = target.color;
    target.chip.style.color = readableOn(target.color);
    target.chip.textContent = target.color;
    styleFallbackAvatar(target);
  }

  function setColor(target, hex){
    target.color = hex.toUpperCase();
    if(target.input) target.input.value = target.color;
    applyRowColor(target);
    updateOutput();
  }

  function renderPalette(target, container){
    container.innerHTML = "";
    PRESETS.forEach(function(hex){
      var dot = document.createElement("button");
      dot.className = "preset-dot";
      dot.style.background = hex;
      dot.title = hex;
      dot.addEventListener("click", function(){ setColor(target, hex); });
      container.appendChild(dot);
    });
  }

  function extractFor(target){
    if(!target.url){
      Utils.setStatus($("colorStatus"),
        target.name + " n'a pas de lien d'image dans la liste collée.", "warn");
      return;
    }
    Utils.loadImage(target.url, true).then(function(img){
      var colors = Utils.extractColors(img, 5);
      target.extracted = colors;
      var box = target.extractedBox;
      box.innerHTML = "";
      colors.forEach(function(c){
        var dot = document.createElement("button");
        dot.className = "preset-dot";
        dot.style.background = c.hex;
        dot.title = c.hex + " (extrait de l'image)";
        dot.addEventListener("click", function(){ setColor(target, c.hex); });
        box.appendChild(dot);
      });
      if(colors.length) setColor(target, colors[0].hex);
    }).catch(function(){
      Utils.setStatus($("colorStatus"),
        "Image inaccessible pour " + target.name + " (CORS ou lien mort).", "warn");
    });
  }

  function render(){
    var list = $("colorList");
    list.innerHTML = "";

    targets.forEach(function(target){
      var row = document.createElement("div");
      row.className = "harem-item k-" + kakeraTier(target.keys);

      var avatarEl;
      if(target.url){
        var img = document.createElement("img");
        img.className = "harem-avatar skeleton";
        img.alt = target.name;
        img.loading = "lazy";
        img.addEventListener("load", function(){ img.classList.remove("skeleton"); });
        img.addEventListener("error", function(){
          var fb = makeFallbackAvatar(target);
          target.avatarFallbackEl = fb;
          styleFallbackAvatar(target);
          if(img.parentNode) img.parentNode.replaceChild(fb, img);
        });
        img.src = target.url;
        avatarEl = img;
      } else {
        avatarEl = makeFallbackAvatar(target);
        target.avatarFallbackEl = avatarEl;
      }

      var body = document.createElement("div");
      body.className = "hbody";
      var name = document.createElement("div");
      name.className = "hname";
      name.textContent = target.name;
      var meta = document.createElement("div");
      meta.className = "hmeta";
      var chip = document.createElement("span");
      chip.className = "color-chip";
      chip.style.display = "none";
      if(target.keys !== null){
        var k = document.createElement("span");
        k.textContent = target.keys + " clé" + (target.keys > 1 ? "s" : "");
        meta.appendChild(k);
      }
      meta.appendChild(chip);
      body.appendChild(name);
      body.appendChild(meta);

      var input = document.createElement("input");
      input.type = "color";
      input.className = "color-input";
      input.value = target.color || "#B26BFF";
      input.addEventListener("input", function(){ setColor(target, this.value); });

      var palette = document.createElement("div");
      palette.className = "preset-row";

      var extracted = document.createElement("div");
      extracted.className = "preset-row";

      var extractBtn = document.createElement("button");
      extractBtn.className = "small-btn";
      extractBtn.textContent = "Extraire";
      extractBtn.addEventListener("click", function(){ extractFor(target); });

      target.row = row;
      target.nameEl = name;
      target.chip = chip;
      target.input = input;
      target.extractedBox = extracted;

      renderPalette(target, palette);

      var controls = document.createElement("div");
      controls.className = "hcolors";
      controls.appendChild(input);
      controls.appendChild(palette);
      controls.appendChild(extractBtn);
      controls.appendChild(extracted);

      row.appendChild(avatarEl);
      row.appendChild(body);
      row.appendChild(controls);
      list.appendChild(row);

      applyRowColor(target);
    });

    updateOutput();
  }

  function init(){
    $("colorParseBtn").addEventListener("click", function(){
      targets = parseTargets($("colorInput").value);
      if(!targets.length){
        Utils.setStatus($("colorStatus"), "Aucun personnage détecté.", "error");
        $("colorWorkspace").style.display = "none";
        return;
      }
      var withUrl = targets.filter(function(t){ return t.url; }).length;
      Utils.setStatus($("colorStatus"),
        targets.length + " personnage(s), dont " + withUrl + " avec une image exploitable.", "ok");
      $("colorWorkspace").style.display = "block";
      render();
    });

    $("colorCommand").addEventListener("input", updateOutput);
    $("colorCommand").addEventListener("change", updateOutput);

    $("colorApplyAll").addEventListener("click", function(){
      var hex = $("colorBulk").value;
      targets.forEach(function(t){ setColor(t, hex); });
    });

    $("colorExtractAll").addEventListener("click", function(){
      var chain = Promise.resolve();
      targets.forEach(function(t){
        if(!t.url) return;
        chain = chain.then(function(){
          return Utils.loadImage(t.url, true).then(function(img){
            var colors = Utils.extractColors(img, 5);
            t.extracted = colors;
            var box = t.extractedBox;
            box.innerHTML = "";
            colors.forEach(function(c){
              var dot = document.createElement("button");
              dot.className = "preset-dot";
              dot.style.background = c.hex;
              dot.title = c.hex;
              dot.addEventListener("click", function(){ setColor(t, c.hex); });
              box.appendChild(dot);
            });
            if(colors.length) setColor(t, colors[0].hex);
          }).catch(function(){});
        });
      });
      chain.then(function(){
        Utils.setStatus($("colorStatus"), "Extraction terminée.", "ok");
      });
    });

    $("colorClearAll").addEventListener("click", function(){
      targets.forEach(function(t){
        t.color = null;
        applyRowColor(t);
      });
      updateOutput();
    });

    $("colorCopyBtn").addEventListener("click", function(){
      Utils.copyText($("colorOutput").textContent, this);
    });
  }

  return { init: init };
})();
