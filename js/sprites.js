var SpriteTool = (function(){

  var $ = Utils.$;

  var CELL = 96;
  var ATLAS_COLS = 26;
  var BG_W = 256, BG_H = 152, BG_COLS = 6;
  var SOCLE_Y = 912, SOCLE_W = 256, SOCLE_H = 40, SOCLE_COLS = 6;

  var decorAtlas = null;
  var borderImg = null;
  var variantAtlas = {};
  var currentVariant = "front";
  var customSprites = [];

  var state = {
    pokeImg: null,
    pokeBox: null,
    pokeFlipped: false,
    pokeScale: 3,
    pokeX: 0,
    pokeY: 0,
    bgImg: null,
    socleImg: null,
    socleScale: 0.55,
    socleY: 0.78,
    dragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    selectedId: null
  };

  var canvas, ctx;

  function variantData(){
    return PokeSprites.variants[currentVariant];
  }

  function loadVariantAtlas(name){
    if(variantAtlas[name]) return Promise.resolve(variantAtlas[name]);
    return Utils.loadImage("data:image/png;base64," + Assets.pokeAtlas[name], false).then(function(img){
      variantAtlas[name] = img;
      return img;
    });
  }

  function nameFor(id){
    if(id === 0) return "Inconnu (?)";
    var entry = PokeSprites.names[id];
    return entry ? entry[0] : "N°" + id;
  }

  function englishFor(id){
    if(id === 0) return "unknown";
    var entry = PokeSprites.names[id];
    return entry ? entry[1] : "";
  }

  function socleGeometry(){
    if(!state.socleImg) return null;
    var w = canvas.width * state.socleScale;
    var h = state.socleImg.naturalHeight * (w / state.socleImg.naturalWidth);
    return {
      x: (canvas.width - w) / 2,
      y: canvas.height * state.socleY - h / 2,
      w: w,
      h: h
    };
  }

  function paintScene(target, width, height, withBorder){
    var c = target.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, width, height);
    c.save();
    c.scale(width / canvas.width, height / canvas.height);

    if(state.bgImg) c.drawImage(state.bgImg, 0, 0, canvas.width, canvas.height);

    var geo = socleGeometry();
    if(geo) c.drawImage(state.socleImg, geo.x, geo.y, geo.w, geo.h);

    if(state.pokeImg){
      var dw = state.pokeImg.naturalWidth * state.pokeScale;
      var dh = state.pokeImg.naturalHeight * state.pokeScale;
      if(state.pokeFlipped){
        c.save();
        c.translate(state.pokeX + dw, state.pokeY);
        c.scale(-1, 1);
        c.drawImage(state.pokeImg, 0, 0, dw, dh);
        c.restore();
      } else {
        c.drawImage(state.pokeImg, state.pokeX, state.pokeY, dw, dh);
      }
    }
    c.restore();

    if(withBorder && borderImg) c.drawImage(borderImg, 0, 0, width, height);
  }

  function draw(){
    paintScene(canvas, canvas.width, canvas.height, $("previewBorder").checked);
  }

  function anchorPokemon(){
    if(!state.pokeImg) return;
    var box = state.pokeBox || {
      centerX: state.pokeImg.naturalWidth / 2,
      bottom: state.pokeImg.naturalHeight
    };
    var geo = socleGeometry();
    var groundY = geo ? geo.y + geo.h * 0.62 : canvas.height * 0.76;
    state.pokeX = canvas.width / 2 - box.centerX * state.pokeScale;
    state.pokeY = groundY - box.bottom * state.pokeScale;
  }

  function measureBox(img){
    var w = img.naturalWidth, h = img.naturalHeight;
    var fallback = { centerX: w / 2, bottom: h };
    try {
      var c = Utils.makeCanvas(w, h);
      var cc = c.getContext("2d");
      cc.drawImage(img, 0, 0);
      var data = cc.getImageData(0, 0, w, h).data;
      var minX = w, maxX = -1, maxY = -1;
      for(var y = 0; y < h; y++){
        for(var x = 0; x < w; x++){
          if(data[(y * w + x) * 4 + 3] > 8){
            if(x < minX) minX = x;
            if(x > maxX) maxX = x;
            if(y > maxY) maxY = y;
          }
        }
      }
      if(maxX < 0) return fallback;
      return { centerX: (minX + maxX + 1) / 2, bottom: maxY + 1 };
    } catch(err){
      return fallback;
    }
  }

  function sliceDecor(sx, sy, sw, sh){
    var c = Utils.makeCanvas(sw, sh);
    c.getContext("2d").drawImage(decorAtlas, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }

  function slicePokemon(variant, slot){
    var atlas = variantAtlas[variant];
    var c = Utils.makeCanvas(CELL, CELL);
    c.getContext("2d").drawImage(
      atlas,
      (slot % ATLAS_COLS) * CELL,
      Math.floor(slot / ATLAS_COLS) * CELL,
      CELL, CELL, 0, 0, CELL, CELL
    );
    return c;
  }

  function slotOf(variant, id){
    return PokeSprites.variants[variant].ids.indexOf(id);
  }

  function boxFor(variant, slot){
    var b = PokeSprites.variants[variant].boxes[slot];
    return { centerX: (b[0] + b[2] + 1) / 2, bottom: b[3] + 1 };
  }

  function applyPokemon(img, box){
    state.pokeImg = img;
    state.pokeBox = box || measureBox(img);
    state.pokeFlipped = false;
    anchorPokemon();
    draw();
  }

  function selectPokemon(id, cardEl){
    var slot = slotOf(currentVariant, id);
    if(slot < 0){
      Utils.setStatus($("pokeStatus"),
        nameFor(id) + " n'existe pas dans la variante « " + variantLabel() + " ».", "warn");
      return;
    }
    state.selectedId = id;
    Utils.canvasToImage(slicePokemon(currentVariant, slot)).then(function(img){
      applyPokemon(img, boxFor(currentVariant, slot));
      document.querySelectorAll("#pokeResults .poke-card").forEach(function(c){
        c.classList.remove("selected");
      });
      if(cardEl) cardEl.classList.add("selected");
      Utils.setStatus($("pokeStatus"),
        "N°" + id + " — " + nameFor(id) + " (" + variantLabel() + ")", "ok");
    });
  }

  function variantLabel(){
    var opt = $("pokeVariant").querySelector('option[value="' + currentVariant + '"]');
    return opt ? opt.textContent : currentVariant;
  }

  function renderCard(entry){
    var card = document.createElement("button");
    card.className = "poke-card";
    if(!entry.custom && entry.id === state.selectedId) card.classList.add("selected");

    var thumb = Utils.makeCanvas(56, 56);
    var tctx = thumb.getContext("2d");
    tctx.imageSmoothingEnabled = false;
    if(entry.custom){
      tctx.drawImage(entry.image, 0, 0, 56, 56);
    } else {
      tctx.drawImage(slicePokemon(currentVariant, entry.slot), 0, 0, 56, 56);
    }

    var num = document.createElement("div");
    num.className = "pnum";
    num.textContent = entry.custom ? "perso" : "#" + String(entry.id).padStart(3, "0");

    var name = document.createElement("div");
    name.className = "pname";
    name.textContent = entry.label;

    card.appendChild(thumb);
    card.appendChild(num);
    card.appendChild(name);
    card.title = entry.label;

    card.addEventListener("click", function(){
      if(entry.custom){
        state.selectedId = null;
        applyPokemon(entry.image, null);
        document.querySelectorAll("#pokeResults .poke-card").forEach(function(c){
          c.classList.remove("selected");
        });
        card.classList.add("selected");
        Utils.setStatus($("pokeStatus"), entry.label + " (sprite importé)", "ok");
      } else {
        selectPokemon(entry.id, card);
      }
    });
    return card;
  }

  function search(query){
    var results = $("pokeResults");
    results.innerHTML = "";
    query = (query || "").trim().toLowerCase();

    var matches = [];
    customSprites.forEach(function(s){
      if(!query || s.label.toLowerCase().indexOf(query) !== -1){
        matches.push({ custom: true, image: s.image, label: s.label });
      }
    });

    var ids = variantData().ids;
    var asNumber = parseInt(query, 10);
    for(var i = 0; i < ids.length && matches.length < 700; i++){
      var id = ids[i];
      var hit = false;
      if(!query) hit = true;
      else if(!isNaN(asNumber) && id === asNumber) hit = true;
      else if(nameFor(id).toLowerCase().indexOf(query) !== -1) hit = true;
      else if(englishFor(id).toLowerCase().indexOf(query) !== -1) hit = true;
      if(hit) matches.push({ id: id, slot: i, label: nameFor(id) });
    }

    if(!matches.length){
      results.innerHTML = "<p class='hint'>Aucun Pokémon ne correspond dans cette variante.</p>";
      return;
    }
    matches.forEach(function(m){ results.appendChild(renderCard(m)); });
  }

  function buildDecorGalleries(){
    var bgGrid = $("bgGrid");
    bgGrid.innerHTML = "";
    PokeData.bgNames.forEach(function(name, i){
      var tile = sliceDecor((i % BG_COLS) * BG_W, Math.floor(i / BG_COLS) * BG_H, BG_W, BG_H);
      var btn = document.createElement("button");
      btn.className = "asset";
      var thumb = Utils.makeCanvas(84, 50);
      thumb.getContext("2d").drawImage(tile, 0, 0, 84, 50);
      var cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = name;
      btn.appendChild(thumb);
      btn.appendChild(cap);
      btn.title = name;
      btn.addEventListener("click", function(){
        Utils.canvasToImage(tile).then(function(img){
          state.bgImg = img;
          document.querySelectorAll("#bgGrid .asset").forEach(function(a){ a.classList.remove("selected"); });
          btn.classList.add("selected");
          draw();
        });
      });
      bgGrid.appendChild(btn);
    });

    var socleGrid = $("socleGrid");
    socleGrid.innerHTML = "";
    PokeData.socleNames.forEach(function(name, i){
      var raw = sliceDecor((i % SOCLE_COLS) * SOCLE_W, SOCLE_Y + Math.floor(i / SOCLE_COLS) * SOCLE_H, SOCLE_W, SOCLE_H);
      var tile = Utils.trimCanvas(raw);
      var btn = document.createElement("button");
      btn.className = "asset";
      var thumb = Utils.makeCanvas(84, 32);
      thumb.getContext("2d").drawImage(tile, 4, 4, 76, 24);
      var cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = name;
      btn.appendChild(thumb);
      btn.appendChild(cap);
      btn.title = name;
      btn.addEventListener("click", function(){
        Utils.canvasToImage(tile).then(function(img){
          state.socleImg = img;
          document.querySelectorAll("#socleGrid .asset").forEach(function(a){ a.classList.remove("selected"); });
          btn.classList.add("selected");
          anchorPokemon();
          draw();
        });
      });
      socleGrid.appendChild(btn);
    });
  }

  function bindControls(){
    $("pokeSearch").addEventListener("input", function(){ search(this.value); });

    $("pokeVariant").addEventListener("change", function(){
      var name = this.value;
      Utils.setStatus($("pokeStatus"), "Chargement de la variante...", "");
      loadVariantAtlas(name).then(function(){
        currentVariant = name;
        search($("pokeSearch").value);
        if(state.selectedId !== null && slotOf(name, state.selectedId) >= 0){
          selectPokemon(state.selectedId, null);
        } else {
          Utils.setStatus($("pokeStatus"), "Variante « " + variantLabel() + " » chargée.", "ok");
        }
      });
    });

    $("pokeImportBtn").addEventListener("click", function(){ $("pokeImportFile").click(); });
    $("pokeImportFile").addEventListener("change", function(){
      var files = Array.prototype.slice.call(this.files);
      if(!files.length) return;
      Promise.all(files.map(function(file){
        return Utils.readFileAsImage(file).then(function(img){
          customSprites.push({ image: img, label: file.name.replace(/\.[^.]+$/, "") });
        });
      })).then(function(){
        Utils.setStatus($("pokeStatus"), files.length + " sprite(s) ajouté(s).", "ok");
        search($("pokeSearch").value);
      });
    });

    $("pokeScale").addEventListener("input", function(){
      $("scaleValue").textContent = this.value;
      state.pokeScale = this.value / 100;
      anchorPokemon();
      draw();
    });

    $("socleScale").addEventListener("input", function(){
      $("socleScaleValue").textContent = this.value;
      state.socleScale = this.value / 100;
      anchorPokemon();
      draw();
    });

    $("socleY").addEventListener("input", function(){
      $("socleYValue").textContent = this.value;
      state.socleY = this.value / 100;
      anchorPokemon();
      draw();
    });

    $("flipBtn").addEventListener("click", function(){
      state.pokeFlipped = !state.pokeFlipped;
      draw();
    });

    $("resetPosBtn").addEventListener("click", function(){
      anchorPokemon();
      draw();
    });

    $("previewBorder").addEventListener("change", draw);

    $("clearBgBtn").addEventListener("click", function(){
      state.bgImg = null;
      document.querySelectorAll("#bgGrid .asset").forEach(function(a){ a.classList.remove("selected"); });
      draw();
    });

    $("clearSocleBtn").addEventListener("click", function(){
      state.socleImg = null;
      document.querySelectorAll("#socleGrid .asset").forEach(function(a){ a.classList.remove("selected"); });
      draw();
    });

    $("customBgBtn").addEventListener("click", function(){ $("customBgFile").click(); });
    $("customBgFile").addEventListener("change", function(){
      if(!this.files[0]) return;
      Utils.readFileAsImage(this.files[0]).then(function(img){
        state.bgImg = img;
        draw();
      });
    });

    $("customSocleBtn").addEventListener("click", function(){ $("customSocleFile").click(); });
    $("customSocleFile").addEventListener("change", function(){
      if(!this.files[0]) return;
      Utils.readFileAsImage(this.files[0]).then(function(img){
        state.socleImg = img;
        anchorPokemon();
        draw();
      });
    });

    $("borderFile").addEventListener("change", function(){
      if(!this.files[0]) return;
      Utils.readFileAsImage(this.files[0]).then(function(img){
        borderImg = img;
        draw();
      });
    });

    canvas.addEventListener("pointerdown", function(e){
      if(!state.pokeImg) return;
      var pt = Utils.pointerPos(canvas, e);
      state.dragging = true;
      state.dragOffsetX = pt.x - state.pokeX;
      state.dragOffsetY = pt.y - state.pokeY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function(e){
      if(!state.dragging) return;
      var pt = Utils.pointerPos(canvas, e);
      state.pokeX = pt.x - state.dragOffsetX;
      state.pokeY = pt.y - state.dragOffsetY;
      draw();
    });
    canvas.addEventListener("pointerup", function(){ state.dragging = false; });
    canvas.addEventListener("pointerleave", function(){ state.dragging = false; });

    $("exportFullBtn").addEventListener("click", function(){
      var out = Utils.makeCanvas(canvas.width, canvas.height);
      paintScene(out, canvas.width, canvas.height, false);
      Utils.downloadCanvas(out, "sprite_complet.png");
      Utils.setStatus($("exportStatus"), "Image complète téléchargée.", "ok");
    });

    $("exportMudaeBtn").addEventListener("click", function(){
      var out = Utils.makeCanvas(225, 350);
      paintScene(out, 225, 350, $("useBorder").checked);
      Utils.downloadCanvas(out, "sprite_mudae_225x350.png");
      Utils.setStatus($("exportStatus"), "Export 225x350 téléchargé.", "ok");
    });
  }

  function init(){
    canvas = $("spriteCanvas");
    ctx = canvas.getContext("2d");
    bindControls();

    return Promise.all([
      Utils.loadImage("data:image/png;base64," + Assets.decorAtlas, false),
      Utils.loadImage("data:image/png;base64," + Assets.border, false),
      loadVariantAtlas("front")
    ]).then(function(images){
      decorAtlas = images[0];
      borderImg = images[1];
      buildDecorGalleries();
      search("");
      selectPokemon(25, null);
      draw();
    });
  }

  return { init: init };
})();
