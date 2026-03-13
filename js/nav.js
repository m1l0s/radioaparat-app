/* ═══════════════════════════════════════
   nav.js — Navigacija, tabovi, sheeti
   ═══════════════════════════════════════ */

/* ── Spring animacija na nav ikonama ── */
function navSpring(el) {
  if (!el) return;
  el.classList.remove('spring-pop');
  void el.offsetWidth;
  el.classList.add('spring-pop');
  setTimeout(function(){ el.classList.remove('spring-pop'); }, 420);
}

function moreSpring(el) {
  if (!el) return;
  el.classList.remove('spring-pop');
  void el.offsetWidth;
  el.classList.add('spring-pop');
  setTimeout(function(){ el.classList.remove('spring-pop'); }, 420);
}

/* ── Zatvori sve bottom sheet-ove ── */
function closeAllSheets() {
  var sheets   = ['stream-sheet','sleep-sheet','airplay-sheet','maps-sheet','history-sheet'];
  var backdrops = ['stream-backdrop','sleep-backdrop','airplay-backdrop','maps-backdrop','history-backdrop'];
  sheets.forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('open'); });
  backdrops.forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('open'); });
}

/* ── Prebaci na glavni tab ── */
function switchTab(n, el) {
  navSpring(el);
  closeMore();
  closeAllSheets();
  activeMoreTab = null;
  document.getElementById('nav-more').classList.remove('active');
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
  document.getElementById('screen-' + n).classList.add('active');
  el.classList.add('active');
  if (n === 'raspored') initProgram();
  if (n === 'supermeni') initSuperMeni();
  if (n === 'shows' && !showImgFetched) { renderShows(); }
  updateMiniPlayer();
}

/* ── Više meni ── */
function toggleMore() {
  if (moreOpen) closeMore(); else openMoreMenu();
}
function openMoreMenu() {
  moreOpen = true;
  document.getElementById('more-menu').classList.add('open');
  document.getElementById('more-backdrop').classList.add('open');
}
function closeMore() {
  moreOpen = false;
  document.getElementById('more-menu').classList.remove('open');
  document.getElementById('more-backdrop').classList.remove('open');
}

/* ── Otvori tab iz Više menija ── */
function openMore(tabName) {
  closeMore();
  closeAllSheets();
  activeMoreTab = tabName;
  document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
  document.getElementById('nav-more').classList.add('active');
  document.getElementById('screen-' + tabName).classList.add('active');
  if (tabName === 'replay' && !replayLoaded) { replayLoaded = true; loadReplay(); }
  if (tabName === 'shows' && !showImgFetched) { renderShows(); }
  updateMiniPlayer();
  setTimeout(updateMiniPlayer, 50);
}

/* ── Light/Dark mode ── */
function setMode(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  document.body.classList.toggle('light-mode', mode === 'light');
  document.getElementById('btn-dark').classList.toggle('active', mode === 'dark');
  document.getElementById('btn-light').classList.toggle('active', mode === 'light');
  if (typeof _renderShowsGrid === 'function') _renderShowsGrid();
}

/* ═══════════════════════════════════════
   Pull-to-refresh
   Skreni prstom dole na vrhu ekrana → reload podataka
   ═══════════════════════════════════════ */
(function() {
  var PTR_THRESHOLD = 65; // px koliko treba povući
  var pullStart = null;
  var pulling = false;

  /* Mapiranje ID-a ekrana → funkcija refresha */
  var REFRESH_MAP = {
    'screen-replay':   function() { if(typeof loadReplay === 'function') { replayLoaded = false; loadReplay(); } },
    'screen-shows':    function() { if(typeof renderShows === 'function') { showImgFetched = false; renderShows(); } },
    'screen-favs':     function() { if(typeof renderFavs === 'function') renderFavs(); },
    'screen-chat':     function() { var f = document.querySelector('#screen-chat iframe'); if(f){ var s=f.src; f.src=''; f.src=s; } }
  };

  function getActiveScrollEl() {
    var screens = ['screen-replay','screen-shows','screen-favs','screen-chat'];
    for (var i=0; i<screens.length; i++) {
      var el = document.getElementById(screens[i]);
      if (el && el.classList.contains('active')) return { screen: screens[i], el: el };
    }
    return null;
  }

  function isAtTop(el) {
    var scrollable = el.querySelector('.episodes-list, .shows-grid, #fav-list, .onama-scroll, iframe');
    if (!scrollable) return el.scrollTop === 0;
    if (scrollable.tagName === 'IFRAME') return true;
    return scrollable.scrollTop === 0;
  }

  function showPTRIndicator(el) {
    var ind = el.querySelector('.ptr-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.className = 'ptr-indicator';
      ind.innerHTML = '<svg class="ptr-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="22" height="22"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
      el.insertBefore(ind, el.firstChild);
    }
    ind.classList.add('visible');
  }

  function hidePTRIndicator(el) {
    var ind = el.querySelector('.ptr-indicator');
    if (ind) ind.classList.remove('visible');
  }

  document.addEventListener('touchstart', function(e) {
    var active = getActiveScrollEl();
    if (!active) return;
    if (isAtTop(active.el)) {
      pullStart = e.touches[0].clientY;
      pulling = false;
    }
  }, { passive:true });

  document.addEventListener('touchmove', function(e) {
    if (pullStart === null) return;
    var active = getActiveScrollEl();
    if (!active) return;
    var dy = e.touches[0].clientY - pullStart;
    if (dy > 10 && isAtTop(active.el)) {
      pulling = true;
      if (dy > PTR_THRESHOLD / 2) showPTRIndicator(active.el);
    }
  }, { passive:true });

  document.addEventListener('touchend', function() {
    if (!pulling || pullStart === null) { pullStart = null; pulling = false; return; }
    var active = getActiveScrollEl();
    pullStart = null; pulling = false;
    if (!active) return;
    var fn = REFRESH_MAP[active.screen];
    if (fn) {
      showPTRIndicator(active.el);
      fn();
      setTimeout(function(){ hidePTRIndicator(active.el); }, 1200);
    } else {
      hidePTRIndicator(active.el);
    }
  });
})();

/* ═══════════════════════════════════════
   Tap status bar → scroll to top
   ═══════════════════════════════════════ */
(function() {
  var sb = document.querySelector('.statusbar');
  if (!sb) return;
  sb.addEventListener('click', function() {
    /* Pokušaj skrolati aktivni scroll kontejner */
    var scrollTargets = document.querySelectorAll(
      '.screen.active .episodes-list, .screen.active .shows-grid, ' +
      '.screen.active #fav-list, .screen.active .onama-scroll, ' +
      '.screen.active .raspored-list, .screen.active .sm-list, ' +
      '.screen.active .day-tabs'
    );
    var scrolled = false;
    scrollTargets.forEach(function(el) {
      if (el.scrollHeight > el.clientHeight || el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: 'smooth' });
        scrolled = true;
      }
    });
    /* Fallback: skrolaj ceo screen */
    if (!scrolled) {
      var active = document.querySelector('.screen.active');
      if (active) active.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
