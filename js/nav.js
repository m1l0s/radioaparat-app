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
