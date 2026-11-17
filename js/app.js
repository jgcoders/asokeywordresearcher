import * as api from './api.js';
import * as cs from './complaints.js';
import * as ideas from './ideas.js';
import * as nightly from './nightly.js';
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
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

function ago(iso) {
  const d = daysSince(iso);
  if (d === Infinity) return 'unknown';
  if (d < 1) return 'today';
  if (d < 31) return `${d}d ago`;
  if (d < 365) return `${Math.round(d / 30)} mo ago`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')} yr ago`;
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
  if (e instanceof api.RateLimitError) return 'Apple is limiting requests right now. Wait a minute, then try again.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return "You're offline. Connect to the internet and try again.";
  return "Couldn't load data from the App Store. Try again in a moment.";
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

const sheet = $('#sheet'); // details / idea editor dialog

// ---------- state ----------
const state = {
  country: CNAME[store.get('country', 'us')] ? store.get('country', 'us') : 'us',
  niche: { genreId: store.get('nicheGenre', '6013'), chart: store.get('nicheChart', 'grossing'), only: false, result: null, busy: false, error: null, token: 0 },
  kw: { text: '', result: null, busy: false, error: null, token: 0 },
  cmp: { text: '', rows: null, busy: false, error: null, token: 0 },
  nicheMode: ['top', 'all', 'one'].includes(store.get('nicheMode', 'top')) ? store.get('nicheMode', 'top') : 'top',
  nightly: { summary: null, loading: false, error: null, countries: {}, countryLoading: {} },
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
  const t = String(text || '').trim();
  if (!t) return;
  const token = ++s.token;
  Object.assign(s, { text: t, busy: true, error: null, result: null });
  refresh('keyword');
  try {
    const r = await scoreKeyword(t, state.country);
    if (token !== s.token) return;
    remember(r.apps);
    s.result = r;
    syncIdea(r);
  } catch (e) {
    if (token !== s.token) return;
    s.error = errorText(e);
  }
  s.busy = false;
  refresh('keyword');
}

async function runCompare(text) {
  const s = state.cmp;
  const t = String(text || '').trim();
  if (!t) return;
  const token = ++s.token;
  Object.assign(s, { text: t, busy: true, error: null, rows: state.cmpCountries.map((cc) => ({ cc, status: 'wait' })) });
  refresh('compare');
  for (const row of s.rows) {
    if (token !== s.token) return;
    row.status = 'busy';
    refresh('compare');
    try {
      row.result = await scoreKeyword(t, row.cc);
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

/** A category row from the nightly scan, in the same shape as a live scan result. */
function fromNightlyCategory(c) {
  return {
    genreId: String(c.g), name: GNAME[c.g] || String(c.g), score: c.s, verdict: categoryVerdict(c.s), sizeLabel: c.sz,
    niche: c.n, gapTop: c.gt, small: c.sm, fresh: c.fr, stale: c.st, median: c.md,
    ideas: c.ideas || [], examples: c.ex ? [{ name: c.ex.n, rank: c.ex.rk, ratings: c.ex.r }] : [],
    topGap: c.top ? { name: c.top.n, gap: c.top.gap } : null,
  };
}

function ensureNightly() {
  const n = state.nightly;
  if (n.summary || n.loading) return;
  n.loading = true;
  n.error = null;
  nightly.loadSummary()
    .then((sum) => { n.summary = sum; })
    .catch((e) => { n.error = e instanceof nightly.NotPublishedError ? 'missing' : 'failed'; })
    .finally(() => { n.loading = false; refresh('niches'); });
}

function ensureNightlyCountry(cc) {
  const n = state.nightly;
  if (n.countries[cc] || n.countryLoading[cc]) return;
  n.countryLoading[cc] = true;
  nightly.loadCountry(cc)
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
  if (!usd || usd < 0.001) return 'under 0.1¢';
  if (usd < 0.01) return `about ${(usd * 100).toFixed(1)}¢`;
  if (usd < 1) return `about ${Math.round(usd * 100)}¢`;
  return `about $${usd.toFixed(2)}`;
}

function complaintsInner(r) {
  const s = state.cs;
  const key = `${r.country}|${r.kw.toLowerCase()}`;
  if (s.key !== key) {
    s.token++; // forget any summary still running for another keyword
    Object.assign(s, { key, busy: false, step: '', error: null, needsKey: false, keyForm: false, entry: cs.getCached(r.kw, r.country) });
  }
  const head = '<h3>What users complain about</h3>';
  if (s.busy) return head + loading(s.step || 'Starting…');
  if (s.keyForm || s.needsKey) return head + keyFormHtml(s.error);
  if (s.entry) return head + summaryHtml(s.entry);
  return `${head}${s.error ? errorBox(s.error) : ''}
  <div class="empty cs-start">
    <p>Let Claude read the recent 1–3 star reviews of the top ${cs.APPS_TO_READ} apps and list what users want fixed.</p>
    <button class="btn" type="button" data-act="cs-run">Summarize complaints</button>
    <p class="note">Uses your own Anthropic API key and is billed to your Anthropic account, usually well under 1¢ per summary with Claude Haiku 5.5. Results stay on this device for 7 days.</p>
  </div>`;
}

function keyFormHtml(err) {
  return `${err ? errorBox(err) : ''}
  <form class="form cs-key" id="csKeyForm">
    <label class="field"><span>Anthropic API key</span>
      <input type="password" id="csKey" placeholder="sk-ant-…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" aria-describedby="csKeyHelp">
    </label>
    <p class="note" id="csKeyHelp">Create a key in the Anthropic Console (console.anthropic.com → API keys); your account needs some credit. The key is stored only on this device and sent only to Anthropic.</p>
    <div class="row">
      <button class="btn" type="submit">Save key and summarize</button>
      <button class="btn ghost" type="button" data-act="cs-key-cancel">Cancel</button>
    </div>
  </form>`;
}

function summaryHtml(e) {
  const r = e.result;
  const model = cs.MODEL_LABELS[e.model] || e.model || cs.MODEL_LABEL;
  const complaints = (r.complaints || []).map((c) => `<li class="cs-item">
      <div class="cs-top"><b>${esc(c.theme)}</b><span class="tag warn">${c.mentions} ${c.mentions === 1 ? 'mention' : 'mentions'}</span></div>
      <p>${esc(c.detail)}</p>
      ${c.quote ? `<blockquote>“${esc(c.quote)}”</blockquote>` : ''}
      ${c.apps?.length ? `<p class="note">${esc(c.apps.join(' · '))}</p>` : ''}
    </li>`).join('');
  const features = (r.features || []).map((f) => `<li><b>${esc(f.idea)}</b><span>${esc(f.why)}</span></li>`).join('');
  return `
  <p class="read">${esc(r.summary)}</p>
  ${complaints ? `<ol class="cs-list">${complaints}</ol>` : ''}
  ${features ? `<h3>How a new app could win</h3><ul class="cs-features">${features}</ul>` : ''}
  <h3>Price and ads</h3>
  <p class="cs-text">${esc(r.pricing)}</p>
  <div class="cs-pitch"><span>Pitch</span><p>${esc(r.pitch)}</p></div>
  <p class="note">Based on ${e.reviewCount} ${e.reviewCount === 1 ? 'review' : 'reviews'} of ${e.appCount} ${e.appCount === 1 ? 'app' : 'apps'} (Apple's feed has reviews for only some apps) · ${esc(model)} · ${costText(e.cost)} ·${sinceText(e.at)} ·
    <button class="linklike" type="button" data-act="cs-redo">Summarize again</button></p>`;
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
      apps: r.apps,
      fresh,
      onStep: (msg) => { if (token === s.token) { s.step = msg; refreshCs(); } },
    });
    if (token !== s.token) return;
    s.entry = entry;
    attachSummaryToIdea(r, entry);
  } catch (e) {
    if (token !== s.token) return;
    s.error = e instanceof cs.SummaryError ? e.message : "Couldn't summarize the reviews. Try again in a minute.";
    s.needsKey = e instanceof cs.SummaryError && e.needsKey;
  }
  s.busy = false;
  refreshCs();
}

function sinceText(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
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
    toast('Removed from Saved');
    return;
  }
  const r = result.report;
  list.unshift({ kw: result.kw, cc: result.country, opp: r.opportunity, demand: r.demand, ease: r.ease, money: r.money, date: Date.now() });
  store.set('saved', list);
  toast('Saved');
}

