import * as api from './api.js';
import * as cs from './complaints.js';
import * as ideas from './ideas.js';
import * as scanData from './scan-data.js';
import { t, cnt, lang, setLang, LANGS, locale } from './i18n.js';
import { COUNTRIES, CNAME, CSHORT, REGIONS, GENRES, GNAME } from './constants.js';
import { keywordReport, nicheReport, nicheScore, categoryScore, categoryVerdict, appGap, gapVerdict, ratingBaseline, pickIdeas, titleIdeas, tokens, daysSince, mostCommon, verdictFor } from './scoring.js';

// ---------- constants ----------

// Countries tab: which countries to compare. Apple limits request speed, so cap the set.
const COMPARE_MAX = 12;
const COMPARE_PRESETS = [
  ['Top payers', ['us', 'gb', 'ca', 'au', 'de', 'jp']],
  ['English', ['us', 'gb', 'ca', 'au', 'nz', 'ie', 'sg']],
  ['Europe', ['de', 'fr', 'it', 'es', 'nl', 'ch', 'se', 'no', 'dk', 'at', 'be', 'pl']],
  ['Asia', ['jp', 'kr', 'tw', 'hk', 'cn', 'sg', 'in']],
  ['Rich & small', ['ch', 'no', 'dk', 'se', 'nl', 'at', 'ie', 'nz', 'sg', 'ae', 'il', 'fi']],
];
const DEFAULT_COMPARE = COMPARE_PRESETS[0][1];

const CHART_LABEL = { grossing: 'Top Grossing', paid: 'Top Paid', free: 'Top Free' };
const SAMPLES = ['plant care', 'budget planner', 'sleep sounds', 'bird identifier', 'meal planner', 'pdf scanner'];

// ---------- helpers ----------
const $ = (s, root = document) => root.querySelector(s);
// Names are stored in English and translated only for display.
const cname = (cc) => t(CNAME[cc] || cc);
const cshort = (cc) => t(CSHORT[cc] || cc);
const gname = (g) => t(GNAME[g] || String(g || ''));
const dateText = (ts) => new Date(ts).toLocaleDateString(locale());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

function ago(iso) {
  const d = daysSince(iso);
  if (d === Infinity) return t('unknown');
  if (d < 1) return t('today');
  if (d < 31) return t('{n}d ago', { n: d });
  if (d < 365) return t('{n} mo ago', { n: Math.round(d / 30) });
  const yrs = (d / 365).toFixed(1).replace(/\.0$/, '');
  return t('{n} yr ago', { n: lang === 'pl' ? yrs.replace('.', ',') : yrs });
}

const year = (iso) => (iso ? new Date(iso).getFullYear() : '–');
const tone = (v) => (v >= 60 ? 'good' : v >= 40 ? 'warn' : 'bad');

