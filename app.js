/* ═══ CONFIG ═══ */
var STREAMS = [
  'http://live4.rcast.net:8268/',
  'https://stream4.rcast.net/72355/'
];
// On HTTPS pages, HTTP streams are blocked — start from HTTPS stream
var streamIndex = (location.protocol === 'https:') ? 1 : 0;
var STREAM = STREAMS[streamIndex];
var MC_USER = 'RADIO_APARAT';
var audio   = document.getElementById('audio');
audio.volume = 0.7;

// Anthropic API ključ za refresh rasporeda i Super Menija.
// NIKADA ne commit-uj pravi ključ u javni repozitorijum.
// Za lokalni razvoj: postavi ovde. Za produkciju: koristi backend proxy.
var ANTHROPIC_API_KEY = '';
// GitHub raw URL za schedule.json — PROMENI u svoj username/repo
var SCHEDULE_JSON_URL = 'https://raw.githubusercontent.com/m1l0s/radioaparat-app/main/schedule.json';

var playing      = false;
var favorites    = [];
var current      = { title: '', artist: 'radioAPARAT' };
var trackHistory = [];

// DEBUG helper — ukloniti pre produkcije
var DBG = false; // postavi na true da ukljucis debug panel

var SHOW_STREAM_LINKS = false; // postavi na true da prikažeš striming tastere
function dbg(type, msg) {
  if (!DBG) return;
  var panel = document.getElementById('debug-panel');
  var el = document.getElementById('dbg-' + type);
  if (!panel || !el) return;
  panel.style.display = 'block';
  el.textContent = (type === 'rds' ? 'RDS: ' : 'ART: ') + msg;
  console.log('[' + type.toUpperCase() + ']', msg);
}
var allEpisodes  = [];
var activeDate   = 'sve';
var playingKey   = null;
var replayLoaded = false;
var activeShowCat = 'sve';
var showImgCache  = {};
var showImgFetched = false;
var moreOpen      = false;
var activeMoreTab = null;
var mixcloudActive = false; // true dok MMP svira

/* ═══ UTILS ═══ */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var toastTimer;
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2000);
}

function updateClock() {
  var d = new Date();
  var h = d.getHours(), m = d.getMinutes();
  document.getElementById('statusbar-time').textContent = h + ':' + (m<10?'0':'')+m;
}
updateClock();
setInterval(updateClock, 10000);

/* ═══ NAV ═══ */
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

function closeAllSheets() {
  // Zatvara sve bottom sheet-ove — pozivati uvek pri promeni taba
  var sheets = ['stream-sheet','sleep-sheet','airplay-sheet','maps-sheet','history-sheet'];
  var backdrops = ['stream-backdrop','sleep-backdrop','airplay-backdrop','maps-backdrop','history-backdrop'];
  sheets.forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('open'); });
  backdrops.forEach(function(id){ var el=document.getElementById(id); if(el) el.classList.remove('open'); });
}

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
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('Kopirano ✓');
  }).catch(function() {
    showToast('Kopirajte ručno: ' + text);
  });
}

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

/* ═══ PLAYER ═══ */
function tryStream() {
  audio.onerror = null;
  var src = STREAMS[streamIndex];
  if (audio.src !== src) audio.src = src;
  audio.onerror = function(e) {
    // Ignorisi greske dok je pauzirano
    if (!playing) return;
    if (streamIndex < STREAMS.length - 1) {
      streamIndex++;
      showToast('Probavam rezervni stream...');
      tryStream();
    } else {
      showToast('Problem sa streamom — pokušaj ponovo');
    }
  };
  audio.play().catch(function(){});
}

function setPlayUI(isPlaying) {
  document.getElementById('play-icon').innerHTML = isPlaying
    ? '<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>'
    : '<polygon points="6,3 20,12 6,21"/>';
  document.getElementById('play-btn').classList.toggle('playing-state', isPlaying);
  document.querySelector('.play-ring-wrap').classList.toggle('is-playing', isPlaying);
  document.querySelector('.mini-ring-wrap').classList.toggle('is-playing', isPlaying);
  document.getElementById('album-art').classList.toggle('playing', isPlaying);
  document.getElementById('eq-bars').classList.toggle('on', isPlaying);
  document.getElementById('live-badge').style.display = isPlaying ? 'inline-flex' : 'none';
  if (!isPlaying) document.getElementById('album-glow').classList.remove('on');
}

function togglePlay() {
  if (playing) {
    // PAUZA — ne brisi src, samo pauziraj
    playing = false;
    audio.pause();
    audio.onerror = null;
    clearRing();
    setPlayUI(false);
  } else {
    // PLAY — zaustavi MMP ako svira
    if (mixcloudActive) stopEp();
    playing = true;
    streamIndex = (location.protocol === 'https:') ? 1 : 0;
    tryStream();
    setPlayUI(true);
    startRingForCurrentShow();
    fetchNow();
    setTimeout(fetchNow, 2000); // brzi retry — stream možda još bufferuje pri prvom pozivu
    showToast('Pokrećem stream...');
  }
  updateMiniPlayer();
}



// RDS — probavamo sve endpointe dok jedan ne prorade
// Kada nađemo koji radi, koristimo samo njega
var rdsWorkingIdx = -1; // -1 = jos trazimo

var RDS_ENDPOINTS = [
  // Direktni rcast stats JSON — najpouzdaniji (kroz proxy jer HTTP)
  'https://api.allorigins.win/get?url=' + encodeURIComponent('http://live4.rcast.net:8268/stats?sid=1&json=1'),
  // Icecast status-json.xsl
  'https://api.allorigins.win/get?url=' + encodeURIComponent('http://live4.rcast.net:8268/status-json.xsl'),
  // corsproxy fallback
  'https://corsproxy.io/?' + encodeURIComponent('http://live4.rcast.net:8268/stats?sid=1&json=1'),
  // rcast hosted API
  'https://rcast.net/api/nowplaying/72355',
];

function parseRDSResponse(d) {
  if (!d) return null;
  // allorigins wrapper {"contents": "...json..."}
  if (d.contents) {
    try { return parseRDSResponse(JSON.parse(d.contents)); } catch(e){}
    // nekad contents vraca XML ili plain text
    var m = String(d.contents).match(/<title>([^<]+)<\/title>/i);
    if (m) return m[1];
    return null;
  }
  // rcast stats?sid=1&json=1 format: {"songtitle":"Artist - Title", ...}
  if (typeof d.songtitle === 'string' && d.songtitle.trim()) return d.songtitle.trim();
  // icecast status-json
  if (d.icestats) {
    var src = d.icestats.source;
    if (!src) return null;
    if (Array.isArray(src)) src = src[0];
    return src.title || src.server_name || null;
  }
  // rcast nowplaying API
  if (d.now_playing && d.now_playing.song) {
    var s = d.now_playing.song;
    return [s.artist, s.title].filter(Boolean).join(' - ') || null;
  }
  if (typeof d.nowplaying === 'string' && d.nowplaying.trim()) return d.nowplaying.trim();
  if (typeof d.title  === 'string' && d.title.trim())  return d.title.trim();
  if (typeof d.song   === 'string' && d.song.trim())   return d.song.trim();
  return null;
}

function applyTrack(t) {
  if (!t || t.trim() === '') return;
  t = t.trim();
  var p = t.split(' - ');
  var newTrack = p.length > 1
    ? { artist: p[0].trim(), title: p.slice(1).join(' - ').trim() }
    : { title: t, artist: 'radioAPARAT' };
  if (newTrack.title !== current.title && current.title !== '') {
    trackHistory.unshift({ title: current.title, artist: current.artist, time: new Date() });
    if (trackHistory.length > 10) trackHistory.pop();
    renderHistory();
  }
  current = newTrack;
  var titleEl = document.getElementById('track-title');
  var artistEl = document.getElementById('track-artist');
  titleEl.style.opacity = '0';
  setTimeout(function(){ titleEl.textContent = current.title; titleEl.style.opacity = '1'; }, 200);
  artistEl.textContent = current.artist;
  artistEl.style.visibility = current.artist ? 'visible' : 'hidden';
  if (SHOW_STREAM_LINKS) document.getElementById('now-stream-links').style.display = 'grid';
  fetchStreamLinks(current.artist, current.title);
  updateMiniPlayer();
  checkFav();
}

// ── Artwork cache: pamti URL po "artist - title" ──
var _artworkCache = {};

function fetchNow() {
  if (!playing) return;
  dbg('rds', '⏳ fetchNow start, idx=' + rdsWorkingIdx);

  function scheduleNext() {
    setTimeout(updateMiniPlayer, 500);
    setTimeout(function(){
      if (document.getElementById('history-sheet').classList.contains('open')) renderHistory();
    }, 600);
    if (playing) setTimeout(fetchNow, 5000); // polling svakih 5s
  }

  function tryWithRace(endpoints) {
    // Promise.race — pobedi koji prvi odgovori sa validnim tracksom
    var racePromises = endpoints.map(function(url, idx) {
      return fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var t = parseRDSResponse(d);
          if (!t) throw new Error('parse null');
          return { track: t, idx: idx };
        });
    });

    // Koristimo allSettled-like pattern: uzimamo prvi koji USPE
    var resolved = false;
    var remaining = racePromises.length;
    return new Promise(function(resolve, reject) {
      racePromises.forEach(function(p) {
        p.then(function(result) {
          if (!resolved) { resolved = true; resolve(result); }
        }).catch(function() {
          remaining--;
          if (remaining === 0 && !resolved) reject(new Error('svi endpointi pali'));
        });
      });
    });
  }

  // Ako znamo koji endpoint radi, probaj njega direktno (brže)
  // ali paralelno pošalji i race kao osiguranje ako poznati padne
  if (rdsWorkingIdx >= 0) {
    fetch(RDS_ENDPOINTS[rdsWorkingIdx])
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var t = parseRDSResponse(d);
        dbg('rds', '✅ EP[' + rdsWorkingIdx + '] → ' + JSON.stringify(t));
        if (t) applyTrack(t);
        scheduleNext();
      })
      .catch(function(e) {
        dbg('rds', '❌ EP[' + rdsWorkingIdx + '] pao: ' + e);
        rdsWorkingIdx = -1;
        // Odmah race na svim endpointima bez čekanja
        tryWithRace(RDS_ENDPOINTS)
          .then(function(result) {
            rdsWorkingIdx = result.idx;
            dbg('rds', '✅ Race recovery EP[' + result.idx + ']');
            applyTrack(result.track);
            scheduleNext();
          })
          .catch(function() {
            dbg('rds', '❌ Svi endpointi pali');
            if (playing) setTimeout(fetchNow, 5000);
          });
      });
    return;
  }

  // Prva pretraga — race sve endpointe paralelno
  tryWithRace(RDS_ENDPOINTS)
    .then(function(result) {
      rdsWorkingIdx = result.idx;
      dbg('rds', '✅ KORISTIM EP[' + result.idx + ']');
      applyTrack(result.track);
      scheduleNext();
    })
    .catch(function() {
      dbg('rds', '❌ Svi endpointi pali pri startu');
      if (playing) setTimeout(fetchNow, 5000);
    });
}

function fetchStreamLinks(artist, title) {
  var q = encodeURIComponent(artist + ' ' + title);
  document.getElementById('lnk-spotify').href  = 'https://open.spotify.com/search/' + q;
  document.getElementById('lnk-apple').href    = 'https://music.apple.com/search?term=' + q;
  document.getElementById('lnk-youtube').href  = 'https://music.youtube.com/search?q=' + q;
  document.getElementById('lnk-deezer').href   = 'https://www.deezer.com/search/' + q;
  fetchArtwork(artist, title);
}

var lastArtworkTitle = '';
function fetchArtwork(artist, title) {
  if (!artist || !title) { dbg('art', '⚠️ artist/title prazno'); return; }
  var key = artist + ' - ' + title;
  if (key === lastArtworkTitle) { dbg('art', '⏭ isti key, skip'); return; }
  lastArtworkTitle = key;

  // Keš — ako smo već tražili ovu pesmu, prikaži odmah
  if (_artworkCache[key]) {
    dbg('art', '⚡ keš hit: ' + key);
    setAlbumArt(_artworkCache[key]);
    return;
  }

  dbg('art', '🔍 iTunes: ' + key);
  var q = encodeURIComponent(artist + ' ' + title);
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var artTimer = controller ? setTimeout(function(){ controller.abort(); }, 6000) : null;
  fetch('https://itunes.apple.com/search?term=' + q + '&media=music&limit=1&country=US',
        controller ? { signal: controller.signal } : {})
    .then(function(r){ if (artTimer) clearTimeout(artTimer); return r.json(); })
    .then(function(d){
      if (d.results && d.results.length > 0) {
        var art = d.results[0].artworkUrl100;
        if (art) {
          art = art.replace('100x100bb', '600x600bb');
          _artworkCache[key] = art; // sačuvaj u keš
          dbg('art', '✅ setAlbumArt + keš: ' + art);
          setAlbumArt(art);
          return;
        }
      }
      dbg('art', '❌ nema result');
      clearAlbumArt();
    })
    .catch(function(e){ if (artTimer) clearTimeout(artTimer); dbg('art', '❌ fetch err: ' + e); clearAlbumArt(); });
}

