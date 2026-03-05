// fetch-schedule.js
// Fetchuje raspored sa radioaparat.rs i upisuje schedule.json
// Sajt koristi Simple Calendar (simcal) WordPress plugin — parsiramo tačne CSS klase

const fetch   = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const URL_RASPORED = 'https://radioaparat.rs/raspored/';
const OUTPUT_FILE  = path.join(__dirname, '..', 'schedule.json');

function parseSchedule(html) {
  const $ = cheerio.load(html);
  const results = [];

  // Svaki dan je par <dt class="simcal-day-label"> (datum) + <dd> (eventi)
  $('.simcal-events-list-container dt.simcal-day-label').each(function() {
    const date = $(this).find('.simcal-date-format').text().trim();
    if (!date) return;

    const items = [];

    // <dd> koji sledi odmah nakon ovog <dt> sadrži listu emisija
    $(this).next('dd').find('li.simcal-event').each(function() {
      const title = $(this).find('.simcal-event-title').text().trim();
      const time  = $(this).find('.simcal-event-start-time').text().trim();

      // Voditelj je u .simcal-event-description
      // Zameni <br> sa ", " da dobijemo "Voditelj1, Voditelj2"
      const descEl = $(this).find('.simcal-event-description');
      descEl.find('br').replaceWith(', ');
      const host = descEl.text().replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();

      if (title && time) {
        items.push({ time, title, host });
      }
    });

    if (items.length > 0) {
      results.push({ date, items });
    }
  });

  return results;
}

async function main() {
  console.log('Fetchujem raspored sa ' + URL_RASPORED + ' ...');

  let html;
  try {
    const res = await fetch(URL_RASPORED, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RadioAparatBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = await res.text();
    console.log('Primljeno ' + html.length + ' bajtova');
  } catch (e) {
    console.error('Fetch greška: ' + e.message);
    process.exit(1);
  }

  const schedule = parseSchedule(html);

  if (!schedule || schedule.length === 0) {
    console.error('Parser nije pronašao nijedan dan!');
    process.exit(1);
  }

  const output = {
    updated: new Date().toISOString(),
    days: schedule
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  const totalItems = schedule.reduce(function(a, d){ return a + d.items.length; }, 0);
  console.log('schedule.json azuriran: ' + schedule.length + ' dana, ' + totalItems + ' emisija');
  schedule.forEach(function(d){ console.log('  ' + d.date + ': ' + d.items.length + ' emisija'); });
}

main();
