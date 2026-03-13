/* ═══════════════════════════════════════
   superMeni.js — Super Meni lista + stream/maps sheet
   ═══════════════════════════════════════ */

var smInited=false, smAllTracks=[];
var _smData={
  "date":"",
  "preslušaj":"",
  "tracks":[]
};

function initSuperMeni(){
  var now = Date.now();
  var hasTracks = _smData.tracks && _smData.tracks.length > 0;

  if (hasTracks) {
    applySMData(_smData);
  } else {
    document.getElementById('sm-sub').textContent = 'Učitavam...';
    document.getElementById('sm-list').innerHTML =
      '<div class="ep-loading"><div class="ep-spinner"></div>Učitavam Super Meni listu...</div>';
  }

  if (window._smRefreshing) return;
  if (hasTracks && window._smLastRefresh && (now - window._smLastRefresh) < 60000) {
    document.getElementById('sm-sub').textContent = (_smData.date||'').replace(/^SUPER MENI\s*[–-]\s*/i,'');
    return;
  }
  window._smRefreshing = true;
  if (hasTracks) document.getElementById('sm-sub').textContent = 'Ažuriram...';
  var timer = setTimeout(function(){
    window._smRefreshing = false;
    if (!_smData.tracks || !_smData.tracks.length) {
      document.getElementById('sm-sub').textContent = 'Lista nije dostupna';
      document.getElementById('sm-list').innerHTML =
        '<div class="ep-loading" style="color:var(--text3)">Lista trenutno nije dostupna.<br>Pokušaj ponovo za koji minut.</div>';
    } else {
      document.getElementById('sm-sub').textContent = (_smData.date||'').replace(/^SUPER MENI\s*[–-]\s*/i,'');
    }
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
        if (html.length > 100) { cb(html); return; }
        tryProxy(i+1);
      })
      .catch(function(e){ tryProxy(i+1); });
  }
  tryProxy(0);
}

function _smParse(html) {
  var tracks = [];

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

  if (!tracks.length) {
    var lines = html.split(/\r?\n/);
    lines.forEach(function(line) {
      if (/^\s*\|[\s\-:]+\|/.test(line)) return;
      var cols = line.split('|').map(function(c){ return c.replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim(); });
      if (cols[0] === '') cols.shift();
      if (cols[cols.length-1] === '') cols.pop();
      if (cols.length < 3) return;
      var posNum = parseInt(cols[0]);
      if (!posNum || isNaN(posNum)) return;
      var t = _smMakeTrack(cols);
      if (t) tracks.push(t);
    });
  }

  return tracks;
}

function _smMakeTrack(cells) {
  var posNum = parseInt(cells[0]);
  if (!posNum || isNaN(posNum)) return null;
  var pn  = (cells[1]||'').replace(/\D/g,'').trim() || '0';
  var raw = (cells[2]||'').trim()
    .replace(/&ndash;/gi, '\u2013')
    .replace(/&mdash;/gi, '\u2014')
    .replace(/&#8211;/g, '\u2013')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'");
  // Kolone ned i naj — sajt ih prikazuje kao brojeve > 0
  // Neki parsovi mogu imati drugačiji broj kolona, pa tražimo sve preostale
  var ned = '', naj = '';
  // Pokupi sve brojeve iz kolona [3] i [4] i dalje
  var extraNums = [];
  for (var ci = 3; ci < cells.length; ci++) {
    var n = (cells[ci]||'').replace(/\D/g,'').trim();
    if (n && parseInt(n) > 0) extraNums.push(n);
  }
  // Sajt format: ned je pre naj (Ned. = koliko nedelja na listi, Naj. = najbolja pozicija)
  ned = extraNums[0] || '1';
  naj = extraNums[1] || String(posNum);

  var artist = '', song = raw;
  var sepIdx = raw.indexOf(' \u2013 ');
  if (sepIdx < 0) sepIdx = raw.indexOf(' \u2014 ');
  if (sepIdx < 0) sepIdx = raw.indexOf(' - ');
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

  if (url && /mixcloud\.com/i.test(url)) { _play(url); return; }

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
  if (dateStr) { _smData.date = dateStr; document.getElementById('sm-sub').textContent = dateStr.replace(/^SUPER MENI\s*[–—-]\s*/i,'').replace(/\.\s*$/,''); }
  smAllTracks = tracks;
  renderSMList(tracks);
  var done = false;
  var FALLBACK_URL = 'https://radioaparat.rs/shows/super-meni/';
  var t = setTimeout(function(){
    done = true;
    if (!_smData['preslušaj'] || _smData['preslušaj'] === FALLBACK_URL) {
      _smData['preslušaj'] = FALLBACK_URL;
    }
  }, 8000);
  _smFetchPreslusaj(function(url){
    if (done) return;
    clearTimeout(t);
    _smData['preslušaj'] = url || FALLBACK_URL;
  });
}

function _smFetchFromJSON(cb) {
  var url = SUPERMENI_JSON_URL + '?t=' + Math.floor(Date.now() / (1000*60*60));
  fetch(url)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(d) {
      if (!d.tracks || !d.tracks.length) throw new Error('Prazan supermeni.json');
      cb(d);
    })
    .catch(function(e) { console.log('SM JSON fetch failed:', e.message); cb(null); });
}

