var CropperTool = (function(){

  var $ = Utils.$;

  var canvas, ctx;
  var frameImg = null;

  var state = {
    img: null,
    gifFrames: null,
    previewIndex: 0,
    playTimer: null,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  function sourceSize(){
    if(state.gifFrames) return { w: state.gifFrames.width, h: state.gifFrames.height };
    if(state.img) return { w: state.img.naturalWidth, h: state.img.naturalHeight };
    return null;
  }

  function background(){
    var checked = document.querySelector('input[name="cropBg"]:checked');
    return checked ? checked.value : "transparent";
  }

  function paint(target, frameIndex, withFrame){
    var c = target.getContext("2d");
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, target.width, target.height);

    var bg = background();
    if(bg !== "transparent"){
      c.fillStyle = bg;
      c.fillRect(0, 0, target.width, target.height);
    }

    var size = sourceSize();
    if(size){
      var source = state.gifFrames ? state.gifFrames.canvases[frameIndex || 0] : state.img;
      c.drawImage(source, state.offsetX, state.offsetY, size.w * state.scale, size.h * state.scale);
    }

    if(withFrame && frameImg){
      c.drawImage(frameImg, 0, 0, target.width, target.height);
    }
  }

  function draw(){
    paint(canvas, state.previewIndex, $("cropUseFrame").checked);
  }

  function setScale(scale){
    state.scale = scale;
    $("cropZoom").value = Math.round(scale * 100);
    $("cropZoomValue").textContent = Math.round(scale * 100);
  }

  function center(){
    var size = sourceSize();
    if(!size) return;
    state.offsetX = (canvas.width - size.w * state.scale) / 2;
    state.offsetY = (canvas.height - size.h * state.scale) / 2;
  }

  function fill(){
    var size = sourceSize();
    if(!size) return;
    setScale(Math.max(canvas.width / size.w, canvas.height / size.h));
    center();
    draw();
  }

  function fit(){
    var size = sourceSize();
    if(!size) return;
    setScale(Math.min(canvas.width / size.w, canvas.height / size.h));
    center();
    draw();
  }

  function stopPlayback(){
    if(state.playTimer){
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
  }

  function updateFrameLabel(){
    if(!state.gifFrames) return;
    $("cropFrameIndex").textContent = (state.previewIndex + 1) + " / " + state.gifFrames.canvases.length;
  }

  function startPlayback(){
    stopPlayback();
    if(!state.gifFrames || state.gifFrames.canvases.length < 2) return;
    function step(){
      state.previewIndex = (state.previewIndex + 1) % state.gifFrames.canvases.length;
      draw();
      updateFrameLabel();
      state.playTimer = setTimeout(step, Math.max(20, state.gifFrames.delays[state.previewIndex] * 10));
    }
    state.playTimer = setTimeout(step, 100);
    $("cropPlayBtn").textContent = "Pause";
  }

  function clearSource(){
    stopPlayback();
    state.img = null;
    state.gifFrames = null;
    state.previewIndex = 0;
    $("cropGifInfo").style.display = "none";
  }

  function setStillImage(img){
    clearSource();
    state.img = img;
    fill();
  }

  function setGif(buffer){
    clearSource();
    var gif = GifCodec.decode(buffer);
    var list = GifCodec.toImageDataList(gif, function(w, h){ return Utils.makeCanvas(w, h); });
    var canvases = list.map(function(f){
      var c = Utils.makeCanvas(gif.width, gif.height);
      c.getContext("2d").putImageData(f.imageData, 0, 0);
      return c;
    });
    state.gifFrames = {
      width: gif.width,
      height: gif.height,
      canvases: canvases,
      delays: list.map(function(f){ return f.delay; })
    };
    $("cropGifInfo").style.display = "block";
    $("cropGifCount").textContent = canvases.length + " frames · " + gif.width + "x" + gif.height;
    updateFrameLabel();
    fill();
    startPlayback();
  }

  function loadFile(file){
    if(!file) return;
    if(/\.gif$/i.test(file.name) || file.type === "image/gif"){
      var reader = new FileReader();
      reader.onload = function(e){
        try {
          setGif(e.target.result);
          Utils.setStatus($("cropStatus"), "GIF chargé et décodé.", "ok");
        } catch(err){
          Utils.setStatus($("cropStatus"), "GIF illisible : " + err.message, "error");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    Utils.readFileAsImage(file).then(function(img){
      setStillImage(img);
      Utils.setStatus($("cropStatus"), "Image chargée.", "ok");
    }).catch(function(){
      Utils.setStatus($("cropStatus"), "Image illisible.", "error");
    });
  }

  function zoomAround(newScale, px, py){
    newScale = Math.max(0.05, Math.min(8, newScale));
    state.offsetX = px - (px - state.offsetX) * (newScale / state.scale);
    state.offsetY = py - (py - state.offsetY) * (newScale / state.scale);
    setScale(newScale);
    draw();
  }

  function buildExport(){
    var withFrame = $("cropUseFrame").checked;
    var out = Utils.makeCanvas(225, 350);

    if(!state.gifFrames){
      paint(out, 0, withFrame);
      return new Promise(function(resolve){
        out.toBlob(function(blob){ resolve({ blob: blob, ext: "png" }); }, "image/png");
      });
    }

    var frames = state.gifFrames.canvases.map(function(_, i){
      paint(out, i, withFrame);
      return {
        imageData: out.getContext("2d").getImageData(0, 0, 225, 350),
        delay: state.gifFrames.delays[i]
      };
    });
    var bytes = GifCodec.encode(frames, 225, 350, {});
    return Promise.resolve({ blob: new Blob([bytes], { type: "image/gif" }), ext: "gif" });
  }

  function downloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function copyBlobToClipboard(blob){
    if(!navigator.clipboard || !window.ClipboardItem){
      return Promise.reject(new Error("presse-papiers indisponible"));
    }
    if(blob.type !== "image/png"){
      return Promise.reject(new Error("seul le PNG passe par le presse-papiers"));
    }
    var item = {};
    item[blob.type] = blob;
    return navigator.clipboard.write([new ClipboardItem(item)]);
  }

  function openImgur(){
    if(!sourceSize()){
      Utils.setStatus($("cropImgurStatus"), "Charge d'abord une image.", "error");
      return;
    }

    var tab = window.open("https://imgur.com/upload", "_blank", "noopener");

    Utils.setStatus($("cropImgurStatus"), "Préparation du fichier...", "");

    buildExport().then(function(result){
      downloadBlob(result.blob, "crop_mudae_225x350." + result.ext);

      return copyBlobToClipboard(result.blob).then(function(){
        Utils.setStatus($("cropImgurStatus"),
          "Fichier téléchargé et copié dans le presse-papiers. Sur l'onglet Imgur qui vient de s'ouvrir, fais Ctrl+V pour le coller directement.", "ok");
      }).catch(function(){
        Utils.setStatus($("cropImgurStatus"),
          "Fichier téléchargé (" + Math.round(result.blob.size / 1024) + " Ko). Sur l'onglet Imgur qui vient de s'ouvrir, glisse le fichier depuis tes téléchargements ou clique « New post ».", "ok");
      });
    }).catch(function(err){
      Utils.setStatus($("cropImgurStatus"), "Préparation impossible : " + err.message, "error");
    });

    if(!tab){
      Utils.setStatus($("cropImgurStatus"),
        "Ton navigateur a bloqué l'ouverture de l'onglet. Autorise les fenêtres surgissantes pour cette page, ou va sur imgur.com/upload à la main.", "warn");
    }
  }

  function init(){
    canvas = $("cropCanvas");
    ctx = canvas.getContext("2d");

    Utils.loadImage("data:image/png;base64," + Assets.border, false).then(function(img){
      frameImg = img;
      draw();
    });

    $("cropFile").addEventListener("change", function(){ loadFile(this.files[0]); });

    $("loadCropUrlBtn").addEventListener("click", function(){
      var url = Utils.normalizeImageUrl($("cropUrl").value.trim());
      if(!url) return;
      Utils.setStatus($("cropStatus"), "Chargement...", "");
      if(/\.gif(\?|$)/i.test(url)){
        fetch(url).then(function(r){
          if(!r.ok) throw new Error("HTTP " + r.status);
          return r.arrayBuffer();
        }).then(function(buf){
          setGif(buf);
          Utils.setStatus($("cropStatus"), "GIF chargé et décodé.", "ok");
        }).catch(function(){
          Utils.setStatus($("cropStatus"),
            "GIF inaccessible depuis le navigateur (CORS). Télécharge-le puis importe-le en local.", "error");
        });
        return;
      }
      Utils.loadImage(url, true).then(function(img){
        setStillImage(img);
        Utils.setStatus($("cropStatus"), "Image chargée.", "ok");
      }).catch(function(){
        Utils.setStatus($("cropStatus"),
          "Chargement impossible (CORS probable). Télécharge l'image puis importe-la en local.", "error");
      });
    });

    $("cropZoom").addEventListener("input", function(){
      if(!sourceSize()) return;
      zoomAround(this.value / 100, canvas.width / 2, canvas.height / 2);
    });

    $("cropFitBtn").addEventListener("click", fit);
    $("cropFillBtn").addEventListener("click", fill);
    $("cropCenterBtn").addEventListener("click", function(){
      center();
      draw();
    });

    $("cropUseFrame").addEventListener("change", draw);
    document.querySelectorAll('input[name="cropBg"]').forEach(function(r){
      r.addEventListener("change", draw);
    });

    $("cropPlayBtn").addEventListener("click", function(){
      if(state.playTimer){
        stopPlayback();
        this.textContent = "Lecture";
      } else {
        startPlayback();
      }
    });

    function stepFrame(delta){
      if(!state.gifFrames) return;
      stopPlayback();
      $("cropPlayBtn").textContent = "Lecture";
      var n = state.gifFrames.canvases.length;
      state.previewIndex = (state.previewIndex + delta + n) % n;
      updateFrameLabel();
      draw();
    }
    $("cropPrevFrame").addEventListener("click", function(){ stepFrame(-1); });
    $("cropNextFrame").addEventListener("click", function(){ stepFrame(1); });

    canvas.addEventListener("pointerdown", function(e){
      if(!sourceSize()) return;
      var pt = Utils.pointerPos(canvas, e);
      state.dragging = true;
      state.lastX = pt.x;
      state.lastY = pt.y;
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", function(e){
      if(!state.dragging) return;
      var pt = Utils.pointerPos(canvas, e);
      state.offsetX += pt.x - state.lastX;
      state.offsetY += pt.y - state.lastY;
      state.lastX = pt.x;
      state.lastY = pt.y;
      draw();
    });

    canvas.addEventListener("pointerup", function(){ state.dragging = false; });
    canvas.addEventListener("pointercancel", function(){ state.dragging = false; });
    canvas.addEventListener("pointerleave", function(){ state.dragging = false; });

    canvas.addEventListener("wheel", function(e){
      if(!sourceSize()) return;
      e.preventDefault();
      var pt = Utils.pointerPos(canvas, e);
      zoomAround(state.scale * (e.deltaY < 0 ? 1.1 : 0.9), pt.x, pt.y);
    }, { passive: false });

    document.addEventListener("keydown", function(e){
      if(!sourceSize()) return;
      if(!$("panel-cropper").classList.contains("active")) return;
      var step = e.shiftKey ? 10 : 1;
      var moved = true;
      if(e.key === "ArrowLeft") state.offsetX -= step;
      else if(e.key === "ArrowRight") state.offsetX += step;
      else if(e.key === "ArrowUp") state.offsetY -= step;
      else if(e.key === "ArrowDown") state.offsetY += step;
      else moved = false;
      if(moved){
        e.preventDefault();
        draw();
      }
    });

    $("cropExportBtn").addEventListener("click", function(){
      if(!sourceSize()){
        alert("Charge d'abord une image.");
        return;
      }
      Utils.setStatus($("cropStatus"),
        state.gifFrames ? "Encodage du GIF, patiente quelques secondes..." : "Export en cours...", "");
      setTimeout(function(){
        buildExport().then(function(result){
          downloadBlob(result.blob, "crop_mudae_225x350." + result.ext);
          Utils.setStatus($("cropStatus"),
            "Export terminé (" + Math.round(result.blob.size / 1024) + " Ko).", "ok");
        }).catch(function(err){
          Utils.setStatus($("cropStatus"), "Export impossible : " + err.message, "error");
        });
      }, 30);
    });

    $("cropImgurBtn").addEventListener("click", openImgur);

    draw();
  }

  return { init: init };
})();
