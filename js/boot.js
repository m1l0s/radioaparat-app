/* ═══════════════════════════════════════
   boot.js — Inicijalizacija pri učitavanju
   Mora biti poslednji <script> tag.
   ═══════════════════════════════════════ */

renderFavs();
loadShowsFromExcel();

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
