var Utils = (function(){

  function $(id){
    return document.getElementById(id);
  }

  function setStatus(el, message, type){
    el.textContent = message;
    el.className = "status show" + (type ? " " + type : "");
  }

  function copyText(text, btn){
    var original = btn.textContent;
    navigator.clipboard.writeText(text).then(function(){
      btn.textContent = "Copié !";
      setTimeout(function(){ btn.textContent = original; }, 1200);
    }).catch(function(){
      alert("Copie automatique impossible, sélectionne le texte à la main.");
    });
  }

  function downloadCanvas(canvas, filename){
    canvas.toBlob(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  }

  function loadImage(src, crossOrigin){
    return new Promise(function(resolve, reject){
      var img = new Image();
      if(crossOrigin) img.crossOrigin = "anonymous";
      img.onload = function(){ resolve(img); };
      img.onerror = function(){ reject(new Error("échec du chargement")); };
      img.src = src;
    });
  }

  function readFileAsImage(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(e){ loadImage(e.target.result, false).then(resolve, reject); };
      reader.onerror = function(){ reject(new Error("lecture impossible")); };
      reader.readAsDataURL(file);
    });
  }

  function makeCanvas(w, h){
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    return c;
  }

  function trimCanvas(source){
    var ctx = source.getContext("2d");
    var data = ctx.getImageData(0, 0, source.width, source.height).data;
    var minX = source.width, minY = source.height, maxX = -1, maxY = -1;
    for(var y = 0; y < source.height; y++){
      for(var x = 0; x < source.width; x++){
        if(data[(y * source.width + x) * 4 + 3] > 8){
          if(x < minX) minX = x;
          if(x > maxX) maxX = x;
          if(y < minY) minY = y;
          if(y > maxY) maxY = y;
        }
      }
    }
    if(maxX < 0) return source;
    var out = makeCanvas(maxX - minX + 1, maxY - minY + 1);
    out.getContext("2d").drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function canvasToImage(canvas){
    return loadImage(canvas.toDataURL(), false);
  }

  function pointerPos(canvas, e){
    var rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function normalizeImageUrl(url){
    url = url.trim().replace(/[),.;\]]+$/, "");
    var imgur = url.match(/^https?:\/\/(?:www\.)?imgur\.com\/([A-Za-z0-9]+)(\.[a-zA-Z]+)?$/);
    if(imgur) return "https://i.imgur.com/" + imgur[1] + (imgur[2] || ".png");
    return url;
  }

  function rgbToHex(r, g, b){
    return "#" + [r, g, b].map(function(x){
      return x.toString(16).padStart(2, "0");
    }).join("").toUpperCase();
  }

  function rgbToHsl(r, g, b){
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    var d = max - min;
    if(d !== 0){
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if(max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if(max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s: s, l: l };
  }

  function extractColors(img, maxColors){
    var w = Math.min(img.naturalWidth, 160);
    var h = Math.max(1, Math.round(w * img.naturalHeight / img.naturalWidth));
    var canvas = makeCanvas(w, h);
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h).data;
    var buckets = {};
    for(var p = 0; p < data.length; p += 4){
      if(data[p + 3] < 128) continue;
      var r = data[p], g = data[p + 1], b = data[p + 2];
      var key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
      if(!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0 };
      buckets[key].r += r;
      buckets[key].g += g;
      buckets[key].b += b;
      buckets[key].count++;
    }
    var arr = Object.keys(buckets).map(function(key){
      var v = buckets[key];
      var r = Math.round(v.r / v.count);
      var g = Math.round(v.g / v.count);
      var b = Math.round(v.b / v.count);
      return { r: r, g: g, b: b, count: v.count, hsl: rgbToHsl(r, g, b), hex: rgbToHex(r, g, b) };
    });
    var dominant = arr.slice().sort(function(a, b){ return b.count - a.count; });
    var vivid = arr.filter(function(c){
      return c.hsl.s > 0.35 && c.hsl.l > 0.2 && c.hsl.l < 0.8;
    }).sort(function(a, b){
      return b.count * b.hsl.s - a.count * a.hsl.s;
    });
    var picked = [];
    var seen = {};
    function push(c){
      if(!c || seen[c.hex]) return;
      seen[c.hex] = true;
      picked.push(c);
    }
    vivid.slice(0, 3).forEach(push);
    dominant.slice(0, 4).forEach(push);
    return picked.slice(0, maxColors || 6);
  }

  return {
    $: $,
    setStatus: setStatus,
    copyText: copyText,
    downloadCanvas: downloadCanvas,
    loadImage: loadImage,
    readFileAsImage: readFileAsImage,
    makeCanvas: makeCanvas,
    trimCanvas: trimCanvas,
    canvasToImage: canvasToImage,
    pointerPos: pointerPos,
    normalizeImageUrl: normalizeImageUrl,
    rgbToHex: rgbToHex,
    rgbToHsl: rgbToHsl,
    extractColors: extractColors
  };
})();