function setAlbumArt(url) {
  var pinImg   = document.querySelector('.album-pin-img');
  var logoImg  = document.querySelector('.album-logo-img');
  var miniPin  = document.querySelector('.mini-pin-img');
  var glowEl   = document.querySelector('.album-glow');

  // Preload
  var img = new Image();
  img.onload = function() {
    if (pinImg)  {
      pinImg.src = url;
      pinImg.classList.add('has-artwork');
    }
    if (miniPin) {
      miniPin.src = url;
      miniPin.classList.add('has-artwork');
    }
    if (logoImg) { logoImg.style.display = 'none'; }
    if (glowEl)  {
      glowEl.style.backgroundImage = 'url(' + url + ')';
      glowEl.classList.add('on');
    }
  };
  img.onerror = function(){ clearAlbumArt(); };
  img.src = url;
}

function clearAlbumArt() {
  var pinImg  = document.querySelector('.album-pin-img');
  var miniPin = document.querySelector('.mini-pin-img');
  var logoImg = document.querySelector('.album-logo-img');
  var glowEl  = document.querySelector('.album-glow');
  if (pinImg)  { pinImg.classList.remove('has-artwork'); }
  if (miniPin) { miniPin.classList.remove('has-artwork'); }
  if (logoImg) { logoImg.style.display = ''; }
  if (glowEl)  { glowEl.classList.remove('on'); glowEl.style.backgroundImage = ''; }
}

function checkFav() {
  if (!current.title) return;
  var btn = document.getElementById('fav-btn');
  if (!btn) return;
  var exists = favorites.some(function(f){ return f.title === current.title; });
  btn.classList.toggle('active', exists);
  btn.querySelector('svg').setAttribute('fill', exists ? 'currentColor' : 'none');
}

function toggleFav() {
  if (!current.title) return;
  var exists = favorites.some(function(f){ return f.title === current.title; });
  if (exists) { favorites = favorites.filter(function(f){ return f.title !== current.title; }); showToast('Uklonjeno iz favorita'); }
  else { favorites.unshift({ title:current.title, artist:current.artist }); showToast('♥ Dodato u favorite'); }
  checkFav(); renderFavs();
  updateMiniPlayer();
}

function shareTrack() {
  var txt = current.title + ' - ' + current.artist + ' | radioAPARAT radioaparat.rs';
  if (navigator.share) navigator.share({ title:'radioAPARAT', text:txt });
  else { navigator.clipboard && navigator.clipboard.writeText(txt); showToast('Kopirano ✓'); }
}

function fetchPlayedHistory(callback) {
  var RCAST_PLAYED = 'http://live4.rcast.net:8268/played.html?sid=1';
  var RCAST_STATS  = 'http://live4.rcast.net:8268/stats?sid=1&json=1';

  var proxies = [
    'https://corsproxy.io/?' + encodeURIComponent(RCAST_PLAYED),
    'https://api.allorigins.win/get?url=' + encodeURIComponent(RCAST_PLAYED),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(RCAST_PLAYED),
    'https://corsproxy.io/?' + encodeURIComponent(RCAST_STATS),
    'https://api.allorigins.win/get?url=' + encodeURIComponent(RCAST_STATS),
  ];

  function decodeHtmlText(s) {
    return s.replace(/<[^>]+>/g,'')
      .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'")
      .replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
      .replace(/\s+/g,' ').trim();
  }

  // Returns true if string looks like a real song (Artist - Title format, no server junk)
  function isValidSong(s) {
    if (!s || s.length < 3) return false;
    // Reject server/navigation/HTML content
    if (/shoutcast|icecast|server|status|history|admin|stream|listener|source|bitrate|version|posix|linux|windows|genre|url:|&nbsp;/i.test(s)) return false;
    if (/^\d+$/.test(s)) return false; // just a number
    return true;
  }

  function parseHtml(html) {
    var rows = [];
    // Format 1: <tr><td> table — rcast played.html has time in col0, "Artist - Title" in col1
    var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, trM;
    while ((trM = trRe.exec(html)) !== null) {
      var cells = [], tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi, tdM;
      while ((tdM = tdRe.exec(trM[1])) !== null)
        cells.push(decodeHtmlText(tdM[1]));
      // Try col1 first (time|track format), then col0
      var trackStr = (cells.length >= 2 ? cells[1] : cells[0] || '');
      if (!isValidSong(trackStr) && cells[0]) trackStr = cells[0];
      if (!isValidSong(trackStr)) continue;
      var parts = trackStr.indexOf(' - ') > 0 ? trackStr.split(' - ') : (trackStr.indexOf(' – ') > 0 ? trackStr.split(' – ') : null);
      rows.push(parts
        ? { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim(), time: new Date() }
        : { artist: '', title: trackStr, time: new Date() }
      );
    }
    if (rows.length) return rows;

    // Format 2: plain text lines "Artist - Title"
    decodeHtmlText(html).split(/\n|\r/).forEach(function(line){
      line = line.trim();
      if (!isValidSong(line)) return;
      var idx = line.indexOf(' - ');
      if (idx > 0) {
        rows.push({ artist: line.slice(0, idx).trim(), title: line.slice(idx+3).trim(), time: new Date() });
      }
    });
    return rows;
  }

  function parseStats(json) {
    // rcast stats JSON may contain songtitle or song history
    var rows = [];
    try {
      var data = (typeof json === 'string') ? JSON.parse(json) : json;
      var icestats = data.icestats || data;
      var src = icestats.source || (Array.isArray(icestats.sources) ? icestats.sources[0] : null);
      if (src) {
        // Current song
        var song = src.songtitle || src.title || '';
        if (song && song.indexOf(' - ') > 0) {
          var p = song.split(' - ');
          rows.push({ artist: p[0].trim(), title: p.slice(1).join(' - ').trim() });
        }
      }
    } catch(e){}
    return rows;
  }

  function tryProxy(i) {
    if (i >= proxies.length) return;
    var url = proxies[i];
    var isStats = url.indexOf('stats') > -1;

    fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined })
      .then(function(r){ return r.text(); })
      .then(function(text){
        var rows = [];
        // allorigins wraps in JSON
        if (text.trim().startsWith('{')) {
          try {
            var d = JSON.parse(text);
            var inner = d.contents || d;
            if (isStats) {
              rows = parseStats(inner);
            } else {
              rows = typeof inner === 'string' ? parseHtml(inner) : [];
            }
          } catch(e){ rows = isStats ? parseStats(text) : parseHtml(text); }
        } else {
          rows = isStats ? parseStats(text) : parseHtml(text);
        }

        if (rows.length > 0) {
          if (callback) callback(rows.slice(0, 10));
        } else {
          tryProxy(i + 1);
        }
      })
      .catch(function(){ tryProxy(i + 1); });
  }

  tryProxy(0);
}

function toggleHistory() {
  var btn = document.getElementById('history-btn');
  var isOpen = document.getElementById('history-sheet').classList.contains('open');
  if (isOpen) {
    closeHistorySheet();
    btn.classList.remove('active');
  } else {
    closeAllSheets();
    document.getElementById('history-backdrop').classList.add('open');
    document.getElementById('history-sheet').classList.add('open');
    btn.classList.add('active');
    // Always show loading and fetch fresh
    var listEl = document.getElementById('history-list');
    if (listEl) listEl.innerHTML = '<div style="padding:16px 0;color:var(--text2);font-size:14px;text-align:center;">Učitavam...</div>';
    fetchPlayedHistory(function(rows){
      var currentTitle = current.title || '';
      var history = rows.filter(function(r){
        // Prikaži samo redove koji imaju i izvođača i naslov (format "Izvođač - Naslov")
        if (!r.artist || !r.title) return false;
        // Ukloni current song
        if (currentTitle && r.title.toLowerCase() === currentTitle.toLowerCase()) return false;
        return true;
      }).slice(0, 3);
      trackHistory = history;
      renderHistory();
    });
  }
}

function closeHistorySheet() {
  document.getElementById('history-backdrop').classList.remove('open');
  document.getElementById('history-sheet').classList.remove('open');
  document.getElementById('history-btn').classList.remove('active');
}

