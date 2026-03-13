/* ═══════════════════════════════════════
   boot.js — Inicijalizacija pri učitavanju
   Mora biti poslednji <script> tag.
   ═══════════════════════════════════════ */

renderFavs();
loadShowsFromExcel();

/* Email — postavlja se kroz JS, Cloudflare ne može da obfuskira JS fajlove */
(function() {
  var u = 'radioaparat';
  var d = 'gmail.com';
  var email = u + '@' + d;
  var row = document.getElementById('onama-email-row');
  var txt = document.getElementById('onama-email-text');
  if (row) row.href = 'mailto:' + email;
  if (txt) txt.textContent = email;
})();

/* Preload rasporeda u pozadini — ring.js čeka na ove podatke */
if (typeof initProgram === 'function') {
  setTimeout(function() {
    if (!rasporedData || !rasporedData.length) initProgram();
  }, 500);
}

/* Preload Super Meni u pozadini — lista je odmah spremna kad korisnik ode na ekran */
if (typeof _autoRefreshSuperMeni === 'function') {
  setTimeout(function() {
    if (!_smData.tracks || !_smData.tracks.length) {
      _autoRefreshSuperMeni(function() {});
    }
  }, 1500);
}
