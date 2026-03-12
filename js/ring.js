/* ═══════════════════════════════════════
   ring.js — Progress ring (trenutna emisija)
   ═══════════════════════════════════════ */

var ringTimer = null;
var RING_CIRC = 188.5; // 2 * PI * 30

function updateRing(progress) {
  var offset = RING_CIRC * (1 - Math.max(0, Math.min(1, progress)));
  var ring = document.getElementById('play-ring');
  if (ring) ring.style.strokeDashoffset = offset;
  var mini = document.querySelector('.mini-ring-fg');
  if (mini) mini.style.strokeDashoffset = offset;
}

function clearRing() {
  if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
  updateRing(0);
}

function startRingForCurrentShow() {
  clearRing();
  if (!playing) return;

  var day = rasporedData[0];
  if (!day) return;

  var now = new Date();
  var curMins = now.getHours() * 60 + now.getMinutes();

  var currentShow = null;
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
      setTimeout(startRingForCurrentShow, 5000);
    }
  }

  tick();
  ringTimer = setInterval(tick, 10000);
}