// ---------- shared rendering ----------
function tagsFor(a, f, { grossingChart = false } = {}) {
  const t = [];
  if (a.gapInfo?.gap) t.push([gapVerdict(a.gapInfo.gap).key === 'strong' ? 'good' : 'info', `Gap ${a.gapInfo.gap}`]);
  if (f.grossing) t.push(['good', 'Top Grossing']);
  if (grossingChart && f.smallEarner) t.push(['good', 'Small earner']);
  else if (!grossingChart && f.beatable) t.push(['good', 'Under 1k ratings']);
  if (f.lowRated) t.push(['bad', `Low rated ★${a.rating.toFixed(1)}`]);
  if (f.stale) t.push(['warn', 'No update in 1 yr+']);
  if (f.isNew) t.push(['info', 'New']);
  if (f.paid) t.push(['info', a.priceText || 'Paid']);
  return t.length ? `<div class="tags">${t.map(([k, l]) => `<span class="tag ${k}">${esc(l)}</span>`).join('')}</div>` : '';
}

function appRow(a, rank, f, opts) {
  const meta = a.ratings
    ? `${fmt(a.ratings)} ratings · ★${(a.rating || 0).toFixed(1)} · updated ${ago(a.updated)}`
    : a.updated ? `No ratings yet · updated ${ago(a.updated)}` : 'No details available';
  const icon = a.icon ? `<img src="${esc(a.icon)}" alt="" loading="lazy" width="48" height="48">` : '<span class="ph"></span>';
  return `<li><button class="app" type="button" data-app="${esc(appKey(a))}">
    <span class="rank">${rank}</span>${icon}
    <span class="body"><span class="name">${esc(a.name)}</span><span class="meta">${esc(meta)}</span>${tagsFor(a, f, opts)}</span>
  </button></li>`;
}

const loading = (msg) => `<div class="loading"><span class="spinner"></span><span>${esc(msg)}</span></div>`;
const errorBox = (msg) => `<p class="error">${esc(msg)}</p>`;

// ---------- views ----------
const VIEWS = {
  niches: {
    title: 'Niches',
    shell: () => ({ top: topShell, all: autoShell, one: oneShell }[state.nicheMode])(),
    out: () => ({ top: topOut, all: autoOut, one: oneOut }[state.nicheMode])(),
  },
  keyword: { title: 'Keyword', shell: keywordShell, out: keywordOut },
  compare: { title: 'Countries', shell: compareShell, out: compareOut },
  ideas: { title: 'Ideas', shell: ideasShell, out: ideasOut },
  saved: { title: 'Saved', shell: () => '<div id="out"></div>', out: savedOut },
};

// Niches
const modeSwitch = () => `
  <div class="seg seg3" role="group" aria-label="Niches view">
    <button type="button" data-mode="top" aria-pressed="${state.nicheMode === 'top'}">Top apps</button>
    <button type="button" data-mode="all" aria-pressed="${state.nicheMode === 'all'}">Categories</button>
    <button type="button" data-mode="one" aria-pressed="${state.nicheMode === 'one'}">One category</button>
  </div>`;

// ---------- Top apps (nightly Gap scores) ----------
const TOP_KINDS = [['gaps', 'Biggest gaps'], ['risers', 'Rising'], ['newcomers', 'New earners']];

