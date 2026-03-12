/* ═══════════════════════════════════════
   emisije.js — Katalog emisija i epizode
   ═══════════════════════════════════════ */

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
    var cardRe = /<a[^>]+href=["']https?:\/\/radioaparat\.rs\/shows\/([^/"']+)\/?["'][^>]*>[\s\S]{0,2000}?<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi;
    var m;
    while ((m = cardRe.exec(html)) !== null) {
      var slug = m[1], imgUrl = m[2];
      var normSlug = slug.toLowerCase().replace(/[šś]/g,'s').replace(/đ/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z');
      if (!showImgCache[slug]) showImgCache[slug] = imgUrl;
      if (slug !== normSlug && !showImgCache[normSlug]) showImgCache[normSlug] = imgUrl;
      found++;
    }
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
        parseShowsPage(html);
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
  var src = (s.img && s.img.startsWith('http')) ? s.img : (showImgCache[s.id] || null);
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
  var epSection = document.getElementById('detail-episodes-section');
  var epList = document.getElementById('detail-episodes-list');
  epSection.style.display = 'block';
  epList.innerHTML = '<div style="padding:12px 0;color:var(--text3);font-size:13px;">Učitavam epizode...</div>';

  var showSlug = s.name.toLowerCase()
    .replace(/[šś]/g,'s').replace(/[đ]/g,'dj').replace(/[čć]/g,'c').replace(/[žź]/g,'z')
    .replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-');

  fetchShowEpisodes(showSlug, (s.links && s.links.mixcloud) || null, (s.links && s.links.soundcloud) || null, function(eps){
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
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
    document.getElementById('nav-raspored').classList.add('active');
    document.getElementById('screen-raspored').classList.add('active');
    activeMoreTab = null;
  }
}

/* ── Mixcloud cloudcast cache ── */
var _mcCache = null;
var _mcCacheCallbacks = [];

function getMixcloudCasts(cb) {
  if (_mcCache) { cb(_mcCache); return; }
  _mcCacheCallbacks.push(cb);
  if (_mcCacheCallbacks.length > 1) return;
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

/* ── Epizode po emisiji ── */
var _epCache = {};
function fetchShowEpisodes(showId, mixcloudLink, soundcloudLink, cb) {
  // Podrška za poziv bez soundcloudLink (backwards compat)
  if (typeof soundcloudLink === 'function') { cb = soundcloudLink; soundcloudLink = null; }
  if (_epCache[showId]) { cb(_epCache[showId]); return; }

  function norm(s) {
    return s.toLowerCase()
      .replace(/[šśŝ]/g,'s').replace(/[đ]/g,'dj').replace(/[čćĉ]/g,'c').replace(/[žź]/g,'z')
      .replace(/[^a-z0-9\s]/g,'').trim();
  }

  function done(eps) { _epCache[showId] = eps; cb(eps); }

  // Pokušaj 1: Sopstveni Mixcloud nalog (ne RADIO_APARAT)
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
          trySoundcloud();
        })
        .catch(trySoundcloud);
      return;
    }
  }

  trySoundcloud();

  // Pokušaj 2: SoundCloud API (public, bez auth za resolve)
  function trySoundcloud() {
    if (!soundcloudLink) { fetchFromRadioAparat(); return; }
    // Izvuci username i playlist/tracks iz URL-a
    // Podrzani formati: soundcloud.com/user, soundcloud.com/user/sets/playlist
    var scMatch = soundcloudLink.match(/soundcloud\.com\/([^\/?\s]+)/i);
    if (!scMatch) { fetchFromRadioAparat(); return; }
    var scUser = scMatch[1];
    // SoundCloud nema javni API bez client_id — koristimo rss feed kao fallback
    var rssUrl = 'https://feeds.soundcloud.com/users/soundcloud:users:' + scUser + '/sounds.rss';
    // Probamo kroz proxy jer CORS
    var proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent('https://soundcloud.com/' + scUser + '/tracks');
    fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(rssUrl))
      .then(function(r){ return r.json(); })
      .then(function(d){
        var xml = d.contents || '';
        if (!xml || xml.length < 100) throw new Error('empty');
        // Parse RSS items
        var eps = [];
        var itemRe = /<item>([\s\S]*?)<\/item>/gi, m;
        while ((m = itemRe.exec(xml)) !== null && eps.length < 20) {
          var titleM = m[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/i);
          var linkM  = m[1].match(/<link>(.*?)<\/link>|<enclosure[^>]+url="([^"]+)"/i);
          var title = titleM ? (titleM[1] || titleM[2] || '').trim() : '';
          var url   = linkM  ? (linkM[1]  || linkM[2]  || '').trim() : '';
          if (title && url) eps.push({ url: url, title: title, mcKey: null, date: '' });
        }
        if (eps.length) { done(eps); return; }
        fetchFromRadioAparat();
      })
      .catch(fetchFromRadioAparat);
  }

  // Pokušaj 3: RADIO_APARAT Mixcloud archive
  function fetchFromRadioAparat() {
    getMixcloudCasts(function(casts) {
      var showWords = norm(showId.replace(/-/g,' ')).split(/\s+/).filter(function(w){ return w.length > 1; });
      if (showWords.length === 0) { done([]); return; }
      var eps = casts.filter(function(c) {
        var cNorm = norm(c.name);
        var cWords = cNorm.split(/\s+/);
        var matches = showWords.filter(function(w){ return cWords.indexOf(w) >= 0; }).length;
        return matches >= Math.min(showWords.length, 2);
      }).map(function(c){
        return { url: 'https://www.mixcloud.com'+c.key, title: c.name, mcKey: c.key, date: (c.created_time||'').slice(0,10) };
      });
      done(eps);
    });
  }
}