const store = {
  get(k, d) {
    try { const v = localStorage.getItem('aof:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('aof:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ }
  },
};

function errorText(e) {
  if (e instanceof api.RateLimitError) return t('Apple is limiting requests right now. Wait a minute, then try again.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return t("You're offline. Connect to the internet and try again.");
  return t("Couldn't load data from the App Store. Try again in a moment.");
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

const sheet = $('#sheet'); // details / idea editor dialog

// ---------- state ----------
const state = {
  country: CNAME[store.get('country', 'us')] ? store.get('country', 'us') : 'us',
  niche: { genreId: store.get('nicheGenre', '6013'), chart: store.get('nicheChart', 'grossing'), only: false, result: null, busy: false, error: null, token: 0 },
  kw: { text: '', result: null, busy: false, error: null, token: 0 },
  cmp: { text: '', rows: null, busy: false, error: null, token: 0 },
  nicheMode: ['top', 'all', 'one'].includes(store.get('nicheMode', 'top')) ? store.get('nicheMode', 'top') : 'top',
  scan: { summary: null, loading: false, error: null, countries: {}, countryLoading: {} },
  top: { kind: 'gaps', cc: store.get('topCc', ''), g: store.get('topG', '') },
  auto: { busy: false, error: null, token: 0, done: 0, failed: 0, current: '', waiting: false, results: null, country: null, at: 0 },
  ideasFilter: 'all',
  cs: { key: null, busy: false, step: '', error: null, needsKey: false, keyForm: false, entry: null, token: 0 },
  cmpCountries: (() => {
    const v = store.get('cmpCountries', DEFAULT_COMPARE);
    const ok = Array.isArray(v) ? v.filter((c) => CNAME[c]).slice(0, COMPARE_MAX) : [];
    return ok.length ? ok : [...DEFAULT_COMPARE];
  })(),
  apps: new Map(), // id|country → app, for the details sheet
};

const appKey = (a) => `${a.id}|${a.cc}`;
const remember = (apps) => apps.forEach((a) => state.apps.set(appKey(a), a));

// ---------- data jobs ----------
async function scoreKeyword(text, cc) {
  const apps = (await api.search(text, cc, 25)).slice(0, 10).map((a) => ({ ...a, cc }));
  const genreId = mostCommon(apps.map((a) => a.genreId));
  let grossingIds = new Set();
  if (genreId) {
    try {
      grossingIds = new Set((await api.chart(cc, genreId, 'grossing')).map((c) => c.id));
    } catch (e) {
      if (e instanceof api.RateLimitError) throw e;
    }
  }
  const report = keywordReport(apps, text, { grossingIds });
  const genreName = GNAME[genreId] || apps.find((a) => a.genreId === genreId)?.genre || '';
  return { kw: text, country: cc, apps, report, genreName };
}

async function scanNiche(genreId, cc, type) {
  const chart = await api.chart(cc, genreId, type);
  const details = await api.lookup(chart.map((c) => c.id), cc);
  const apps = chart.map((c, i) => ({ ...c, ...(details.get(c.id) || {}), rank: i + 1, cc }));
  if (type === 'grossing') {
    const baseline = ratingBaseline(apps);
    apps.forEach((a) => {
      const g = appGap(a, { rank: a.rank, baseline, genreId });
      a.gapInfo = { gap: g.gap, money: g.money, demand: g.demand, unhappy: g.unhappy, beatable: g.beatable, rank: a.rank };
    });
  }
  return { genreId, country: cc, chart: type, apps, report: nicheReport(apps, { isGrossing: type === 'grossing' }) };
}

async function runNiche() {
  const s = state.niche;
  const token = ++s.token;
  Object.assign(s, { busy: true, error: null, result: null });
  refresh('niches');
  try {
    const r = await scanNiche(s.genreId, state.country, s.chart);
    if (token !== s.token) return;
    remember(r.apps);
    s.result = r;
  } catch (e) {
    if (token !== s.token) return;
    s.error = errorText(e);
  }
  s.busy = false;
  refresh('niches');
}

async function runKeyword(text) {
  const s = state.kw;
  const term = String(text || '').trim();
  if (!term) return;
  const token = ++s.token;
  Object.assign(s, { text: term, busy: true, error: null, result: null });
  refresh('keyword');
  try {
    const r = await scoreKeyword(term, state.country);
    if (token !== s.token) return;
    remember(r.apps);
    s.result = r;
    syncIdea(r);
    if (!r.report.empty) guideDone('keyword');
  } catch (e) {
    if (token !== s.token) return;
    s.error = errorText(e);
  }
  s.busy = false;
  refresh('keyword');
}

async function runCompare(text) {
  const s = state.cmp;
  const term = String(text || '').trim();
  if (!term) return;
  const token = ++s.token;
  Object.assign(s, { text: term, busy: true, error: null, rows: state.cmpCountries.map((cc) => ({ cc, status: 'wait' })) });
  refresh('compare');
  for (const row of s.rows) {
    if (token !== s.token) return;
    row.status = 'busy';
    refresh('compare');
    try {
      row.result = await scoreKeyword(term, row.cc);
      remember(row.result.apps);
      row.status = 'done';
    } catch (e) {
      row.status = 'error';
      if (e instanceof api.RateLimitError) {
        s.error = errorText(e);
        s.rows.filter((r) => r.status === 'wait').forEach((r) => { r.status = 'skipped'; });
        break;
      }
    }
    if (token !== s.token) return;
    refresh('compare');
  }
  if (token !== s.token) return;
  s.busy = false;
  refresh('compare');
  if (s.rows.some((r) => r.status === 'done')) guideDone('compare');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function summarizeNiche(r, name) {
  const rep = r.report;
  const gaps = r.apps.map((a) => a.gapInfo?.gap || 0);
  const cat = categoryScore(rep, gaps);
  const examples = r.apps
    .filter((a, i) => rep.flags[i].smallEarner && a.ratings > 0)
    .slice(0, 2)
    .map((a) => ({ name: a.name, rank: a.rank, ratings: a.ratings }));
  const best = [...r.apps].sort((x, y) => (y.gapInfo?.gap || 0) - (x.gapInfo?.gap || 0))[0];
  return {
    genreId: String(r.genreId), name, score: cat.score, verdict: cat.verdict, sizeLabel: cat.sizeLabel,
    niche: cat.niche, gapTop: cat.gapTop,
    small: rep.small, fresh: rep.fresh, stale: rep.stale, median: rep.medianRatings,
    ideas: pickIdeas(rep.ideas.map((i) => i.text), name), examples,
    topGap: best ? { name: best.name, gap: best.gapInfo?.gap || 0 } : null,
  };
}

/** A category row from the App Store scan, in the same shape as a live scan result. */
function fromScanCategory(c) {
  return {
    genreId: String(c.g), name: GNAME[c.g] || String(c.g), score: c.s, verdict: categoryVerdict(c.s), sizeLabel: c.sz,
    niche: c.n, gapTop: c.gt, small: c.sm, fresh: c.fr, stale: c.st, median: c.md,
    ideas: c.ideas || [], examples: c.ex ? [{ name: c.ex.n, rank: c.ex.rk, ratings: c.ex.r }] : [],
    topGap: c.top ? { name: c.top.n, gap: c.top.gap } : null,
  };
}

function ensureScan() {
  const n = state.scan;
  if (n.summary || n.loading) return;
  n.loading = true;
  n.error = null;
  scanData.loadSummary()
    .then((sum) => { n.summary = sum; })
    .catch((e) => { n.error = e instanceof scanData.NotPublishedError ? 'missing' : 'failed'; })
    .finally(() => { n.loading = false; refresh('niches'); });
}

function ensureScanCountry(cc) {
  const n = state.scan;
  if (n.countries[cc] || n.countryLoading[cc]) return;
  n.countryLoading[cc] = true;
  scanData.loadCountry(cc)
    .then((data) => { n.countries[cc] = data; })
    .catch(() => { n.countries[cc] = { failed: true, categories: [] }; })
    .finally(() => { n.countryLoading[cc] = false; refresh('niches'); });
}


/** Load the last saved auto-scan for the current country, unless a scan is running. */
function loadAuto() {
  const a = state.auto;
  if (a.busy || a.country === state.country) return;
  const saved = store.get('autoscan2:' + state.country, null);
  Object.assign(a, { country: state.country, results: saved?.results || null, at: saved?.at || 0, error: null, failed: 0 });
}

async function runAutoScan() {
  const a = state.auto;
  const cc = state.country;
  const token = ++a.token;
  Object.assign(a, { busy: true, error: null, done: 0, failed: 0, current: '', waiting: false, results: [], country: cc, at: 0 });
  refresh('niches');
  for (const [id, name] of GENRES) {
    if (token !== a.token) return;
    a.current = name;
    refresh('niches');
    let r = null;
    for (let attempt = 0; attempt < 2 && !r; attempt++) {
      try {
        r = await scanNiche(String(id), cc, 'grossing');
      } catch (e) {
        if (!(e instanceof api.RateLimitError)) break; // skip this category, keep going
        if (attempt === 0) {
          a.waiting = true;
          refresh('niches');
          await sleep(30000);
          a.waiting = false;
          if (token !== a.token) return;
        } else {
          a.error = errorText(e);
        }
      }
    }
    if (token !== a.token) return;
    if (a.error) break;
    if (r) {
      remember(r.apps);
      a.results.push(summarizeNiche(r, name));
      a.results.sort((x, y) => y.score - x.score);
    } else {
      a.failed++;
    }
    a.done++;
    refresh('niches');
  }
  if (token !== a.token) return;
  a.busy = false;
  a.at = Date.now();
  if (!a.error && a.results.length) store.set('autoscan2:' + cc, { at: a.at, results: a.results });
  refresh('niches');
}

// ---------- complaint summary ----------
function costText(usd) {
  if (!usd || usd < 0.001) return t('under 0.1¢');
  if (usd < 0.01) return t('about {n}¢', { n: (usd * 100).toFixed(1) });
  if (usd < 1) return t('about {n}¢', { n: Math.round(usd * 100) });
  return t('about ${n}', { n: usd.toFixed(2) });
}

function complaintsInner(r) {
  const s = state.cs;
  const key = `${r.country}|${r.kw.toLowerCase()}`;
  if (s.key !== key) {
    s.token++; // forget any summary still running for another keyword
    Object.assign(s, { key, busy: false, step: '', error: null, needsKey: false, keyForm: false, entry: cs.getCached(r.kw, r.country) });
  }
  const head = `<h3>${t('What users complain about')}${info('complaints')}</h3>`;
  if (s.busy) return head + loading(s.step || t('Starting…'));
  if (s.keyForm || s.needsKey) return head + keyFormHtml(s.error);
  if (s.entry) return head + summaryHtml(s.entry);
  return `${head}${s.error ? errorBox(s.error) : ''}
  <div class="empty cs-start">
    <p>${t('Let Claude read the recent 1–3 star reviews of the top {n} apps and list what users want fixed.', { n: cs.APPS_TO_READ })}</p>
    <button class="btn" type="button" data-act="cs-run">${t('Summarize complaints')}</button>
    <p class="note">${t('Uses your own Anthropic API key and is billed to your Anthropic account, usually well under 1¢ per summary with Claude Haiku 5.5. Results stay on this device for 7 days.')}</p>
  </div>`;
}

function keyFormHtml(err) {
  return `${err ? errorBox(err) : ''}
  <form class="form cs-key" id="csKeyForm">
    <label class="field"><span>${t('Anthropic API key')}</span>
      <input type="password" id="csKey" placeholder="sk-ant-…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="csKeyHelp">
    </label>
    <p class="note" id="csKeyHelp">${t('Create a key in the Anthropic Console (console.anthropic.com → API keys); your account needs some credit. The key is stored only on this device and sent only to Anthropic.')}</p>
    <div class="row">
      <button class="btn" type="submit">${t('Save key and summarize')}</button>
      <button class="btn ghost" type="button" data-act="cs-key-cancel">${t('Cancel')}</button>
    </div>
  </form>`;
}

function summaryHtml(e) {
  const r = e.result;
  const model = cs.MODEL_LABELS[e.model] || e.model || cs.MODEL_LABEL;
  const complaints = (r.complaints || []).map((c) => `<li class="cs-item">
      <div class="cs-top"><b>${esc(c.theme)}</b><span class="tag warn">${cnt(c.mentions, 'mention')}</span></div>
      <p>${esc(c.detail)}</p>
      ${c.quote ? `<blockquote>“${esc(c.quote)}”</blockquote>` : ''}
      ${c.apps?.length ? `<p class="note">${esc(c.apps.join(' · '))}</p>` : ''}
    </li>`).join('');
  const features = (r.features || []).map((f) => `<li><b>${esc(f.idea)}</b><span>${esc(f.why)}</span></li>`).join('');
  return `
  <p class="read">${esc(r.summary)}</p>
  ${complaints ? `<ol class="cs-list">${complaints}</ol>` : ''}
  ${features ? `<h3>${t('How a new app could win')}</h3><ul class="cs-features">${features}</ul>` : ''}
  <h3>${t('Price and ads')}</h3>
  <p class="cs-text">${esc(r.pricing)}</p>
  <div class="cs-pitch"><span>${t('Pitch')}</span><p>${esc(r.pitch)}</p></div>
  <p class="note">${t("Based on {reviews} of {apps} (Apple's feed has reviews for only some apps) · {model} · {cost} · {ago} ·", { reviews: cnt(e.reviewCount, 'review'), apps: cnt(e.appCount, 'app'), model: esc(model), cost: costText(e.cost), ago: sinceText(e.at) })}
    <button class="linklike" type="button" data-act="cs-redo">${t('Summarize again')}</button></p>`;
}

function refreshCs() {
  const box = $('#csBox');
  if (box && state.kw.result && current() === 'keyword') box.innerHTML = complaintsInner(state.kw.result);
}

async function runSummary(fresh = false) {
  const r = state.kw.result;
  if (!r || r.report.empty) return;
  const s = state.cs;
  const token = ++s.token;
  Object.assign(s, { busy: true, step: '', error: null, needsKey: false, keyForm: false });
  refreshCs();
  try {
    const entry = await cs.summarize({
      keyword: r.kw,
      country: r.country,
      countryName: CNAME[r.country],
      language: lang,
      apps: r.apps,
      fresh,
      onStep: (msg) => { if (token === s.token) { s.step = msg; refreshCs(); } },
    });
    if (token !== s.token) return;
    s.entry = entry;
    attachSummaryToIdea(r, entry);
    guideDone('complaints');
  } catch (e) {
    if (token !== s.token) return;
    s.error = e instanceof cs.SummaryError ? e.message : t("Couldn't summarize the reviews. Try again in a minute.");
    s.needsKey = e instanceof cs.SummaryError && e.needsKey;
  }
  s.busy = false;
  refreshCs();
}

function sinceText(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return t('just now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('{n} h ago', { n: h });
  return t('{n} days ago', { n: Math.round(h / 24) });
}

function refreshPicker() {
  const box = $('#cmpPicker');
  if (!box) return;
  const wasOpen = box.querySelector('details')?.open;
  box.innerHTML = comparePickerHtml();
  if (wasOpen) box.querySelector('details').open = true;
}

function checkKeyword(text) {
  state.kw.text = text;
  go('keyword');
  runKeyword(text);
}

// ---------- saved ----------
const savedList = () => store.get('saved', []);
const savedKey = (kw, cc) => `${kw.toLowerCase()}|${cc}`;
const isSaved = (kw, cc) => savedList().some((x) => savedKey(x.kw, x.cc) === savedKey(kw, cc));

function toggleSaved(result) {
  const list = savedList();
  const key = savedKey(result.kw, result.country);
  const i = list.findIndex((x) => savedKey(x.kw, x.cc) === key);
  if (i >= 0) {
    list.splice(i, 1);
    store.set('saved', list);
    toast(t('Removed from Saved'));
    return;
  }
  const r = result.report;
  list.unshift({ kw: result.kw, cc: result.country, opp: r.opportunity, demand: r.demand, ease: r.ease, money: r.money, date: Date.now() });
  store.set('saved', list);
  toast(t('Keyword saved'));
}

// ---------- shared rendering ----------
function tagsFor(a, f, { grossingChart = false } = {}) {
  const tg = [];
  if (a.gapInfo?.gap) tg.push([gapVerdict(a.gapInfo.gap).key === 'strong' ? 'good' : 'info', t('Gap {n}', { n: a.gapInfo.gap })]);
  if (f.grossing) tg.push(['good', t('Top Grossing')]);
  if (grossingChart && f.smallEarner) tg.push(['good', t('Small earner')]);
  else if (!grossingChart && f.beatable) tg.push(['good', t('Under 1k ratings')]);
  if (f.lowRated) tg.push(['bad', t('Low rated ★{r}', { r: a.rating.toFixed(1) })]);
  if (f.stale) tg.push(['warn', t('No update in 1 yr+')]);
  if (f.isNew) tg.push(['info', t('New')]);
  if (f.paid) tg.push(['info', a.priceText || t('Paid')]);
  return tg.length ? `<div class="tags">${tg.map(([k, l]) => `<span class="tag ${k}">${esc(l)}</span>`).join('')}</div>` : '';
}

function appRow(a, rank, f, opts) {
  const meta = a.ratings
    ? t('{ratings} · ★{r} · updated {ago}', { ratings: cnt(a.ratings, 'rating', fmt(a.ratings)), r: (a.rating || 0).toFixed(1), ago: ago(a.updated) })
    : a.updated ? t('No ratings yet · updated {ago}', { ago: ago(a.updated) }) : t('No details available');
  const icon = a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy" width="48" height="48">` : '<span class="ph"></span>';
  return `<li><button class="app" type="button" data-app="${esc(appKey(a))}">
    <span class="rank">${rank}</span>${icon}
    <span class="body"><span class="name">${esc(a.name)}</span><span class="meta">${esc(meta)}</span>${tagsFor(a, f, opts)}</span>
  </button></li>`;
}

const loading = (msg) => `<div class="loading"><span class="spinner"></span><span>${esc(msg)}</span></div>`;
const errorBox = (msg) => `<p class="error">${esc(msg)}</p>`;

/** A small ⓘ button that opens a short explanation (see INFO). */
const info = (key) => `<button class="info-btn" type="button" data-info="${key}" aria-label="${esc(t('What does this mean?'))}">i</button>`;

// ---------- views ----------
const VIEWS = {
  niches: {
    title: () => t('Niches'),
    shell: () => ({ top: topShell, all: autoShell, one: oneShell }[state.nicheMode])(),
    out: () => ({ top: topOut, all: autoOut, one: oneOut }[state.nicheMode])(),
  },
  keyword: { title: () => t('Keyword tab'), shell: keywordShell, out: keywordOut },
  compare: { title: () => t('Countries'), shell: compareShell, out: compareOut },
  ideas: { title: () => t('Ideas'), shell: ideasShell, out: ideasOut },
  saved: { title: () => t('Saved'), shell: () => '<div id="out"></div>', out: savedOut },
};

// Niches
const modeSwitch = () => `
  <div class="seg seg3" role="group" aria-label="${esc(t('Niches view'))}">
    <button type="button" data-mode="top" aria-pressed="${state.nicheMode === 'top'}">${t('Top apps')}</button>
    <button type="button" data-mode="all" aria-pressed="${state.nicheMode === 'all'}">${t('Categories')}</button>
    <button type="button" data-mode="one" aria-pressed="${state.nicheMode === 'one'}">${t('One category')}</button>
  </div>`;

// ---------- Top apps (Gap scores from the App Store scan) ----------
const TOP_KINDS = [['gaps', 'Biggest gaps'], ['risers', 'Rising'], ['newcomers', 'New earners']];

function topShell() {
  ensureScan();
  const tp = state.top;
  if (tp.cc) ensureScanCountry(tp.cc);
  return `${modeSwitch()}
  <p class="intro">${t('Each App Store scan scores every Top Grossing app in {c} countries and {g} categories. High Gap scores are apps people pay for but are unhappy with.', { c: COUNTRIES.length, g: GENRES.length })}${info('topapps')}</p>
  <div class="row">
    <label class="field"><span>${t('Country')}</span><select class="input" id="topCc">
      <option value="">${t('All countries')}</option>
      ${REGIONS.map((r) => `<optgroup label="${esc(t(r))}">${COUNTRIES.filter((c) => c[3] === r).map(([c]) => `<option value="${c}"${c === tp.cc ? ' selected' : ''}>${esc(cname(c))}</option>`).join('')}</optgroup>`).join('')}
    </select></label>
    <label class="field"><span>${t('Category')}</span><select class="input" id="topG">
      <option value="">${t('All categories')}</option>
      ${GENRES.map(([id]) => `<option value="${id}"${String(id) === String(tp.g) ? ' selected' : ''}>${esc(gname(id))}</option>`).join('')}
    </select></label>
  </div>
  <div class="chips">${TOP_KINDS.map(([k, l]) => `<button class="chip" type="button" data-top-kind="${k}" aria-pressed="${tp.kind === k}">${t(l)}</button>`).join('')}</div>
  <div id="out"></div>`;
}

function topEntries() {
  const tp = state.top;
  const sum = state.scan.summary;
  const byGenre = (list) => (tp.g ? list.filter((e) => String(e.g) === String(tp.g)) : list);
  if (tp.kind === 'gaps') {
    if (tp.cc) {
      const data = state.scan.countries[tp.cc];
      if (!data) return null;
      return byGenre(data.categories.flatMap((c) => c.apps)).sort((a, b) => b.gap - a.gap).slice(0, 100);
    }
    return byGenre(sum.leaderboard);
  }
  const list = tp.kind === 'risers' ? sum.risers : sum.newcomers;
  return byGenre(tp.cc ? list.filter((e) => e.cc === tp.cc) : list);
}

function topRow(e, i) {
  const a = scanData.toApp(e);
  remember([a]);
  const tags = [];
  if (e.pr > 0 && e.pr > e.rk) tags.push(['good', t('Up {n} places (was #{was})', { n: e.pr - e.rk, was: e.pr })]);
  if (e.pr === -1) tags.push(['good', t('New in Top Grossing')]);
  tags.push(['info', cnt(e.r, 'rating', fmt(e.r))]);
  if (e.r >= 20 && e.a) tags.push([e.uh >= 40 ? 'bad' : 'info', `${e.a.toFixed(1)}★`]);
  const days = daysSince(e.up);
  if (days > 270 && days !== Infinity) tags.push(['warn', t('No update in {n} mo', { n: Math.round(days / 30) })]);
  if (e.ic2 > 1) tags.push(['info', t('Charts in {n} countries', { n: e.ic2 })]);
  const icon = e.ic ? `<img src="${esc(e.ic)}" alt="" loading="lazy" width="48" height="48">` : '<span class="ph"></span>';
  const v = gapVerdict(e.gap);
  return `<li><button class="app top-app" type="button" data-app="${esc(appKey(a))}">
    <span class="rank">${i + 1}</span>${icon}
    <span class="body">
      <span class="name">${esc(e.n)}</span>
      <span class="meta">${esc(cshort(e.cc))} · ${esc(gname(e.g))} · ${t('#{rank} in Top Grossing', { rank: e.rk })}</span>
      <span class="tags">${tags.map(([k, l]) => `<span class="tag ${k}">${esc(l)}</span>`).join('')}</span>
    </span>
    <span class="score-pill ${v.key}" aria-label="${esc(t('Gap score {n}', { n: e.gap }))}">${e.gap}</span>
  </button></li>`;
}

function topOut() {
  const n = state.scan;
  const tp = state.top;
  if (n.loading && !n.summary) return loading(t('Loading the latest scan…'));
  if (!n.summary) {
    if (n.error === 'missing') {
      return `<div class="empty"><p>${t('No App Store scan has been published yet.')}</p>
        <p>${t('Start one from GitHub (Actions → App Store scan → Run workflow). Until then, use <b>Categories</b> or <b>One category</b> to scan live.')}</p></div>`;
    }
    return `${errorBox(t("Couldn't load the latest scan. Check your connection and try again."))}
      <button class="btn ghost small" type="button" data-act="scan-retry">${t('Try again')}</button>`;
  }
  const sum = n.summary;
  const meta = `<p class="note">${t('Updated {ago} · {charts}', { ago: sinceText(Date.parse(sum.generatedAt)), charts: cnt(sum.scanned, 'chart') })}${sum.trendSince ? t(' · trends since {date}', { date: esc(sum.trendSince) }) : ''}</p>`;
  if (tp.kind !== 'gaps' && !sum.trendSince) {
    return `${meta}<div class="empty"><p>${t('Trends appear once the scan has run on two different days. Check back tomorrow.')}</p></div>`;
  }
  if (tp.kind === 'gaps' && tp.cc && !n.countries[tp.cc]) return meta + loading(t('Loading {name}…', { name: cname(tp.cc) }));
  const list = topEntries() || [];
  if (!list.length) return `${meta}<div class="empty"><p>${tp.kind === 'gaps' && !tp.cc ? t('Nothing here for this filter. The overall list keeps the best 150 apps; pick a country to see more for one category.') : t('Nothing here for this filter.')}</p></div>`;
  const explain = {
    gaps: 'Gap score = Top Grossing rank (30%) + ratings count (20%) + unhappy users: rated below the typical app in its chart, or not updated for months (30%) + not a giant worldwide (20%). Sports, news, social, entertainment and music apps get a discount because content rights or networks protect them. Tap an app for details and complaints.',
    risers: 'Apps that climbed at least 10 places in Top Grossing and are now in the top 50. A niche that is heating up.',
    newcomers: 'Apps with under 5k ratings that entered the top 60 in Top Grossing. Small apps starting to earn.',
  }[tp.kind];
  return `${meta}<ol class="list top-list">${list.map(topRow).join('')}</ol><p class="note">${esc(t(explain))}</p>`;
}

function autoShell() {
  loadAuto();
  ensureScan();
  return `${modeSwitch()}
  <p class="intro">${t('All {g} categories in {country}, ranked by room for small apps, market size and the biggest Gap scores. Change the country at the top.', { g: GENRES.length, country: esc(cname(state.country)) })}${info('category')}</p>
  <button class="btn ghost" id="autoBtn" type="button" data-act="autoscan">${t('Scan live now')}</button>
  <div id="out"></div>`;
}

function nicheCard(n, i) {
  const ex = n.examples[0];
  return `<li class="niche">
    <div class="niche-head">
      <span class="niche-rank">${i}</span>
      <div class="niche-title"><b>${esc(gname(n.genreId))}</b><span>${t('{size} · typical top app has {n}', { size: esc(t(n.sizeLabel)), n: cnt(Math.round(n.median), 'rating', fmt(n.median)) })}</span></div>
      <span class="score-pill ${n.verdict.key}" aria-label="${esc(t('Niche score {n}, {label}', { n: n.score, label: t(n.verdict.label) }))}">${n.score}</span>
    </div>
    <div class="tags">
      <span class="tag good">${t('{n} small earners', { n: n.small })}</span>
      <span class="tag info">${t('{n} new', { n: n.fresh })}</span>
      ${n.stale ? `<span class="tag warn">${t('{n} neglected', { n: n.stale })}</span>` : ''}
    </div>
    ${ex ? `<p class="niche-ex">${t('Example: <b>{name}</b> is #{rank} in Top Grossing with {ratings}.', { name: esc(ex.name), rank: ex.rank, ratings: cnt(ex.ratings, 'rating', fmt(ex.ratings)) })}</p>` : ''}
    ${n.topGap && n.topGap.gap ? `<p class="niche-ex">${t('Biggest gap: <b>{name}</b> (Gap {n})', { name: esc(n.topGap.name), n: n.topGap.gap })}</p>` : ''}
    ${n.ideas.length ? `<div class="chips">${n.ideas.map((k) => `<button class="chip" type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
    <button class="linklike" type="button" data-open-genre="${esc(n.genreId)}">${t('See the full chart →')}</button>
  </li>`;
}

function autoOut() {
  const a = state.auto;
  const parts = [];
  if (a.busy) {
    const pct = Math.round((a.done / GENRES.length) * 100);
    const msg = a.waiting
      ? t('Apple asked us to slow down. Waiting 30 seconds, then continuing…')
      : t('Scanning {name} · {i} of {n}', { name: t(a.current), i: Math.min(a.done + 1, GENRES.length), n: GENRES.length });
    parts.push(`<div class="progress-card"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="note">${esc(msg)}</p></div>`);
  }
  if (a.error) parts.push(errorBox(t('{error} Categories scanned so far are below.', { error: a.error })));
  // Show whichever is newer: a live scan on this phone or the latest App Store scan.
  const sum = state.scan.summary;
  const scanAt = sum ? Date.parse(sum.generatedAt) : 0;
  const scanRows = sum ? sum.categories.filter((c) => c.cc === state.country).map(fromScanCategory).sort((x, y) => y.score - x.score) : [];
  const live = a.country === state.country && a.results?.length ? a.results : null;
  let res = null;
  let source = '';
  if (live && (a.busy || a.at >= scanAt || !scanRows.length)) { res = live; source = a.busy ? '' : t('Scanned live {ago}.', { ago: sinceText(a.at) }); }
  else if (scanRows.length && !a.busy) { res = scanRows; source = t('From the App Store scan of {date} ({ago}).', { date: dateText(scanAt), ago: sinceText(scanAt) }); }
  if (!res || !res.length) {
    if (!a.busy) {
      if (state.scan.loading) parts.push(loading(t('Loading the latest scan…')));
      else {
        parts.push(`<div class="empty"><p>${sum ? t('The latest scan has no data for {country}.', { country: esc(cname(state.country)) }) : t('No App Store scan is available yet.')} ${t('Tap <b>Scan live now</b> to rank every category in {country}.', { country: esc(cname(state.country)) })}</p>
          <p>${t('A live scan takes 1–2 minutes. Scanning again within 6 hours is almost instant.')}</p></div>`);
      }
    }
    return parts.join('');
  }
  if (!a.busy) {
    const best = res.filter((n) => n.verdict.key === 'strong').slice(0, 3).map((n) => gname(n.genreId));
    const lead = best.length
      ? t('Best bets in {country}: <b>{list}</b>.', { country: esc(cname(state.country)), list: best.map(esc).join(', ') })
      : t('No category in {country} scores as Promising right now. Look at the Possible ones.', { country: esc(cname(state.country)) });
    const china = state.country === 'cn' ? t(' Note: to publish in China, Apple requires a government ICP filing for your app, which is hard for developers outside China.') : '';
    parts.push(`<p class="read">${lead} ${source}${china}${a.failed && res === live ? t(" {n} couldn't be loaded.", { n: cnt(a.failed, 'category') }) : ''}</p>`);
  }
  parts.push(`<ol class="niche-list">${res.map((n, i) => nicheCard(n, i + 1)).join('')}</ol>`);
  if (!a.busy) setTimeout(() => guideDone('categories'));
  parts.push(`<p class="note">${t('Score = half room for small apps (small earners, new and neglected apps, weighed against market size) and half the average of the 5 biggest Gap scores. 55+ Promising, 45–54 Possible. Tap a keyword to score it.')}</p>`);
  return parts.join('');
}

function oneShell() {
  const s = state.niche;
  return `${modeSwitch()}
  <p class="intro">${t('See which apps earn money in a category and how many of them are small. Many small earners means a newcomer can get in.')}${info('onecategory')}</p>
  <form class="form" id="nicheForm">
    <div class="row">
      <label class="field"><span>${t('Category')}</span>
        <select class="input" id="genre">${GENRES.map(([id]) => `<option value="${id}"${String(id) === String(s.genreId) ? ' selected' : ''}>${esc(gname(id))}</option>`).join('')}</select>
      </label>
      <label class="field"><span>${t('Chart')}</span>
        <select class="input" id="chartType">${Object.entries(CHART_LABEL).map(([k, l]) => `<option value="${k}"${k === s.chart ? ' selected' : ''}>${t(l)}</option>`).join('')}</select>
      </label>
    </div>
    <button class="btn" id="nicheBtn" type="submit">${t('Scan category')}</button>
  </form>
  <div id="out"></div>`;
}

function oneOut() {
  const s = state.niche;
  if (s.busy) return loading(t('Reading {chart} for {genre} in {country}…', { chart: t(CHART_LABEL[s.chart]), genre: gname(s.genreId), country: cname(state.country) }));
  if (s.error) return errorBox(s.error);
  const r = s.result;
  if (!r) {
    return `<div class="empty"><p>${t('Pick a category and tap <b>Scan category</b>.')}</p>
      <p>${t('Start with Top Grossing. It shows where users actually pay. Health &amp; Fitness, Productivity, Education and Lifestyle are good first scans for small, paid apps.')}</p></div>`;
  }
  const rep = r.report;
  const g = r.chart === 'grossing';
  const rows = r.apps
    .map((a, i) => ({ a, f: rep.flags[i] }))
    .filter(({ f }) => !s.only || f.smallEarner || f.isNew);
  const ideas = rep.ideas.length
    ? `<div class="chips">${rep.ideas.map((i) => `<button class="chip" type="button" data-kw="${esc(i.text)}">${esc(i.text)}<span class="n">${i.count}</span></button>`).join('')}</div>
       <p class="note">${t('Words that repeat in the names of small and new apps. Tap one to score it.')}</p>`
    : `<p class="note">${t('No repeating words found in this chart.')}</p>`;
  return `
  <section class="section">
    <h2>${esc(gname(r.genreId))} · ${t(CHART_LABEL[r.chart])} · ${esc(cname(r.country))}</h2>
    <div class="stats">
      <div class="stat"><b>${rep.small}</b><span>${g ? t('small earners (under 5k ratings)') : t('small apps (under 5k ratings)')}${info('smallEarners')}</span></div>
      <div class="stat"><b>${rep.fresh}</b><span>${t('released in the last 18 months')}${info('newApps')}</span></div>
      <div class="stat"><b>${rep.stale}</b><span>${t('not updated in a year')}${info('neglected')}</span></div>
    </div>
    <p class="read">${esc(t(rep.read))}</p>
  </section>
  <section class="section"><h3>${t('Keyword ideas')}</h3>${ideas}</section>
  <section class="section">
    <div class="row" style="align-items:center">
      <h3 style="margin:0">${t('The chart ({n})', { n: rep.total })}</h3>
      <div class="chips" style="justify-content:flex-end">
        <button class="chip" type="button" data-act="filter" aria-pressed="${s.only}">${s.only ? t('Show all apps') : t('Only small &amp; new')}</button>
      </div>
    </div>
    ${rows.length ? `<ul class="list">${rows.map(({ a, f }) => appRow(a, a.rank, f, { grossingChart: g })).join('')}</ul>` : `<div class="empty"><p>${t('No small or new apps in this chart.')}</p></div>`}
  </section>`;
}

// Keyword
function keywordShell() {
  return `
  <p class="intro">${t('Score a search term: how many people want it, how beatable the top 10 apps are, and whether they make money.')}</p>
  <form class="form" id="kwForm">
    <div class="row">
      <input type="search" id="kwInput" placeholder="${esc(t('e.g. plant care'))}" enterkeyhint="search" autocapitalize="none" autocorrect="off" autocomplete="off" value="${esc(state.kw.text)}" aria-label="${esc(t('Keyword'))}">
      <button class="btn" id="kwBtn" type="submit" style="flex:0 0 auto">${t('Check')}</button>
    </div>
  </form>
  <div id="out"></div>`;
}

function meter(name, v, why, infoKey) {
  return `<div class="meter">
    <div class="top"><span class="name">${name}${infoKey ? info(infoKey) : ''}</span><span class="val">${v}</span></div>
    <div class="bar"><i style="width:${v}%;background:var(--${tone(v)})"></i></div>
    <p class="why">${esc(why)}</p>
  </div>`;
}

function keywordOut() {
  const s = state.kw;
  if (s.busy) return loading(t('Checking "{kw}" in {country}…', { kw: s.text, country: cname(state.country) }));
  if (s.error) return errorBox(s.error);
  const r = s.result;
  if (!r) {
    return `<div class="empty"><p>${t('Type a search term and tap <b>Check</b>, or try one of these:')}</p>
      <div class="chips">${SAMPLES.map((k) => `<button class="chip" type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`;
  }
  const rep = r.report;
  if (rep.empty) return `<div class="empty"><p>${t('No apps found for "{kw}" in {country}. Try a shorter or more common phrase.', { kw: esc(r.kw), country: esc(cname(r.country)) })}</p></div>`;
  const f = rep.facts;
  const v = rep.verdict;
  const demandWhy = t('Top {n} apps have {ratings} combined.', { n: rep.n, ratings: cnt(f.totalRatings, 'rating', fmt(f.totalRatings)) }) + (rep.demand < 25 ? t(' Few people use apps for this.') : '');
  const easeWhy = t('Typical top app has {ratings}. {hits} of {n} have this keyword in their name. {weak} look beatable (few ratings, low rating, or no update in a year).',
    { ratings: cnt(Math.round(f.medianRatings), 'rating', fmt(f.medianRatings)), hits: f.titleHits, n: rep.n, weak: f.weak });
  const moneyWhy = rep.money === 0
    ? t('None of the top apps are in Top Grossing or charge upfront.')
    : t('{hits} of {n} are in Top Grossing{forGenre}. {paid} charge upfront.', { hits: f.grossingHits, n: rep.n, forGenre: r.genreName ? t(' for {genre}', { genre: t(r.genreName) }) : '', paid: f.paidHits });
  const saved = isSaved(r.kw, r.country);
  return `
  <div class="scorecard">
    <div class="ring ${v.key}" style="--v:${rep.opportunity}" role="img" aria-label="${esc(t('Opportunity score {n} out of 100', { n: rep.opportunity }))}"><b>${rep.opportunity}</b></div>
    <div class="what">
      <p class="kw">${esc(r.kw)}</p>
      <span class="verdict ${v.key}">${t(v.label)}</span>
      <div class="sub">${t('Opportunity score · {country}', { country: esc(cname(r.country)) })}${info('opportunity')}</div>
    </div>
    <div class="actions">
      <button class="btn small" type="button" data-act="save">${saved ? t('Saved ✓') : t('Save')}</button>
      <button class="btn small ghost" type="button" data-act="compare">${t('Compare countries')}</button>
      <button class="btn small ghost" type="button" data-act="idea-from-kw">${ideas.findIdea(ideas.loadIdeas(), r.kw, r.country) ? t('Open idea') : t('Add to ideas')}</button>
    </div>
  </div>
  <div class="meters">
    ${meter(t('Demand'), rep.demand, demandWhy, 'demand')}
    ${meter(t('Ease'), rep.ease, easeWhy, 'ease')}
    ${meter(t('Money'), rep.money, moneyWhy, 'money')}
  </div>
  <section class="section" id="csBox">${complaintsInner(r)}</section>
  <section class="section">
    <h3>${t('Top {n} for this search', { n: rep.n })}</h3>
    <ul class="list">${r.apps.map((a, i) => appRow(a, i + 1, rep.flags[i])).join('')}</ul>
    <p class="note">${t('Tap an app to read what its users complain about. Scores are estimates from public App Store data; ratings stand in for downloads.')}</p>
  </section>`;
}

// Compare
function comparePickerHtml() {
  const sel = new Set(state.cmpCountries);
  const full = sel.size >= COMPARE_MAX;
  const presets = COMPARE_PRESETS.map(([label]) => `<button class="chip" type="button" data-cmp-preset="${esc(label)}">${esc(t(label))}</button>`).join('');
  const groups = REGIONS.map((region) => `<div class="cmp-region"><span>${esc(t(region))}</span><div class="chips">${
    COUNTRIES.filter((c) => c[3] === region).map(([c]) => {
      const on = sel.has(c);
      return `<button class="chip" type="button" data-cmp-cc="${c}" aria-pressed="${on}"${!on && full ? ' disabled' : ''}>${esc(cshort(c))}</button>`;
    }).join('')
  }</div></div>`).join('');
  const secs = Math.max(5, Math.round(sel.size * 2.5));
  return `<details class="cmp-pick">
    <summary>${t('Countries: <b>{list}</b>', { list: state.cmpCountries.map((c) => esc(cshort(c))).join(', ') })}</summary>
    <div class="cmp-pick-body">
      <div class="chips">${presets}</div>
      ${groups}
      <p class="note">${t('{n} of {max} max selected · about {secs} seconds per comparison.', { n: sel.size, max: COMPARE_MAX, secs })}</p>
    </div>
  </details>`;
}

function compareShell() {
  return `
  <p class="intro">${t('Score one keyword in several countries at once. Look for a country where demand exists but competition is weaker.')}${info('compare')}</p>
  <div id="cmpPicker">${comparePickerHtml()}</div>
  <form class="form" id="cmpForm">
    <div class="row">
      <input type="search" id="cmpInput" placeholder="${esc(t('e.g. budget planner'))}" enterkeyhint="search" autocapitalize="none" autocorrect="off" autocomplete="off" value="${esc(state.cmp.text)}" aria-label="${esc(t('Keyword to compare'))}">
      <button class="btn" id="cmpBtn" type="submit" style="flex:0 0 auto">${t('Compare')}</button>
    </div>
  </form>
  <p class="note">${t('Outside English-speaking countries, most people search in their own language. Also try the translated keyword, for example "Pflanzenpflege" (German) or "家計簿" (Japanese).')}</p>
  <div id="out"></div>`;
}

function compareOut() {
  const s = state.cmp;
  if (!s.rows) {
    return `<div class="empty"><p>${t('Pick your countries, type a keyword and tap <b>Compare</b>. Apple limits how fast we can ask, so each country takes a couple of seconds.')}</p></div>`;
  }
  const done = s.rows.filter((r) => r.status === 'done');
  const best = !s.busy && done.length ? done.reduce((a, b) => (b.result.report.opportunity > a.result.report.opportunity ? b : a)) : null;
  const rows = s.rows.map((row) => {
    const name = esc(cshort(row.cc));
    if (row.status !== 'done') {
      const label = t({ wait: 'Waiting', busy: 'Checking…', error: 'Failed', skipped: 'Skipped' }[row.status]);
      return `<tr><td>${name}</td><td colspan="5" class="note">${row.status === 'busy' ? '<span class="spinner" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>' : ''}${label}</td></tr>`;
    }
    const rep = row.result.report;
    if (rep.empty) return `<tr><td>${name}</td><td colspan="5" class="note">${t('No apps found')}</td></tr>`;
    const top = row.result.apps[0]?.name || '';
    return `<tr class="clickable${row === best ? ' best' : ''}" data-cc="${row.cc}" tabindex="0">
      <td>${name}</td>
      <td><span class="score-pill ${verdictFor(rep.opportunity).key}">${rep.opportunity}</span></td>
      <td class="num">${rep.demand}</td><td class="num">${rep.ease}</td><td class="num">${rep.money}</td>
      <td class="top-app">${esc(top.length > 24 ? top.slice(0, 23) + '…' : top)}</td>
    </tr>`;
  }).join('');
  return `
  ${s.error ? errorBox(s.error) : ''}
  <h2>"${esc(s.text)}"</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>${t('Country')}</th><th>${t('Score')}</th><th>${t('Demand')}</th><th>${t('Ease')}</th><th>${t('Money')}</th><th>${t('Top app')}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="note">${best ? t('Best: {country}. ', { country: esc(cname(best.cc)) }) : ''}${t('Tap a country to see its full breakdown.')}</p>`;
}

// Saved
function savedOut() {
  return savedListHtml() + settingsHtml() + keySectionHtml();
}

function settingsHtml() {
  return `<section class="section"><h3>${t('Settings')}</h3>
    <div class="empty settings">
      <div class="field"><span>${t('Language')}</span>
        <div class="seg" role="group" aria-label="${esc(t('Language'))}">${LANGS.map(([code, label]) => `<button type="button" data-lang="${code}" aria-pressed="${lang === code}">${label}</button>`).join('')}</div>
      </div>
      <div class="field"><span>${t('Guide and tutorial')}</span>
        <div class="row">
          <button class="btn ghost small" type="button" data-act="welcome-again">${t('Show the welcome tutorial again')}</button>
          <button class="btn ghost small" type="button" data-act="guide-reset">${t('Reset guide progress')}</button>
        </div>
      </div>
    </div></section>`;
}

function keySectionHtml() {
  const has = !!cs.getKey();
  return `<section class="section"><h3>${t('Claude API key')}</h3><div class="empty">
    ${has
    ? `<p>${t('Saved on this device. Used only for complaint summaries.')}</p><button class="btn ghost small" type="button" data-act="cs-key-remove">${t('Remove key')}</button>`
    : `<p>${t("No key saved. You'll be asked for one the first time you summarize complaints.")}</p>`}
  </div></section>`;
}

function savedListHtml() {
  const list = savedList();
  if (!list.length) {
    return `<div class="empty"><p>${t('Nothing saved yet.')}</p><p>${t('Check a keyword and tap <b>Save</b> to keep it here. Saved keywords stay on this device.')}</p></div>`;
  }
  return `
  <p class="intro">${t('Keywords you saved on this device. Tap one to check it again with fresh data.')}</p>
  <ul class="list">${list.map((x, i) => `<li class="saved-item">
    <button class="open" type="button" data-saved="${i}">
      <span class="score-pill ${verdictFor(x.opp).key}">${x.opp}</span>
      <span class="body"><span class="kw">${esc(x.kw)}</span>
      <span class="meta">${esc(cname(x.cc))} · ${t('Demand')} ${x.demand} · ${t('Ease')} ${x.ease} · ${t('Money')} ${x.money} · ${dateText(x.date)}</span></span>
    </button>
    <button class="btn ghost small" type="button" data-idea-saved="${i}">${t('Idea')}</button>
    <button class="close" type="button" data-del="${i}" aria-label="${esc(t('Remove {kw}', { kw: x.kw }))}">×</button>
  </li>`).join('')}</ul>
  <div class="row"><button class="btn ghost" type="button" data-act="csv">${t('Copy as CSV')}</button></div>
  <div id="csvFallback"></div>`;
}

// ---------- idea board ----------
function putIdea(idea) {
  const list = ideas.loadIdeas();
  idea.updatedAt = Date.now();
  const at = list.findIndex((x) => x.id === idea.id);
  if (at >= 0) list[at] = idea;
  else list.unshift(idea);
  if (!ideas.saveIdeas(list)) toast(t("Couldn't save. This browser is blocking storage."));
}

const getIdea = (id) => ideas.loadIdeas().find((x) => x.id === id);

function syncIdea(r) {
  if (!r || r.report.empty) return;
  const idea = ideas.findIdea(ideas.loadIdeas(), r.kw, r.country);
  if (!idea) return;
  idea.snapshot = ideas.snapshotOf(r.report);
  if (!idea.category && r.genreName) idea.category = r.genreName;
  putIdea(idea);
}

function attachSummaryToIdea(r, entry) {
  const idea = ideas.findIdea(ideas.loadIdeas(), r.kw, r.country);
  if (!idea) return;
  idea.summary = ideas.summaryOf(entry);
  putIdea(idea);
}

function addIdea(fields, extra = {}) {
  const existing = fields.kw ? ideas.findIdea(ideas.loadIdeas(), fields.kw, fields.cc) : null;
  if (existing) return openIdea(existing.id);
  const idea = ideas.createIdea({ ...fields, summary: fields.kw ? cs.getCached(fields.kw, fields.cc) : null });
  Object.assign(idea, extra);
  putIdea(idea);
  toast(t('Added to Ideas'));
  guideDone('idea');
  openIdea(idea.id);
}

/** Start an idea from a competitor app: its main phrase becomes the keyword, the app goes into notes. */
function appToIdea(a) {
  if (!a) return;
  // "Brand: what it does" or "Brand – what it does": the part after the brand makes the better keyword.
  const parts = a.name.split(/\s*[:|–—]\s*|\s+-\s+/).filter(Boolean);
  const descriptor = parts.length > 1 ? parts.slice(1).join(' ') : a.name;
  const kw = pickIdeas(titleIdeas([descriptor], { min: 1, limit: 8 }).map((i) => i.text), a.genre || '')[0] || '';
  const g = a.gapInfo;
  const note = t('Competitor: {name} ({seller}), {rankPart}{ratings}, {r}★, updated {ago}.', {
    name: a.name, seller: a.seller || t('unknown developer'),
    rankPart: g ? t('#{rank} in {genre} Top Grossing, Gap score {gap}, ', { rank: g.rank, genre: t(a.genre), gap: g.gap }) : '',
    ratings: cnt(a.ratings || 0, 'rating', fmt(a.ratings)), r: (a.rating || 0).toFixed(1), ago: ago(a.updated),
  });
  addIdea({ kw, cc: a.cc, category: GNAME[a.genreId] || a.genre || '' }, { name: t('Better {name}', { name: a.name.split(/[:\-–—|]/)[0].trim() }), notes: note });
}

function ideasShell() {
  return `
  <p class="intro">${t("Turn promising keywords into app ideas. Write down why you'd win and how you'll charge, and see how ready each idea is. Ideas stay on this device.")}${info('ideas')}</p>
  <div class="row">
    <button class="btn" type="button" data-act="idea-new">${t('New idea')}</button>
    <button class="btn ghost" type="button" data-act="idea-copy">${t('Copy all as text')}</button>
  </div>
  <div id="out"></div>`;
}

function ideaCard(i) {
  const r = ideas.readiness(i);
  const snap = i.snapshot;
  const meta = [i.kw ? `"${i.kw}"` : '', cname(i.cc), i.category ? t(i.category) : ''].filter(Boolean).join(' · ');
  const blurb = i.why || i.summary?.pitch || '';
  return `<li><button class="idea" type="button" data-idea="${esc(i.id)}">
    <span class="idea-head"><b>${esc(i.name || t('Untitled idea'))}</b>${snap ? `<span class="score-pill ${verdictFor(snap.opp).key}">${snap.opp}</span>` : ''}</span>
    ${meta ? `<span class="idea-meta">${esc(meta)}</span>` : ''}
    <span class="tags">
      <span class="tag status-${esc(i.status)}">${esc(t(ideas.STATUS_LABEL[i.status] || i.status))}</span>
      ${i.priceModel ? `<span class="tag info">${esc(t(ideas.PRICE_LABEL[i.priceModel]))}${i.price ? ` · ${esc(i.price)}` : ''}</span>` : ''}
      <span class="tag ${r.done === r.total ? 'good' : 'info'}">${t('Ready {d}/{t}', { d: r.done, t: r.total })}</span>
    </span>
    ${blurb ? `<span class="idea-why">${esc(blurb)}</span>` : ''}
  </button></li>`;
}

function ideasOut() {
  const list = ideas.loadIdeas().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    return `<div class="empty"><p>${t('No ideas yet.')}</p>
      <p>${t('Check a keyword and tap <b>Add to ideas</b>, or tap <b>New idea</b> to start from scratch.')}</p></div>`;
  }
  const f = state.ideasFilter;
  const count = (k) => (k === 'all' ? list.length : list.filter((i) => i.status === k).length);
  const chips = [['all', 'All'], ...ideas.STATUSES]
    .map(([k, l]) => `<button class="chip" type="button" data-ifilter="${k}" aria-pressed="${f === k}">${t(l)}<span class="n">${count(k)}</span></button>`)
    .join('');
  const shown = list.filter((i) => f === 'all' || i.status === f);
  return `<div class="chips">${chips}</div>
  ${shown.length ? `<ul class="idea-list">${shown.map(ideaCard).join('')}</ul>` : `<div class="empty"><p>${t('No ideas with this status.')}</p></div>`}
  <div id="copyFallback"></div>`;
}

const options = (pairs, value) => pairs.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function ideaScoresHtml(i) {
  const s = i.snapshot;
  const check = i.kw ? `<button class="btn small ghost" type="button" data-act="idea-recheck">${s ? t('Check again') : t('Check keyword')}</button>` : '';
  if (!s) return `<p class="note">${i.kw ? t('No scores yet.') : t('Add a keyword to score this idea.')}</p>${check}`;
  return `<div class="facts">
      <div><b>${s.opp}</b><span>${t('opportunity')}</span></div>
      <div><b>${s.demand}</b><span>${t('demand')}</span></div>
      <div><b>${s.ease}</b><span>${t('ease')}</span></div>
      <div><b>${s.money}</b><span>${t('money')}</span></div>
    </div>
    <p class="note">${t('Checked {ago} in {country}. Scores update whenever you check this keyword again.', { ago: sinceText(s.at), country: esc(cname(i.cc)) })}</p>
    ${check}`;
}

function ideaSummaryHtml(i) {
  const sm = i.summary;
  if (!sm) {
    return `<p class="note">${t('Summarize complaints for "{kw}" on the Keyword tab and they\'ll show up here.', { kw: esc(i.kw || t('its keyword')) })}</p>`;
  }
  return `${sm.pitch ? `<div class="cs-pitch"><span>${t('Pitch')}</span><p>${esc(sm.pitch)}</p></div>` : ''}
    ${sm.complaints.length ? `<ul class="cs-features">${sm.complaints.map((c) => `<li><b>${esc(c.theme)}</b><span>${cnt(c.mentions, 'mention')}</span></li>`).join('')}</ul>` : ''}`;
}

const READY_HINT = {
  score: 'From the keyword score',
  complaintOk: 'From the complaint summary',
  price: "From How you'll charge",
  why: "Write at least a sentence in Why I'd win",
};

function readyHtml(i) {
  return ideas.readiness(i).items.map((it) => {
    const manual = it.key === 'buildable' || (it.key === 'complaintOk' && !it.auto);
    if (manual) {
      return `<li class="${it.done ? 'done' : ''}"><label><input type="checkbox" id="if-${it.key}" name="${it.key}"${it.done ? ' checked' : ''}><span>${esc(t(it.label))}</span></label></li>`;
    }
    return `<li class="${it.done ? 'done' : ''}"><span class="mark" aria-hidden="true">${it.done ? '✓' : '○'}</span><span>${esc(t(it.label))}<small>${esc(t(READY_HINT[it.key] || ''))}</small></span></li>`;
  }).join('');
}

function openIdea(id) {
  const i = getIdea(id);
  if (!i) return;
  sheet.dataset.mode = 'idea';
  sheet.dataset.idea = id;
  sheet.innerHTML = `
  <div class="sheet-head">
    <div class="t"><b>${t('Idea')}</b><span id="ideaSaved">${t('Changes save automatically')}</span></div>
    <button class="close" type="button" data-close aria-label="${esc(t('Close'))}">×</button>
  </div>
  <form class="sheet-body idea-form" id="ideaForm" autocomplete="off">
    <label class="field"><span>${t('Name')}</span><input type="text" id="if-name" name="name" value="${esc(i.name)}"></label>
    <div class="row">
      <label class="field"><span>${t('Status')}</span><select class="input" id="if-status" name="status">${options(ideas.STATUSES.map(([k, l]) => [k, t(l)]), i.status)}</select></label>
      <label class="field"><span>${t('Country')}</span><select class="input" id="if-cc" name="cc">${options(COUNTRIES.map(([c]) => [c, cname(c)]), i.cc)}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>${t('Keyword')}</span><input type="text" id="if-kw" name="kw" value="${esc(i.kw)}" autocapitalize="none" autocorrect="off"></label>
      <label class="field"><span>${t('Category')}</span><select class="input" id="if-category" name="category">${options([['', '–'], ...GENRES.map(([, n]) => [n, t(n)])], i.category)}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>${t("How you'll charge")}</span><select class="input" id="if-priceModel" name="priceModel">${options(ideas.PRICE_MODELS.map(([k, l]) => [k, t(l)]), i.priceModel)}</select></label>
      <label class="field"><span>${t('Price')}</span><input type="text" id="if-price" name="price" value="${esc(i.price)}" placeholder="${esc(t('e.g. $4.99/month'))}"></label>
    </div>
    <label class="field"><span>${t("Why I'd win")}</span><textarea id="if-why" name="why" rows="3" placeholder="${esc(t('What will you do better than the top apps?'))}">${esc(i.why)}</textarea></label>
    <section class="section"><h3>${t('Scores')}</h3><div id="ideaScores">${ideaScoresHtml(i)}</div></section>
    <section class="section"><h3>${t('What users complain about')}</h3><div id="ideaSummary">${ideaSummaryHtml(i)}</div></section>
    <section class="section"><h3>${t('Ready to build?')}${info('readiness')}</h3><ul class="ready" id="ideaReady">${readyHtml(i)}</ul></section>
    <label class="field"><span>${t('Notes')}</span><textarea id="if-notes" name="notes" rows="4" placeholder="${esc(t('Anything else: features, names, links'))}">${esc(i.notes)}</textarea></label>
    <div id="ideaDelete"><button class="btn danger small" type="button" data-act="idea-delete">${t('Delete idea')}</button></div>
  </form>`;
  if (!sheet.open) sheet.showModal();
  sheet.querySelector('.sheet-body').scrollTop = 0;
}

let ideaSaveTimer = null;

function saveIdeaForm() {
  clearTimeout(ideaSaveTimer);
  ideaSaveTimer = null;
  const form = $('#ideaForm', sheet);
  if (!form || sheet.dataset.mode !== 'idea') return;
  const i = getIdea(sheet.dataset.idea);
  if (!i) return;
  const val = (name) => form.elements[name]?.value ?? '';
  const before = { kw: i.kw, cc: i.cc };
  Object.assign(i, {
    name: val('name').trim(),
    status: val('status'),
    cc: val('cc'),
    kw: val('kw').trim(),
    category: val('category'),
    priceModel: val('priceModel'),
    price: val('price').trim(),
    why: val('why'),
    notes: val('notes'),
  });
  if (form.elements.buildable) i.buildable = form.elements.buildable.checked;
  if (form.elements.complaintOk) i.complaintOk = form.elements.complaintOk.checked;
  const moved = before.kw.toLowerCase() !== i.kw.toLowerCase() || before.cc !== i.cc;
  if (moved) {
    // Scores and complaints belong to a keyword in a country.
    i.snapshot = null;
    i.summary = i.kw ? ideas.summaryOf(cs.getCached(i.kw, i.cc)) : null;
  }
  putIdea(i);
  if (moved) {
    $('#ideaScores', sheet).innerHTML = ideaScoresHtml(i);
    $('#ideaSummary', sheet).innerHTML = ideaSummaryHtml(i);
  }
  const ready = $('#ideaReady', sheet);
  if (ready) {
    const fresh = document.createElement('ul');
    fresh.innerHTML = readyHtml(i);
    const sameShape = fresh.children.length === ready.children.length
      && [...ready.children].every((li, n) => !!li.querySelector('input') === !!fresh.children[n].querySelector('input'));
    if (!sameShape) ready.innerHTML = fresh.innerHTML;
    else {
      // Keep checkbox rows in place (so focus stays put) and refresh everything else.
      [...ready.children].forEach((li, n) => {
        const f = fresh.children[n];
        if (li.querySelector('input')) li.className = f.className;
        else li.replaceWith(f.cloneNode(true));
      });
    }
  }
  const savedNote = $('#ideaSaved', sheet);
  if (savedNote) savedNote.textContent = t('All changes saved');
  guideRefresh();
}

sheet.addEventListener('input', (e) => {
  if (sheet.dataset.mode !== 'idea' || !e.target.closest('#ideaForm')) return;
  clearTimeout(ideaSaveTimer);
  ideaSaveTimer = setTimeout(saveIdeaForm, 400);
});
sheet.addEventListener('change', (e) => {
  if (sheet.dataset.mode !== 'idea' || !e.target.closest('#ideaForm')) return;
  saveIdeaForm();
});
sheet.addEventListener('submit', (e) => { e.preventDefault(); saveIdeaForm(); });
sheet.addEventListener('close', () => {
  if (sheet.dataset.mode === 'idea') {
    if (ideaSaveTimer) saveIdeaForm();
    sheet.dataset.mode = '';
    const name = current();
    if (name === 'ideas' || name === 'keyword') refresh(name);
  }
});

function ideaSheetAction(act) {
  const i = getIdea(sheet.dataset.idea);
  if (!i) return;
  if (act === 'idea-recheck') {
    saveIdeaForm();
    sheet.close();
    setCountry(i.cc);
    checkKeyword(i.kw);
  } else if (act === 'idea-delete') {
    $('#ideaDelete', sheet).innerHTML = `<div class="row" style="align-items:center"><span>${t('Delete "{name}"?', { name: esc(i.name || t('Untitled idea')) })}</span>
      <button class="btn danger small" type="button" data-act="idea-delete-yes" style="flex:0 0 auto">${t('Delete')}</button>
      <button class="btn ghost small" type="button" data-act="idea-delete-no" style="flex:0 0 auto">${t('Cancel')}</button></div>`;
  } else if (act === 'idea-delete-no') {
    $('#ideaDelete', sheet).innerHTML = `<button class="btn danger small" type="button" data-act="idea-delete">${t('Delete idea')}</button>`;
  } else if (act === 'idea-delete-yes') {
    clearTimeout(ideaSaveTimer);
    ideaSaveTimer = null;
    ideas.saveIdeas(ideas.loadIdeas().filter((x) => x.id !== i.id));
    sheet.close();
    toast(t('Idea deleted'));
  }
}

function copyText(text, boxId, okMsg) {
  const fallback = () => {
    const box = $('#' + boxId);
    if (box) {
      box.innerHTML = `<p class="note">${t("Couldn't copy automatically. Select the text below and copy it.")}</p><textarea readonly rows="8" class="copy-box">${esc(text)}</textarea>`;
      box.querySelector('textarea').select();
    }
  };
  try {
    navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
  } catch {
    fallback();
  }
}

// ---------- router ----------
const current = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'niches');

function render() {
  const name = current();
  const v = VIEWS[name];
  $('#viewTitle').textContent = v.title();
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
  guideTrack(name);
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#view').innerHTML = v.shell();
  refresh(name);
  guideRefresh();
}

function refresh(name) {
  if (current() !== name) return;
  const out = $('#out');
  if (out) out.innerHTML = VIEWS[name].out();
  const nicheBusy = state.nicheMode === 'all' ? state.auto.busy : state.niche.busy;
  const busy = { niches: nicheBusy, keyword: state.kw.busy, compare: state.cmp.busy }[name];
  const btn = $('#autoBtn') || $('#nicheBtn') || $('#kwBtn') || $('#cmpBtn');
  if (btn) btn.disabled = !!busy;
}

function go(name) {
  if (current() !== name) location.hash = name; // hashchange renders again; harmless
  render();
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- details sheet ----------

async function openApp(key) {
  const a = state.apps.get(key);
  if (!a) return;
  sheet.dataset.app = key;
  const nameIdeas = titleIdeas([a.name], { min: 1, limit: 8 });
  sheet.dataset.mode = 'app';
  sheet.innerHTML = `
  <div class="sheet-head">
    ${a.icon ? `<img src="${esc(a.icon)}" alt="" width="56" height="56">` : ''}
    <div class="t"><b>${esc(a.name)}</b><span>${esc(a.seller)}</span></div>
    <button class="close" type="button" data-close aria-label="${esc(t('Close'))}">×</button>
  </div>
  <div class="sheet-body">
    <div class="facts">
      <div><b>${a.ratings ? fmt(a.ratings) : '0'}</b><span>${t('ratings in {country}', { country: esc(cname(a.cc)) })}</span></div>
      <div><b>${a.rating ? '★ ' + a.rating.toFixed(2) : '–'}</b><span>${t('average rating')}</span></div>
      <div><b>${year(a.released)}</b><span>${t('first released')}</span></div>
      <div><b>${a.updated ? ago(a.updated) : '–'}</b><span>${t('last update')}</span></div>
      <div><b>${esc(a.priceText || (a.price ? a.price : t('Free')))}</b><span>${t('price')}</span></div>
      <div><b>${esc(GNAME[a.genreId] ? gname(a.genreId) : (a.genre || '–'))}</b><span>${t('category')}</span></div>
    </div>
    ${a.gapInfo?.gap ? `<section class="section"><h3>${t('Gap score {n} · {label}', { n: a.gapInfo.gap, label: esc(t(gapVerdict(a.gapInfo.gap).label)) })}${info('gap')}</h3>
      <div class="facts gap-facts">
        <div><b>${a.gapInfo.money}</b><span>${t('money (#{rank} in Top Grossing)', { rank: a.gapInfo.rank })}</span></div>
        <div><b>${a.gapInfo.demand}</b><span>${t('demand (ratings)')}</span></div>
        <div><b>${a.gapInfo.unhappy}</b><span>${t('unhappy users')}</span></div>
        <div><b>${a.gapInfo.beatable}</b><span>${t('beatable')}</span></div>
      </div></section>` : ''}
    <div class="row">
      ${a.url ? `<a class="store-link" href="${esc(a.url)}" target="_blank" rel="noopener">${t('Open in App Store ↗')}</a>` : ''}
      <button class="btn ghost small" type="button" data-act="app-to-idea" style="flex:0 0 auto">${t('Add to ideas')}</button>
    </div>
    ${nameIdeas.length ? `<section class="section"><h3>${t('Score words from its name')}</h3><div class="chips">${nameIdeas.map((i) => `<button class="chip" type="button" data-kw="${esc(i.text)}">${esc(i.text)}</button>`).join('')}</div></section>` : ''}
    <section class="section">
      <h3>${t('What users complain about')}</h3>
      <div id="complaints">${loading(t('Reading recent reviews…'))}</div>
      <p class="note">${t('Recent 1–3 star reviews from {country}. Repeated complaints are features a better app could get right.', { country: esc(cname(a.cc)) })}</p>
    </section>
  </div>`;
  if (!sheet.open) sheet.showModal();
  if (a.gapInfo) guideDone('topapps');

  let html;
  try {
    const all = await api.reviews(a.id, a.cc);
    const bad = all.filter((r) => r.stars <= 3).sort((x, y) => x.stars - y.stars).slice(0, 12);
    html = bad.length
      ? bad.map((r) => `<div class="review">
          <span class="stars" aria-label="${esc(t('{n} stars', { n: r.stars }))}">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
          <b>${esc(r.title)}</b><p>${esc(r.text.length > 420 ? r.text.slice(0, 419) + '…' : r.text)}</p>
          <div class="when">${r.date ? esc(dateText(r.date)) : ''}${r.version ? ` · ${t('version {v}', { v: esc(r.version) })}` : ''}</div>
        </div>`).join('')
      : `<p class="note">${all.length ? t('No 1–3 star reviews among the {n} most recent. Users seem happy, so this app is harder to beat.', { n: all.length }) : t("Apple's review feed returned no reviews for this app in this country. This happens for many apps, so it doesn't mean users are happy.")}</p>`;
    if (bad.length) guideDone('complaints');
  } catch (e) {
    html = errorBox(errorText(e));
  }
  const box = $('#complaints', sheet);
  if (box && sheet.open) box.innerHTML = html;
}

sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) { sheet.close(); return; }
  const kw = e.target.closest('[data-kw]');
  if (kw) { sheet.close(); checkKeyword(kw.dataset.kw); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'app-to-idea') { appToIdea(state.apps.get(sheet.dataset.app)); return; }
  if (act && act.startsWith('idea-')) ideaSheetAction(act);
});

// ---------- events ----------
const view = $('#view');

view.addEventListener('submit', (e) => {
  e.preventDefault();
  if (document.activeElement) document.activeElement.blur(); // hide the iPhone keyboard
  if (e.target.id === 'nicheForm') {
    state.niche.genreId = $('#genre').value;
    state.niche.chart = $('#chartType').value;
    store.set('nicheGenre', state.niche.genreId);
    store.set('nicheChart', state.niche.chart);
    runNiche();
  } else if (e.target.id === 'kwForm') {
    runKeyword($('#kwInput').value);
  } else if (e.target.id === 'cmpForm') {
    runCompare($('#cmpInput').value);
  } else if (e.target.id === 'csKeyForm') {
    const key = $('#csKey').value.trim();
    if (!key) { $('#csKey').focus(); return; }
    cs.setKey(key);
    toast(t('API key saved on this device'));
    runSummary(true);
  }
});

view.addEventListener('click', (e) => {
  const t2 = e.target;
  const infoBtn = t2.closest('[data-info]');
  if (infoBtn) { openInfo(infoBtn.dataset.info); return; }
  const app = t2.closest('[data-app]');
  if (app) return openApp(app.dataset.app);
  const kw = t2.closest('[data-kw]');
  if (kw) return checkKeyword(kw.dataset.kw);
  const row = t2.closest('tr[data-cc]');
  if (row) return openCompareRow(row.dataset.cc);
  const saved = t2.closest('[data-saved]');
  if (saved) {
    const x = savedList()[Number(saved.dataset.saved)];
    if (x) { setCountry(x.cc); checkKeyword(x.kw); }
    return;
  }
  const pickCc = t2.closest('[data-cmp-cc]');
  if (pickCc) {
    const cc = pickCc.dataset.cmpCc;
    const list = state.cmpCountries;
    if (list.includes(cc)) { if (list.length > 1) list.splice(list.indexOf(cc), 1); } else if (list.length < COMPARE_MAX) list.push(cc);
    // keep the region order of the master list
    state.cmpCountries = COUNTRIES.map((c) => c[0]).filter((c) => list.includes(c));
    store.set('cmpCountries', state.cmpCountries);
    refreshPicker();
    return;
  }
  const preset = t2.closest('[data-cmp-preset]');
  if (preset) {
    const found = COMPARE_PRESETS.find(([label]) => label === preset.dataset.cmpPreset);
    if (found) { state.cmpCountries = found[1].slice(0, COMPARE_MAX); store.set('cmpCountries', state.cmpCountries); refreshPicker(); }
    return;
  }
  const ideaBtn = t2.closest('[data-idea]');
  if (ideaBtn) return openIdea(ideaBtn.dataset.idea);
  const filter = t2.closest('[data-ifilter]');
  if (filter) { state.ideasFilter = filter.dataset.ifilter; refresh('ideas'); return; }
  const fromSaved = t2.closest('[data-idea-saved]');
  if (fromSaved) {
    const x = savedList()[Number(fromSaved.dataset.ideaSaved)];
    if (x) addIdea({ kw: x.kw, cc: x.cc, report: { empty: false, opportunity: x.opp, demand: x.demand, ease: x.ease, money: x.money } });
    return;
  }
  const del = t2.closest('[data-del]');
  if (del) {
    const list = savedList();
    list.splice(Number(del.dataset.del), 1);
    store.set('saved', list);
    refresh('saved');
    toast(t('Removed from Saved'));
    return;
  }
  const act = t2.closest('[data-act]')?.dataset.act;
  const topKind = t2.closest('[data-top-kind]')?.dataset.topKind;
  if (topKind) { state.top.kind = topKind; render(); return; }
  if (act === 'scan-retry') { ensureScan(); refresh('niches'); return; }
  const mode = t2.closest('[data-mode]')?.dataset.mode;
  if (mode && mode !== state.nicheMode) { state.nicheMode = mode; store.set('nicheMode', mode); render(); return; }
  const genre = t2.closest('[data-open-genre]')?.dataset.openGenre;
  if (genre) {
    Object.assign(state.niche, { genreId: genre, chart: 'grossing', only: false });
    store.set('nicheGenre', genre);
    store.set('nicheChart', 'grossing');
    state.nicheMode = 'one';
    store.set('nicheMode', 'one');
    render();
    window.scrollTo(0, 0);
    runNiche();
    return;
  }
  if (act === 'autoscan' && !state.auto.busy) runAutoScan();
  if (act === 'filter') { state.niche.only = !state.niche.only; refresh('niches'); }
  if (act === 'save' && state.kw.result) { toggleSaved(state.kw.result); refresh('keyword'); }
  if (act === 'compare' && state.kw.result) { state.cmp.text = state.kw.result.kw; go('compare'); runCompare(state.kw.result.kw); }
  if (act === 'csv') copyCsv();
  if (act === 'cs-run') {
    if (cs.getKey()) runSummary(false);
    else { state.cs.keyForm = true; refreshCs(); $('#csKey')?.focus(); }
  }
  if (act === 'cs-redo') runSummary(true);
  if (act === 'idea-from-kw' && state.kw.result) {
    const r = state.kw.result;
    addIdea({ kw: r.kw, cc: r.country, category: r.genreName || '', report: r.report });
  }
  if (act === 'idea-new') addIdea({ cc: state.country });
  if (act === 'idea-copy') {
    const list = ideas.loadIdeas().sort((a, b) => b.updatedAt - a.updatedAt);
    if (!list.length) toast(t('No ideas to copy yet'));
    else copyText(ideas.ideasToText(list, { countryName: cname, t }), 'copyFallback', t('Copied all ideas'));
  }
  if (act === 'cs-key-cancel') { Object.assign(state.cs, { keyForm: false, needsKey: false, error: null }); refreshCs(); }
  if (act === 'cs-key-remove') { cs.setKey(''); refresh('saved'); toast(t('API key removed')); }
  if (act === 'welcome-again') openWelcome();
  if (act === 'guide-reset') { guideReset(); toast(t('Guide progress reset')); }
  const langBtn = t2.closest('[data-lang]');
  if (langBtn && langBtn.dataset.lang !== lang) changeLang(langBtn.dataset.lang);
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'topCc') {
    state.top.cc = e.target.value;
    store.set('topCc', state.top.cc);
    if (state.top.cc) ensureScanCountry(state.top.cc);
    refresh('niches');
  } else if (e.target.id === 'topG') {
    state.top.g = e.target.value;
    store.set('topG', state.top.g);
    refresh('niches');
  }
});

view.addEventListener('keydown', (e) => {
  const row = e.target.closest?.('tr[data-cc]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCompareRow(row.dataset.cc); }
});

function openCompareRow(cc) {
  const row = state.cmp.rows?.find((r) => r.cc === cc && r.status === 'done');
  if (!row) return;
  setCountry(cc);
  state.kw.token++;
  Object.assign(state.kw, { text: row.result.kw, result: row.result, busy: false, error: null });
  go('keyword');
}

function copyCsv() {
  const lines = [['keyword', 'country', 'opportunity', 'demand', 'ease', 'money', 'saved']].concat(
    savedList().map((x) => [x.kw, x.cc.toUpperCase(), x.opp, x.demand, x.ease, x.money, new Date(x.date).toISOString().slice(0, 10)]),
  );
  const csv = lines.map((l) => l.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const fallback = () => {
    const box = $('#csvFallback');
    if (box) {
      box.innerHTML = `<p class="note">Couldn't copy automatically. Select the text below and copy it.</p><textarea readonly rows="6" style="width:100%;font:13px var(--mono);border-radius:12px;padding:10px;border:1px solid var(--line);background:var(--surface);color:var(--fg)">${esc(csv)}</textarea>`;
      box.querySelector('textarea').select();
    }
  };
  try {
    navigator.clipboard.writeText(csv).then(() => toast('Copied as CSV'), fallback);
  } catch {
    fallback();
  }
}

// ---------- info popups (ⓘ) ----------
const INFO = {
  opportunity: ['Opportunity score', 'How good this keyword is for a new app, from 0 to 100. It combines Demand, Ease and Money, and one weak part pulls the whole score down. 60+ is strong, 40–59 is worth a look.'],
  demand: ['Demand', "How many people use apps for this search. Based on the combined ratings of the top 10 apps, because Apple doesn't publish downloads (roughly 1–2% of users leave a rating)."],
  ease: ['Ease', "How beatable the top 10 apps are. Higher when they have few ratings, don't use the keyword in their name, are rated low or haven't been updated for a year."],
  money: ['Money', 'Whether apps for this search earn money. Points for top apps that are in Top Grossing for their category, and for apps that charge upfront.'],
  gap: ['Gap score', "For one app in Top Grossing. High when people pay for it (its rank), use it (ratings), are unhappy with it (rated below the typical app in its chart, or not updated for months), and it isn't a giant. A high Gap score means users are waiting for a better app. 55+ is Hot."],
  category: ['Category score', 'How open a category is to a new app in this country. Half is room for small apps (small earners, new and neglected apps, weighed against market size) and half is the average of its 5 biggest Gap scores. 55+ is Promising.'],
  topapps: ['Top apps', 'Results of the latest App Store scan across 33 countries and 24 categories. Biggest gaps: apps people pay for but dislike. Rising: apps climbing Top Grossing. New earners: small apps that just started earning.'],
  smallEarners: ['Small earners', 'Apps in Top Grossing with under 5,000 ratings. Many of them means small developers make money here.'],
  newApps: ['New apps', "Apps released in the last 18 months. When new apps reach the chart, the category isn't locked by old players."],
  neglected: ['Neglected apps', 'Apps not updated for a year. Their users often switch to a better-maintained alternative.'],
  onecategory: ['One category', 'Reads one chart live: Top Grossing (where people pay), Top Paid or Top Free. Start with Top Grossing.'],
  compare: ['Countries', 'Scores the same keyword in several countries. Look for a country where Demand is decent but Ease is higher. Tap a row for the full breakdown.'],
  complaints: ['Complaint summary', 'Claude reads recent 1–3 star reviews of the top apps and groups them into themes, with features a new app could win with. Needs your own Anthropic API key and usually costs well under 1 cent.'],
  ideas: ['Ideas', 'Turn a keyword or a competitor into an idea card. Scores and complaints attach automatically, and the checklist shows when an idea is ready to build.'],
  readiness: ['Ready to build?', "Five checks from the research method: a good score, a complaint you can fix, a small first version, a pricing plan and a clear reason you'd win. 4 of 5 means you have a real candidate."],
};

const tip = $('#tip');
function openInfo(key) {
  const entry = INFO[key];
  if (!entry) return;
  tip.innerHTML = `<div class="tip-body">
    <h2>${esc(t(entry[0]))}</h2>
    <p>${esc(t(entry[1]))}</p>
    <button class="btn" type="button" data-close-tip>${t('Got it')}</button>
  </div>`;
  if (!tip.open) tip.showModal();
  tip.querySelector('[data-close-tip]').focus();
}
tip.addEventListener('click', (e) => {
  if (e.target === tip || e.target.closest('[data-close-tip]')) tip.close();
});
// Info buttons inside the details/idea sheet
sheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-info]');
  if (b) { e.stopPropagation(); openInfo(b.dataset.info); }
}, true);

// ---------- guide: step by step to an app idea ----------
const guideState = (() => {
  const g = store.get('guide', null) || {};
  return { done: g.done || {}, welcomed: !!g.welcomed };
})();
const saveGuide = () => store.set('guide', guideState);

function setNicheMode(mode) {
  state.nicheMode = mode;
  store.set('nicheMode', mode);
}

function highlight(selector) {
  setTimeout(() => {
    const el = $(selector);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('pulse');
    setTimeout(() => el.classList.remove('pulse'), 2600);
  }, 80);
}

const GUIDE = [
  {
    id: 'country',
    title: 'Pick your target country',
    body: 'Choose where you want to sell, using the country picker at the top. Countries where people pay a lot: US, UK, Germany, Japan, Switzerland, the Nordics.',
    go: () => highlight('#country'),
    extra: () => `<button class="btn ghost small" type="button" data-guide-act="country-ok">${t('Use {country}', { country: esc(cname(state.country)) })}</button>`,
  },
  {
    id: 'categories',
    title: 'Find a promising category',
    body: 'Niches → Categories ranks every category in your country. Look for Promising (55+) and note its keyword ideas.',
    go: () => { setNicheMode('all'); go('niches'); highlight('.niche-list, #autoBtn'); },
  },
  {
    id: 'topapps',
    title: 'Spot apps people pay for but dislike',
    body: 'Niches → Top apps lists the biggest Gap scores. Open one and see why its users are unhappy.',
    go: () => { setNicheMode('top'); go('niches'); highlight('.top-list, #out'); },
  },
  {
    id: 'keyword',
    title: 'Score a keyword',
    body: 'Tap a keyword idea or type one on the Keyword tab. Aim for an Opportunity score of 55 or more.',
    go: () => { go('keyword'); highlight('#kwInput'); },
  },
  {
    id: 'compare',
    title: 'Compare countries',
    body: 'On the Countries tab, score the same keyword in several countries and find where competition is weaker.',
    go: () => {
      if (state.kw.result && !state.cmp.text) state.cmp.text = state.kw.result.kw;
      go('compare');
      highlight('#cmpInput');
    },
  },
  {
    id: 'complaints',
    title: 'Read what users complain about',
    body: "Open a competitor's details or summarize complaints for your keyword. Repeated complaints are your feature list.",
    go: () => {
      if (state.kw.result) { go('keyword'); highlight('#csBox'); } else { setNicheMode('top'); go('niches'); highlight('.top-list, #out'); }
    },
  },
  {
    id: 'idea',
    title: 'Save it as an idea',
    body: 'Tap Add to ideas on a keyword or an app. The idea keeps its scores and complaints.',
    auto: () => ideas.loadIdeas().length > 0,
    go: () => {
      if (state.kw.result) { go('keyword'); highlight('[data-act="idea-from-kw"]'); } else { go('ideas'); highlight('[data-act="idea-new"]'); }
    },
  },
  {
    id: 'ready',
    title: 'Get an idea ready to build',
    body: "Fill in why you'd win and how you'll charge, and tick the checklist. At 4 of 5 you have a real candidate.",
    auto: () => ideas.loadIdeas().some((i) => ideas.readiness(i).done >= 4),
    go: () => {
      go('ideas');
      const list = ideas.loadIdeas().sort((a, b) => b.updatedAt - a.updatedAt);
      if (list[0]) openIdea(list[0].id);
    },
  },
];

const stepDone = (s) => !!guideState.done[s.id] || !!s.auto?.();

function guideDone(id) {
  if (guideState.done[id]) return;
  guideState.done[id] = true;
  saveGuide();
  const step = GUIDE.find((s) => s.id === id);
  if (step) toast(`✓ ${t(step.title)}`);
  guideRefresh();
}

function guideTrack(name) {
  // Viewing the right screen with results counts for the browsing steps.
  if (name === 'niches' && state.nicheMode === 'all' && (state.scan.summary || state.auto.results?.length)) guideDone('categories');
}

function guideReset() {
  guideState.done = {};
  saveGuide();
  guideRefresh();
}

const guidePanel = $('#guidePanel');
const guideFab = $('#guideFab');

function guideHtml() {
  const done = GUIDE.filter(stepDone).length;
  const currentIdx = GUIDE.findIndex((s) => !stepDone(s));
  const pct = Math.round((done / GUIDE.length) * 100);
  const steps = GUIDE.map((s, i) => {
    const isDone = stepDone(s);
    const isCurrent = i === currentIdx;
    return `<li class="g-step${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}">
      <span class="g-mark" aria-hidden="true">${isDone ? '✓' : i + 1}</span>
      <div class="g-text">
        <b>${esc(t(s.title))}</b>
        ${isCurrent ? `<p>${esc(t(s.body))}</p>
          <div class="g-actions">
            <button class="btn small" type="button" data-guide-go="${s.id}">${t('Go')}</button>
            ${s.extra ? s.extra() : ''}
          </div>` : ''}
      </div>
      <span class="sr-only">${isDone ? t('Done') : t('Step {n} of {total}', { n: i + 1, total: GUIDE.length })}</span>
    </li>`;
  }).join('');
  return `<div class="g-head">
      <div><b>${t('Find your app idea')}</b><span>${t('{done} of {total} done', { done, total: GUIDE.length })}</span></div>
      <button class="close g-close" type="button" data-guide-close aria-label="${esc(t('Close'))}">×</button>
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <ol class="g-steps">${steps}</ol>
    ${currentIdx === -1 ? `<p class="read">${t("All steps done. You have an idea that's ready to build. Run the steps again for your next idea.")}</p>` : ''}`;
}

function guideRefresh() {
  if (!guidePanel) return;
  guidePanel.innerHTML = guideHtml();
  const done = GUIDE.filter(stepDone).length;
  guideFab.innerHTML = `<span>${t('Guide')}</span><b>${done}/${GUIDE.length}</b>`;
  guideFab.setAttribute('aria-label', `${t('Open the guide')}: ${t('{done} of {total} done', { done, total: GUIDE.length })}`);
}

const wideScreen = () => window.matchMedia('(min-width: 1180px)').matches;

function openGuide() {
  guideRefresh();
  guidePanel.classList.add('open');
  document.body.classList.add('guide-open');
  guidePanel.querySelector('[data-guide-go]')?.focus();
}
function closeGuide() {
  guidePanel.classList.remove('open');
  document.body.classList.remove('guide-open');
}

guideFab.addEventListener('click', openGuide);
$('#guideBackdrop').addEventListener('click', closeGuide);
guidePanel.addEventListener('click', (e) => {
  if (e.target.closest('[data-guide-close]')) { closeGuide(); return; }
  const goBtn = e.target.closest('[data-guide-go]');
  if (goBtn) {
    const step = GUIDE.find((s) => s.id === goBtn.dataset.guideGo);
    if (!wideScreen()) closeGuide();
    if (sheet.open) sheet.close();
    step?.go();
    return;
  }
  if (e.target.closest('[data-guide-act="country-ok"]')) guideDone('country');
});

// ---------- welcome tutorial ----------
const welcome = $('#welcome');
let welcomeStep = 0;
const WELCOME = [
  { title: 'Find an app idea people will pay for', body: 'This app reads public App Store data in 33 countries and shows where users pay, where they are unhappy, and where a small developer can win.', lang: true },
  { title: 'How the scores work', body: 'Every score is 0–100 and built from public signals: ratings stand in for downloads, Top Grossing shows money, and low ratings or old updates show unhappy users. Tap any ⓘ for an explanation.', legend: true },
  { title: 'Follow the guide', body: "The guide takes you from a country to an idea that's ready to build in 8 steps. Steps tick themselves off as you use the app. Open it any time with the Guide button." },
];

function welcomeHtml() {
  const w = WELCOME[welcomeStep];
  const last = welcomeStep === WELCOME.length - 1;
  return `<div class="welcome-body">
    <div class="w-dots" aria-hidden="true">${WELCOME.map((_, i) => `<i class="${i === welcomeStep ? 'on' : ''}"></i>`).join('')}</div>
    <h2>${esc(t(w.title))}</h2>
    <p>${esc(t(w.body))}</p>
    ${w.lang ? `<div class="field"><span>${t('Choose your language')}</span>
      <div class="seg" role="group" aria-label="${esc(t('Language'))}">${LANGS.map(([code, label]) => `<button type="button" data-wlang="${code}" aria-pressed="${lang === code}">${label}</button>`).join('')}</div></div>` : ''}
    ${w.legend ? `<div class="w-legend"><span class="score-pill strong">72</span><span class="score-pill maybe">48</span><span class="score-pill weak">25</span><span class="info-btn" aria-hidden="true">i</span></div>
      <p class="note">${t('Green is good, amber is worth a look, red is weak.')}</p>` : ''}
    <div class="w-actions">
      ${welcomeStep > 0 ? `<button class="btn ghost" type="button" data-w="back">${t('Back')}</button>` : `<button class="btn ghost" type="button" data-w="skip">${t('Skip')}</button>`}
      <button class="btn" type="button" data-w="${last ? 'finish' : 'next'}">${last ? t('Start the guide') : t('Next')}</button>
    </div>
  </div>`;
}

function openWelcome() {
  welcomeStep = 0;
  welcome.innerHTML = welcomeHtml();
  if (!welcome.open) welcome.showModal();
}

function finishWelcome(openTheGuide) {
  guideState.welcomed = true;
  saveGuide();
  welcome.close();
  if (openTheGuide && !wideScreen()) openGuide();
}

welcome.addEventListener('click', (e) => {
  const wl = e.target.closest('[data-wlang]');
  if (wl) { changeLang(wl.dataset.wlang, { quiet: true }); welcome.innerHTML = welcomeHtml(); return; }
  const a = e.target.closest('[data-w]')?.dataset.w;
  if (a === 'next') welcomeStep++;
  if (a === 'back') welcomeStep--;
  if (a === 'skip') return finishWelcome(false);
  if (a === 'finish') return finishWelcome(true);
  if (a) welcome.innerHTML = welcomeHtml();
});
welcome.addEventListener('cancel', () => { guideState.welcomed = true; saveGuide(); });

// ---------- language ----------
function changeLang(code, { quiet = false } = {}) {
  setLang(code);
  buildCountrySelect();
  render();
  guideRefresh();
  if (sheet.open) sheet.close();
  if (!quiet) toast(t('Language changed'));
}

// ---------- country picker ----------
const countrySel = $('#country');
function buildCountrySelect() {
  countrySel.innerHTML = REGIONS.map((region) => `<optgroup label="${esc(t(region))}">${
    COUNTRIES.filter((c) => c[3] === region).map(([c]) => `<option value="${c}">${esc(cshort(c))}</option>`).join('')
  }</optgroup>`).join('');
  countrySel.value = state.country;
}
buildCountrySelect();

function setCountry(cc) {
  if (!CNAME[cc] || cc === state.country) return;
  state.country = cc;
  countrySel.value = cc;
  store.set('country', cc);
}

countrySel.addEventListener('change', () => {
  const had = { niche: !!state.niche.result, kw: state.kw.result?.kw };
  setCountry(countrySel.value);
  guideDone('country');
  state.niche.result = null;
  state.kw.result = null;
  const name = current();
  if (name === 'niches' && state.nicheMode === 'all') { loadAuto(); refresh(name); }
  else if (name === 'niches' && had.niche) runNiche();
  else if (name === 'keyword' && had.kw) runKeyword(had.kw);
  else refresh(name);
});

render();
guideRefresh();
if (!guideState.welcomed) openWelcome();