function _autoRefreshSuperMeni(doneCb){
  doneCb = doneCb || function(){};
  _smFetchFromJSON(function(data) {
    if (data) {
      // JSON ima sve osim pouzdanog ned — enrichuj sa HTML stranicom
      _smFetchPage(function(html){
        if (html) {
          var htmlTracks = _smParse(html);
          if (htmlTracks.length) {
            // Napravi mapu pos -> ned iz HTML-a
            var nedMap = {};
            htmlTracks.forEach(function(t){ nedMap[t.pos] = t.ned; });
            data.tracks.forEach(function(t){
              var htmlNed = nedMap[t.pos] || nedMap[parseInt(t.pos) < 10 ? '0'+parseInt(t.pos) : t.pos];
              if (htmlNed && parseInt(htmlNed) > 0) t.ned = htmlNed;
            });
          }
        }
        _smApplyFetched(data.tracks, data.date || '');
        doneCb();
      });
      return;
    }
    _smFetchPage(function(html){
      if (!html) { doneCb(); return; }
      var tracks = _smParse(html);
      if (!tracks.length) { doneCb(); return; }
      _smApplyFetched(tracks, _smExtractDate(html));
      doneCb();
    });
  });
}

function refreshSuperMeni(){
  var btn = document.getElementById('sm-refresh-btn');
  var sub = document.getElementById('sm-sub');
  btn.classList.add('spinning'); btn.disabled = true;
  sub.textContent = 'Osvežavam...';
  _smFetchFromJSON(function(data) {
    if (data) {
      _smFetchPage(function(html){
        btn.classList.remove('spinning'); btn.disabled = false;
        if (html) {
          var htmlTracks = _smParse(html);
          if (htmlTracks.length) {
            var nedMap = {};
            htmlTracks.forEach(function(t){ nedMap[t.pos] = t.ned; });
            data.tracks.forEach(function(t){
              var htmlNed = nedMap[t.pos] || nedMap[parseInt(t.pos) < 10 ? '0'+parseInt(t.pos) : t.pos];
              if (htmlNed && parseInt(htmlNed) > 0) t.ned = htmlNed;
            });
          }
        }
        _smApplyFetched(data.tracks, data.date || '');
        showToast('Lista osvežena ✓');
      });
      return;
    }
    _smFetchPage(function(html){
      btn.classList.remove('spinning'); btn.disabled = false;
      if (!html) { showToast('Greška: ne mogu da dohvatim listu'); sub.textContent = (_smData.date||'Nije dostupno'); return; }
      var tracks = _smParse(html);
      if (!tracks.length) { showToast('Greška: stranica se promenila'); sub.textContent = (_smData.date||'Nije dostupno'); return; }
      _smApplyFetched(tracks, _smExtractDate(html));
      showToast('Lista osvežena ✓');
    });
  });
}