/* ── Raspored → show detail (fuzzy match) ── */
function openDetailFromRaspored(el) {
  var title = el.getAttribute('data-show-title') || '';
  if (!showsReady) {
    var attempts = 0;
    var wait = setInterval(function() {
      attempts++;
      if (showsReady) { clearInterval(wait); _doOpenFromRaspored(title); }
      else if (attempts >= 30) { clearInterval(wait); showToast('Emisije se još učitavaju, pokušaj ponovo'); }
    }, 100);
    return;
  }
  _doOpenFromRaspored(title);
}

function _doOpenFromRaspored(title) {
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
  var MATCH_THRESHOLD = 30;
  if (best && bestScore >= MATCH_THRESHOLD) {
    detailOrigin = 'raspored';
    closeMore();
    closeAllSheets();
    activeMoreTab = 'shows';
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.screen').forEach(function(s){ s.classList.remove('active'); });
    document.getElementById('nav-more').classList.add('active');
    var det = document.getElementById('show-detail');
    det.style.transition = 'none';
    det.classList.add('open');
    document.getElementById('screen-shows').classList.add('active');
    _openDetailById(best.id);
    requestAnimationFrame(function(){ det.style.transition = ''; });
  } else {
    showToast('Emisija nije u katalogu');
  }
}

/* ── Učitaj shows.json sa GitHuba ── */
function loadShowsFromExcel() {
  var url = SHOWS_JSON_URL + '?t=' + Math.floor(Date.now() / (1000 * 60 * 30));
  fetch(url)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      var list = data.shows || data;
      if (!Array.isArray(list) || !list.length) throw new Error('Prazan shows.json');
      SHOWS.length = 0;
      list.forEach(function(s) { SHOWS.push(s); });
      showsReady = true;
      showImgFetched = false;
      _epCache = {};
      renderShows();
      console.log('shows.json: učitano', SHOWS.length, 'emisija');
    })
    .catch(function(e) {
      console.warn('shows.json fetch failed:', e);
    });
}
