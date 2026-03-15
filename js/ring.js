/* ═══════════════════════════════════════
   ring.js — robust progress ring
   - koristi realno end vreme emisije
   - podrška za emisije preko ponoći
   - ring se gasi kad nema emisije
   - tolerancija na varijacije JSON rasporeda
   ═══════════════════════════════════════ */

var ringTimer = null;
var RING_CIRC = 188.5;

function updateRing(progress) {

  var offset = RING_CIRC * (1 - Math.max(0, Math.min(1, progress)));

  var ring = document.getElementById('play-ring');
  if (ring) ring.style.strokeDashoffset = offset;

  var mini = document.querySelector('.mini-ring-fg');
  if (mini) mini.style.strokeDashoffset = offset;

}

function clearRing() {

  if (ringTimer) {
    clearInterval(ringTimer);
    ringTimer = null;
  }

  updateRing(0);

}

function timeToMinutes(t) {

  if (!t) return null;

  var p = t.split(':');

  return parseInt(p[0]) * 60 + parseInt(p[1]);

}

function nowMinutes() {

  var n = new Date();

  return (
    n.getHours() * 60 +
    n.getMinutes() +
    n.getSeconds() / 60
  );

}

function normalizeEnd(start, end) {

  if (end === null) return null;

  if (end < start) {
    end += 1440;
  }

  return end;

}

function getTodaySchedule() {

  if (!rasporedData || !rasporedData.days) return null;

  var d = new Date();

  var today =
    String(d.getDate()).padStart(2,'0') + '.' +
    String(d.getMonth()+1).padStart(2,'0') + '.' +
    d.getFullYear() + '.';

  for (var i = 0; i < rasporedData.days.length; i++) {

    if (rasporedData.days[i].date === today) {
      return rasporedData.days[i];
    }

  }

  return null;

}

function findCurrentShow(day) {

  if (!day || !day.items) return null;

  var now = nowMinutes();

  for (var i = 0; i < day.items.length; i++) {

    var item = day.items[i];

    if (!item || !item.time) continue;

    var start = timeToMinutes(item.time);

    var end = null;

    if (item.end) {
      end = timeToMinutes(item.end);
    }

    if (end === null) {

      var next = day.items[i + 1];

      if (next && next.time) {
        end = timeToMinutes(next.time);
      }

    }

    if (end === null) continue;

    end = normalizeEnd(start, end);

    var checkNow = now;

    if (end > 1440 && now < start) {
      checkNow += 1440;
    }

    if (checkNow >= start && checkNow < end) {

      return {
        start: start,
        end: end
      };

    }

  }

  return null;

}

function startRingForCurrentShow() {

  clearRing();

  if (!playing) return;

  if (!rasporedData || !rasporedData.length) {

    setTimeout(function () {
      if (playing) startRingForCurrentShow();
    }, 2000);

    return;

  }

  var day = getTodaySchedule();

  var show = findCurrentShow(day);

  if (!show) {

    updateRing(0);

    setTimeout(startRingForCurrentShow, 60000);

    return;

  }

  function tick() {

    var now = nowMinutes();

    var start = show.start;
    var end = show.end;

    if (end > 1440 && now < start) {
      now += 1440;
    }

    var duration = end - start;

    var elapsed = now - start;

    var progress = duration > 0 ? elapsed / duration : 0;

    updateRing(progress);

    if (progress >= 1) {

      clearRing();

      setTimeout(startRingForCurrentShow, 2000);

    }

  }

  tick();

  ringTimer = setInterval(tick, 1000);

}