function renderHistory() {
  var el = document.getElementById('history-list');
  if (!el) return;
  if (!trackHistory.length) {
    el.innerHTML = '<div style="padding:16px 0;color:var(--text2);font-size:14px;text-align:center;">Još nema prethodnih pesama.</div>';
    return;
  }
  el.innerHTML = trackHistory.slice(0, 3).map(function(t, i) {
    var isFav = favorites.some(function(f){ return f.title === t.title; });
    var rawQ = t.artist + ' ' + t.title;
    var safeArtist = esc(t.artist).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeTitle  = esc(t.title).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var safeQ      = rawQ.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div class="history-item" onclick="openStreamSheet(\'' + safeArtist + '\',\'' + safeTitle + '\',\'' + safeQ + '\')">' +
      '<div class="history-num">' + (i+1) + '</div>' +
      '<div class="history-info">' +
        '<div class="history-title">' + esc(t.title) + '</div>' +
        '<div class="history-artist">' + (t.artist ? esc(t.artist) : '') + '</div>' +
      '</div>' +
      '<button class="history-fav' + (isFav ? ' active' : '') + '" onclick="event.stopPropagation();toggleHistFav(' + i + ')">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="' + (isFav ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2.2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
      '</button>' +
    '</div>';
  }).join('');
}

function toggleHistFav(i) {
  var t = trackHistory[i];
  var exists = favorites.some(function(f){ return f.title === t.title; });
  if (exists) favorites = favorites.filter(function(f){ return f.title !== t.title; });
  else favorites.unshift({ title:t.title, artist:t.artist });
  checkFav(); renderFavs(); renderHistory();
}

/* ═══ FAVORITI ═══ */
var PIN_SVG = '<svg viewBox="0 0 100 100" fill="none"><g stroke="#000" stroke-width="6" stroke-linecap="round"><line x1="50" y1="4" x2="50" y2="13"/><line x1="65.3" y1="6.7" x2="61.7" y2="15.1"/><line x1="78.3" y1="14.6" x2="72.3" y2="20.6"/><line x1="86.7" y1="26.7" x2="78.5" y2="30.3"/><line x1="89.5" y1="41" x2="80.5" y2="41"/><line x1="34.7" y1="6.7" x2="38.3" y2="15.1"/><line x1="21.7" y1="14.6" x2="27.7" y2="20.6"/><line x1="13.3" y1="26.7" x2="21.5" y2="30.3"/><line x1="10.5" y1="41" x2="19.5" y2="41"/></g><path d="M50 22 C35 22 24 33 24 46 C24 60 50 82 50 82 C50 82 76 60 76 46 C76 33 65 22 50 22Z" stroke="#000" stroke-width="5" fill="none"/><circle cx="50" cy="46" r="10" stroke="#000" stroke-width="5" fill="none"/><circle cx="50" cy="46" r="3.5" fill="#000"/></svg>';

function renderFavs() {
  var n = favorites.length;
  document.getElementById('fav-count').textContent = n===0?'0 sačuvanih pesama':n===1?'1 sačuvana pesma':n+' sačuvanih pesama';
  document.getElementById('fav-empty').style.display = n?'none':'block';
  var exportBtn = document.getElementById('fav-export-btn');
  if(exportBtn) exportBtn.style.display = n ? 'block' : 'none';
  document.getElementById('fav-list').innerHTML = favorites.map(function(f,i){
    var rawQ = encodeURIComponent(f.artist ? f.artist+' '+f.title : f.title);
    return '<div class="fav-item" style="flex-direction:column;align-items:stretch;gap:10px;">'+
      '<div style="display:flex;align-items:center;gap:14px;">'+
        '<div class="fav-thumb-sm">'+PIN_SVG+'</div>'+
        '<div class="fav-info"><div class="fav-title">'+esc(f.title)+'</div><div class="fav-artist">'+esc(f.artist)+'</div></div>'+
        '<button class="fav-del" onclick="delFav('+i+')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'+
      '</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">'+
        '<a href="https://music.apple.com/search?term='+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Apple Music</a>'+
        '<a href="https://www.deezer.com/search/'+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Deezer</a>'+
        '<a href="https://open.spotify.com/search/'+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">Spotify</a>'+
        '<a href="https://music.youtube.com/search?q='+rawQ+'" target="_blank" style="flex:1;min-width:70px;text-align:center;justify-content:center;padding:7px 8px;border-radius:10px;border:1px solid var(--border2);font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;display:flex;align-items:center;">YouTube Music</a>'+
      '</div>'+
    '</div>';
  }).join('');
}

function exportFavs() {
  if(!favorites.length) return;
  var lines = ['radioAPARAT — Moje omiljene pesme', ''];
  favorites.forEach(function(f,i){
    lines.push((i+1)+'. '+(f.artist?f.artist+' — ':'')+f.title);
  });
  lines.push('', 'radioaparat.rs');
  var blob = new Blob([lines.join('\n')], {type:'text/plain;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'radioAPARAT-favoriti.txt';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
function delFav(i) { favorites.splice(i,1); renderFavs(); checkFav(); }

/* ═══ RASPORED ═══ */
var rasporedData = [
  {"date":"03.03.2026.","items":[
    {"time":"14:00","title":"SUPER MENI LISTA (r)","host":"Ceca Đolović"},
    {"time":"18:00","title":"BEOPOLIS IZ RADIOAPARATA","host":"Aleksandar Nikolić Kafka"},
    {"time":"20:00","title":"ŠIZOANALIZA","host":"Anđelija Rudnjanin"}]},
  {"date":"04.03.2026.","items":[
    {"time":"11:00","title":"DJ SATARAŠ - Uncool","host":"Ceca"},
    {"time":"14:00","title":"POP DEPRESIJA","host":"Ivan Lončarević"},
    {"time":"17:00","title":"REGGAE FEVER","host":"Nenad Pekez"},
    {"time":"18:00","title":"KAMILICA","host":"Milica Joksimović"},
    {"time":"20:00","title":"VEČE SA TEGLINIM POPODNEVOM","host":"tegla.rs"}]},
  {"date":"05.03.2026.","items":[
    {"time":"16:00","title":"ARCADIA","host":"Gordan Paunović, Slobodan Brkić"},
    {"time":"19:00","title":"EUREKA","host":"Jovana Nikolić Živković"},
    {"time":"20:00","title":"LANČANI SUDAR","host":"Bojan Marjanović"}]},
  {"date":"06.03.2026.","items":[
    {"time":"10:30","title":"DJ SATARAŠ - Soundtrack time!","host":"Ceca"},
    {"time":"15:00","title":"REALITY CHECK","host":"Dubravko Jagatić"},
    {"time":"17:00","title":"LICE ULICE FM","host":"Nikoleta Kosovac, Bojan Marjanović"},
    {"time":"19:00","title":"PIRATSKI SATELIT","host":"Marko Blažić"}]},
  {"date":"07.03.2026.","items":[
    {"time":"11:00","title":"MANSARDA","host":"Jovana Nikolić Živković i Pavle Živković"},
    {"time":"12:00","title":"SUPER MENI","host":"Svetlana Đolović"},
    {"time":"21:00","title":"AFTER HOURS","host":"Aćim"}]},
  {"date":"08.03.2026.","items":[
    {"time":"10:00","title":"ARHEOFONIJA","host":"Ivan Čkonjević"},
    {"time":"12:00","title":"POVRATAK LOPOVA","host":"Mimi, Moma i Denča"},
    {"time":"15:00","title":"GISTRO FM","host":"Skoča"},
    {"time":"18:00","title":"ZELENI KAČKET","host":""}]},
  {"date":"09.03.2026.","items":[
    {"time":"10:30","title":"DJ SATARAŠ - Noviteti","host":"Ceca"},
    {"time":"14:00","title":"EKSPEDICIJA","host":"Knower"},
    {"time":"20:00","title":"NEDALEKO ODAVDE","host":"Bobe Vujanović Fridom"},
    {"time":"22:00","title":"PODZEMLJE","host":"Radoš M."}]}
];
var activeDayIdx = 0;
var rasporedInited = false;

/* ── Raspored cache helpers ── */
var RASPORED_CACHE_KEY  = 'ra_raspored_data';
var RASPORED_CACHE_TIME = 'ra_raspored_time';
var RASPORED_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 sata

function rasporedIsStale() {
  // Smatra se zastarelim ako: 1) prvi dan nije danas, ili 2) cache je stariji od 3h
  var today = new Date();
  var dd = String(today.getDate()).padStart(2,'0');
  var mm = String(today.getMonth()+1).padStart(2,'0');
  var yyyy = today.getFullYear();
  var todayStr = dd + '.' + mm + '.' + yyyy + '.';
  if (!rasporedData || !rasporedData[0]) return true;
  if (rasporedData[0].date !== todayStr) return true;
  try {
    var t = parseInt(localStorage.getItem(RASPORED_CACHE_TIME) || '0');
    if (Date.now() - t > RASPORED_MAX_AGE_MS) return true;
  } catch(e){}
  return false;
}

function rasporedSaveCache(data) {
  try {
    localStorage.setItem(RASPORED_CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(RASPORED_CACHE_TIME, String(Date.now()));
  } catch(e){}
}

function rasporedLoadCache() {
  try {
    var raw = localStorage.getItem(RASPORED_CACHE_KEY);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return false;
    rasporedData = data;
    return true;
  } catch(e){ return false; }
}

function rasporedApplyData(data, source) {
  rasporedData = data;
  rasporedSaveCache(data);
  var sub = document.getElementById('raspored-sub');
  if (sub) {
    var now = new Date();
    var h = now.getHours(), m = now.getMinutes();
    sub.textContent = 'Ažurirano ' + h + ':' + (m<10?'0':'')+m;
  }
  rasporedInited = false;
  initProgram();
}

/* ── HTML parser za radioaparat.rs/raspored/ ── */
function parseRasporedHTML(html) {
  // Parsiramo HTML stranicu rasporeda u naš format
  // Radimo sa DOM parserom koji je uvek dostupan u browseru
  var doc = (new DOMParser()).parseFromString(html, 'text/html');
  var results = [];

  // Strategija: tražimo elemente koji sadrže datum i listu emisija
  // Tipični CMS pattern: .schedule-day / .program-day / article / section sa datumom i listom
  var dayContainers = doc.querySelectorAll(
    '.schedule-day, .program-day, .raspored-day, ' +
    '[class*="schedule"] [class*="day"], [class*="program"] [class*="day"], ' +
    'article, .entry, .post, .wp-block'
  );

  // Fallback: pokušaj da pronađemo direktno datume i vremena u celoj stranici
  if (dayContainers.length === 0) {
    dayContainers = doc.querySelectorAll('div, section, article');
  }

  // Regex patterns
  var rDate = /\b(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})\b/;
  var rTime = /\b(\d{1,2}):(\d{2})\b/;

  // Skupljamo sve tekstualne čvorove koji sadrže datum + vremena
  var bodyText = doc.body ? doc.body.innerText || doc.body.textContent : '';
  
  // Splitujemo po linijama i tražimo datume i vremena
  var lines = bodyText.split(/\n/).map(function(l){ return l.trim(); }).filter(Boolean);
  
  var currentDay = null;
  var currentItems = [];

  lines.forEach(function(line) {
    var dateMatch = line.match(rDate);
    if (dateMatch) {
      // Sačuvaj prethodni dan ako postoji
      if (currentDay && currentItems.length > 0) {
        results.push({ date: currentDay, items: currentItems });
      }
      // Novi dan — normalizuj format na DD.MM.YYYY.
      var d = dateMatch[1].padStart(2,'0');
      var m = dateMatch[2].padStart(2,'0');
      var y = dateMatch[3];
      currentDay = d + '.' + m + '.' + y + '.';
      currentItems = [];
      return;
    }
    if (currentDay) {
      var timeMatch = line.match(rTime);
      if (timeMatch) {
        var time = timeMatch[1].padStart(2,'0') + ':' + timeMatch[2];
        // Ostatak linije (posle vremena) je naslov emisije
        var rest = line.replace(rTime, '').replace(/^[\s\-–—:]+/, '').trim();
        // Pokušaj da odvojiš host (format: "NASLOV / Host" ili "NASLOV — Host")
        var hostSplit = rest.split(/\s*[\/|–—]\s*/);
        var title = hostSplit[0].trim();
        var host  = hostSplit.length > 1 ? hostSplit.slice(1).join(', ').trim() : '';
        if (title) currentItems.push({ time: time, title: title, host: host });
      }
    }
  });

  // Dodaj poslednji dan
  if (currentDay && currentItems.length > 0) {
    results.push({ date: currentDay, items: currentItems });
  }

  return results;
}

/* ── Auto-fetch direktno sa sajta (bez API ključa) ── */
/* ── GitHub raw fetch — schedule.json koji GitHub Actions ažurira ── */
function fetchRasporedDirect(onSuccess, onFail) {
  if (!SCHEDULE_JSON_URL || SCHEDULE_JSON_URL.indexOf('YOUR_GITHUB_USERNAME') >= 0) {
    console.warn('SCHEDULE_JSON_URL nije podešen');
    onFail(); return;
  }
  // Dodajemo timestamp da zaobiđemo browser cache
  var url = SCHEDULE_JSON_URL + '?t=' + Math.floor(Date.now() / (1000*60*10));
  fetch(url)
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      // schedule.json format: { updated:"...", days:[{date, items}] }
      var days = d.days || d; // podrška i za stari array format
      if (!Array.isArray(days) || days.length === 0) throw new Error('Prazan raspored');
      onSuccess(days);
    })
    .catch(function(e){
      console.log('fetchRasporedDirect: nije dostupan GitHub, koristim lokalne podatke');
      onFail();
    });
}

/* ── Glavni init — sa auto-refresh logikom ── */
function initProgram() {
  if (rasporedInited) return;
  rasporedInited = true;

  // Pokušaj da učitamo cache pre renderovanja
  if (rasporedLoadCache() && !rasporedIsStale()) {
    // Cache je svež — prikaži odmah
    buildDayTabs();
    renderRasporedDay(0);
    _updateRasporedSub(false);
    return;
  }

  // Podaci su zastareli ili nema cache-a — prikaži šta imamo i tiho fetchuj u pozadini
  buildDayTabs();
  renderRasporedDay(0);

  var sub = document.getElementById('raspored-sub');
  if (sub) sub.textContent = 'Ažuriram...';
  var btn = document.getElementById('raspored-refresh-btn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }

  fetchRasporedDirect(
    function(data) {
      // Uspeh — primeni i sačuvaj
      rasporedApplyData(data, 'direct');
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    },
    function() {
      // Direct fetch nije uspeo — pokušaj Anthropic API ako je ključ dostupan
      if (ANTHROPIC_API_KEY) {
        _refreshRasporedViaAPI(btn);
      } else {
        // Prikaži poslednje poznate podatke sa napomenom
        if (sub) sub.textContent = 'Prikazujem poslednji raspored';
        if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
        _updateRasporedSub(true);
      }
    }
  );
}

function _updateRasporedSub(stale) {
  var sub = document.getElementById('raspored-sub');
  if (!sub) return;
  try {
    var t = parseInt(localStorage.getItem(RASPORED_CACHE_TIME) || '0');
    if (t) {
      var d = new Date(t);
      var h = d.getHours(), m = d.getMinutes();
      sub.textContent = (stale ? '⚠ ' : '') + 'Ažurirano ' + h + ':' + (m<10?'0':'')+m;
    }
  } catch(e){}
}

/* ── Ručni refresh (dugme) ── */
function refreshRaspored() {
  var btn = document.getElementById('raspored-refresh-btn');
  var sub = document.getElementById('raspored-sub');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
  if (sub) sub.textContent = 'Ažuriram...';

  fetchRasporedDirect(
    function(data) {
      rasporedApplyData(data, 'direct');
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    },
    function() {
      if (ANTHROPIC_API_KEY) {
        _refreshRasporedViaAPI(btn);
      } else {
        if (sub) sub.textContent = 'Prikazujem poslednji raspored';
        if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
        showToast('Nije moguće učitati raspored — proveri konekciju');
      }
    }
  );
}

/* ── Anthropic API fallback ── */
function _refreshRasporedViaAPI(btn) {
  fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model:'claude-sonnet-4-20250514', max_tokens:3000,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      system:'You are a JSON bot. Use web_search to fetch the page. Return ONLY a raw JSON array, no markdown, no explanation. Format: [{"date":"DD.MM.YYYY.","items":[{"time":"HH:MM","title":"SHOW","host":"Host"}]}]',
      messages:[{role:'user',content:'Fetch https://radioaparat.rs/raspored/ and return schedule as JSON array only.'}]
    })
  })
  .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(function(d){
    var text = '';
    (d.content||[]).forEach(function(b){ if (b.type==='text') text += b.text; });
    text = text.replace(/```json|```/g, '');
    var m = text.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('Nije pronađen JSON array');
    var parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Prazan raspored');
    rasporedApplyData(parsed, 'api');
  })
  .catch(function(e){
    console.error('_refreshRasporedViaAPI greška:', e);
    var sub = document.getElementById('raspored-sub');
    if (sub) sub.textContent = 'Raspored možda nije ažuran';
  })
  .finally(function(){
    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  });
}

