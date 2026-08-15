(function(){

  function initTheme(){
    var toggle = document.getElementById("themeToggle");
    if(!toggle) return;
    toggle.addEventListener("click", function(){
      var root = document.documentElement;
      var isLight = root.getAttribute("data-theme") === "light";
      var next = isLight ? "dark" : "light";

      // Certains navigateurs "figent" une propriété transitionnée quand
      // sa valeur change via une variable CSS re-résolue par un attribut
      // plutôt que par la règle elle-même (ex. couleurs de thème). On
      // coupe toutes les transitions le temps du bascule pour forcer un
      // recalcul propre, sans avoir à traquer chaque règle une par une.
      root.classList.add("theme-switching");

      if(next === "light") root.setAttribute("data-theme", "light");
      else root.removeAttribute("data-theme");
      toggle.setAttribute("aria-label", next === "light" ? "Basculer en mode nuit" : "Basculer en mode jour");
      try{ localStorage.setItem("mudae-theme", next); }catch(e){}

      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          root.classList.remove("theme-switching");
        });
      });
    });
  }

  function initLoader(){
    var loader = document.getElementById("loader");
    if(!loader) return;
    var minDelay = 550;
    var start = Date.now();
    function hide(){
      var elapsed = Date.now() - start;
      var wait = Math.max(0, minDelay - elapsed);
      setTimeout(function(){
        loader.classList.add("is-hidden");
        setTimeout(function(){
          if(loader.parentNode) loader.parentNode.removeChild(loader);
        }, 550);
      }, wait);
    }
    if(document.readyState === "complete") hide();
    else window.addEventListener("load", hide);
  }
  initLoader();

  function initCarousel(){
    var track = document.getElementById("carouselTrack");
    if(!track) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll(".carousel-card"));
    var n = cards.length;
    if(!n) return;

    var activeIndex = 0;
    cards.forEach(function(c, i){ if(c.classList.contains("active")) activeIndex = i; });

    function circularOffset(i){
      var raw = ((i - activeIndex) % n + n) % n;
      if(raw > n / 2) raw -= n;
      return raw;
    }

    var caption = document.getElementById("carouselCaption");

    function layout(){
      cards.forEach(function(card, i){
        Array.prototype.slice.call(card.classList).forEach(function(c){
          if(/^co--?\d+$/.test(c)) card.classList.remove(c);
        });
        card.classList.add("co-" + circularOffset(i));
      });
      if(caption) caption.textContent = cards[activeIndex].textContent.trim();
    }

    cards.forEach(function(card, i){
      card.addEventListener("click", function(){
        activeIndex = i;
        layout();
      });
    });

    var prev = document.getElementById("carouselPrev");
    var next = document.getElementById("carouselNext");
    if(prev) prev.addEventListener("click", function(){
      cards[((activeIndex - 1) % n + n) % n].click();
    });
    if(next) next.addEventListener("click", function(){
      cards[(activeIndex + 1) % n].click();
    });

    var stage = document.querySelector(".carousel-stage");
    if(stage){
      var DRAG_STEP = 70;
      var dragX = null;
      var dragAccum = 0;
      var moved = false;

      function onDragMove(e){
        if(dragX === null) return;
        var x = e.clientX;
        var dx = x - dragX;
        dragX = x;
        dragAccum += dx;
        while(dragAccum <= -DRAG_STEP){
          cards[(activeIndex + 1) % n].click();
          dragAccum += DRAG_STEP;
          moved = true;
        }
        while(dragAccum >= DRAG_STEP){
          cards[((activeIndex - 1) % n + n) % n].click();
          dragAccum -= DRAG_STEP;
          moved = true;
        }
      }
      function onDragEnd(){
        dragX = null;
        stage.classList.remove("is-dragging");
        document.removeEventListener("pointermove", onDragMove);
        document.removeEventListener("pointerup", onDragEnd);
        setTimeout(function(){ moved = false; }, 0);
      }
      stage.addEventListener("pointerdown", function(e){
        dragX = e.clientX;
        dragAccum = 0;
        moved = false;
        stage.classList.add("is-dragging");
        document.addEventListener("pointermove", onDragMove);
        document.addEventListener("pointerup", onDragEnd);
      });
      stage.addEventListener("click", function(e){
        if(moved && e.isTrusted){ e.stopPropagation(); e.preventDefault(); }
      }, true);
    }

    document.addEventListener("keydown", function(e){
      var tag = document.activeElement && document.activeElement.tagName;
      if(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if(e.key === "ArrowLeft" && prev) prev.click();
      if(e.key === "ArrowRight" && next) next.click();
    });

    layout();
  }

  function initHero(){
    var strips = document.getElementById("heroStrips");
    if(strips){
      var count = window.innerWidth < 640 ? 8 : 14;
      for(var i = 0; i < count; i++){
        var span = document.createElement("span");
        span.style.animationDelay = (i * 0.12) + "s";
        strips.appendChild(span);
      }
    }

    var reduceMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var hero = document.getElementById("hero");
    if(hero && !reduceMotion && window.matchMedia && window.matchMedia("(hover: hover)").matches){
      hero.addEventListener("pointermove", function(e){
        var rect = hero.getBoundingClientRect();
        var mx = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
        var my = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
        hero.style.setProperty("--mx", mx + "%");
        hero.style.setProperty("--my", my + "%");
      });
    }
  }

  function initTabs(){
    document.querySelectorAll("#tabs .tab-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        document.querySelectorAll("#tabs .tab-btn").forEach(function(b){
          b.classList.remove("active");
        });
        document.querySelectorAll(".panel").forEach(function(p){
          p.classList.remove("active");
        });
        btn.classList.add("active");
        document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function(){
    initTheme();
    initHero();
    initTabs();
    initCarousel();
    CropperTool.init();
    Solvers.init();
    WishFormator.init();
    BoostWish.init();
    HaremSort.init();
    ColorPicker.init();
    PlayerStats.init();
    SpriteTool.init().catch(function(err){
      Utils.setStatus(
        Utils.$("pokeStatus"),
        "Les assets locaux n'ont pas pu être décodés : " + err.message,
        "error"
      );
    });
  });

})();
