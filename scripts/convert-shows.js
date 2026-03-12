// convert-shows.js
// Čita radioaparat-shows_data.xlsx iz root repozitorijuma
// i upisuje shows.json — pokreće se automatski via GitHub Actions
// pri svakom pushu koji menja xlsx fajl.

const XLSX = require('xlsx');
const fs   = require('fs');
const path = require('path');

const XLSX_FILE   = path.join(__dirname, '..', 'radioaparat-shows_data.xlsx');
const OUTPUT_FILE = path.join(__dirname, '..', 'shows.json');

function slugify(str) {
  return String(str).toLowerCase()
    .replace(/[šś]/g, 's').replace(/[đ]/g, 'dj')
    .replace(/[čć]/g, 'c').replace(/[žź]/g, 'z')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-');
}

function main() {
  if (!fs.existsSync(XLSX_FILE)) {
    console.error('GREŠKA: ' + XLSX_FILE + ' nije pronađen');
    process.exit(1);
  }

  const wb = XLSX.readFile(XLSX_FILE);

  // Pokušaj sheet EMISIJE, pa prvi sheet
  const ws = wb.Sheets['EMISIJE'] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) {
    console.error('GREŠKA: sheet EMISIJE nije pronađen. Dostupni:', wb.SheetNames);
    process.exit(1);
  }

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log('Excel: učitano ' + rows.length + ' redova');
  if (rows.length > 0) {
    console.log('Kolone:', Object.keys(rows[0]).join(', '));
  }

  const catMap = {
    'muzika': 'muzika', 'kultura': 'kultura',
    'društvo': 'drustvo', 'drustvo': 'drustvo', 'zabava': 'zabava'
  };

  const shows = rows.map(function(r) {
    const links = {};

    // Podrška za oba formata kolona: "Link: Web" i "linkovi" JSON
    if (r['Link: Web'])        links.web        = r['Link: Web'];
    if (r['Link: Mixcloud'])   links.mixcloud   = r['Link: Mixcloud'];
    if (r['Link: SoundCloud']) links.soundcloud = r['Link: SoundCloud'];
    if (r['Link: Instagram'])  links.instagram  = r['Link: Instagram'];
    if (r['Link: Facebook'])   links.facebook   = r['Link: Facebook'];
    if (r['Link: YouTube'])    links.youtube    = r['Link: YouTube'];
    if (r['Link: Patreon'])    links.patreon    = r['Link: Patreon'];

    // Alternativni format: kolona "linkovi" kao JSON string ili URL
    if (r['linkovi'] && !Object.keys(links).length) {
      const lv = String(r['linkovi']).trim();
      if (lv.startsWith('{')) {
        try { Object.assign(links, JSON.parse(lv)); } catch(e) {}
      } else if (lv.startsWith('http')) {
        if (/mixcloud/i.test(lv)) links.mixcloud = lv;
        else links.web = lv;
      }
    }

    const rawId = slugify(r['ID'] || r['id'] || r['Naziv'] || '');
    const cat   = catMap[(String(r['Kategorija'] || '')).toLowerCase().trim()] || 'muzika';
    const name  = String(r['Naziv'] || '').trim();

    return {
      id:       rawId,
      name:     name,
      cat:      cat,
      schedule: String(r['Termin'] || '').trim(),
      desc:     String(r['Opis']   || '').trim(),
      img:      String(r['URL slike'] || '').trim() || null,
      links:    Object.keys(links).length ? links : null
    };
  }).filter(function(s) { return s.name && s.id; });

  if (!shows.length) {
    console.error('GREŠKA: nema validnih redova u Excel fajlu');
    process.exit(1);
  }

  const output = {
    updated: new Date().toISOString(),
    shows:   shows
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log('✓ shows.json ažuriran: ' + shows.length + ' emisija');

  // Grupiši po kategoriji za pregled
  const bycat = {};
  shows.forEach(function(s) {
    bycat[s.cat] = (bycat[s.cat] || 0) + 1;
  });
  Object.entries(bycat).forEach(function([cat, n]) {
    console.log('  ' + cat + ': ' + n);
  });
}

main();
