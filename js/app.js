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

  /* Halo qui suit le curseur sur la carte survolée. Un seul écouteur
     délégué sur <main> plutôt qu'un par carte : les cartes sont créées
     et détruites dynamiquement par plusieurs modules. */
  function initCardSpotlight(){
    var main = document.querySelector("main");
    if(!main) return;
    if(window.matchMedia){
      if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if(!window.matchMedia("(hover: hover)").matches) return;
    }
    var last = null;
    main.addEventListener("pointermove", function(e){
      var card = e.target && e.target.closest ? e.target.closest(".card") : null;
      if(card !== last && last) last.style.removeProperty("--spot");
      last = card;
      if(!card) return;
      var r = card.getBoundingClientRect();
      card.style.setProperty("--cx", (e.clientX - r.left).toFixed(0) + "px");
      card.style.setProperty("--cy", (e.clientY - r.top).toFixed(0) + "px");
      card.style.setProperty("--spot", "1");
    });
    main.addEventListener("pointerleave", function(){
      if(last){ last.style.removeProperty("--spot"); last = null; }
    });
  }

  /* RangÃ©e d'onglets au motif ARIA tablist : un seul onglet dans
     l'ordre de tabulation, les flÃ¨ches circulent entre eux, DÃ©but et
     Fin sautent aux extrÃ©mitÃ©s. */
  function initTabs(){
    var tabs = Array.prototype.slice.call(document.querySelectorAll("#tabs .tab-btn"));
    if(!tabs.length) return;

    function select(btn, focus){
      tabs.forEach(function(b){
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      document.querySelectorAll(".panel").forEach(function(p){
        p.classList.remove("active");
      });
      var panel = document.getElementById("panel-" + btn.dataset.tab);
      if(panel) panel.classList.add("active");
      if(focus) btn.focus();
    }

    tabs.forEach(function(btn, i){
      btn.addEventListener("click", function(){ select(btn, false); });
      btn.addEventListener("keydown", function(e){
        var next = null;
        if(e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        else if(e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if(e.key === "Home") next = tabs[0];
        else if(e.key === "End") next = tabs[tabs.length - 1];
        if(!next) return;
        e.preventDefault();
        select(next, true);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function(){
    initTheme();
    initTabs();
    initCardSpotlight();
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
