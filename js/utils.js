/* ═══════════════════════════════════════
   utils.js — Pomoćne funkcije
   ═══════════════════════════════════════ */

/* ── HTML escape ── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Debug helper ── */
function dbg(type, msg) {
  if (!DBG) return;
  var panel = document.getElementById('debug-panel');
  var el = document.getElementById('dbg-' + type);
  if (!panel || !el) return;
  panel.style.display = 'block';
  el.textContent = (type === 'rds' ? 'RDS: ' : 'ART: ') + msg;
  console.log('[' + type.toUpperCase() + ']', msg);
}

/* ── Toast notifikacija ── */
var toastTimer;
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 2000);
}

/* ── Sat u status baru ── */
function updateClock() {
  var d = new Date();
  var h = d.getHours(), m = d.getMinutes();
  document.getElementById('statusbar-time').textContent = h + ':' + (m<10?'0':'')+m;
}
updateClock();
setInterval(updateClock, 10000);

/* ── Copy to clipboard ── */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('Kopirano ✓');
  }).catch(function() {
    showToast('Kopirajte ručno: ' + text);
  });
}
