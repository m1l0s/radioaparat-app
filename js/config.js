/* ═══════════════════════════════════════
   config.js — Konstante i globalni state
   ═══════════════════════════════════════ */

/* ── Stream URLs ── */
var STREAMS = [
  'http://live4.rcast.net:8268/',
  'https://stream4.rcast.net/72355/'
];
// Na HTTPS stranicama HTTP streamovi su blokirani — počni od HTTPS streama
var streamIndex = (location.protocol === 'https:') ? 1 : 0;
var STREAM = STREAMS[streamIndex];

/* ── Mixcloud nalog ── */
var MC_USER = 'RADIO_APARAT';

/* ── Audio element ── */
var audio = document.getElementById('audio');
audio.volume = 0.7;

/* ── Anthropic API ključ ──
   NIKADA ne commit-uj pravi ključ u javni repozitorijum.
   Za lokalni razvoj: postavi ovde. Za produkciju: koristi backend proxy. */
var ANTHROPIC_API_KEY = '';

/* ── GitHub raw URL-ovi za JSON fajlove (GitHub Actions ih ažurira) ── */
var SCHEDULE_JSON_URL  = 'https://raw.githubusercontent.com/m1l0s/radioaparat-app/main/schedule.json';
var SUPERMENI_JSON_URL = 'https://raw.githubusercontent.com/m1l0s/radioaparat-app/main/supermeni.json';
var SHOWS_JSON_URL     = 'https://raw.githubusercontent.com/m1l0s/radioaparat-app/main/shows.json';

/* ── Player state ── */
var playing      = false;
var current      = { title: '', artist: 'radioAPARAT' };
var trackHistory = [];

/* ── Favorites ── */
var favorites = JSON.parse(localStorage.getItem('ra_favorites') || '[]');

/* ── Replay state ── */
var allEpisodes    = [];
var activeDate     = 'sve';
var playingKey     = null;
var replayLoaded   = false;
var mixcloudActive = false; // true dok MMP svira

/* ── Emisije state ── */
var SHOWS          = [];
var showsReady     = false;
var activeShowCat  = 'sve';
var showImgCache   = {};
var showImgFetched = false;

/* ── Nav state ── */
var moreOpen      = false;
var activeMoreTab = null;

/* ── Debug ──
   Postavi DBG = true da uključiš debug panel. Ukloniti pre produkcije. */
var DBG = false;

/* ── Vidljivost streaming tastera na player ekranu ── */
var SHOW_STREAM_LINKS = false;