function applySMData(data){
  if(data.date) document.getElementById('sm-sub').textContent=data.date.replace(/^SUPER MENI\s*[–-]\s*/i,'');
  if(data['preslušaj']) _smData['preslušaj']=data['preslušaj'];
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
  var ned = parseInt(t.ned) || 1;
  var naj = (t.naj && t.naj !== '00') ? t.naj : t.pos;
  var nedStr = ned < 10 ? '0'+ned : ''+ned;
  var najStr = parseInt(naj) < 10 ? '0'+parseInt(naj) : ''+parseInt(naj);
  var nedLabel = ned > 1 ? '<div class="sm-ned">NED: '+nedStr+'</div>' : '';
  return '<div class="sm-row" data-q="'+esc(t.artist+' '+t.song)+'" onclick="smRowClick(this)">'+
    '<div class="sm-pos'+(t.posNum<=3?' top3':'')+'">'+esc(t.pos)+'</div>'+
    '<div class="sm-trend '+t.trend+'">'+(TREND_ICONS[t.trend]||'')+'</div>'+
    '<div class="sm-body">'+
      (t.artist?'<div class="sm-artist">'+esc(t.artist)+'</div>':'')+
      '<div class="sm-song">'+esc(t.song)+'</div>'+
    '</div>'+
    '<div class="sm-stats">'+nedLabel+'<div class="sm-naj">NAJ: '+najStr+'</div></div>'+
  '</div>';
}

function renderSMList(tracks){
  var search='<div class="sm-search-wrap"><input class="sm-search" type="text" placeholder="🔍  Pretraži listu..." oninput="filterSM(this.value)" autocomplete="off"></div>';
  document.getElementById('sm-list').innerHTML=search+tracks.map(smRowHTML).join('');
}

function filterSM(q){
  var lq = q ? q.toLowerCase() : '';
  document.querySelectorAll('#sm-list .sm-row').forEach(function(r){
    var match = !lq || (r.getAttribute('data-q') || '').toLowerCase().indexOf(lq) >= 0;
    r.style.display = match ? '' : 'none';
  });
}

function smRowClick(el){
  var raw = el.getAttribute('data-q') || '';
  if (!raw) return;
  var artist = el.querySelector('.sm-artist') ? el.querySelector('.sm-artist').textContent : '';
  var song   = el.querySelector('.sm-song')   ? el.querySelector('.sm-song').textContent   : '';
  openStreamSheet(artist, song, raw);
}

/* ── Stream sheet ── */
function openStreamSheet(artist, song, rawQ) {
  var q = encodeURIComponent(rawQ);
  document.getElementById('stream-sheet-title').textContent  = song   || rawQ;
  document.getElementById('stream-sheet-artist').textContent = artist || '';
  document.getElementById('ssi-spotify').href  = 'https://open.spotify.com/search/' + q;
  document.getElementById('ssi-apple').href    = 'https://music.apple.com/search?term=' + q;
  document.getElementById('ssi-youtube').href  = 'https://music.youtube.com/search?q=' + q;
  document.getElementById('ssi-deezer').href   = 'https://www.deezer.com/search/' + q;
  document.getElementById('history-backdrop').classList.remove('open');
  document.getElementById('history-sheet').classList.remove('open');
  document.getElementById('stream-backdrop').classList.add('open');
  document.getElementById('stream-sheet').classList.add('open');
}

function closeStreamSheet() {
  document.getElementById('stream-backdrop').classList.remove('open');
  document.getElementById('stream-sheet').classList.remove('open');
}

/* ── Maps sheet ── */
function openMapsSheet() {
  closeAllSheets();
  document.getElementById('maps-backdrop').classList.add('open');
  document.getElementById('maps-sheet').classList.add('open');
}
function closeMapsSheet() {
  document.getElementById('maps-backdrop').classList.remove('open');
  document.getElementById('maps-sheet').classList.remove('open');
}