function buildDayTabs() {
  var SR=['ned','pon','uto','sre','čet','pet','sub'];
  var html=rasporedData.map(function(day,i){
    var pts=day.date.replace(/\.$/,'').split('.');
    var d=new Date(parseInt(pts[2]),parseInt(pts[1])-1,parseInt(pts[0]));
    var name=i===0?'Danas':i===1?'Sutra':SR[d.getDay()];
    var num=parseInt(pts[0]);
    return '<div class="day-tab'+(i===0?' active':'')+'" onclick="selectRasporedDay('+i+',this)">'+
      '<div class="dt-day">'+name+'</div><div class="dt-num">'+num+'</div></div>';
  }).join('');
  document.getElementById('day-tabs').innerHTML=html;
}

function selectRasporedDay(idx,el){
  document.querySelectorAll('.day-tab').forEach(function(t){t.classList.remove('active');});
  el.classList.add('active'); activeDayIdx=idx; renderRasporedDay(idx);
}

function renderRasporedDay(idx){
  var day=rasporedData[idx]; if(!day)return;
  var now=new Date(), cur=now.getHours()*60+now.getMinutes(), isToday=idx===0;
  var html=day.items.map(function(item,i){
    var isNow=false;
    if(isToday&&item.time){
      var tp=item.time.split(':'), st=parseInt(tp[0])*60+parseInt(tp[1]);
      var nxt=day.items[i+1];
      var en=nxt&&nxt.time?(function(t){var p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]);})(nxt.time):st+120;
      isNow=cur>=st&&cur<en;
    }
    var nc=isNow?' now':'', ni=isNow?' prog-now-item':'';
    var badge=isNow?'<div class="prog-now-badge"><div class="prog-dot"></div>SADA</div>':'';
    var safeTitle = esc(item.title).replace(/'/g,"&#39;");
    var safeDate  = esc(day.date).replace(/'/g,"&#39;");
    var safeTime  = esc(item.time||'').replace(/'/g,"&#39;");
    return '<div class="prog-item prog-clickable'+ni+'" data-show-title="'+esc(item.title)+'" onclick="openDetailFromRaspored(this)">' +
      '<div class="prog-time'+nc+'">'+esc(item.time||'')+'</div>' +
      '<div class="prog-body">'+badge+
        '<div class="prog-title'+nc+'">'+esc(item.title)+'</div>'+
        (item.host?'<div class="prog-desc">'+esc(item.host)+'</div>':'')+
      '</div>'+
      '<button class="prog-cal-btn" title="Dodaj podsetnik" onclick="event.stopPropagation();addCalendarEvent(\''+safeTitle+'\',\''+safeDate+'\',\''+safeTime+'\')">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'+
      '</button>'+
    '</div>';
  }).join('');
  document.getElementById('raspored-list').innerHTML=html||'<div class="ep-loading">Nema emisija.</div>';
  if(isToday){setTimeout(function(){var el=document.querySelector('.prog-now-item');var list=document.getElementById('raspored-list');if(el&&list){var t=el.offsetTop-list.offsetTop-12;list.scrollTo({top:Math.max(0,t),behavior:'smooth'});}},150);}
}

/* ═══ SUPER MENI ═══ */
var smInited=false, smAllTracks=[];
var _smData={
  "date":"SUPER MENI – 28. FEBRUAR 2026.",
  "preslušaj":"",
  "tracks":[
    {"pos":"01","pn":"04","naj":"1","artist":"ARCTIC MONKEYS","song":"Opening Night","ned":"6"},
    {"pos":"02","pn":"05","naj":"2","artist":"LU","song":"Gde đavo spava","ned":"6"},
    {"pos":"03","pn":"06","naj":"3","artist":"JAMES BLAKE","song":"Death of Love","ned":"6"},
    {"pos":"04","pn":"07","naj":"4","artist":"ROBBIE WILLIAMS","song":"Selfish Disco","ned":"5"},
    {"pos":"05","pn":"12","naj":"5","artist":"DJU DJU","song":"Natural","ned":"5"},
    {"pos":"06","pn":"14","naj":"6","artist":"ERIC CANTONA","song":"On se love","ned":"5"},
    {"pos":"07","pn":"01","naj":"1","artist":"ALEN SINKAUZ, NENAD SINKAUZ, A. STOJKOVIĆ","song":"Nešto se promenilo","ned":"7"},
    {"pos":"08","pn":"13","naj":"8","artist":"IGRALOM x ORKESTAR B. NIKOLIĆ DONJA","song":"Lešinari (Nisville Live 2025)","ned":"5"},
    {"pos":"09","pn":"15","naj":"9","artist":"FRIKO","song":"Seven Degrees","ned":"4"},
    {"pos":"10","pn":"19","naj":"10","artist":"BROWN HORSE","song":"Twisters","ned":"4"},
    {"pos":"11","pn":"18","naj":"11","artist":"SOMBR","song":"Homewrecker","ned":"3"},
    {"pos":"12","pn":"20","naj":"12","artist":"RIP MAGIC","song":"5words","ned":"4"},
    {"pos":"13","pn":"17","naj":"13","artist":"SHORT REPORTS","song":"Da li se sećaš","ned":"5"},
    {"pos":"14","pn":"21","naj":"14","artist":"ANGINE DE POITRINE","song":"Fabienk","ned":"3"},
    {"pos":"15","pn":"24","naj":"15","artist":"HEMLOCKE SPRINGS","song":"Be the Girl!","ned":"3"},
    {"pos":"16","pn":"23","naj":"16","artist":"ROLLING BLACKOUTS COASTAL FEVER","song":"Sunburned in London","ned":"4"},
    {"pos":"17","pn":"25","naj":"17","artist":"DUA SALEH feat. BON IVER","song":"Flood","ned":"4"},
    {"pos":"18","pn":"22","naj":"18","artist":"MARKUS PAVLOV","song":"Usne","ned":"4"},
    {"pos":"19","pn":"26","naj":"19","artist":"LOLA MIKOVIĆ","song":"Nobody Without","ned":"3"},
    {"pos":"20","pn":"31","naj":"20","artist":"HEN OGLEDD","song":"End of the Rhythm","ned":"2"},
    {"pos":"21","pn":"27","naj":"21","artist":"KENDI","song":"9. februar","ned":"4"},
    {"pos":"22","pn":"33","naj":"22","artist":"SARA RENAR","song":"Smile & Wave","ned":"2"},
    {"pos":"23","pn":"28","naj":"23","artist":"GOLEMATA VODA","song":"Stoj podaleku / Mrtov","ned":"3"},
    {"pos":"24","pn":"34","naj":"24","artist":"CARDINALS","song":"I Like You","ned":"2"},
    {"pos":"25","pn":"30","naj":"25","artist":"ZHIVA","song":"Atom","ned":"3"},
    {"pos":"26","pn":"35","naj":"26","artist":"NAST.ROJE","song":"Obrisana devojka","ned":"2"},
    {"pos":"27","pn":"02","naj":"2","artist":"IKA","song":"Sram, strah i ja","ned":"7"},
    {"pos":"28","pn":"32","naj":"28","artist":"MATE PONJEVIĆ","song":"Ljetne kiše","ned":"3"},
    {"pos":"29","pn":"03","naj":"3","artist":"THE SOPHS","song":"Goldstar","ned":"7"},
    {"pos":"30","pn":"36","naj":"30","artist":"BORIS VLASTELICA","song":"Sa tobom imam više","ned":"2"},
    {"pos":"31","pn":"00","naj":"31","artist":"FEVER RAY","song":"The Lake","ned":"1"},
    {"pos":"32","pn":"37","naj":"32","artist":"ANTOAN DE MILO","song":"Plava fontana mladosti","ned":"2"},
    {"pos":"33","pn":"38","naj":"33","artist":"OXAJO","song":"Čekam ih","ned":"2"},
    {"pos":"34","pn":"00","naj":"34","artist":"VOJKO V","song":"Vlaga","ned":"1"},
    {"pos":"35","pn":"00","naj":"35","artist":"MY NEW BAND BELIEVE","song":"Numerology","ned":"1"},
    {"pos":"36","pn":"00","naj":"36","artist":"JILL SCOTT feat. TROMBONE SHORTY","song":"Be Great","ned":"1"},
    {"pos":"37","pn":"00","naj":"37","artist":"DRAM","song":"Ada Bojana","ned":"1"},
    {"pos":"38","pn":"00","naj":"38","artist":"BABY KEEM feat. KENDRICK LAMAR","song":"Good Flirts","ned":"1"},
    {"pos":"39","pn":"10","naj":"10","artist":"HARRY STYLES","song":"Aperture","ned":"6"},
    {"pos":"40","pn":"11","naj":"11","artist":"SNAIL MAIL","song":"Dead End","ned":"6"}
  ]
};

function initSuperMeni(){
  // Uvek prikaži keširane podatke odmah
  applySMData(_smData);
  // Ne radi refresh ako je već u toku ili ako je pre manje od 60s
  var now = Date.now();
  if (window._smRefreshing) return;
  if (window._smLastRefresh && (now - window._smLastRefresh) < 60000) {
    // Podaci su sveži — samo prikaži datum
    document.getElementById('sm-sub').textContent = (_smData.date||'').replace(/^SUPER MENI\s*[–-]\s*/i,'');
    return;
  }
  window._smRefreshing = true;
  document.getElementById('sm-sub').textContent = 'Ažuriram...';
  var timer = setTimeout(function(){
    window._smRefreshing = false;
    document.getElementById('sm-sub').textContent = (_smData.date||'').replace(/^SUPER MENI\s*[–-]\s*/i,'');
  }, 15000);
  _autoRefreshSuperMeni(function(){
    window._smRefreshing = false;
    window._smLastRefresh = Date.now();
    clearTimeout(timer);
  });
}

function _smFetchPage(cb) {
  var URL = 'https://radioaparat.rs/super-meni/';
  var proxies = [
    'https://corsproxy.io/?' + encodeURIComponent(URL),
    'https://api.allorigins.win/get?url=' + encodeURIComponent(URL),
    'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(URL),
  ];
  function tryProxy(i) {
    if (i >= proxies.length) { console.warn('SM: svi proxiji pali'); cb(null); return; }
    fetch(proxies[i])
      .then(function(r){ return r.text(); })
      .then(function(text){
        var html = '';
        try { html = (text.trim().charAt(0) === '{') ? (JSON.parse(text).contents || '') : text; }
        catch(e) { html = text; }
        console.log('SM proxy['+i+'] len='+html.length);
        if (html.length > 100) { cb(html); return; }
        tryProxy(i+1);
      })
      .catch(function(e){ console.warn('SM proxy['+i+'] err:', e.message); tryProxy(i+1); });
  }
  tryProxy(0);
}
function _smParse(html) {
  var tracks = [];

  // ── Strategija 1: HTML tabela <tr><td> ──
  if (/<tr/i.test(html)) {
    var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, trM;
    while ((trM = trRe.exec(html)) !== null) {
      var cells = [], tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi, tdM;
      while ((tdM = tdRe.exec(trM[1])) !== null)
        cells.push(tdM[1].replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim());
      if (cells.length < 3) continue;
      var posNum = parseInt(cells[0]);
      if (!posNum || isNaN(posNum)) continue;
      var t = _smMakeTrack(cells);
      if (t) tracks.push(t);
    }
  }

  // ── Strategija 2: Markdown/text tabela "| 01 | 02 | LU – Song | 7 | 1 |" ──
  if (!tracks.length) {
    var lines = html.split(/\r?\n/);
    lines.forEach(function(line) {
      // Preskoči header/separator redove
      if (/^\s*\|[\s\-:]+\|/.test(line)) return;
      var cols = line.split('|').map(function(c){ return c.replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim(); });
      // Ukloni prazne ivične ćelije od | ... |
      if (cols[0] === '') cols.shift();
      if (cols[cols.length-1] === '') cols.pop();
      if (cols.length < 3) return;
      var posNum = parseInt(cols[0]);
      if (!posNum || isNaN(posNum)) return;
      var t = _smMakeTrack(cols);
      if (t) tracks.push(t);
    });
  }

  console.log('SM parse: pronađeno', tracks.length, 'pesama');
  return tracks;
}

function _smMakeTrack(cells) {
  var posNum = parseInt(cells[0]);
  if (!posNum || isNaN(posNum)) return null;
  var pn  = (cells[1]||'').replace(/\D/g,'').trim() || '0';
  // Dekodiraj HTML entitete u nazivu
  var raw = (cells[2]||'').trim()
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'");
  var ned = (cells[3]||'').replace(/\D/g,'').trim() || '1';
  var naj = (cells[4]||'').replace(/\D/g,'').trim() || String(posNum);
  var artist = '', song = raw;
  // Probaj sve varijante separatora
  var sepIdx = raw.indexOf(' \u2013 ');            // en-dash
  if (sepIdx < 0) sepIdx = raw.indexOf(' \u2014 '); // em-dash
  if (sepIdx < 0) sepIdx = raw.indexOf(' - ');       // crtica
  if (sepIdx > 0) {
    artist = raw.slice(0, sepIdx).trim();
    song = raw.slice(sepIdx + 3).trim();
  }
  if (!song) return null;
  var pn2 = parseInt(pn) || 0;
  return {
    pos: posNum < 10 ? '0'+posNum : ''+posNum,
    posNum: posNum, pn: pn, ned: ned, naj: naj,
    artist: artist, song: song,
    trend: pn2 === 0 ? 'new' : posNum < pn2 ? 'up' : posNum > pn2 ? 'down' : 'same'
  };
}

function _smExtractDate(html) {
  var m = html.match(/SUPER MENI\s*[–—-]\s*([^<"\n]{4,50})/i);
  return m ? m[1].trim().replace(/\.\s*$/, '.') : '';
}

function _smFetchPreslusaj(cb) {
  // Mixcloud API — najnoviji cloudcast SUPER_MENI naloga
  fetch('https://api.mixcloud.com/SUPER_MENI/cloudcasts/?limit=1')
    .then(function(r){ return r.json(); })
    .then(function(d){
      var key = d.data && d.data[0] && d.data[0].key;
      cb(key ? 'https://www.mixcloud.com' + key : null);
    })
    .catch(function(){ cb(null); });
}


function smPreslusaj() {
  var url = _smData['preslušaj'] || '';

  function _play(mcUrl) {
    var mcMatch = mcUrl && mcUrl.match(/mixcloud\.com(\/[^?#]+\/?)/i);
    if (mcMatch) {
      var key = mcMatch[1].replace(/\/$/, '') + '/';
      var title = (_smData.date || 'Super Meni').replace(/^SUPER MENI\s*[–-]\s*/i, 'Super Meni ');
      if (mixcloudActive && playingKey === key) { openMore('replay'); return; }
      openMore('replay');
      setTimeout(function(){ playEp(key, title); }, 250);
    } else {
      window.open('https://radioaparat.rs/shows/super-meni/', '_blank');
    }
  }

  // Ako već imamo Mixcloud URL — odmah pusti
  if (url && /mixcloud\.com/i.test(url)) { _play(url); return; }

  // Nemamo ili imamo sajt URL — fetchuj Mixcloud key on-demand
  var btn = document.getElementById('sm-preslušaj');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Učitavam...'; }
  _smFetchPreslusaj(function(mcUrl) {
    if (btn) { btn.disabled = false; btn.textContent = '▶ Preslušaj emisiju'; }
    if (mcUrl) { _smData['preslušaj'] = mcUrl; _play(mcUrl); }
    else { window.open('https://radioaparat.rs/shows/super-meni/', '_blank'); }
  });
}

function _smApplyFetched(tracks, dateStr) {
  _smData.tracks = tracks;
  if (dateStr) { _smData.date = dateStr; document.getElementById('sm-sub').textContent = dateStr; }
  smAllTracks = tracks;
  renderSMList(tracks);
  // Preslusaj URL u pozadini, sa timeoutom od 8s
  var done = false;
  var FALLBACK_URL = 'https://radioaparat.rs/shows/super-meni/';
  var t = setTimeout(function(){
    done = true;
    // Timeout — postavi fallback ako nemamo ništa bolje
    if (!_smData['preslušaj'] || _smData['preslušaj'] === FALLBACK_URL) {
      _smData['preslušaj'] = FALLBACK_URL; /* button uses smPreslusaj() */
    }
  }, 8000);
  _smFetchPreslusaj(function(url){
    if (done) return;
    clearTimeout(t);
    var finalUrl = url || FALLBACK_URL;
    _smData['preslušaj'] = finalUrl;
  });
}

function _autoRefreshSuperMeni(doneCb){
  doneCb = doneCb || function(){};
  _smFetchPage(function(html){
    if (!html) { doneCb(); return; }
    var tracks = _smParse(html);
    if (!tracks.length) { console.warn('SM: parse vratio 0 pesama'); doneCb(); return; }
    var dateStr = _smExtractDate(html);
    _smApplyFetched(tracks, dateStr);
    doneCb();
  });
}

function refreshSuperMeni(){
  var btn = document.getElementById('sm-refresh-btn');
  btn.classList.add('spinning'); btn.disabled = true;
  document.getElementById('sm-sub').textContent = 'Osvežavam...';
  _smFetchPage(function(html){
    btn.classList.remove('spinning'); btn.disabled = false;
    if (!html) { showToast('Greška: ne mogu da dohvatim stranicu'); document.getElementById('sm-sub').textContent = (_smData.date||''); return; }
    var tracks = _smParse(html);
    if (!tracks.length) { showToast('Greška: stranica se promenila'); document.getElementById('sm-sub').textContent = (_smData.date||''); return; }
    var dateStr = _smExtractDate(html);
    _smApplyFetched(tracks, dateStr);
    showToast('Lista osvežena ✓');
  });
}


function applySMData(data){
  if(data.date) document.getElementById('sm-sub').textContent=data.date.replace(/^SUPER MENI\s*[–-]\s*/i,'');
  if(data['preslušaj']) _smData['preslušaj']=data['preslušaj']; /* button uses smPreslusaj() */
  var tracks=(data.tracks||[]).map(function(t){
    var p=parseInt(t.pos)||0,pn=parseInt(t.pn)||0;
    t.posNum=p; t.trend=pn===0?'new':p<pn?'up':p>pn?'down':'same'; return t;
  });
  smAllTracks=tracks; renderSMList(tracks);
}

var TREND_ICONS={
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="18 15 12 9 6 15"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="6 9 12 15 18 9"/></svg>',
  same:'<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><rect x="3" y="11" width="18" height="2" rx="1"/></svg>',
  new:'<span style="font-size:7px;font-weight:800;letter-spacing:.5px">NEW</span>'
};

function smRowHTML(t){
  var ned = t.ned || '1';
  var naj = (t.naj && t.naj !== '00') ? t.naj : t.pos;
  var nedStr = '<div class="sm-ned">NED: '+esc(ned)+'</div>';
  var najStr = '<div class="sm-naj">NAJ: '+esc(naj)+'</div>';
  return '<div class="sm-row" data-q="'+esc(t.artist+' '+t.song)+'" onclick="smRowClick(this)">'+
    '<div class="sm-pos'+(t.posNum<=3?' top3':'')+'">'+esc(t.pos)+'</div>'+
    '<div class="sm-trend '+t.trend+'">'+(TREND_ICONS[t.trend]||'')+'</div>'+
    '<div class="sm-body">'+
      (t.artist?'<div class="sm-artist">'+esc(t.artist)+'</div>':'')+
      '<div class="sm-song">'+esc(t.song)+'</div>'+
    '</div>'+
    '<div class="sm-stats">'+nedStr+najStr+'</div>'+
  '</div>';
}

function renderSMList(tracks){
  var search='<div class="sm-search-wrap"><input class="sm-search" type="text" placeholder="🔍  Pretraži listu..." oninput="filterSM(this.value)" autocomplete="off"></div>';
  document.getElementById('sm-list').innerHTML=search+tracks.map(smRowHTML).join('');
}

function filterSM(q){
  // Koristimo display:none na redovima umesto brisanja/kreiranja DOM elemenata
  var lq = q ? q.toLowerCase() : '';
  document.querySelectorAll('#sm-list .sm-row').forEach(function(r){
    var match = !lq || (r.getAttribute('data-q') || '').toLowerCase().indexOf(lq) >= 0;
    r.style.display = match ? '' : 'none';
  });
}

function smRowClick(el){
  var raw = el.getAttribute('data-q') || '';
  if (!raw) return;
  var parts = raw.split(' ');
  // data-q is "ARTIST song title" — try to split artist/song from the track data
  var artist = el.querySelector('.sm-artist') ? el.querySelector('.sm-artist').textContent : '';
  var song   = el.querySelector('.sm-song')   ? el.querySelector('.sm-song').textContent   : '';
  openStreamSheet(artist, song, raw);
}

function openStreamSheet(artist, song, rawQ) {
  var q = encodeURIComponent(rawQ);
  document.getElementById('stream-sheet-title').textContent  = song   || rawQ;
  document.getElementById('stream-sheet-artist').textContent = artist || '';
  document.getElementById('ssi-spotify').href  = 'https://open.spotify.com/search/' + q;
  document.getElementById('ssi-apple').href    = 'https://music.apple.com/search?term=' + q;
  document.getElementById('ssi-youtube').href  = 'https://music.youtube.com/search?q=' + q;
  document.getElementById('ssi-deezer').href   = 'https://www.deezer.com/search/' + q;
  // Zatvori history sheet ako je otvoren
  document.getElementById('history-backdrop').classList.remove('open');
  document.getElementById('history-sheet').classList.remove('open');
  document.getElementById('stream-backdrop').classList.add('open');
  document.getElementById('stream-sheet').classList.add('open');
}

function closeStreamSheet() {
  document.getElementById('stream-backdrop').classList.remove('open');
  document.getElementById('stream-sheet').classList.remove('open');
}

/* ═══ MAPS SHEET ═══ */
function openMapsSheet() {
  closeAllSheets();
  document.getElementById('maps-backdrop').classList.add('open');
  document.getElementById('maps-sheet').classList.add('open');
}
function closeMapsSheet() {
  document.getElementById('maps-backdrop').classList.remove('open');
  document.getElementById('maps-sheet').classList.remove('open');
}

/* ═══ EMISIJE ═══ */
// SHOWS se učitava iz shows.json (generisan GitHub Actions iz Excel-a)
var SHOWS = [];
var SHOWS_JSON_URL = 'https://raw.githubusercontent.com/m1l0s/radioaparat-app/main/shows.json';

function filterShows(cat,el){
  document.querySelectorAll('.cat-pill').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active'); activeShowCat=cat; renderShows();
}

function renderShows(){
  _renderShowsGrid();
  if(!showImgFetched) fetchShowImages(function(){_renderShowsGrid();});
}

function fetchShowImages(cb){
  if(showImgFetched){cb();return;}

  var SHOWS_PAGE = 'https://radioaparat.rs/shows/';
  var proxies = [
    'https://corsproxy.io/?' + encodeURIComponent(SHOWS_PAGE),
    'https://api.allorigins.win/get?url=' + encodeURIComponent(SHOWS_PAGE),
  ];

  function parseShowsPage(html) {
    var found = 0;
    // Pattern 1: href="/shows/slug/" + <img src="...">
    var cardRe = /<a[^>]+href=["']https?:\/\/radioaparat\.rs\/shows\/([^/"']+)\/?["'][^>]*>[\s\S]{0,2000}?<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
    var m;
    while ((m = cardRe.exec(html)) !== null) {
      var slug = m[1], imgUrl = m[2];
      var normSlug = slug.toLowerCase().replace(/[šś]/g,'s').replace(/đ/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z');
      if (!showImgCache[slug]) showImgCache[slug] = imgUrl;
      if (slug !== normSlug && !showImgCache[normSlug]) showImgCache[normSlug] = imgUrl;
      found++;
    }
    // Pattern 2: pozicija linka + closest slika
    if (!found) {
      var re2 = /href=["']https?:\/\/radioaparat\.rs\/shows\/([^/"']+)\/?["']/gi;
      var positions = [];
      while ((m = re2.exec(html)) !== null) positions.push({ slug: m[1], pos: m.index });
      positions.forEach(function(p){
        var near = html.slice(p.pos, p.pos + 3000);
        var imgM = near.match(/src=["'](https?:\/\/radioaparat\.rs\/wp-content\/uploads\/[^"']+\.(?:jpg|png|webp))["']/i)
                || near.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|png|webp))[^"']*["']/i);
        if (imgM) {
          var normSlug = p.slug.toLowerCase().replace(/[šś]/g,'s').replace(/đ/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z');
          if (!showImgCache[p.slug]) showImgCache[p.slug] = imgM[1];
          if (p.slug !== normSlug && !showImgCache[normSlug]) showImgCache[normSlug] = imgM[1];
          found++;
        }
      });
    }
    return found;
  }

  var _imgTimeoutId = null;
  function tryListingProxy(i) {
    if (i >= proxies.length) { tryMixcloudFallback(); return; }
    fetch(proxies[i])
      .then(function(r){ return r.text(); })
      .then(function(text){
        var html = text.trim().startsWith('{') ? (JSON.parse(text).contents || '') : text;
        var found = parseShowsPage(html);
        console.log('Shows listing [proxy '+i+']: slike za', found, 'emisija');
        if (_imgTimeoutId) { clearTimeout(_imgTimeoutId); _imgTimeoutId = null; }
        tryMixcloudFallback();
      })
      .catch(function(){ tryListingProxy(i + 1); });
  }

  function tryMixcloudFallback(){
    fetch('https://api.mixcloud.com/RADIO_APARAT/cloudcasts/?limit=100')
      .then(function(r){return r.json();})
      .then(function(d){
        var cc=d.data||[];
        SHOWS.forEach(function(s){
          if(showImgCache[s.id]) return;
          function norm(str) {
            return str.toLowerCase()
              .replace(/[šś]/g,'s').replace(/[đ]/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z')
              .replace(/[^a-z0-9\s]/g,'').trim();
          }
          var sNorm = norm(s.name);
          var sWords = sNorm.split(/\s+/).filter(function(w){ return w.length > 1; });
          var best = null, bestScore = 0;
          cc.forEach(function(c){
            var cNorm = norm(c.name);
            var cWords = cNorm.split(/\s+/);
            var score = 0;
            // Exact show name mora biti kao zasebne reči — ne substring
            var allMatch = sWords.length > 0 && sWords.every(function(w){ return cWords.indexOf(w) >= 0; });
            if (allMatch) score = sWords.length * 35;
            if (score > bestScore) { bestScore = score; best = c; }
          });
          if (best && bestScore >= 35 && best.pictures) {
            var p = best.pictures['640wx640h'] || best.pictures.medium_mobile || best.pictures.medium || best.pictures.small;
            if (p) showImgCache[s.id] = p;
          }
        });
        showImgFetched=true; cb();
      })
      .catch(function(){ showImgFetched=true; cb(); });
  }

  tryListingProxy(0);

  // Timeout: ako /shows/ listing ne odgovori za 6s, idi direktno na Mixcloud
  _imgTimeoutId = setTimeout(function(){
    if(!showImgFetched) { _imgTimeoutId = null; tryMixcloudFallback(); }
  }, 6000);
}

function _renderShowsGrid(){
  var q = (document.getElementById('show-search-input') ? document.getElementById('show-search-input').value : '').toLowerCase().trim();
  var filtered = activeShowCat==='sve' ? SHOWS.slice() : SHOWS.filter(function(s){ return s.cat===activeShowCat; });
  if (q) filtered = filtered.filter(function(s){ return s.name.toLowerCase().indexOf(q) !== -1; });
  filtered.sort(function(a,b){return a.name.localeCompare(b.name,'sr');});
  document.getElementById('shows-grid').innerHTML=filtered.map(function(s,i){
    // Chess pattern: column in row determines color
    // row = Math.floor(i/2), col = i%2
    // white when (row+col) is even, black when odd — real chessboard
    var row = Math.floor(i / 2), col = i % 2;
    var isWhite = (row + col) % 2 === 0;
    var bg   = isWhite ? 'var(--chess-light)' : 'var(--chess-dark)';
    var fg   = isWhite ? 'var(--chess-dark)'  : 'var(--chess-light)';
    var inner = '<div class="show-card-chess" style="background:'+bg+';color:'+fg+'">'+
      '<span class="show-card-chess-name">'+esc(s.name)+'</span>'+
    '</div>';
    return '<div class="show-card" onclick="openDetail(\''+s.id+'\')">'+
      inner+
      '<div class="show-card-overlay" style="background:none"></div>'+
    '</div>';
  }).join('');
}

var detailOrigin = 'shows'; // 'shows' | 'raspored'

function openDetail(id){
  detailOrigin = 'shows';
  _openDetailById(id);
}

function _openDetailById(id){
  var s=SHOWS.find(function(x){return x.id===id;});
  if(!s)return;
  var cats={muzika:'Muzika',kultura:'Kultura',drustvo:'Društvo',zabava:'Zabava'};
  document.getElementById('detail-cat').textContent=cats[s.cat]||s.cat;
  document.getElementById('detail-title').textContent=s.name;
  document.getElementById('detail-schedule').textContent='🕐  '+s.schedule;
  document.getElementById('detail-desc').textContent=s.desc;
  var imgEl=document.getElementById('detail-img');
  // Prioritet: 1) URL slike iz Excel, 2) scrape cache, 3) fallback gradijent
  var src = (s.img && s.img.startsWith('http')) ? s.img : (showImgCache[s.id] || null);
  // Pokušaj i sa originalnim slugom ako ID nije pronašao sliku
  if (!src) {
    var normId = s.id.replace(/-/g,' ');
    Object.keys(showImgCache).forEach(function(k){
      if (!src && (k === s.id || k.replace(/-/g,' ') === normId)) src = showImgCache[k];
    });
  }
  if(src){
    imgEl.innerHTML='<img src="'+src+'" alt="'+esc(s.name)+'">';
    imgEl.style.background='';
    imgEl.style.color='';
  } else {
    // Nema slike — prikaži šahovnicu kao u gridu
    var showIdx = SHOWS.findIndex(function(x){ return x.id === s.id; });
    var row = Math.floor(showIdx / 2), col = showIdx % 2;
    var isWhite = (row + col) % 2 === 0;
    var bg = isWhite ? 'var(--chess-light)' : 'var(--chess-dark)';
    var fg = isWhite ? 'var(--chess-dark)'  : 'var(--chess-light)';
    imgEl.style.background = bg;
    imgEl.style.color = fg;
    imgEl.innerHTML = '<div class="show-card-chess" style="background:'+bg+';color:'+fg+'">'+
      '<span class="show-card-chess-name" style="font-size:24px;">'+esc(s.name)+'</span>'+
    '</div>';
  }
  var LINK_LABELS = {web:'Web',mixcloud:'Mixcloud',soundcloud:'SoundCloud',instagram:'Instagram',facebook:'Facebook',youtube:'YouTube',patreon:'Patreon'};
  var linksHTML = '';
  if (s.links) {
    Object.keys(LINK_LABELS).forEach(function(key){
      if(s.links[key]) linksHTML+='<a class="detail-link" href="'+s.links[key]+'" target="_blank">'+LINK_LABELS[key]+'</a>';
    });
  }
  if(!linksHTML){
    linksHTML='<a class="detail-link" href="https://www.mixcloud.com/RADIO_APARAT/" target="_blank">Mixcloud</a>'+
              '<a class="detail-link" href="https://www.instagram.com/radioaparat/" target="_blank">Instagram</a>'+
              '<a class="detail-link" href="https://www.facebook.com/radioAPARAT" target="_blank">Facebook</a>';
  }
  document.getElementById('detail-links').innerHTML=linksHTML;
  // Reset epizode sekcije — prikaži loading odmah
  var epSection = document.getElementById('detail-episodes-section');
  var epList = document.getElementById('detail-episodes-list');
  epSection.style.display = 'block';
  epList.innerHTML = '<div style="padding:12px 0;color:var(--text3);font-size:13px;">Učitavam epizode...</div>';

  // Slug za sajt: isto kao ID ali iz originalnog naziva emisije
  var showSlug = s.name.toLowerCase()
    .replace(/[šś]/g,'s').replace(/[đ]/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

  fetchShowEpisodes(showSlug, (s.links && s.links.mixcloud) || null, function(eps){
    if (!eps || !eps.length) {
      epList.innerHTML = '<div style="padding:12px 0;color:var(--text3);font-size:13px;">Nema dostupnih epizoda.</div>';
      return;
    }
    epList.innerHTML = eps.slice(0, 12).map(function(ep){
      var safeKey   = ep.mcKey ? ep.mcKey.replace(/'/g,"\\'") : '';
      var safeTitle = esc(ep.title);
      var safeUrl   = esc(ep.url);
      var btn = ep.mcKey
        ? '<button onclick="event.stopPropagation();closeDetail();openMore(\'replay\');setTimeout(function(){playEp(\''+safeKey+'\',\''+safeTitle+'\')},200);" style="background:none;border:1px solid var(--border2);border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;color:var(--text2);cursor:pointer;white-space:nowrap;font-family:inherit;">▶ Replay</button>'
        : '<a href="'+safeUrl+'" target="_blank" rel="noopener" style="background:none;border:1px solid var(--border2);border-radius:8px;padding:5px 12px;font-size:11px;font-weight:700;color:var(--text2);text-decoration:none;white-space:nowrap;">Slušaj ↗</a>';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">'+
        '<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+safeTitle+'</div>'+
        '<div style="flex-shrink:0;">'+btn+'</div>'+
      '</div>';
    }).join('')+
    (eps.length > 12 ? '<div style="padding:10px 0;color:var(--text3);font-size:12px;text-align:center;">+ još '+(eps.length-12)+' epizoda na sajtu</div>' : '');
  });
  document.getElementById('show-detail').classList.add('open');
  document.getElementById('show-detail').scrollTop=0;
}
function closeDetail(){
  document.getElementById('show-detail').classList.remove('open');
  if (detailOrigin === 'raspored') {
    // Vrati se na Raspored ekran i aktiviraj njegov tab (ne "Više")
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
    document.getElementById('nav-raspored').classList.add('active');
    document.getElementById('screen-raspored').classList.add('active');
    activeMoreTab = null;
  }
}

/* ═══ MIXCLOUD CLOUDCAST CACHE ═══
   Jedan fetch za sve emisije — keširamo 100 najnovijih cloudcastova RADIO_APARAT.
   fetchShowEpisodes i Super Meni preslusaj koriste isti keš. */
var _mcCache = null;        // null = nije učitano, [] = učitano (može biti prazno)
var _mcCacheCallbacks = []; // čekaju dok se keš puni

function getMixcloudCasts(cb) {
  if (_mcCache) { cb(_mcCache); return; }
  _mcCacheCallbacks.push(cb);
  if (_mcCacheCallbacks.length > 1) return; // već se učitava
  fetch('https://api.mixcloud.com/' + MC_USER + '/cloudcasts/?limit=100')
    .then(function(r){ return r.json(); })
    .then(function(d){
      _mcCache = d.data || [];
      _mcCacheCallbacks.forEach(function(fn){ fn(_mcCache); });
      _mcCacheCallbacks = [];
    })
    .catch(function(){
      _mcCache = [];
      _mcCacheCallbacks.forEach(function(fn){ fn([]); });
      _mcCacheCallbacks = [];
    });
}

/* Keš za epizode */
var _epCache = {};
function fetchShowEpisodes(showId, mixcloudLink, cb) {
  // mixcloudLink može biti URL naloga (mixcloud.com/USER/) ili specifičan cloudcast
  if (_epCache[showId]) { cb(_epCache[showId]); return; }

  function norm(s) {
    return s.toLowerCase()
      .replace(/[šśŝ]/g,'s').replace(/[đ]/g,'dj').replace(/[čćĉ]/g,'c').replace(/[žź]/g,'z')
      .replace(/[^a-z0-9\s]/g,'').trim();
  }

  function done(eps) {
    _epCache[showId] = eps;
    cb(eps);
  }

  // Pokušaj 1: Ako emisija ima sopstveni Mixcloud nalog (ne RADIO_APARAT)
  // Prepoznajemo po: mixcloud.com/NESTO/ (nije RADIO_APARAT, nije direktan cloudcast)
  if (mixcloudLink) {
    var mcUserMatch = mixcloudLink.match(/mixcloud\.com\/([^\/]+)\/?$/i);
    if (mcUserMatch && mcUserMatch[1].toUpperCase() !== 'RADIO_APARAT') {
      var mcUser = mcUserMatch[1];
      fetch('https://api.mixcloud.com/' + mcUser + '/cloudcasts/?limit=20')
        .then(function(r){ return r.json(); })
        .then(function(d){
          var eps = (d.data || []).map(function(c){
            return { url: 'https://www.mixcloud.com'+c.key, title: c.name, mcKey: c.key, date: (c.created_time||'').slice(0,10) };
          });
          if (eps.length) { done(eps); return; }
          fetchFromRadioAparat(); // fallback
        })
        .catch(fetchFromRadioAparat);
      return;
    }
  }

  fetchFromRadioAparat();

  function fetchFromRadioAparat() {
    getMixcloudCasts(function(casts) {
      var showWords = norm(showId.replace(/-/g,' ')).split(/\s+/).filter(function(w){ return w.length > 1; });
      if (showWords.length === 0) { done([]); return; }
      var eps = casts.filter(function(c) {
        var cNorm = norm(c.name);
        var cWords = cNorm.split(/\s+/);
        // Svaka reč iz naziva emisije mora biti zasebna reč u naslovu (ne substring)
        var matches = showWords.filter(function(w){ return cWords.indexOf(w) >= 0; }).length;
        return matches >= Math.min(showWords.length, 2);
      }).map(function(c){
        return { url: 'https://www.mixcloud.com'+c.key, title: c.name, mcKey: c.key, date: (c.created_time||'').slice(0,10) };
      });
      done(eps);
    });
  }
}

/* ═══ REPLAY ═══ */
function loadReplay(){
  buildDatePills();
  fetch('https://api.mixcloud.com/'+MC_USER+'/cloudcasts/?limit=100')
    .then(function(r){return r.json();})
    .then(function(d){
      // Fix timezone: koristimo lokalni datum, ne UTC (toISOString vraća UTC)
      var cutDate = new Date(); cutDate.setDate(cutDate.getDate()-7);
      var y = cutDate.getFullYear();
      var m = String(cutDate.getMonth()+1).padStart(2,'0');
      var day = String(cutDate.getDate()).padStart(2,'0');
      var cutStr = y+'-'+m+'-'+day;

      var data = d.data || [];
      // Fix empty response: ako API vrati prazan niz, idi na demo
      if (!data.length) { replayLoaded = false; loadDemoEpisodes(); return; }

      allEpisodes = data.map(function(e){
        var pics = e.pictures || {};
        var thumb = pics['640wx640h'] || pics['320wx320h'] || pics.medium_mobile || pics.medium || pics.small || null;
        return {
          key: e.key,
          name: e.name,
          show: (e.tags && e.tags[0] && e.tags[0].name) || 'radioAPARAT',
          date: (e.created_time||'').slice(0,10),
          dur: e.audio_length || 0,
          thumb: thumb
        };
      }).filter(function(e){ return e.date && e.date >= cutStr; });

      // Fix empty after filter: ako nema emisija u poslednjih 7 dana, prikaži sve
      if (!allEpisodes.length) {
        allEpisodes = data.map(function(e){
          var pics = e.pictures || {};
          var thumb = pics['640wx640h'] || pics['320wx320h'] || pics.medium_mobile || pics.medium || pics.small || null;
          return {
            key: e.key,
            name: e.name,
            show: (e.tags && e.tags[0] && e.tags[0].name) || 'radioAPARAT',
            date: (e.created_time||'').slice(0,10),
            dur: e.audio_length || 0,
            thumb: thumb
          };
        }).slice(0, 20);
      }
      filterEpisodes();
    })
    .catch(function(){
      replayLoaded = false; // Dozvoli ponovni pokušaj
      loadDemoEpisodes();
    });
}

// Pull-to-refresh — zajednička logika za više ekrana
(function(){
  var threshold = 60;

  function makePTR(screenId, getScrollEl, onRefresh) {
    var startY = 0, pulling = false;
    function onTouchStart(e){ startY = e.touches[0].clientY; pulling = true; }
    function onTouchEnd(e){
      if (!pulling) return;
      var dy = e.changedTouches[0].clientY - startY;
      pulling = false;
      var scrollEl = getScrollEl();
      if (dy > threshold && (!scrollEl || scrollEl.scrollTop === 0)) {
        onRefresh();
      }
    }
    document.addEventListener('DOMContentLoaded', function(){
      var screen = document.getElementById(screenId);
      if (screen) {
        screen.addEventListener('touchstart', onTouchStart, {passive:true});
        screen.addEventListener('touchend',   onTouchEnd,   {passive:true});
      }
    });
  }

  // REPLAY
  makePTR('screen-replay',
    function(){ return document.getElementById('episodes-list'); },
    function(){
      replayLoaded = false;
      allEpisodes = [];
      var list = document.getElementById('episodes-list');
      if (list) list.innerHTML = '<div class="ep-loading"><div class="ep-spinner"></div>Učitavam emisije...</div>';
      loadReplay();
    }
  );

  // EMISIJE
  makePTR('screen-shows',
    function(){ return document.getElementById('shows-grid'); },
    function(){
      var grid = document.getElementById('shows-grid');
      if (grid) grid.innerHTML = '<div class="ep-loading"><div class="ep-spinner"></div>Učitavam emisije...</div>';
      loadShowsFromExcel();
    }
  );

  // FAVORITI — lokalni state, samo re-render
  makePTR('screen-favs',
    function(){ return document.getElementById('fav-list'); },
    function(){ renderFavs(); }
  );

  // CHAT — reload iframe
  makePTR('screen-chat',
    function(){ return null; }, // iframe nema scrollTop; uvek dozvoli refresh
    function(){
      var iframe = document.querySelector('#screen-chat iframe');
      if (iframe) { var s = iframe.src; iframe.src = ''; iframe.src = s; }
    }
  );
})();

function today(n){var d=new Date();d.setDate(d.getDate()-n);var y=d.getFullYear(),mo=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0');return y+'-'+mo+'-'+dy;}
function loadDemoEpisodes(){
  allEpisodes=[
    {key:'/RADIO_APARAT/after-hours-212/',name:'After Hours #212',show:'After Hours',date:today(0),dur:5400,thumb:null},
    {key:'/RADIO_APARAT/arcadia-88/',name:'Arcadia #88',show:'Arcadia',date:today(0),dur:3600,thumb:null},
    {key:'/RADIO_APARAT/disko-buvljak-45/',name:'Disko buvljak #45',show:'Disko buvljak',date:today(1),dur:4800,thumb:null},
    {key:'/RADIO_APARAT/groove-variations-67/',name:'Groove Variations #67',show:'Groove Variations',date:today(2),dur:7200,thumb:null},
    {key:'/RADIO_APARAT/mono-55/',name:'Mono #55',show:'Mono',date:today(4),dur:3600,thumb:null},
    {key:'/RADIO_APARAT/reggae-fever-101/',name:'Reggae Fever #101',show:'Reggae Fever',date:today(5),dur:7200,thumb:null}
  ]; filterEpisodes();
}

function buildDatePills(){
  var SR=['ned','pon','uto','sre','čet','pet','sub'],MN=['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];
  var h='<div class="date-pill active" onclick="selDate(\'sve\',this)">Sve</div>';
  for(var i=0;i<7;i++){var d=new Date();d.setDate(d.getDate()-i);var k=d.toISOString().slice(0,10);var lbl=i===0?'Danas':i===1?'Juče':SR[d.getDay()]+' '+d.getDate()+'. '+MN[d.getMonth()];h+='<div class="date-pill" onclick="selDate(\''+k+'\',this)">'+lbl+'</div>';}
  document.getElementById('date-scroll').innerHTML=h;
}

function selDate(d,el){document.querySelectorAll('.date-pill').forEach(function(p){p.classList.remove('active');});el.classList.add('active');activeDate=d;filterEpisodes();}

function fmt(s){if(!s)return'';var h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?h+'h '+m+'min':m+' min';}
function fmtD(s){if(!s)return'';var d=new Date(s);var SR=['ned','pon','uto','sre','čet','pet','sub'],MN=['jan','feb','mar','apr','maj','jun','jul','avg','sep','okt','nov','dec'];return SR[d.getDay()]+', '+d.getDate()+'. '+MN[d.getMonth()];}

function filterEpisodes(){
  var q=document.getElementById('search-input').value.toLowerCase();
  var f=allEpisodes.filter(function(e){return(activeDate==='sve'||e.date===activeDate)&&(!q||e.name.toLowerCase().indexOf(q)>=0||e.show.toLowerCase().indexOf(q)>=0);});
  var list=document.getElementById('episodes-list');
  if(!f.length){list.innerHTML='<div class="ep-loading">Nema emisija.</div>';return;}
  list.innerHTML=f.map(function(e){
    var thumb=e.thumb?'<img src="'+e.thumb+'" loading="lazy" alt="">':'<div class="ep-thumb-ph"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>';
    var playIco=playingKey===e.key?'<svg width="13" height="13" viewBox="0 0 24 24" fill="#000"><rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/></svg>':'<svg width="13" height="13" viewBox="0 0 24 24" fill="#000"><polygon points="6,3 20,12 6,21"/></svg>';
    var sk=e.key.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    var st=(e.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    return '<div class="ep-item'+(playingKey===e.key?' playing':'')+'" onclick="playEp(\''+sk+'\',\''+st+'\')">' +
      '<div class="ep-thumb">'+thumb+'</div>' +
      '<div class="ep-info"><div class="ep-show">'+esc(e.show)+'</div><div class="ep-title">'+esc(e.name)+'</div>' +
      '<div class="ep-meta"><span>'+fmtD(e.date)+'</span>'+(e.dur?'<span>·</span><span>'+fmt(e.dur)+'</span>':'')+'</div></div>' +
      '<button class="ep-play-btn" onclick="event.stopPropagation();playEp(\''+sk+'\',\''+st+'\')">'+playIco+'</button></div>';
  }).join('');
}

function stopEp() {
  if (!playingKey) return;
  playingKey = null;
  mixcloudActive = false;
  document.getElementById('mc-mini-player').style.display = 'none';
  document.getElementById('mc-iframe').src = '';
  filterEpisodes();
  updateMiniPlayer();
  setTimeout(updateMiniPlayer, 100); // safety net after DOM re-render
}

function playEp(key, title){
  if(playingKey===key){ stopEp(); return; }
  playingKey=key;
  // Zaustavi live strim ako svira
  if(playing){
    playing = false;
    audio.pause(); audio.src='';
    audio.onerror = null;
    clearRing();
    setPlayUI(false);
  }
  // Show Mixcloud mini player
  var mcp = document.getElementById('mc-mini-player');
  document.getElementById('mc-mini-title').textContent = title || key.split('/').filter(Boolean).pop() || 'Emisija';
  document.getElementById('mc-mini-ext').href = 'https://www.mixcloud.com' + key;
  document.getElementById('mc-iframe').src = 'https://www.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&autoplay=1&feed='+encodeURIComponent(key)+'&dark=1';
  mcp.style.display = 'block';
  mixcloudActive = true;
  filterEpisodes();
  updateMiniPlayer();
}

/* ═══ PROGRESS RING ═══ */
var ringTimer = null;
var RING_CIRC = 188.5; // 2 * PI * 30

function updateRing(progress) {
  // progress: 0.0 to 1.0
  var offset = RING_CIRC * (1 - Math.max(0, Math.min(1, progress)));
  var ring = document.getElementById('play-ring');
  if (ring) ring.style.strokeDashoffset = offset;
}

function clearRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  updateRing(0);
}

function startRingForCurrentShow() {
  clearRing();
  if (!playing) return;

  // Find current show from rasporedData (today = index 0)
  var day = rasporedData[0];
  if (!day) return;

  var now = new Date();
  var curMins = now.getHours() * 60 + now.getMinutes();

  var currentShow = null, nextShow = null;
  for (var i = 0; i < day.items.length; i++) {
    var item = day.items[i];
    if (!item.time) continue;
    var tp = item.time.split(':');
    var startMins = parseInt(tp[0]) * 60 + parseInt(tp[1]);
    var nxt = day.items[i + 1];
    var endMins = nxt && nxt.time
      ? (function(t) { var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1]); })(nxt.time)
      : startMins + 60;
    if (curMins >= startMins && curMins < endMins) {
      currentShow = { start: startMins, end: endMins };
      break;
    }
  }

  if (!currentShow) { updateRing(0); return; }

  function tick() {
    var n = new Date();
    var mins = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
    var duration = currentShow.end - currentShow.start;
    var elapsed  = mins - currentShow.start;
    var progress = duration > 0 ? elapsed / duration : 0;
    updateRing(progress);
    if (progress >= 1) {
      clearInterval(ringTimer); ringTimer = null;
      // Try to find next show
      setTimeout(startRingForCurrentShow, 5000);
    }
  }

  tick();
  ringTimer = setInterval(tick, 10000); // update every 10s
}

/* ═══ SLEEP TIMER ═══ */
var sleepTimer = null;
var sleepEndMin = null;
var sleepEndTimestamp = null;
var sleepCountdownInterval = null;

function _sleepStartCountdown(endTimestamp) {
  sleepEndTimestamp = endTimestamp;
  if (sleepCountdownInterval) clearInterval(sleepCountdownInterval);
  sleepCountdownInterval = setInterval(function() {
    if (!sleepEndTimestamp) { clearInterval(sleepCountdownInterval); return; }
    var remaining = Math.round((sleepEndTimestamp - Date.now()) / 60000);
    if (remaining <= 0) {
      clearInterval(sleepCountdownInterval);
      updateSleepLabel(null);
    } else {
      updateSleepLabel(remaining);
    }
  }, 30000); // osvežava svakih 30s
}

function openSleepTimer() {
  document.getElementById('sleep-backdrop').classList.add('open');
  document.getElementById('sleep-sheet').classList.add('open');
  // Highlight active option if set
  document.querySelectorAll('.sleep-opt').forEach(function(b){ b.classList.remove('active'); });
}
function closeSleepTimer() {
  document.getElementById('sleep-backdrop').classList.remove('open');
  document.getElementById('sleep-sheet').classList.remove('open');
}

function setSleep(minutes, btn) {
  if (sleepTimer) clearTimeout(sleepTimer);
  var endTs = Date.now() + minutes * 60 * 1000;
  sleepTimer = setTimeout(function(){
    if (playing) togglePlay();
    sleepTimer = null;
    sleepEndTimestamp = null;
    if (sleepCountdownInterval) { clearInterval(sleepCountdownInterval); sleepCountdownInterval = null; }
    updateSleepLabel(null);
    showToast('😴 Stream zaustavljen');
  }, minutes * 60 * 1000);
  document.querySelectorAll('.sleep-opt').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('sleep-cancel-btn').style.display = 'flex';
  updateSleepLabel(minutes);
  _sleepStartCountdown(endTs);
  showToast('⏱ Tajmer: ' + (minutes < 60 ? minutes + ' min' : (minutes/60) + (minutes===60?' sat':' sata')));
  setTimeout(closeSleepTimer, 600);
}

function setSleepEndOfShow(btn) {
  if (sleepTimer) clearTimeout(sleepTimer);
  // Pronađi kraj trenutne emisije
  var day = rasporedData[0];
  if (!day) { showToast('Nema podataka o rasporedu'); return; }
  var now = new Date(), curMins = now.getHours()*60+now.getMinutes();
  var endMins = null;
  for (var i=0; i<day.items.length; i++) {
    var item = day.items[i];
    if (!item.time) continue;
    var tp = item.time.split(':'), st = parseInt(tp[0])*60+parseInt(tp[1]);
    var nxt = day.items[i+1];
    var en = nxt&&nxt.time?(function(t){var p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]);})(nxt.time):st+60;
    if (curMins >= st && curMins < en) { endMins = en; break; }
  }
  if (endMins === null) { showToast('Nema aktivne emisije'); return; }
  var remaining = (endMins - curMins) * 60 * 1000;
  var endTs = Date.now() + remaining;
  sleepTimer = setTimeout(function(){
    if (playing) togglePlay();
    sleepTimer = null;
    sleepEndTimestamp = null;
    if (sleepCountdownInterval) { clearInterval(sleepCountdownInterval); sleepCountdownInterval = null; }
    updateSleepLabel(null);
    showToast('😴 Emisija završena – stream zaustavljen');
  }, remaining);
  document.querySelectorAll('.sleep-opt').forEach(function(b){ b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  document.getElementById('sleep-cancel-btn').style.display = 'flex';
  var remMin = Math.round(remaining/60000);
  updateSleepLabel(remMin);
  _sleepStartCountdown(endTs);
  showToast('⏱ Gasi se za kraj emisije (~' + remMin + ' min)');
  setTimeout(closeSleepTimer, 600);
}

function cancelSleep() {
  if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
  if (sleepCountdownInterval) { clearInterval(sleepCountdownInterval); sleepCountdownInterval = null; }
  sleepEndTimestamp = null;
  sleepEndMin = null;
  document.querySelectorAll('.sleep-opt').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('sleep-cancel-btn').style.display = 'none';
  updateSleepLabel(null);
  showToast('Tajmer otkazan');
  closeSleepTimer();
}

function updateSleepLabel(val) {
  var el = document.getElementById('sleep-label');
  if (!el) return;
  if (val === null) { el.textContent = ''; el.classList.remove('visible'); }
  else { el.textContent = typeof val === 'number' ? (val<60?val+'m':val/60+'h') : val; el.classList.add('visible'); }
}

/* ═══ AIRPLAY / CAST ═══ */
var activeDevice = 'phone';

function openAirplay() {
  document.getElementById('airplay-backdrop').classList.add('open');
  document.getElementById('airplay-sheet').classList.add('open');
  // Try Web Bluetooth / Remote Playback API scan
  scanDevices();
}
function closeAirplay() {
  document.getElementById('airplay-backdrop').classList.remove('open');
  document.getElementById('airplay-sheet').classList.remove('open');
}

function scanDevices() {
  // Remote Playback API (Chrome / Chromium on Android)
  if (window.RemotePlayback && audio.remote) {
    audio.remote.watchAvailability(function(available) {
      var el = document.getElementById('dev-airplay');
      if (el) {
        el.querySelector('.device-sub').textContent = available ? 'Dostupno' : 'Nije dostupno';
        el.style.opacity = available ? '1' : '0.5';
      }
    }).catch(function(){});
  }
  // Web Bluetooth availability
  if (navigator.bluetooth) {
    navigator.bluetooth.getAvailability().then(function(available) {
      var el = document.getElementById('dev-bt');
      if (el) el.querySelector('.device-sub').textContent = available ? 'Bluetooth dostupan' : 'Nije dostupno';
    }).catch(function(){});
  }
}

function selectDevice(type) {
  // Remote Playback API – actual device selection
  if (type === 'airplay' && window.RemotePlayback && audio.remote) {
    audio.remote.prompt().then(function(){
      setActiveDevice(type);
    }).catch(function(e){
      showToast('Koristite Share → AirPlay na iOS-u');
    });
    return;
  }
  if (type === 'bt') {
    // Web Bluetooth – can't route audio directly, but show info
    showToast('Povežite Bluetooth uređaj kroz podešavanja telefona');
    return;
  }
  if (type === 'cast') {
    showToast('Otvorite Cast opciju u browser meniju');
    return;
  }
  setActiveDevice(type);
}

function setActiveDevice(type) {
  activeDevice = type;
  ['phone','airplay','bt','cast'].forEach(function(d){
    var item = document.getElementById('dev-'+d);
    var check = document.getElementById('check-'+d);
    if (item) item.classList.toggle('active', d===type);
    if (check) check.style.opacity = d===type ? '1' : '0';
  });
  setTimeout(closeAirplay, 400);
}

/* ═══ MINI PLAYER ═══ */
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

  // Sync title/artist
  var hasTrack = playing && current.title && current.title !== 'radioAPARAT';
  var liveTitle  = hasTrack ? current.title  : 'radioAPARAT';
  var liveArtist = !playing
    ? 'Pauzirano'
    : (hasTrack ? current.artist : 'Uživo');
  document.getElementById('mini-title').textContent = liveTitle;
  document.getElementById('mini-artist').textContent = liveArtist;

  // Sync play/pause icon
  var miniIcon = document.getElementById('mini-play-icon');
  miniIcon.innerHTML = playing
    ? '<rect x="5" y="4" width="4" height="16"/><rect x="15" y="4" width="4" height="16"/>'
    : '<polygon points="6,3 20,12 6,21"/>';

  // Sync fav — visible only when stream is playing
  var favExists = favorites.some(function(f){ return f.title === current.title; });
  var mfb = document.getElementById('mini-fav-btn');
  mfb.classList.toggle('active', favExists);
  mfb.classList.toggle('visible', playing);
  mfb.querySelector('svg').setAttribute('fill', favExists ? 'currentColor' : 'none');

  // Sync ring progress
  syncMiniRing();
}

function syncMiniRing() {
  var mainRing = document.getElementById('play-ring');
  var miniRing = document.getElementById('mini-ring');
  if (!mainRing || !miniRing) return;
  // Read progress from main ring and scale to mini circumference
  var mainOffset = parseFloat(mainRing.style.strokeDashoffset || 188.5);
  var mainCirc = 188.5;
  var progress = 1 - (mainOffset / mainCirc);
  miniRing.style.strokeDashoffset = MINI_CIRC * (1 - Math.max(0, Math.min(1, progress)));
}

function goToPlayer() {
  var playerNav = document.getElementById('nav-player');
  switchTab('player', playerNav);
}

// Sync ring every 10s when visible
setInterval(function(){
  var mp = document.getElementById('mini-player');
  if (mp && mp.style.display !== 'none') syncMiniRing();
}, 10000);

/* ═══ RASPORED → SHOW DETAIL ═══ */
function openDetailFromRaspored(el) {
  var title = el.getAttribute('data-show-title') || '';
  function norm(s) {
    return s.toLowerCase()
      .replace(/\(r\)/g,'').replace(/\s+#?\d+$/,'')
      .replace(/[^a-zšđčćž\s]/gi,'').trim();
  }
  var t = norm(title);
  var best = null, bestScore = 0;
  SHOWS.forEach(function(s) {
    var sn = norm(s.name);
    var score = 0;
    if (t === sn) score = 100;
    else if (t.indexOf(sn) >= 0 || sn.indexOf(t) >= 0) score = 80;
    else {
      var tw = t.split(' '), sw = sn.split(' ');
      var matches = tw.filter(function(w){ return w.length > 2 && sw.indexOf(w) >= 0; }).length;
      score = matches * 30;
    }
    if (score > bestScore) { bestScore = score; best = s; }
  });
  // Minimalni score da bi se emisija smatrala pronađenom:
  // 100 = egzaktno poklapanje, 80 = substring, 30 = bar jedna zajednička reč (3+ chars)
  var MATCH_THRESHOLD = 30;
  if (best && bestScore >= MATCH_THRESHOLD) {
    detailOrigin = 'raspored';
    openMore('shows');
    setTimeout(function(){ _openDetailById(best.id); }, 60);
  } else {
    showToast('Emisija nije u katalogu');
  }
}


/* ═══ LIGHT/DARK MODE TOGGLE ═══ */
function setMode(mode) {
  // CSS varijable se sada nalaze u :root[data-theme] pravilima u CSS-u.
  // Ova funkcija samo postavlja atribut — CSS preuzima sve ostalo.
  document.documentElement.setAttribute('data-theme', mode);
  document.body.classList.toggle('light-mode', mode === 'light');
  document.getElementById('btn-dark').classList.toggle('active', mode === 'dark');
  document.getElementById('btn-light').classList.toggle('active', mode === 'light');
  // Re-render shows grid da bi chess boje bile ažurne
  if (typeof _renderShowsGrid === 'function') _renderShowsGrid();
}

/* ═══ BOOT ═══ */
/* ═══ CALENDAR REMINDER ═══ */
function addCalendarEvent(title, dateStr, timeStr) {
  // dateStr format: "05.03.2026." → parse to YYYYMMDD
  var parts = dateStr.replace(/\./g,' ').trim().split(/\s+/);
  // parts: [day, month, year]
  var d = parseInt(parts[0],10), mo = parseInt(parts[1],10), yr = parseInt(parts[2],10);
  var timeParts = (timeStr||'00:00').split(':');
  var h = parseInt(timeParts[0],10), m = parseInt(timeParts[1],10)||0;
  function pad(n){return n<10?'0'+n:String(n);}
  var dtStart = yr+''+pad(mo)+''+pad(d)+'T'+pad(h)+''+pad(m)+'00';
  var hEnd = h+1; var dtEnd = yr+''+pad(mo)+''+pad(d)+'T'+pad(hEnd<24?hEnd:23)+''+pad(m)+'00';
  var ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//radioAPARAT//App//SR',
    'BEGIN:VEVENT',
    'DTSTART:'+dtStart,
    'DTEND:'+dtEnd,
    'SUMMARY:'+title+' — radioAPARAT',
    'DESCRIPTION:radioAPARAT — radioaparat.rs',
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
  var blob = new Blob([ics], {type:'text/calendar;charset=utf-8'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'radioAPARAT-podsetnik.ics';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  showToast('📅 Podsetnik preuzet');
}

renderFavs();

/* ═══ EXCEL SHOWS ═══ */
function loadShowsFromExcel() {
  // Sada učitavamo shows.json (GitHub Actions konvertuje Excel → JSON automatski)
  var url = SHOWS_JSON_URL + '?t=' + Math.floor(Date.now() / (1000 * 60 * 30));
  fetch(url)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      var list = data.shows || data; // podrška za oba formata
      if (!Array.isArray(list) || !list.length) throw new Error('Prazan shows.json');
      SHOWS.length = 0;
      list.forEach(function(s) { SHOWS.push(s); });
      showImgFetched = false;
      _epCache = {};
      renderShows();
      console.log('shows.json: učitano', SHOWS.length, 'emisija');
    })
    .catch(function(e) {
      console.warn('shows.json fetch failed:', e);
    });
}
loadShowsFromExcel();
