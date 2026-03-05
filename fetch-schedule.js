// fetch-schedule.js
// Fetchuje raspored sa radioaparat.rs i upisuje schedule.json u root repozitorijuma
// Pokreće se automatski svakih 3h via GitHub Actions

const fetch  = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const cheerio = require('cheerio');
const fs     = require('fs');
const path   = require('path');

const URL_RASPORED  = 'https://radioaparat.rs/raspored/';
const OUTPUT_FILE   = path.join(__dirname, '..', 'schedule.json');

// ── Pomoćne funkcije ────────────────────────────────────────────────────────

function normDate(str) {
  // Normalizuje datum u format DD.MM.YYYY.
  // Podržava: "3. mart 2026.", "03.03.2026", "3/3/2026" itd.
  if (!str) return null;
  str = str.trim();

  // Srpski meseci
  const MESECI = {
    'januar':1,'januara':1,'jan':1,
    'februar':2,'februara':2,'feb':2,
    'mart':3,'marta':3,'mar':3,
    'april':4,'aprila':4,'apr':4,
    'maj':5,'maja':5,
    'jun':6,'juna':6,'juni':6,
    'jul':7,'jula':7,'juli':7,
    'avgust':8,'avgusta':8,'avg':8,
    'septembar':9,'septembra':9,'sep':9,
    'oktobar':10,'oktobra':10,'okt':10,
    'novembar':11,'novembra':11,'nov':11,
    'decembar':12,'decembra':12,'dec':12
  };

  // Format: "3. mart 2026." ili "3. marta 2026."
  const mMatch = str.match(/(\d{1,2})\.\s*([a-zšđčćž]+)\s*(\d{4})/i);
  if (mMatch) {
    const d = mMatch[1].padStart(2,'0');
    const m = MESECI[mMatch[2].toLowerCase()];
    const y = mMatch[3];
    if (m) return `${d}.${String(m).padStart(2,'0')}.${y}.`;
  }

  // Format: DD.MM.YYYY ili D.M.YYYY
  const dotMatch = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dotMatch) {
    return `${dotMatch[1].padStart(2,'0')}.${dotMatch[2].padStart(2,'0')}.${dotMatch[3]}.`;
  }

  return null;
}