function topShell() {
  ensureNightly();
  const t = state.top;
  if (t.cc) ensureNightlyCountry(t.cc);
  return `${modeSwitch()}
  <p class="intro">Every night we score every Top Grossing app in ${COUNTRIES.length} countries and ${GENRES.length} categories. High Gap scores are apps people pay for but are unhappy with.</p>
  <div class="row">
    <label class="field"><span>Country</span><select class="input" id="topCc">
      <option value="">All countries</option>
      ${REGIONS.map((r) => `<optgroup label="${esc(r)}">${COUNTRIES.filter((c) => c[3] === r).map(([c, n]) => `<option value="${c}"${c === t.cc ? ' selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}
    </select></label>
    <label class="field"><span>Category</span><select class="input" id="topG">
      <option value="">All categories</option>
      ${GENRES.map(([id, n]) => `<option value="${id}"${String(id) === String(t.g) ? ' selected' : ''}>${esc(n)}</option>`).join('')}
    </select></label>
  </div>
  <div class="chips">${TOP_KINDS.map(([k, l]) => `<button class="chip" type="button" data-top-kind="${k}" aria-pressed="${t.kind === k}">${l}</button>`).join('')}</div>
  <div id="out"></div>`;
}

function topEntries() {
  const t = state.top;
  const sum = state.nightly.summary;
  const byGenre = (list) => (t.g ? list.filter((e) => String(e.g) === String(t.g)) : list);
  if (t.kind === 'gaps') {
    if (t.cc) {
      const data = state.nightly.countries[t.cc];
      if (!data) return null;
      return byGenre(data.categories.flatMap((c) => c.apps)).sort((a, b) => b.gap - a.gap).slice(0, 100);
    }
    return byGenre(sum.leaderboard);
  }
  const list = t.kind === 'risers' ? sum.risers : sum.newcomers;
  return byGenre(t.cc ? list.filter((e) => e.cc === t.cc) : list);
}

function topRow(e, i) {
  const a = nightly.toApp(e);
  remember([a]);
  const tags = [];
  if (e.pr > 0 && e.pr > e.rk) tags.push(['good', `Up ${e.pr - e.rk} places (was #${e.pr})`]);
  if (e.pr === -1) tags.push(['good', 'New in Top Grossing']);
  tags.push(['info', `${fmt(e.r)} ratings`]);
  if (e.r >= 20 && e.a) tags.push([e.uh >= 40 ? 'bad' : 'info', `${e.a.toFixed(1)}★`]);
  const days = daysSince(e.up);
  if (days > 270 && days !== Infinity) tags.push(['warn', `No update in ${Math.round(days / 30)} mo`]);
  if (e.ic2 > 1) tags.push(['info', `Charts in ${e.ic2} countries`]);
  const icon = e.ic ? `<img src="${esc(e.ic)}" alt="" loading="lazy" width="48" height="48">` : '<span class="ph"></span>';
  const v = gapVerdict(e.gap);
  return `<li><button class="app top-app" type="button" data-app="${esc(appKey(a))}">
    <span class="rank">${i + 1}</span>${icon}
    <span class="body">
      <span class="name">${esc(e.n)}</span>
      <span class="meta">${esc(CSHORT[e.cc] || e.cc)} · ${esc(GNAME[e.g] || '')} · #${e.rk} in Top Grossing</span>
      <span class="tags">${tags.map(([k, l]) => `<span class="tag ${k}">${esc(l)}</span>`).join('')}</span>
    </span>
    <span class="score-pill ${v.key}" aria-label="Gap score ${e.gap}">${e.gap}</span>
  </button></li>`;
}

function topOut() {
  const n = state.nightly;
  const t = state.top;
  if (n.loading && !n.summary) return loading("Loading last night's scan…");
  if (!n.summary) {
    if (n.error === 'missing') {
      return `<div class="empty"><p>The nightly scan hasn't published results yet.</p>
        <p>It runs every night at about 02:30 UTC. Until then, use <b>Categories</b> or <b>One category</b> to scan live.</p></div>`;
    }
    return `${errorBox("Couldn't load last night's scan. Check your connection and try again.")}
      <button class="btn ghost small" type="button" data-act="nightly-retry">Try again</button>`;
  }
  const sum = n.summary;
  const meta = `<p class="note">Updated ${sinceText(Date.parse(sum.generatedAt))} · ${sum.scanned} charts${sum.trendSince ? ` · trends since ${esc(sum.trendSince)}` : ''}</p>`;
  if (t.kind !== 'gaps' && !sum.trendSince) {
    return `${meta}<div class="empty"><p>Trends appear once the scan has run on two different days. Check back tomorrow.</p></div>`;
  }
  if (t.kind === 'gaps' && t.cc && !n.countries[t.cc]) return meta + loading(`Loading ${CNAME[t.cc]}…`);
  const list = topEntries() || [];
  if (!list.length) return `${meta}<div class="empty"><p>Nothing here for this filter${t.kind === 'gaps' && !t.cc ? '. The overall list keeps the best 150 apps; pick a country to see more for one category' : ''}.</p></div>`;
  const explain = {
    gaps: 'Gap score = Top Grossing rank (35%) + ratings count (25%) + unhappy users: rated below the typical app in its chart, or not updated for months (30%) + not a giant (10%). Tap an app for details and complaints.',
    risers: 'Apps that climbed at least 10 places in Top Grossing and are now in the top 50. A niche that is heating up.',
    newcomers: 'Apps with under 5k ratings that entered the top 60 in Top Grossing. Small apps starting to earn.',
  }[t.kind];
  return `${meta}<ol class="list top-list">${list.map(topRow).join('')}</ol><p class="note">${esc(explain)}</p>`;
}

function autoShell() {
  loadAuto();
  ensureNightly();
  return `${modeSwitch()}
  <p class="intro">All ${GENRES.length} categories in ${esc(CNAME[state.country])}, ranked by room for small apps, market size and the biggest Gap scores. Change the country at the top.</p>
  <button class="btn ghost" id="autoBtn" type="button" data-act="autoscan">Scan live now</button>
  <div id="out"></div>`;
}

function nicheCard(n, i) {
  const ex = n.examples[0];
  return `<li class="niche">
    <div class="niche-head">
      <span class="niche-rank">${i}</span>
      <div class="niche-title"><b>${esc(n.name)}</b><span>${esc(n.sizeLabel)} · typical top app has ${fmt(n.median)} ratings</span></div>
      <span class="score-pill ${n.verdict.key}" aria-label="Niche score ${n.score}, ${esc(n.verdict.label)}">${n.score}</span>
    </div>
    <div class="tags">
      <span class="tag good">${n.small} small earners</span>
      <span class="tag info">${n.fresh} new</span>
      ${n.stale ? `<span class="tag warn">${n.stale} neglected</span>` : ''}
    </div>
    ${ex ? `<p class="niche-ex">Example: <b>${esc(ex.name)}</b> is #${ex.rank} in Top Grossing with ${fmt(ex.ratings)} ratings.</p>` : ''}
    ${n.topGap && n.topGap.gap ? `<p class="niche-ex">Biggest gap: <b>${esc(n.topGap.name)}</b> (Gap ${n.topGap.gap})</p>` : ''}
    ${n.ideas.length ? `<div class="chips">${n.ideas.map((k) => `<button class="chip" type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
    <button class="linklike" type="button" data-open-genre="${esc(n.genreId)}">See the full chart →</button>
  </li>`;
}

function autoOut() {
  const a = state.auto;
  const parts = [];
  if (a.busy) {
    const pct = Math.round((a.done / GENRES.length) * 100);
    const msg = a.waiting
      ? 'Apple asked us to slow down. Waiting 30 seconds, then continuing…'
      : `Scanning ${a.current} · ${Math.min(a.done + 1, GENRES.length)} of ${GENRES.length}`;
    parts.push(`<div class="progress-card"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><p class="note">${esc(msg)}</p></div>`);
  }
  if (a.error) parts.push(errorBox(`${a.error} Categories scanned so far are below.`));
  // Show whichever is newer: a live scan on this phone or last night's scan.
  const sum = state.nightly.summary;
  const nightlyAt = sum ? Date.parse(sum.generatedAt) : 0;
  const nightlyRows = sum ? sum.categories.filter((c) => c.cc === state.country).map(fromNightlyCategory).sort((x, y) => y.score - x.score) : [];
  const live = a.country === state.country && a.results?.length ? a.results : null;
  let res = null;
  let source = '';
  if (live && (a.busy || a.at >= nightlyAt || !nightlyRows.length)) { res = live; source = a.busy ? '' : `Scanned live ${sinceText(a.at)}.`; }
  else if (nightlyRows.length && !a.busy) { res = nightlyRows; source = `From last night's scan, updated ${sinceText(nightlyAt)}.`; }
  if (!res || !res.length) {
    if (!a.busy) {
      if (state.nightly.loading) parts.push(loading("Loading last night's scan…"));
      else {
        parts.push(`<div class="empty"><p>${sum ? `Last night's scan has no data for ${esc(CNAME[state.country])}.` : "Last night's scan isn't available yet."} Tap <b>Scan live now</b> to rank every category in ${esc(CNAME[state.country])}.</p>
          <p>A live scan takes 1–2 minutes. Scanning again within 6 hours is almost instant.</p></div>`);
      }
    }
    return parts.join('');
  }
  if (!a.busy) {
    const best = res.filter((n) => n.verdict.key === 'strong').slice(0, 3).map((n) => n.name);
    const lead = best.length ? `Best bets in ${CNAME[state.country]}: <b>${best.map(esc).join(', ')}</b>.` : `No category in ${esc(CNAME[state.country])} scores as Promising right now. Look at the Possible ones.`;
    const china = state.country === 'cn' ? ' Note: to publish in China, Apple requires a government ICP filing for your app, which is hard for developers outside China.' : '';
    parts.push(`<p class="read">${lead} ${source}${china}${a.failed && res === live ? ` ${a.failed} ${a.failed === 1 ? 'category' : 'categories'} couldn't be loaded.` : ''}</p>`);
  }
  parts.push(`<ol class="niche-list">${res.map((n, i) => nicheCard(n, i + 1)).join('')}</ol>`);
  parts.push('<p class="note">Score = half room for small apps (small earners, new and neglected apps, weighed against market size) and half the average of the 5 biggest Gap scores. 55+ Promising, 45–54 Possible. Tap a keyword to score it.</p>');
  return parts.join('');
}

function oneShell() {
  const s = state.niche;
  return `${modeSwitch()}
  <p class="intro">See which apps earn money in a category and how many of them are small. Many small earners means a newcomer can get in.</p>
  <form class="form" id="nicheForm">
    <div class="row">
      <label class="field"><span>Category</span>
        <select class="input" id="genre">${GENRES.map(([id, n]) => `<option value="${id}"${String(id) === String(s.genreId) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>
      </label>
      <label class="field"><span>Chart</span>
        <select class="input" id="chartType">${Object.entries(CHART_LABEL).map(([k, l]) => `<option value="${k}"${k === s.chart ? ' selected' : ''}>${l}</option>`).join('')}</select>
      </label>
    </div>
    <button class="btn" id="nicheBtn" type="submit">Scan category</button>
  </form>
  <div id="out"></div>`;
}

function oneOut() {
  const s = state.niche;
  if (s.busy) return loading(`Reading ${CHART_LABEL[s.chart]} for ${GNAME[s.genreId]} in ${CNAME[state.country]}…`);
  if (s.error) return errorBox(s.error);
  const r = s.result;
  if (!r) {
    return `<div class="empty"><p>Pick a category and tap <b>Scan category</b>.</p>
      <p>Start with Top Grossing. It shows where users actually pay. Health &amp; Fitness, Productivity, Education and Lifestyle are good first scans for small, paid apps.</p></div>`;
  }
  const rep = r.report;
  const g = r.chart === 'grossing';
  const rows = r.apps
    .map((a, i) => ({ a, f: rep.flags[i] }))
    .filter(({ f }) => !s.only || f.smallEarner || f.isNew);
  const ideas = rep.ideas.length
    ? `<div class="chips">${rep.ideas.map((i) => `<button class="chip" type="button" data-kw="${esc(i.text)}">${esc(i.text)}<span class="n">${i.count}</span></button>`).join('')}</div>
       <p class="note">Words that repeat in the names of small and new apps. Tap one to score it.</p>`
    : '<p class="note">No repeating words found in this chart.</p>';
  return `
  <section class="section">
    <h2>${esc(GNAME[r.genreId])} · ${CHART_LABEL[r.chart]} · ${esc(CNAME[r.country])}</h2>
    <div class="stats">
      <div class="stat"><b>${rep.small}</b><span>${g ? 'small earners' : 'small apps'} (under 5k ratings)</span></div>
      <div class="stat"><b>${rep.fresh}</b><span>released in the last 18 months</span></div>
      <div class="stat"><b>${rep.stale}</b><span>not updated in a year</span></div>
    </div>
    <p class="read">${esc(rep.read)}</p>
  </section>
  <section class="section"><h3>Keyword ideas</h3>${ideas}</section>
  <section class="section">
    <div class="row" style="align-items:center">
      <h3 style="margin:0">The chart (${rep.total})</h3>
      <div class="chips" style="justify-content:flex-end">
        <button class="chip" type="button" data-act="filter" aria-pressed="${s.only}">${s.only ? 'Show all apps' : 'Only small &amp; new'}</button>
      </div>
    </div>
    ${rows.length ? `<ul class="list">${rows.map(({ a, f }) => appRow(a, a.rank, f, { grossingChart: g })).join('')}</ul>` : '<div class="empty"><p>No small or new apps in this chart.</p></div>'}
  </section>`;
}

// Keyword
function keywordShell() {
  return `
  <p class="intro">Score a search term: how many people want it, how beatable the top 10 apps are, and whether they make money.</p>
  <form class="form" id="kwForm">
    <div class="row">
      <input type="search" id="kwInput" placeholder="e.g. plant care" enterkeyhint="search" autocapitalize="none" autocorrect="off" autocomplete="off" value="${esc(state.kw.text)}" aria-label="Keyword">
      <button class="btn" id="kwBtn" type="submit" style="flex:0 0 auto">Check</button>
    </div>
  </form>
  <div id="out"></div>`;
}

function meter(name, v, why) {
  return `<div class="meter">
    <div class="top"><span class="name">${name}</span><span class="val">${v}</span></div>
    <div class="bar"><i style="width:${v}%;background:var(--${tone(v)})"></i></div>
    <p class="why">${esc(why)}</p>
  </div>`;
}

function keywordOut() {
  const s = state.kw;
  if (s.busy) return loading(`Checking "${s.text}" in ${CNAME[state.country]}…`);
  if (s.error) return errorBox(s.error);
  const r = s.result;
  if (!r) {
    return `<div class="empty"><p>Type a search term and tap <b>Check</b>, or try one of these:</p>
      <div class="chips">${SAMPLES.map((k) => `<button class="chip" type="button" data-kw="${esc(k)}">${esc(k)}</button>`).join('')}</div></div>`;
  }
  const rep = r.report;
  if (rep.empty) return `<div class="empty"><p>No apps found for "${esc(r.kw)}" in ${esc(CNAME[r.country])}. Try a shorter or more common phrase.</p></div>`;
  const f = rep.facts;
  const v = rep.verdict;
  const demandWhy = `Top ${rep.n} apps have ${fmt(f.totalRatings)} ratings combined.` + (rep.demand < 25 ? ' Few people use apps for this.' : '');
  const easeWhy = `Typical top app has ${fmt(f.medianRatings)} ratings. ${f.titleHits} of ${rep.n} have this keyword in their name. ${f.weak} ${f.weak === 1 ? 'looks' : 'look'} beatable (few ratings, low rating, or no update in a year).`;
  const moneyWhy = rep.money === 0
    ? 'None of the top apps are in Top Grossing or charge upfront.'
    : `${f.grossingHits} of ${rep.n} are in Top Grossing${r.genreName ? ` for ${r.genreName}` : ''}. ${f.paidHits} charge upfront.`;
  const saved = isSaved(r.kw, r.country);
  return `
  <div class="scorecard">
    <div class="ring ${v.key}" style="--v:${rep.opportunity}" role="img" aria-label="Opportunity score ${rep.opportunity} out of 100"><b>${rep.opportunity}</b></div>
    <div class="what">
      <p class="kw">${esc(r.kw)}</p>
      <span class="verdict ${v.key}">${v.label}</span>
      <div class="sub">Opportunity score · ${esc(CNAME[r.country])}</div>
    </div>
    <div class="actions">
      <button class="btn small" type="button" data-act="save">${saved ? 'Saved ✓' : 'Save'}</button>
      <button class="btn small ghost" type="button" data-act="compare">Compare countries</button>
      <button class="btn small ghost" type="button" data-act="idea-from-kw">${ideas.findIdea(ideas.loadIdeas(), r.kw, r.country) ? 'Open idea' : 'Add to ideas'}</button>
    </div>
  </div>
  <div class="meters">
    ${meter('Demand', rep.demand, demandWhy)}
    ${meter('Ease', rep.ease, easeWhy)}
    ${meter('Money', rep.money, moneyWhy)}
  </div>
  <section class="section" id="csBox">${complaintsInner(r)}</section>
  <section class="section">
    <h3>Top ${rep.n} for this search</h3>
    <ul class="list">${r.apps.map((a, i) => appRow(a, i + 1, rep.flags[i])).join('')}</ul>
    <p class="note">Tap an app to read what its users complain about. Scores are estimates from public App Store data; ratings stand in for downloads.</p>
  </section>`;
}

// Compare
function comparePickerHtml() {
  const sel = new Set(state.cmpCountries);
  const full = sel.size >= COMPARE_MAX;
  const presets = COMPARE_PRESETS.map(([label, list]) => `<button class="chip" type="button" data-cmp-preset="${esc(label)}">${esc(label)}</button>`).join('');
  const groups = REGIONS.map((region) => `<div class="cmp-region"><span>${esc(region)}</span><div class="chips">${
    COUNTRIES.filter((c) => c[3] === region).map(([c, , short]) => {
      const on = sel.has(c);
      return `<button class="chip" type="button" data-cmp-cc="${c}" aria-pressed="${on}"${!on && full ? ' disabled' : ''}>${esc(short)}</button>`;
    }).join('')
  }</div></div>`).join('');
  const secs = Math.max(5, Math.round(sel.size * 2.5));
  return `<details class="cmp-pick">
    <summary>Countries: <b>${state.cmpCountries.map((c) => esc(CSHORT[c])).join(', ')}</b></summary>
    <div class="cmp-pick-body">
      <div class="chips">${presets}</div>
      ${groups}
      <p class="note">${sel.size} of ${COMPARE_MAX} max selected · about ${secs} seconds per comparison.</p>
    </div>
  </details>`;
}

function compareShell() {
  return `
  <p class="intro">Score one keyword in several countries at once. Look for a country where demand exists but competition is weaker.</p>
  <div id="cmpPicker">${comparePickerHtml()}</div>
  <form class="form" id="cmpForm">
    <div class="row">
      <input type="search" id="cmpInput" placeholder="e.g. budget planner" enterkeyhint="search" autocapitalize="none" autocorrect="off" autocomplete="off" value="${esc(state.cmp.text)}" aria-label="Keyword to compare">
      <button class="btn" id="cmpBtn" type="submit" style="flex:0 0 auto">Compare</button>
    </div>
  </form>
  <p class="note">Outside English-speaking countries, most people search in their own language. Also try the translated keyword, for example "Pflanzenpflege" (German) or "家計簿" (Japanese).</p>
  <div id="out"></div>`;
}

function compareOut() {
  const s = state.cmp;
  if (!s.rows) {
    return `<div class="empty"><p>Pick your countries, type a keyword and tap <b>Compare</b>. Apple limits how fast we can ask, so each country takes a couple of seconds.</p></div>`;
  }
  const done = s.rows.filter((r) => r.status === 'done');
  const best = !s.busy && done.length ? done.reduce((a, b) => (b.result.report.opportunity > a.result.report.opportunity ? b : a)) : null;
  const rows = s.rows.map((row) => {
    const name = esc(CSHORT[row.cc] || row.cc);
    if (row.status !== 'done') {
      const label = { wait: 'Waiting', busy: 'Checking…', error: 'Failed', skipped: 'Skipped' }[row.status];
      return `<tr><td>${name}</td><td colspan="5" class="note">${row.status === 'busy' ? '<span class="spinner" style="display:inline-block;vertical-align:-3px;margin-right:6px"></span>' : ''}${label}</td></tr>`;
    }
    const rep = row.result.report;
    if (rep.empty) return `<tr><td>${name}</td><td colspan="5" class="note">No apps found</td></tr>`;
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
    <thead><tr><th>Country</th><th>Score</th><th>Demand</th><th>Ease</th><th>Money</th><th>Top app</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <p class="note">${best ? `Best: ${esc(CNAME[best.cc])}. ` : ''}Tap a country to see its full breakdown.</p>`;
}

// Saved
function savedOut() {
  return savedListHtml() + keySectionHtml();
}

function keySectionHtml() {
  const has = !!cs.getKey();
  return `<section class="section"><h3>Claude API key</h3><div class="empty">
    ${has
    ? '<p>Saved on this device. Used only for complaint summaries.</p><button class="btn ghost small" type="button" data-act="cs-key-remove">Remove key</button>'
    : "<p>No key saved. You'll be asked for one the first time you summarize complaints.</p>"}
  </div></section>`;
}

function savedListHtml() {
  const list = savedList();
  if (!list.length) {
    return `<div class="empty"><p>Nothing saved yet.</p><p>Check a keyword and tap <b>Save</b> to keep it here. Saved keywords stay on this device.</p></div>`;
  }
  return `
  <p class="intro">Keywords you saved on this device. Tap one to check it again with fresh data.</p>
  <ul class="list">${list.map((x, i) => `<li class="saved-item">
    <button class="open" type="button" data-saved="${i}">
      <span class="score-pill ${verdictFor(x.opp).key}">${x.opp}</span>
      <span class="body"><span class="kw">${esc(x.kw)}</span>
      <span class="meta">${esc(CNAME[x.cc] || x.cc)} · D ${x.demand} · E ${x.ease} · M ${x.money} · ${new Date(x.date).toLocaleDateString()}</span></span>
    </button>
    <button class="btn ghost small" type="button" data-idea-saved="${i}">Idea</button>
    <button class="close" type="button" data-del="${i}" aria-label="Remove ${esc(x.kw)}">×</button>
  </li>`).join('')}</ul>
  <div class="row"><button class="btn ghost" type="button" data-act="csv">Copy as CSV</button></div>
  <div id="csvFallback"></div>`;
}

// ---------- idea board ----------
function putIdea(idea) {
  const list = ideas.loadIdeas();
  idea.updatedAt = Date.now();
  const at = list.findIndex((x) => x.id === idea.id);
  if (at >= 0) list[at] = idea;
  else list.unshift(idea);
  if (!ideas.saveIdeas(list)) toast("Couldn't save. This browser is blocking storage.");
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
  toast('Added to Ideas');
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
  const note = `Competitor: ${a.name} (${a.seller || 'unknown developer'}), ${g ? `#${g.rank} in ${a.genre} Top Grossing, Gap score ${g.gap}, ` : ''}${fmt(a.ratings)} ratings, ${(a.rating || 0).toFixed(1)}★, updated ${ago(a.updated)}.`;
  addIdea({ kw, cc: a.cc, category: a.genre || '' }, { name: `Better ${a.name.split(/[:\-–—|]/)[0].trim()}`, notes: note });
}

function ideasShell() {
  return `
  <p class="intro">Turn promising keywords into app ideas. Write down why you'd win and how you'll charge, and see how ready each idea is. Ideas stay on this device.</p>
  <div class="row">
    <button class="btn" type="button" data-act="idea-new">New idea</button>
    <button class="btn ghost" type="button" data-act="idea-copy">Copy all as text</button>
  </div>
  <div id="out"></div>`;
}

function ideaCard(i) {
  const r = ideas.readiness(i);
  const snap = i.snapshot;
  const meta = [i.kw ? `"${i.kw}"` : '', CNAME[i.cc] || '', i.category].filter(Boolean).join(' · ');
  const blurb = i.why || i.summary?.pitch || '';
  return `<li><button class="idea" type="button" data-idea="${esc(i.id)}">
    <span class="idea-head"><b>${esc(i.name || 'Untitled idea')}</b>${snap ? `<span class="score-pill ${verdictFor(snap.opp).key}">${snap.opp}</span>` : ''}</span>
    ${meta ? `<span class="idea-meta">${esc(meta)}</span>` : ''}
    <span class="tags">
      <span class="tag status-${esc(i.status)}">${esc(ideas.STATUS_LABEL[i.status] || i.status)}</span>
      ${i.priceModel ? `<span class="tag info">${esc(ideas.PRICE_LABEL[i.priceModel])}${i.price ? ` · ${esc(i.price)}` : ''}</span>` : ''}
      <span class="tag ${r.done === r.total ? 'good' : 'info'}">Ready ${r.done}/${r.total}</span>
    </span>
    ${blurb ? `<span class="idea-why">${esc(blurb)}</span>` : ''}
  </button></li>`;
}

function ideasOut() {
  const list = ideas.loadIdeas().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!list.length) {
    return `<div class="empty"><p>No ideas yet.</p>
      <p>Check a keyword and tap <b>Add to ideas</b>, or tap <b>New idea</b> to start from scratch.</p></div>`;
  }
  const f = state.ideasFilter;
  const count = (k) => (k === 'all' ? list.length : list.filter((i) => i.status === k).length);
  const chips = [['all', 'All'], ...ideas.STATUSES]
    .map(([k, l]) => `<button class="chip" type="button" data-ifilter="${k}" aria-pressed="${f === k}">${l}<span class="n">${count(k)}</span></button>`)
    .join('');
  const shown = list.filter((i) => f === 'all' || i.status === f);
  return `<div class="chips">${chips}</div>
  ${shown.length ? `<ul class="idea-list">${shown.map(ideaCard).join('')}</ul>` : '<div class="empty"><p>No ideas with this status.</p></div>'}
  <div id="copyFallback"></div>`;
}

const options = (pairs, value) => pairs.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function ideaScoresHtml(i) {
  const s = i.snapshot;
  const check = i.kw ? `<button class="btn small ghost" type="button" data-act="idea-recheck">${s ? 'Check again' : 'Check keyword'}</button>` : '';
  if (!s) return `<p class="note">${i.kw ? 'No scores yet.' : 'Add a keyword to score this idea.'}</p>${check}`;
  return `<div class="facts">
      <div><b>${s.opp}</b><span>opportunity</span></div>
      <div><b>${s.demand}</b><span>demand</span></div>
      <div><b>${s.ease}</b><span>ease</span></div>
      <div><b>${s.money}</b><span>money</span></div>
    </div>
    <p class="note">Checked ${sinceText(s.at)} in ${esc(CNAME[i.cc] || i.cc)}. Scores update whenever you check this keyword again.</p>
    ${check}`;
}

function ideaSummaryHtml(i) {
  const sm = i.summary;
  if (!sm) {
    return `<p class="note">Summarize complaints for "${esc(i.kw || 'its keyword')}" on the Keyword tab and they'll show up here.</p>`;
  }
  return `${sm.pitch ? `<div class="cs-pitch"><span>Pitch</span><p>${esc(sm.pitch)}</p></div>` : ''}
    ${sm.complaints.length ? `<ul class="cs-features">${sm.complaints.map((c) => `<li><b>${esc(c.theme)}</b><span>${c.mentions} ${c.mentions === 1 ? 'mention' : 'mentions'}</span></li>`).join('')}</ul>` : ''}`;
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
      return `<li class="${it.done ? 'done' : ''}"><label><input type="checkbox" id="if-${it.key}" name="${it.key}"${it.done ? ' checked' : ''}><span>${esc(it.label)}</span></label></li>`;
    }
    return `<li class="${it.done ? 'done' : ''}"><span class="mark" aria-hidden="true">${it.done ? '✓' : '○'}</span><span>${esc(it.label)}<small>${esc(READY_HINT[it.key] || '')}</small></span></li>`;
  }).join('');
}

function openIdea(id) {
  const i = getIdea(id);
  if (!i) return;
  sheet.dataset.mode = 'idea';
  sheet.dataset.idea = id;
  sheet.innerHTML = `
  <div class="sheet-head">
    <div class="t"><b>Idea</b><span id="ideaSaved">Changes save automatically</span></div>
    <button class="close" type="button" data-close aria-label="Close">×</button>
  </div>
  <form class="sheet-body idea-form" id="ideaForm" autocomplete="off">
    <label class="field"><span>Name</span><input type="text" id="if-name" name="name" value="${esc(i.name)}"></label>
    <div class="row">
      <label class="field"><span>Status</span><select class="input" id="if-status" name="status">${options(ideas.STATUSES, i.status)}</select></label>
      <label class="field"><span>Country</span><select class="input" id="if-cc" name="cc">${options(COUNTRIES.map(([c, n]) => [c, n]), i.cc)}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>Keyword</span><input type="text" id="if-kw" name="kw" value="${esc(i.kw)}" autocapitalize="none" autocorrect="off"></label>
      <label class="field"><span>Category</span><select class="input" id="if-category" name="category">${options([['', '–'], ...GENRES.map(([, n]) => [n, n])], i.category)}</select></label>
    </div>
    <div class="row">
      <label class="field"><span>How you'll charge</span><select class="input" id="if-priceModel" name="priceModel">${options(ideas.PRICE_MODELS, i.priceModel)}</select></label>
      <label class="field"><span>Price</span><input type="text" id="if-price" name="price" value="${esc(i.price)}" placeholder="e.g. $4.99/month"></label>
    </div>
    <label class="field"><span>Why I'd win</span><textarea id="if-why" name="why" rows="3" placeholder="What will you do better than the top apps?">${esc(i.why)}</textarea></label>
    <section class="section"><h3>Scores</h3><div id="ideaScores">${ideaScoresHtml(i)}</div></section>
    <section class="section"><h3>What users complain about</h3><div id="ideaSummary">${ideaSummaryHtml(i)}</div></section>
    <section class="section"><h3>Ready to build?</h3><ul class="ready" id="ideaReady">${readyHtml(i)}</ul></section>
    <label class="field"><span>Notes</span><textarea id="if-notes" name="notes" rows="4" placeholder="Anything else: features, names, links">${esc(i.notes)}</textarea></label>
    <div id="ideaDelete"><button class="btn danger small" type="button" data-act="idea-delete">Delete idea</button></div>
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
  if (savedNote) savedNote.textContent = 'Saved';
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
    $('#ideaDelete', sheet).innerHTML = `<div class="row" style="align-items:center"><span>Delete "${esc(i.name || 'Untitled idea')}"?</span>
      <button class="btn danger small" type="button" data-act="idea-delete-yes" style="flex:0 0 auto">Delete</button>
      <button class="btn ghost small" type="button" data-act="idea-delete-no" style="flex:0 0 auto">Cancel</button></div>`;
  } else if (act === 'idea-delete-no') {
    $('#ideaDelete', sheet).innerHTML = '<button class="btn danger small" type="button" data-act="idea-delete">Delete idea</button>';
  } else if (act === 'idea-delete-yes') {
    clearTimeout(ideaSaveTimer);
    ideaSaveTimer = null;
    ideas.saveIdeas(ideas.loadIdeas().filter((x) => x.id !== i.id));
    sheet.close();
    toast('Idea deleted');
  }
}

function copyText(text, boxId, okMsg) {
  const fallback = () => {
    const box = $('#' + boxId);
    if (box) {
      box.innerHTML = `<p class="note">Couldn't copy automatically. Select the text below and copy it.</p><textarea readonly rows="8" class="copy-box">${esc(text)}</textarea>`;
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
  $('#viewTitle').textContent = v.title;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#view').innerHTML = v.shell();
  refresh(name);
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
    <button class="close" type="button" data-close aria-label="Close">×</button>
  </div>
  <div class="sheet-body">
    <div class="facts">
      <div><b>${a.ratings ? fmt(a.ratings) : '0'}</b><span>ratings in ${esc(CNAME[a.cc])}</span></div>
      <div><b>${a.rating ? '★ ' + a.rating.toFixed(2) : '–'}</b><span>average rating</span></div>
      <div><b>${year(a.released)}</b><span>first released</span></div>
      <div><b>${a.updated ? ago(a.updated) : '–'}</b><span>last update</span></div>
      <div><b>${esc(a.priceText || (a.price ? a.price : 'Free'))}</b><span>price</span></div>
      <div><b>${esc(a.genre || GNAME[a.genreId] || '–')}</b><span>category</span></div>
    </div>
    ${a.gapInfo?.gap ? `<section class="section"><h3>Gap score ${a.gapInfo.gap} · ${esc(gapVerdict(a.gapInfo.gap).label)}</h3>
      <div class="facts gap-facts">
        <div><b>${a.gapInfo.money}</b><span>money (#${a.gapInfo.rank} in Top Grossing)</span></div>
        <div><b>${a.gapInfo.demand}</b><span>demand (ratings)</span></div>
        <div><b>${a.gapInfo.unhappy}</b><span>unhappy users</span></div>
        <div><b>${a.gapInfo.beatable}</b><span>beatable</span></div>
      </div></section>` : ''}
    <div class="row">
      ${a.url ? `<a class="store-link" href="${esc(a.url)}" target="_blank" rel="noopener">Open in App Store ↗</a>` : ''}
      <button class="btn ghost small" type="button" data-act="app-to-idea" style="flex:0 0 auto">Add to ideas</button>
    </div>
    ${nameIdeas.length ? `<section class="section"><h3>Score words from its name</h3><div class="chips">${nameIdeas.map((i) => `<button class="chip" type="button" data-kw="${esc(i.text)}">${esc(i.text)}</button>`).join('')}</div></section>` : ''}
    <section class="section">
      <h3>What users complain about</h3>
      <div id="complaints">${loading('Reading recent reviews…')}</div>
      <p class="note">Recent 1–3 star reviews from ${esc(CNAME[a.cc])}. Repeated complaints are features a better app could get right.</p>
    </section>
  </div>`;
  if (!sheet.open) sheet.showModal();

  let html;
  try {
    const all = await api.reviews(a.id, a.cc);
    const bad = all.filter((r) => r.stars <= 3).sort((x, y) => x.stars - y.stars).slice(0, 12);
    html = bad.length
      ? bad.map((r) => `<div class="review">
          <span class="stars" aria-label="${r.stars} stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
          <b>${esc(r.title)}</b><p>${esc(r.text.length > 420 ? r.text.slice(0, 419) + '…' : r.text)}</p>
          <div class="when">${r.date ? esc(new Date(r.date).toLocaleDateString()) : ''}${r.version ? ` · version ${esc(r.version)}` : ''}</div>
        </div>`).join('')
      : `<p class="note">${all.length ? `No 1–3 star reviews among the ${all.length} most recent. Users seem happy, so this app is harder to beat.` : "Apple's review feed returned no reviews for this app in this country. This happens for many apps, so it doesn't mean users are happy."}</p>`;
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
    toast('API key saved on this device');
    runSummary(true);
  }
});

view.addEventListener('click', (e) => {
  const t = e.target;
  const app = t.closest('[data-app]');
  if (app) return openApp(app.dataset.app);
  const kw = t.closest('[data-kw]');
  if (kw) return checkKeyword(kw.dataset.kw);
  const row = t.closest('tr[data-cc]');
  if (row) return openCompareRow(row.dataset.cc);
  const saved = t.closest('[data-saved]');
  if (saved) {
    const x = savedList()[Number(saved.dataset.saved)];
    if (x) { setCountry(x.cc); checkKeyword(x.kw); }
    return;
  }
  const pickCc = t.closest('[data-cmp-cc]');
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
  const preset = t.closest('[data-cmp-preset]');
  if (preset) {
    const found = COMPARE_PRESETS.find(([label]) => label === preset.dataset.cmpPreset);
    if (found) { state.cmpCountries = found[1].slice(0, COMPARE_MAX); store.set('cmpCountries', state.cmpCountries); refreshPicker(); }
    return;
  }
  const ideaBtn = t.closest('[data-idea]');
  if (ideaBtn) return openIdea(ideaBtn.dataset.idea);
  const filter = t.closest('[data-ifilter]');
  if (filter) { state.ideasFilter = filter.dataset.ifilter; refresh('ideas'); return; }
  const fromSaved = t.closest('[data-idea-saved]');
  if (fromSaved) {
    const x = savedList()[Number(fromSaved.dataset.ideaSaved)];
    if (x) addIdea({ kw: x.kw, cc: x.cc, report: { empty: false, opportunity: x.opp, demand: x.demand, ease: x.ease, money: x.money } });
    return;
  }
  const del = t.closest('[data-del]');
  if (del) {
    const list = savedList();
    list.splice(Number(del.dataset.del), 1);
    store.set('saved', list);
    refresh('saved');
    toast('Removed from Saved');
    return;
  }
  const act = t.closest('[data-act]')?.dataset.act;
  const topKind = t.closest('[data-top-kind]')?.dataset.topKind;
  if (topKind) { state.top.kind = topKind; render(); return; }
  if (act === 'nightly-retry') { ensureNightly(); refresh('niches'); return; }
  const mode = t.closest('[data-mode]')?.dataset.mode;
  if (mode && mode !== state.nicheMode) { state.nicheMode = mode; store.set('nicheMode', mode); render(); return; }
  const genre = t.closest('[data-open-genre]')?.dataset.openGenre;
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
    if (!list.length) toast('No ideas to copy yet');
    else copyText(ideas.ideasToText(list, { countryName: (c) => CNAME[c] || c }), 'copyFallback', 'Copied all ideas');
  }
  if (act === 'cs-key-cancel') { Object.assign(state.cs, { keyForm: false, needsKey: false, error: null }); refreshCs(); }
  if (act === 'cs-key-remove') { cs.setKey(''); refresh('saved'); toast('API key removed'); }
});

view.addEventListener('change', (e) => {
  if (e.target.id === 'topCc') {
    state.top.cc = e.target.value;
    store.set('topCc', state.top.cc);
    if (state.top.cc) ensureNightlyCountry(state.top.cc);
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

// ---------- country picker ----------
const countrySel = $('#country');
countrySel.innerHTML = REGIONS.map((region) => `<optgroup label="${esc(region)}">${
  COUNTRIES.filter((c) => c[3] === region).map(([c, , short]) => `<option value="${c}">${esc(short)}</option>`).join('')
}</optgroup>`).join('');
countrySel.value = state.country;

function setCountry(cc) {
  if (!CNAME[cc] || cc === state.country) return;
  state.country = cc;
  countrySel.value = cc;
  store.set('country', cc);
}

countrySel.addEventListener('change', () => {
  const had = { niche: !!state.niche.result, kw: state.kw.result?.kw };
  setCountry(countrySel.value);
  state.niche.result = null;
  state.kw.result = null;
  const name = current();
  if (name === 'niches' && state.nicheMode === 'all') { loadAuto(); refresh(name); }
  else if (name === 'niches' && had.niche) runNiche();
  else if (name === 'keyword' && had.kw) runKeyword(had.kw);
  else refresh(name);
});

render();
