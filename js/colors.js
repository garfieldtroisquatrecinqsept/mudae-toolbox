var ColorPicker = (function(){

  var $ = Utils.$;

  var targets = [];
  var store = Utils.createStore("mudae-colors");

  function persist(){
    var state = {
      targets: targets.map(function(t){
        return { name: t.name, keys: t.keys, url: t.url, color: t.color };
      }),
      command: $("colorCommand").value
    };
    store.save(state);
    store.checkpoint(state);
  }

  function restoreState(state){
    targets = (state.targets || []).map(function(t){
      return { name: t.name, keys: t.keys, url: t.url, color: t.color };
    });
    if(state.command){
      var hasOption = Array.prototype.some.call($("colorCommand").options, function(o){
        return o.value === state.command;
      });
      if(hasOption) $("colorCommand").value = state.command;
    }
  }

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
    persist();
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

  function hexToHsl(hex){
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return Utils.rgbToHsl(r, g, b);
  }

  var activeWheel = null;

  function closeColorWheel(){
    if(!activeWheel) return;
    activeWheel.cleanup();
    if(activeWheel.el.parentNode) activeWheel.el.parentNode.removeChild(activeWheel.el);
    activeWheel = null;
  }

  function drawWheel(canvas, lightness){
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    var cx = w / 2, cy = h / 2, radius = Math.min(cx, cy) - 1;
    var img = ctx.createImageData(w, h);
    for(var y = 0; y < h; y++){
      for(var x = 0; x < w; x++){
        var dx = x - cx, dy = y - cy;
        var dist = Math.sqrt(dx * dx + dy * dy);
        var idx = (y * w + x) * 4;
        if(dist > radius){ img.data[idx + 3] = 0; continue; }
        var hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        var sat = Math.min(1, dist / radius);
        var rgb = Utils.hslToRgb(hue, sat, lightness);
        img.data[idx] = rgb.r;
        img.data[idx + 1] = rgb.g;
        img.data[idx + 2] = rgb.b;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function openColorWheel(target, anchorEl){
    closeColorWheel();

    var start = target.color ? hexToHsl(target.color) : { h: 265, s: .7, l: .65 };
    var angle = start.h, sat = start.s, lightness = start.l;

    var popup = document.createElement("div");
    popup.className = "color-wheel-popup";

    var canvas = document.createElement("canvas");
    canvas.className = "cw-canvas";
    canvas.width = 176;
    canvas.height = 176;
    popup.appendChild(canvas);

    var lightInput = document.createElement("input");
    lightInput.type = "range";
    lightInput.min = 0; lightInput.max = 100;
    lightInput.value = Math.round(lightness * 100);
    lightInput.className = "cw-light";
    popup.appendChild(lightInput);

    var previewRow = document.createElement("div");
    previewRow.className = "cw-preview-row";
    var swatch = document.createElement("span");
    swatch.className = "cw-swatch";
    var hexLabel = document.createElement("span");
    hexLabel.className = "cw-hex";
    previewRow.appendChild(swatch);
    previewRow.appendChild(hexLabel);
    popup.appendChild(previewRow);

    var presetsRow = document.createElement("div");
    presetsRow.className = "preset-row";
    PRESETS.forEach(function(hex){
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "preset-dot";
      dot.style.background = hex;
      dot.title = hex;
      dot.addEventListener("click", function(){ apply(hex); });
      presetsRow.appendChild(dot);
    });
    popup.appendChild(presetsRow);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "small-btn cw-close";
    closeBtn.textContent = "Fermer";
    popup.appendChild(closeBtn);

    document.body.appendChild(popup);
    var rect = anchorEl.getBoundingClientRect();
    popup.style.top = (rect.bottom + window.scrollY + 8) + "px";
    popup.style.left = (rect.left + window.scrollX) + "px";
    var maxLeft = window.scrollX + document.documentElement.clientWidth - popup.offsetWidth - 12;
    if(rect.left > maxLeft) popup.style.left = Math.max(12, maxLeft) + "px";

    function apply(hex){
      setColor(target, hex);
      swatch.style.background = hex;
      hexLabel.textContent = hex;
    }

    function pickFromEvent(e){
      var r = canvas.getBoundingClientRect();
      var x = (e.clientX - r.left) * (canvas.width / r.width);
      var y = (e.clientY - r.top) * (canvas.height / r.height);
      var cx = canvas.width / 2, cy = canvas.height / 2;
      var radius = Math.min(cx, cy) - 1;
      var dx = x - cx, dy = y - cy;
      var dist = Math.min(radius, Math.sqrt(dx * dx + dy * dy));
      angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
      sat = dist / radius;
      var rgb = Utils.hslToRgb(angle, sat, lightness);
      apply(Utils.rgbToHex(rgb.r, rgb.g, rgb.b));
    }

    var dragging = false;
    canvas.addEventListener("pointerdown", function(e){
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      pickFromEvent(e);
    });
    canvas.addEventListener("pointermove", function(e){ if(dragging) pickFromEvent(e); });
    canvas.addEventListener("pointerup", function(){ dragging = false; });

    lightInput.addEventListener("input", function(){
      lightness = this.value / 100;
      drawWheel(canvas, lightness);
      var rgb = Utils.hslToRgb(angle, sat, lightness);
      apply(Utils.rgbToHex(rgb.r, rgb.g, rgb.b));
    });

    drawWheel(canvas, lightness);
    swatch.style.background = target.color || "#B26BFF";
    hexLabel.textContent = target.color || "—";

    closeBtn.addEventListener("click", closeColorWheel);

    function onOutside(e){
      if(popup.contains(e.target) || e.target === anchorEl || anchorEl.contains(e.target)) return;
      closeColorWheel();
    }
    function onKey(e){ if(e.key === "Escape") closeColorWheel(); }

    setTimeout(function(){
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    activeWheel = {
      el: popup,
      cleanup: function(){
        document.removeEventListener("click", onOutside);
        document.removeEventListener("keydown", onKey);
      }
    };
  }

  function showExtracted(target, colors){
    target.extracted = colors;
    var box = target.extractedBox;
    box.innerHTML = "";
    colors.forEach(function(c){
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "preset-dot";
      dot.style.background = c.hex;
      dot.title = c.hex + " (extrait de l'image)";
      dot.addEventListener("click", function(){ setColor(target, c.hex); });
      box.appendChild(dot);
    });
    if(colors.length) setColor(target, colors[0].hex);
  }

  /* Trois échecs très différents étaient tous rapportés comme « lien mort » :
     l'image qui ne charge pas, le serveur qui interdit la lecture des pixels,
     et une erreur d'extraction survenue APRÈS un chargement réussi (le .catch
     englobait le .then). On les distingue pour dire quoi faire. */
  function extractionFailed(target, reason, level){
    Utils.setStatus($("colorStatus"), reason, level || "warn");
  }

  function diagnose(target){
    // le chargement sans crossOrigin réussit-il ? si oui, l'image existe et
    // c'est bien la lecture des pixels qui est refusée
    return Utils.loadImage(target.url, false).then(function(){
      extractionFailed(target,
        "L'image de " + target.name + " s'affiche mais son serveur interdit d'en lire " +
        "les pixels. Choisis la couleur avec le bouton Roue.", "warn");
    }).catch(function(){
      extractionFailed(target,
        "Image introuvable pour " + target.name + " : lien mort, hors ligne, " +
        "ou requête bloquée par une extension du navigateur.", "error");
    });
  }

  function extractFor(target){
    if(!target.url){
      Utils.setStatus($("colorStatus"),
        target.name + " n'a pas de lien d'image dans la liste collée.", "warn");
      return;
    }
    return Utils.loadImage(target.url, true).then(function(img){
      var colors;
      try {
        colors = Utils.extractColors(img, 5);
      } catch(err){
        // image chargée mais canvas « teinté » : lecture des pixels refusée
        extractionFailed(target,
          "Les pixels de l'image de " + target.name + " ne sont pas lisibles " +
          "(" + err.name + "). Utilise le bouton Roue.", "warn");
        return;
      }
      if(!colors.length){
        extractionFailed(target,
          "Aucune couleur exploitable trouvée dans l'image de " + target.name + ".", "warn");
        return;
      }
      showExtracted(target, colors);
    }).catch(function(){
      return diagnose(target);
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
        // sans ça, l'anti-hotlink de mudae.net renvoie 403 (voir loadImage)
        img.referrerPolicy = "no-referrer";
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

      var wheelBtn = document.createElement("button");
      wheelBtn.type = "button";
      wheelBtn.className = "small-btn";
      wheelBtn.textContent = "Roue";
      wheelBtn.addEventListener("click", function(){ openColorWheel(target, wheelBtn); });

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

      var controls = document.createElement("div");
      controls.className = "hcolors";
      controls.appendChild(input);
      controls.appendChild(wheelBtn);
      controls.appendChild(extractBtn);
      controls.appendChild(extracted);

      row.appendChild(avatarEl);
      row.appendChild(body);
      row.appendChild(controls);
      list.appendChild(row);

      applyRowColor(target);
    });

    if(!targets.length){
      Utils.emptyState(list, "palette", "Aucun personnage",
        "Colle la sortie de $mmysi-c- plus haut pour attribuer des couleurs.");
    }

    updateOutput();
  }

  function init(){
    Utils.attachVersions("colorVersionsBtn", store, function(state){
      restoreState(state);
      $("colorWorkspace").style.display = "block";
      render();
      Utils.setStatus($("colorStatus"), "Version restaurée (" + targets.length + " personnage(s)).", "ok");
    });

    var saved = store.load();
    if(saved && saved.targets && saved.targets.length){
      restoreState(saved);
      $("colorWorkspace").style.display = "block";
      render();
    }

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

    /* L'ancienne version avalait chaque échec en silence (.catch vide) puis
       annonçait « Extraction terminée » même si rien n'avait fonctionné. */
    $("colorExtractAll").addEventListener("click", function(){
      var withUrl = targets.filter(function(t){ return t.url; });
      if(!withUrl.length){
        Utils.setStatus($("colorStatus"),
          "Aucun personnage n'a de lien d'image dans la liste collée.", "warn");
        return;
      }

      Utils.setStatus($("colorStatus"),
        "Extraction en cours sur " + withUrl.length + " image(s)…", "");

      var done = 0, failed = 0;
      var chain = Promise.resolve();
      withUrl.forEach(function(t){
        chain = chain.then(function(){
          return Utils.loadImage(t.url, true).then(function(img){
            var colors = Utils.extractColors(img, 5);   // peut lever si teinté
            if(!colors.length) throw new Error("aucune couleur");
            showExtracted(t, colors);
            done++;
          }).catch(function(){ failed++; });
        });
      });

      chain.then(function(){
        var msg = done + " image(s) sur " + withUrl.length + " exploitée(s).";
        if(failed){
          msg += " " + failed + " en échec : serveur qui refuse la lecture des " +
                 "pixels, ou lien mort. Passe par le bouton Roue pour celles-là.";
        }
        Utils.setStatus($("colorStatus"), msg, failed ? (done ? "warn" : "error") : "ok");
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
