/* ═══════════════════════════════════════
   sleepTimer.js — Sleep tajmer
   ═══════════════════════════════════════ */

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
      sleepCountdownInterval = null;
      if (sleepTimer) { clearTimeout(sleepTimer); sleepTimer = null; }
      sleepEndTimestamp = null;
      if (playing) togglePlay();
      updateSleepLabel(null);
      showToast('😴 Stream zaustavljen');
    } else {
      updateSleepLabel(remaining);
    }
  }, 30000);
}

function openSleepTimer() {
  document.getElementById('sleep-backdrop').classList.add('open');
  document.getElementById('sleep-sheet').classList.add('open');
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
