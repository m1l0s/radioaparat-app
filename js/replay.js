/* ═══════════════════════════════════════
   replay.js — Replay (Mixcloud cloudcasts)
   ═══════════════════════════════════════ */

function loadReplay(){
  buildDatePills();
  var externalUsers = [];
  SHOWS.forEach(function(s) {
    var mc = s.links && s.links.mixcloud;
    if (!mc) return;
    var m = mc.match(/mixcloud\.com\/([^\/]+)\/?$/i);
    if (m && m[1].toUpperCase() !== 'RADIO_APARAT') {
      var user = m[1];
      if (externalUsers.indexOf(user) === -1) externalUsers.push(user);
    }
  });
  var fetchUrls = ['RADIO_APARAT'].concat(externalUsers).map(function(user) {
    return fetch('https://api.mixcloud.com/' + user + '/cloudcasts/?limit=100')
      .then(function(r){ return r.json(); })
      .then(function(d){ return d.data || []; })
      .catch(function(){ return []; });
  });
  Promise.all(fetchUrls).then(function(results) {
    var combined = [];
    results.forEach(function(data) { combined = combined.concat(data); });
    if (!combined.length) { replayLoaded = false; loadDemoEpisodes(); return; }
    combined.sort(function(a, b) { return (b.created_time||'').localeCompare(a.created_time||''); });
    var seen = {};
    combined = combined.filter(function(e) { if (seen[e.key]) return false; seen[e.key]=true; return true; });
    var cutDate = new Date(); cutDate.setDate(cutDate.getDate()-7);
    var cutStr = cutDate.getFullYear()+'-'+String(cutDate.getMonth()+1).padStart(2,'0')+'-'+String(cutDate.getDate()).padStart(2,'0');
    function mapEp(e){ var pics=e.pictures||{}; var thumb=pics['640wx640h']||pics['320wx320h']||pics.medium_mobile||pics.medium||pics.small||null; return {key:e.key,name:e.name,show:(e.tags&&e.tags[0]&&e.tags[0].name)||'radioAPARAT',date:(e.created_time||'').slice(0,10),dur:e.audio_length||0,thumb:thumb}; }
    allEpisodes = combined.map(mapEp).filter(function(e){ return e.date && e.date >= cutStr; });
    if (!allEpisodes.length) allEpisodes = combined.map(mapEp).slice(0,20);
    filterEpisodes();
  }).catch(function(){ replayLoaded = false; loadDemoEpisodes(); });
}

/* ── Pull-to-refresh (više ekrana) ── */
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

  makePTR('screen-shows',
    function(){ return document.getElementById('shows-grid'); },
    function(){
      var grid = document.getElementById('shows-grid');
      if (grid) grid.innerHTML = '<div class="ep-loading"><div class="ep-spinner"></div>Učitavam emisije...</div>';
      loadShowsFromExcel();
    }
  );

  makePTR('screen-favs',
    function(){ return document.getElementById('fav-list'); },
    function(){ renderFavs(); }
  );

  makePTR('screen-chat',
    function(){ return null; },
    function(){
      var iframe = document.querySelector('#screen-chat iframe');
      if (iframe) { var s = iframe.src; iframe.src = ''; iframe.src = s; }
    }
  );
})();

/* ── Datum helpers ── */
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
    return '<div class="ep-item'+(playingKey===e.key?' playing':'')+'" onclick="playEp(\''+sk+'\',\''+st+'\')">'+
      '<div class="ep-thumb">'+thumb+'</div>'+
      '<div class="ep-info"><div class="ep-show">'+esc(e.show)+'</div><div class="ep-title">'+esc(e.name)+'</div>'+
      '<div class="ep-meta"><span>'+fmtD(e.date)+'</span>'+(e.dur?'<span>·</span><span>'+fmt(e.dur)+'</span>':'')+'</div></div>'+
      '<button class="ep-play-btn" onclick="event.stopPropagation();playEp(\''+sk+'\',\''+st+'\')">'+playIco+'</button></div>';
  }).join('');
}

/* ── MMP playback ── */
function mcStartPlayback() {
  if (playing) {
    playing = false;
    audio.pause();
    audio.onerror = null;
    clearRing();
    setPlayUI(false);
    updateMiniPlayer();
  }
  document.getElementById('mc-mini-play-wrap').style.display = 'none';
  document.getElementById('mc-mini-iframe-wrap').style.display = 'block';
  document.getElementById('mc-iframe').src = 'https://www.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&autoplay=1&feed='+encodeURIComponent(playingKey)+'&dark=1';
}

function stopEp() {
  if (!playingKey) return;
  playingKey = null;
  mixcloudActive = false;
  document.getElementById('mc-mini-player').style.display = 'none';
  document.getElementById('mc-iframe').src = '';
  document.getElementById('mc-mini-iframe-wrap').style.display = 'none';
  document.getElementById('mc-mini-play-wrap').style.display = 'block';
  filterEpisodes();
  updateMiniPlayer();
  setTimeout(updateMiniPlayer, 100);
}

function playEp(key, title){
  if(playingKey===key){
    // Isti ep kliknut ponovo — vrati se na "Učitaj emisiju" prikaz bez stopEp()
    var mcp = document.getElementById('mc-mini-player');
    document.getElementById('mc-mini-iframe-wrap').style.display = 'none';
    document.getElementById('mc-mini-play-wrap').style.display = 'block';
    mcp.style.display = 'block';
    mixcloudActive = true;
    return;
  }
  playingKey=key;
  var mcp = document.getElementById('mc-mini-player');
  document.getElementById('mc-mini-title').textContent = title || key.split('/').filter(Boolean).pop() || 'Emisija';
  document.getElementById('mc-mini-ext').href = 'https://www.mixcloud.com' + key;
  document.getElementById('mc-mini-iframe-wrap').style.display = 'none';
  document.getElementById('mc-mini-play-wrap').style.display = 'block';
  document.getElementById('mc-mini-play-btn').innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="6,3 20,12 6,21"/></svg> Učitaj emisiju';
  document.getElementById('mc-iframe').src = '';
  mcp.style.display = 'block';
  mixcloudActive = true;
  filterEpisodes();
  updateMiniPlayer();
}
