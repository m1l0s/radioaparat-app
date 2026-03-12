/* ═══════════════════════════════════════
   player.js — Stream, RDS, artwork, favoriti, historija
   ═══════════════════════════════════════ */

/* ── Stream error retry tracking ── */
var _streamRetryTimes = []; // timestamp svakog neuspelog pokušaja
var STREAM_RETRY_WINDOW = 30000; // 30 sekundi
var STREAM_RETRY_LIMIT  = 3;    // posle 3 greške → "pokušaj kasnije"

/* ── Pokušaj pokretanja streama sa fallback logikom ── */
function tryStream() {
  audio.onerror = null;
  var src = STREAMS[streamIndex];
  // Uvek resetuj src na live streamu — sprečava resume od stale pozicije
  audio.src = src;
  audio.onerror = function(e) {
    if (!playing) return;
    if (streamIndex < STREAMS.length - 1) {
      streamIndex++;
      showToast('Probavam rezervni stream...');
      tryStream();
    } else {
      // Svi streamovi neuspešni — auto-pauziraj
      playing = false;
      audio.pause();
      audio.onerror = null;
      clearRing();
      setPlayUI(false);
      updateMiniPlayer();

      // Proveravamo koliko puta smo imali grešku u poslednih 30s
      var now = Date.now();
      _streamRetryTimes = _streamRetryTimes.filter(function(t){ return now - t < STREAM_RETRY_WINDOW; });
      _streamRetryTimes.push(now);

      if (_streamRetryTimes.length > STREAM_RETRY_LIMIT) {
        showToast('Problem sa streamom — pokušaj kasnije');
      } else {
        showToast('Problem sa streamom — pokušaj ponovo');
      }
    }
  };
  audio.play().catch(function(){});
}

/* ── Ažuriranje UI play/pauza stanja ── */
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

/* ── Toggle play/pauza ── */
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
    setTimeout(fetchNow, 2000); // brzi retry — stream možda još bufferuje
    showToast('Pokrećem stream...');
  }
  updateMiniPlayer();
}

/* ── RDS polling ──
   Probavamo sve endpointe dok jedan ne prooradi.
   Kada nađemo koji radi, koristimo samo njega. */
var rdsWorkingIdx = -1; // -1 = još tražimo

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

/* ── Primeni novi track (RDS → UI) ── */
function applyTrack(t) {
  if (!t || t.trim() === '') return;
  t = t.trim();
  var p = t.split(' - ');
  var newTrack = p.length > 1
    ? { artist: p[0].trim(), title: p.slice(1).join(' - ').trim() }
    : { title: t, artist: 'radioAPARAT' };
  var trackChanged = newTrack.title !== current.title;
  if (trackChanged && current.title !== '') {
    trackHistory.unshift({ title: current.title, artist: current.artist, time: new Date() });
    if (trackHistory.length > 10) trackHistory.pop();
    renderHistory();
  }
  current = newTrack;
  if (trackChanged) {
    var titleEl = document.getElementById('track-title');
    var artistEl = document.getElementById('track-artist');
    titleEl.style.opacity = '0';
    setTimeout(function(){
      titleEl.textContent = current.title;
      titleEl.style.opacity = '1';
      // Marquee na Player ekranu
      requestAnimationFrame(function() {
        titleEl.classList.remove('marquee-player');
        if (titleEl.scrollWidth > titleEl.clientWidth) {
          var dur = Math.max(6, titleEl.scrollWidth / 35);
          var dist = -(titleEl.scrollWidth + 40);
          titleEl.style.setProperty('--marquee-dur', dur + 's');
          titleEl.style.setProperty('--marquee-dist', dist + 'px');
          titleEl.classList.add('marquee-player');
        }
      });
    }, 200);
    artistEl.textContent = current.artist;
    artistEl.style.visibility = current.artist ? 'visible' : 'hidden';
    fetchStreamLinks(current.artist, current.title);
  }
  updateMiniPlayer();
  checkFav();
}

/* ── Artwork cache ── */
var _artworkCache = {};

/* ── RDS polling loop ── */
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
    var racePromises = endpoints.map(function(url, idx) {
      return fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(d) {
          var t = parseRDSResponse(d);
          if (!t) throw new Error('parse null');
          return { track: t, idx: idx };
        });
    });

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

/* ── Streaming linkovi za trenutnu pesmu ── */
function fetchStreamLinks(artist, title) {
  var q = encodeURIComponent(artist + ' ' + title);
  document.getElementById('lnk-spotify').href  = 'https://open.spotify.com/search/' + q;
  document.getElementById('lnk-apple').href    = 'https://music.apple.com/search?term=' + q;
  document.getElementById('lnk-youtube').href  = 'https://music.youtube.com/search?q=' + q;
  document.getElementById('lnk-deezer').href   = 'https://www.deezer.com/search/' + q;
  fetchArtwork(artist, title);
}

/* ── Otvori streaming sheet za trenutnu RDS pesmu ── */
function openCurrentTrackStreamSheet() {
  if (!current.title || current.title === '') return;
  var rawQ = current.artist && current.artist !== 'radioAPARAT'
    ? current.artist + ' ' + current.title
    : current.title;
  openStreamSheet(current.artist || '', current.title, rawQ);
}