function normTime(str) {
  if (!str) return null;
  const m = str.trim().match(/(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2,'0')}:${m[2]}`;
  return null;
}

// ── Glavni parser ────────────────────────────────────────────────────────────

function parseSchedule(html) {
  const $ = cheerio.load(html);
  const results = [];

  // Ukloni navigaciju, footer, sidebar — ostavi samo sadržaj
  $('nav, footer, header, aside, .sidebar, .widget, .menu, script, style').remove();

  // ── Strategija 1: tražimo strukturirane tabele sa rasporedom ──
  // Format: | Datum | Vreme | Emisija | Voditelj |
  $('table').each(function() {
    const rows = $(this).find('tr');
    let currentDate = null;
    const items = [];

    rows.each(function() {
      const cells = $(this).find('td, th').map(function(){ return $(this).text().trim(); }).get();
      if (cells.length === 0) return;

      const fullRow = cells.join(' ');
      const date = normDate(fullRow);
      if (date) { currentDate = date; return; }

      const time = normTime(cells[0]) || normTime(cells[1]);
      if (time && currentDate) {
        const title = cells[1] || cells[2] || '';
        const host  = cells[2] || cells[3] || '';
        if (title && title !== time) {
          items.push({ time, title: title.trim(), host: host.trim() });
        }
      }
    });

    if (currentDate && items.length > 0) {
      results.push({ date: currentDate, items });
    }
  });

  if (results.length > 0) {
    console.log(`Strategija 1 (table): ${results.length} dana pronađeno`);
    return results;
  }

  // ── Strategija 2: tražimo divove/sekcije grupisane po danu ──
  // WordPress tipično generiše: h2/h3 sa datumom, pa lista emisija
  const dayMap = {};
  const dayOrder = [];

  $('h1, h2, h3, h4, .day-title, .date-heading, [class*="datum"], [class*="date"], [class*="day"]').each(function() {
    const text = $(this).text().trim();
    const date = normDate(text);
    if (!date) return;

    if (!dayMap[date]) {
      dayMap[date] = [];
      dayOrder.push(date);
    }

    // Tražimo stavke ispod ovog headinga
    let el = $(this).next();
    let safety = 0;
    while (el.length && safety++ < 50) {
      const tag = el.prop('tagName') || '';
      // Stani kad naiđemo na sledeći heading istog nivoa
      if (/^H[1-4]$/.test(tag)) {
        const nextDate = normDate(el.text());
        if (nextDate) break;
      }

      const text = el.text().trim();
      const time = normTime(text.substring(0, 6));
      if (time) {
        // Parsiramo: "14:00 EMISIJA — Voditelj" ili "14:00 - EMISIJA (Voditelj)"
        const rest = text.replace(/^\d{1,2}:\d{2}\s*[-–—]?\s*/, '').trim();
        const parts = rest.split(/\s*[\/|–—]\s*/);
        const title = parts[0].trim();
        const host  = parts.slice(1).join(', ').trim();
        if (title) dayMap[date].push({ time, title, host });
      }

      // Provjeri i child elemente (li, p, div)
      el.find('li, p').each(function() {
        const childText = $(this).text().trim();
        const childTime = normTime(childText.substring(0, 6));
        if (childTime) {
          const rest = childText.replace(/^\d{1,2}:\d{2}\s*[-–—]?\s*/, '').trim();
          const parts = rest.split(/\s*[\/|–—]\s*/);
          const title = parts[0].trim();
          const host  = parts.slice(1).join(', ').trim();
          if (title) dayMap[date].push({ time: childTime, title, host });
        }
      });

      el = el.next();
    }
  });

  dayOrder.forEach(function(date) {
    if (dayMap[date].length > 0) {
      // Deduplikacija po time+title
      const seen = new Set();
      const items = dayMap[date].filter(function(item) {
        const key = item.time + item.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      results.push({ date, items });
    }
  });

  if (results.length > 0) {
    console.log(`Strategija 2 (headings): ${results.length} dana pronađeno`);
    return results;
  }

  // ── Strategija 3: plain text parsing — linija po linija ──
  const bodyText = $.root().text();
  const lines = bodyText.split(/\n/).map(s => s.trim()).filter(Boolean);

  let curDate = null;
  let curItems = [];
  const timeRe = /^\d{1,2}:\d{2}/;

  lines.forEach(function(line) {
    const date = normDate(line);
    if (date) {
      if (curDate && curItems.length > 0) results.push({ date: curDate, items: curItems });
      curDate = date;
      curItems = [];
      return;
    }
    if (curDate && timeRe.test(line)) {
      const time = normTime(line.substring(0, 5));
      const rest = line.replace(/^\d{1,2}:\d{2}\s*[-–—]?\s*/, '').trim();
      const parts = rest.split(/\s*[\/|–—]\s*/);
      const title = parts[0].trim();
      const host  = parts.slice(1).join(', ').trim();
      if (time && title) curItems.push({ time, title, host });
    }
  });
  if (curDate && curItems.length > 0) results.push({ date: curDate, items: curItems });

  if (results.length > 0) {
    console.log(`Strategija 3 (plain text): ${results.length} dana pronađeno`);
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetchujem raspored sa ${URL_RASPORED} ...`);

  let html;
  try {
    const res = await fetch(URL_RASPORED, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RadioAparatBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 15000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
    console.log(`Primljeno ${html.length} bajtova HTML-a`);
  } catch (e) {
    console.error(`Fetch greška: ${e.message}`);
    process.exit(1);
  }

  const schedule = parseSchedule(html);

  if (!schedule || schedule.length === 0) {
    console.error('Parser nije pronašao nijedan dan u rasporedu!');
    console.log('--- Prvih 2000 znakova HTML-a za debug ---');
    console.log(html.substring(0, 2000));
    process.exit(1);
  }

  const output = {
    updated: new Date().toISOString(),
    days: schedule
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✓ schedule.json ažuriran: ${schedule.length} dana, ${schedule.reduce((a,d)=>a+d.items.length,0)} emisija`);
  schedule.forEach(d => console.log(`  ${d.date}: ${d.items.length} emisija`));
}

main();
