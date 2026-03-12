/* ═══════════════════════════════════════
   raspored.js — Raspored emisija
   ═══════════════════════════════════════ */

var rasporedData   = []; // popunjava se iz schedule.json
var activeDayIdx   = 0;
var rasporedInited = false;

/* ── Cache helpers ── */
var RASPORED_CACHE_KEY  = 'ra_raspored_data';
var RASPORED_CACHE_TIME = 'ra_raspored_time';
var RASPORED_MAX_AGE_MS = 3 * 60 * 60 * 1000; // 3 sata

function rasporedIsStale() {
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
  rasporedInited = true;
  buildDayTabs();
  renderRasporedDay(activeDayIdx || 0);
}

/* ── HTML parser za radioaparat.rs/raspored/ ── */
function parseRasporedHTML(html) {
  var doc = (new DOMParser()).parseFromString(html, 'text/html');
  var results = [];

  var dayContainers = doc.querySelectorAll(
    '.schedule-day, .program-day, .raspored-day, ' +
    '[class*="schedule"] [class*="day"], [class*="program"] [class*="day"], ' +
    'article, .entry, .post, .wp-block'
  );
  if (dayContainers.length === 0) {
    dayContainers = doc.querySelectorAll('div, section, article');
  }

  var rDate = /\b(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})\b/;
  var rTime = /\b(\d{1,2}):(\d{2})\b/;
  var bodyText = doc.body ? doc.body.innerText || doc.body.textContent : '';
  var lines = bodyText.split(/\n/).map(function(l){ return l.trim(); }).filter(Boolean);

  var currentDay = null;
  var currentItems = [];

  lines.forEach(function(line) {
    var dateMatch = line.match(rDate);
    if (dateMatch) {
      if (currentDay && currentItems.length > 0) {
        results.push({ date: currentDay, items: currentItems });
      }
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
        var rest = line.replace(rTime, '').replace(/^[\s\-–—:]+/, '').trim();
        var hostSplit = rest.split(/\s*[\/|–—]\s*/);
        var title = hostSplit[0].trim();
        var host  = hostSplit.length > 1 ? hostSplit.slice(1).join(', ').trim() : '';
        if (title) currentItems.push({ time: time, title: title, host: host });
      }
    }
  });

  if (currentDay && currentItems.length > 0) {
    results.push({ date: currentDay, items: currentItems });
  }

  return results;
}

/* ── Fetch schedule.json sa GitHuba ── */
function fetchRasporedDirect(onSuccess, onFail) {
  if (!SCHEDULE_JSON_URL || SCHEDULE_JSON_URL.indexOf('YOUR_GITHUB_USERNAME') >= 0) {
    console.warn('SCHEDULE_JSON_URL nije podešen');
    onFail(); return;
  }
  var url = SCHEDULE_JSON_URL + '?t=' + Math.floor(Date.now() / (1000*60*10));
  fetch(url)
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(d){
      var days = d.days || d;
      if (!Array.isArray(days) || days.length === 0) throw new Error('Prazan raspored');
      onSuccess(days);
    })
    .catch(function(e){
      console.log('fetchRasporedDirect: nije dostupan GitHub, koristim lokalne podatke');
      onFail();
    });
}

/* ── Glavni init ── */
function initProgram() {
  if (rasporedInited) return;
  rasporedInited = true;

  if (rasporedLoadCache() && !rasporedIsStale()) {
    buildDayTabs();
    renderRasporedDay(0);
    _updateRasporedSub(false);
    return;
  }

  if (rasporedData.length > 0) {
    buildDayTabs();
    renderRasporedDay(0);
  } else {
    document.getElementById('day-tabs').innerHTML = '';
    document.getElementById('raspored-list').innerHTML =
      '<div class="ep-loading"><div class="ep-spinner"></div>Učitavam raspored...</div>';
  }

  var sub = document.getElementById('raspored-sub');
  if (sub) sub.textContent = 'Ažuriram...';
  var btn = document.getElementById('raspored-refresh-btn');
  if (btn) { btn.classList.add('spinning'); btn.disabled = true; }

  fetchRasporedDirect(
    function(data) {
      rasporedApplyData(data, 'direct');
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    },
    function() {
      if (ANTHROPIC_API_KEY) {
        _refreshRasporedViaAPI(btn);
      } else {
        if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
        if (rasporedData.length > 0) {
          _updateRasporedSub(true);
        } else {
          if (sub) sub.textContent = 'Raspored nije dostupan';
          document.getElementById('day-tabs').innerHTML = '';
          document.getElementById('raspored-list').innerHTML =
            '<div class="ep-loading" style="color:var(--text3)">Raspored trenutno nije dostupan.<br>Pokušaj ponovo za koji minut.</div>';
        }
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

/* ── Ručni refresh ── */
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

/* ── Render ── */
function buildDayTabs() {
  var SR=['ned','pon','uto','sre','čet','pet','sub'];
  var html=rasporedData.map(function(day,i){
    var pts=day.date.replace(/\.$/,'').split('.');
    var d=new Date(parseInt(pts[2]),parseInt(pts[1])-1,parseInt(pts[0]));
    var name=i===0?'Danas':i===1?'Sutra':SR[d.getDay()];
    var num=parseInt(pts[0]);
    return '<div class="day-tab'+(i===0?' active':'')+'\" onclick="selectRasporedDay('+i+',this)">'+
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

/* ── Kalendarski podsetnik (.ics) ── */
function addCalendarEvent(title, dateStr, timeStr) {
  var parts = dateStr.replace(/\./g,' ').trim().split(/\s+/);
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