/* ── iTunes artwork fetch ── */
var lastArtworkTitle = '';
function fetchArtwork(artist, title) {
  if (!artist || !title) { dbg('art', '⚠️ artist/title prazno'); return; }
  var key = artist + ' - ' + title;
  if (key === lastArtworkTitle) { dbg('art', '⏭ isti key, skip'); return; }
  lastArtworkTitle = key;

  if (_artworkCache[key]) {
    dbg('art', '⚡ keš hit: ' + key);
    setAlbumArt(_artworkCache[key]);
    return;
  }

  dbg('art', '🔍 iTunes: ' + key);
  var q1 = encodeURIComponent(artist + ' ' + title);
  var q2 = encodeURIComponent(title);

  function makeArtFetch(q) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function(){ controller.abort(); }, 6000) : null;
    return fetch('https://itunes.apple.com/search?term=' + q + '&media=music&limit=1&country=US',
                 controller ? { signal: controller.signal } : {})
      .then(function(r){ if (timer) clearTimeout(timer); return r.json(); })
      .then(function(d){
        if (d.results && d.results.length > 0 && d.results[0].artworkUrl100)
          return d.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
        throw new Error('no result');
      })
      .catch(function(e){ if (timer) clearTimeout(timer); throw e; });
  }

  var resolved = false;
  function tryResult(art) {
    if (resolved) return;
    resolved = true;
    _artworkCache[key] = art;
    dbg('art', '✅ setAlbumArt: ' + art);
    setAlbumArt(art);
  }
  var p1 = makeArtFetch(q1);
  var p2 = makeArtFetch(q2);
  p1.then(tryResult).catch(function(){});
  p2.then(tryResult).catch(function(){});
  Promise.all([p1.catch(function(){}), p2.catch(function(){})]).then(function(){
    if (!resolved) { dbg('art', '❌ nema result'); clearAlbumArt(); }
  });
}

/* ── Postavi album art ── */
function setAlbumArt(url) {
  var pinImg  = document.querySelector('.album-pin-img');
  var logoImg = document.querySelector('.album-logo-img');
  var miniPin = document.querySelector('.mini-pin-img');
  var glowEl  = document.querySelector('.album-glow');

  var img = new Image();
  img.onload = function() {
    if (pinImg)  { pinImg.src = url; pinImg.classList.add('has-artwork'); }
    if (miniPin) { miniPin.src = url; miniPin.classList.add('has-artwork'); }
    if (logoImg) { logoImg.style.display = 'none'; }
    if (glowEl)  { glowEl.style.backgroundImage = 'url(' + url + ')'; glowEl.classList.add('on'); }
  };
  img.onerror = function(){ clearAlbumArt(); };
  img.src = url;
}

/* ── Ukloni album art ── */
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

/* ── Favoriti dugme sync ── */
function checkFav() {
  if (!current.title) return;
  var btn = document.getElementById('fav-btn');
  if (!btn) return;
  var exists = favorites.some(function(f){ return f.title === current.title; });
  btn.classList.toggle('active', exists);
  btn.querySelector('svg').setAttribute('fill', exists ? 'currentColor' : 'none');
}

function saveFavs() { localStorage.setItem('ra_favorites', JSON.stringify(favorites)); }

function toggleFav() {
  if (!current.title) return;
  var exists = favorites.some(function(f){ return f.title === current.title; });
  if (exists) { favorites = favorites.filter(function(f){ return f.title !== current.title; }); showToast('Uklonjeno iz favorita'); }
  else { favorites.unshift({ title:current.title, artist:current.artist }); showToast('♥ Dodato u favorite'); }
  saveFavs();
  checkFav(); renderFavs();
  updateMiniPlayer();
}

/* ── Deli pesmu ── */
function shareTrack() {
  var txt = current.title + ' - ' + current.artist + ' | radioAPARAT radioaparat.rs';
  if (navigator.share) navigator.share({ title:'radioAPARAT', text:txt });
  else { navigator.clipboard && navigator.clipboard.writeText(txt); showToast('Kopirano ✓'); }
}

/* ── Istorija pesama ── */
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

  function isValidSong(s) {
    if (!s || s.length < 3) return false;
    if (/shoutcast|icecast|server|status|history|admin|stream|listener|source|bitrate|version|posix|linux|windows|genre|url:|&nbsp;/i.test(s)) return false;
    if (/^\d+$/.test(s)) return false;
    return true;
  }

  function parseHtml(html) {
    var rows = [];
    var trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi, trM;
    while ((trM = trRe.exec(html)) !== null) {
      var cells = [], tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi, tdM;
      while ((tdM = tdRe.exec(trM[1])) !== null)
        cells.push(decodeHtmlText(tdM[1]));
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
    var rows = [];
    try {
      var data = (typeof json === 'string') ? JSON.parse(json) : json;
      var icestats = data.icestats || data;
      var src = icestats.source || (Array.isArray(icestats.sources) ? icestats.sources[0] : null);
      if (src) {
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

/* ── History sheet ── */
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
    var listEl = document.getElementById('history-list');
    if (listEl) listEl.innerHTML = '<div style="padding:16px 0;color:var(--text2);font-size:14px;text-align:center;">Učitavam...</div>';
    fetchPlayedHistory(function(rows){
      var currentTitle = current.title || '';
      var history = rows.filter(function(r){
        if (!r.artist || !r.title) return false;
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
