/* ═══════════════════════════════════════
   airplay.js — AirPlay / Cast / Bluetooth
   ═══════════════════════════════════════ */

var activeDevice = 'phone';

function openAirplay() {
  document.getElementById('airplay-backdrop').classList.add('open');
  document.getElementById('airplay-sheet').classList.add('open');
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
  // Web Bluetooth
  if (navigator.bluetooth) {
    navigator.bluetooth.getAvailability().then(function(available) {
      var el = document.getElementById('dev-bt');
      if (el) el.querySelector('.device-sub').textContent = available ? 'Bluetooth dostupan' : 'Nije dostupno';
    }).catch(function(){});
  }
}

function selectDevice(type) {
  if (type === 'airplay' && window.RemotePlayback && audio.remote) {
    audio.remote.prompt().then(function(){
      setActiveDevice(type);
    }).catch(function(e){
      showToast('Koristite Share → AirPlay na iOS-u');
    });
    return;
  }
  if (type === 'bt') {
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
