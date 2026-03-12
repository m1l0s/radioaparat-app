/* ═══════════════════════════════════════
   miniPlayer.js — Mini player i mini ring
   ═══════════════════════════════════════ */

var MINI_CIRC = 113.1; // 2 * PI * 18

function updateMiniPlayer() {
  var isPlayerTab = document.getElementById('screen-player').classList.contains('active');
  var isChatTab   = document.getElementById('screen-chat').classList.contains('active');
  var isReplayTab = document.getElementById('screen-replay').classList.contains('active');
  var mp     = document.getElementById('mini-player');
  var mcMini = document.getElementById('mc-mini-player');

  // MMP vidljiv SAMO na Replay tabu dok mixcloudActive
  if (mcMini) mcMini.style.display = (mixcloudActive && isReplayTab) ? 'block' : 'none';

  // Standardni mini — skriven na: Player, Chat, i dok Mixcloud svira
  if (isPlayerTab || isChatTab || mixcloudActive) {
    mp.style.display = 'none';
    return;
  }
  mp.style.display = 'flex';

  var hasTrack = playing && current.title && current.title !== 'radioAPARAT';
  var liveTitle  = hasTrack ? current.title  : 'radioAPARAT';
  var liveArtist = !playing
    ? 'Pauzirano'
    : (hasTrack ? current.artist : 'Uživo');
  var el = document.getElementById('mini-title');
  var elArtist = document.getElementById('mini-artist');
  var prevTitle = el.textContent;
  el.textContent = liveTitle;
  elArtist.textContent = liveArtist;
  // Marquee samo ako se naslov promenio
  if (prevTitle !== liveTitle) {
    el.classList.remove('marquee');
    requestAnimationFrame(function() {
      var wrap = el.parentElement;
      if (wrap && el.scrollWidth > wrap.clientWidth) {
        var dur = Math.max(5, el.scrollWidth / 40);
        var dist = -(el.scrollWidth + 40);
        el.style.setProperty('--marquee-dur', dur + 's');
        el.style.setProperty('--marquee-dist', dist + 'px');
        el.classList.add('marquee');
      }
    });
  }

  // Sync play/pause icon
  var miniIcon = document.getElementById('mini-play-icon');
  miniIcon.innerHTML = playing
    ? '<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>'
    : '<polygon points="6,3 20,12 6,21"/>';

  // Sync fav
  var favExists = favorites.some(function(f){ return f.title === current.title; });
  var mfb = document.getElementById('mini-fav-btn');
  mfb.classList.toggle('active', favExists);
  mfb.classList.toggle('visible', playing);
  mfb.querySelector('svg').setAttribute('fill', favExists ? 'currentColor' : 'none');

  syncMiniRing();
}

function syncMiniRing() {
  var mainRing = document.getElementById('play-ring');
  var miniRing = document.getElementById('mini-ring');
  if (!mainRing || !miniRing) return;
  var mainOffset = parseFloat(mainRing.style.strokeDashoffset || 188.5);
  var progress = 1 - (mainOffset / 188.5);
  miniRing.style.strokeDashoffset = MINI_CIRC * (1 - Math.max(0, Math.min(1, progress)));
}

function goToPlayer() {
  var playerNav = document.getElementById('nav-player');
  switchTab('player', playerNav);
}

// Sinhronizuj ring svakih 10s kada je mini player vidljiv
setInterval(function(){
  var mp = document.getElementById('mini-player');
  if (mp && mp.style.display !== 'none') syncMiniRing();
}, 10000);
