import * as api from './api.js';
import * as cs from './complaints.js';
import { keywordReport, nicheReport, nicheScore, titleIdeas, tokens, daysSince, mostCommon, verdictFor } from './scoring.js';

// ---------- constants ----------
const COUNTRIES = [
  ['us', 'United States', 'US'],
  ['gb', 'United Kingdom', 'UK'],
  ['ca', 'Canada', 'Canada'],
  ['au', 'Australia', 'Australia'],
  ['de', 'Germany', 'Germany'],
  ['jp', 'Japan', 'Japan'],
];
const CNAME = Object.fromEntries(COUNTRIES.map(([c, n]) => [c, n]));

const GENRES = [
  [6018, 'Books'], [6000, 'Business'], [6026, 'Developer Tools'], [6017, 'Education'], [6016, 'Entertainment'],
  [6015, 'Finance'], [6023, 'Food & Drink'], [6014, 'Games'], [6027, 'Graphics & Design'], [6013, 'Health & Fitness'],
  [6012, 'Lifestyle'], [6020, 'Medical'], [6011, 'Music'], [6010, 'Navigation'], [6009, 'News'],
  [6008, 'Photo & Video'], [6007, 'Productivity'], [6006, 'Reference'], [6024, 'Shopping'], [6005, 'Social Networking'],
  [6004, 'Sports'], [6003, 'Travel'], [6002, 'Utilities'], [6001, 'Weather'],
];
const GNAME = Object.fromEntries(GENRES.map(([id, n]) => [String(id), n]));
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

// ---------- state ----------
const state = {
  country: CNAME[store.get('country', 'us')] ? store.get('country', 'us') : 'us',
  niche: { genreId: store.get('nicheGenre', '6013'), chart: store.get('nicheChart', 'grossing'), only: false, result: null, busy: false, error: null, token: 0 },
  kw: { text: '', result: null, busy: false, error: null, token: 0 },
  cmp: { text: '', rows: null, busy: false, error: null, token: 0 },
  nicheMode: store.get('nicheMode', 'all') === 'one' ? 'one' : 'all',
  auto: { busy: false, error: null, token: 0, done: 0, failed: 0, current: '', waiting: false, results: null, country: null, at: 0 },
  cs: { key: null, busy: false, step: '', error: null, needsKey: false, keyForm: false, entry: null, token: 0 },
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
  Object.assign(s, { text: t, busy: true, error: null, rows: COUNTRIES.map(([cc]) => ({ cc, status: 'wait' })) });
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
  const ns = nicheScore(rep);
  const examples = r.apps
    .filter((a, i) => rep.flags[i].smallEarner && a.ratings > 0)
    .slice(0, 2)
    .map((a) => ({ name: a.name, rank: a.rank, ratings: a.ratings }));
  return {
    genreId: String(r.genreId), name, score: ns.score, verdict: ns.verdict, sizeLabel: ns.sizeLabel,
    small: rep.small, fresh: rep.fresh, stale: rep.stale, median: rep.medianRatings,
    ideas: pickIdeas(rep.ideas.map((i) => i.text), name), examples,
  };
}

/** Phrases first, no words from the category's own name, no single words already inside a phrase. */
function pickIdeas(ideas, categoryName, limit = 5) {
  const cat = new Set(tokens(categoryName));
  const isCat = (w) => cat.has(w) || cat.has(w + 's') || cat.has(w.replace(/s$/, ''));
  const useful = ideas.filter((t) => !t.split(' ').every(isCat));
  const phrases = useful.filter((t) => t.includes(' '));
  const inPhrase = new Set(phrases.flatMap((t) => t.split(' ')));
  const words = useful.filter((t) => !t.includes(' ') && !inPhrase.has(t));
  return [...phrases, ...words].slice(0, limit);
}

/** Load the last saved auto-scan for the current country, unless a scan is running. */
function loadAuto() {
  const a = state.auto;
  if (a.busy || a.country === state.country) return;
  const saved = store.get('autoscan:' + state.country, null);
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
  if (!a.error && a.results.length) store.set('autoscan:' + cc, { at: a.at, results: a.results });
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
  niches: { title: 'Niches', shell: () => (state.nicheMode === 'all' ? autoShell() : oneShell()), out: () => (state.nicheMode === 'all' ? autoOut() : oneOut()) },
  keyword: { title: 'Keyword', shell: keywordShell, out: keywordOut },
  compare: { title: 'Countries', shell: compareShell, out: compareOut },
  saved: { title: 'Saved', shell: () => '<div id="out"></div>', out: savedOut },
};

// Niches
const modeSwitch = () => `
  <div class="seg" role="group" aria-label="Scan type">
    <button type="button" data-mode="all" aria-pressed="${state.nicheMode === 'all'}">All categories</button>
    <button type="button" data-mode="one" aria-pressed="${state.nicheMode === 'one'}">One category</button>
  </div>`;

function autoShell() {
  loadAuto();
  return `${modeSwitch()}
  <p class="intro">Scans Top Grossing in all ${GENRES.length} categories and ranks them by how much room there is for small apps, weighed against market size.</p>
  <button class="btn" id="autoBtn" type="button" data-act="autoscan">Scan all categories</button>
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
  const res = a.country === state.country ? a.results : null;
  if (!res || !res.length) {
    if (!a.busy) {
      parts.push(`<div class="empty"><p>Tap <b>Scan all categories</b> to rank every category in ${esc(CNAME[state.country])} by how open it is to small apps.</p>
        <p>The first scan takes 1–2 minutes. Scanning again within 6 hours is almost instant.</p></div>`);
    }
    return parts.join('');
  }
  if (!a.busy) {
    const best = res.filter((n) => n.verdict.key === 'strong').slice(0, 3).map((n) => n.name);
    const lead = best.length ? `Best bets in ${CNAME[state.country]}: <b>${best.map(esc).join(', ')}</b>.` : `No category in ${esc(CNAME[state.country])} scores as Promising right now. Look at the Possible ones.`;
    parts.push(`<p class="read">${lead} Scanned ${sinceText(a.at)}.${a.failed ? ` ${a.failed} ${a.failed === 1 ? 'category' : 'categories'} couldn't be loaded.` : ''}</p>`);
  }
  parts.push(`<ol class="niche-list">${res.map((n, i) => nicheCard(n, i + 1)).join('')}</ol>`);
  parts.push('<p class="note">Score = room for small apps (small earners, new apps, neglected apps) weighed against market size. 65+ Promising, 50–64 Possible. Tap a keyword to score it.</p>');
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
function compareShell() {
  return `
  <p class="intro">Score one keyword in all six countries. Look for a country where demand exists but competition is weaker.</p>
  <form class="form" id="cmpForm">
    <div class="row">
      <input type="search" id="cmpInput" placeholder="e.g. budget planner" enterkeyhint="search" autocapitalize="none" autocorrect="off" autocomplete="off" value="${esc(state.cmp.text)}" aria-label="Keyword to compare">
      <button class="btn" id="cmpBtn" type="submit" style="flex:0 0 auto">Compare</button>
    </div>
  </form>
  <p class="note">German and Japanese users mostly search in their own language. Also try the translated keyword, for example "Pflanzenpflege" or "家計簿".</p>
  <div id="out"></div>`;
}

function compareOut() {
  const s = state.cmp;
  if (!s.rows) {
    return `<div class="empty"><p>Type a keyword and tap <b>Compare</b>. It takes about 15 seconds, because Apple limits how fast we can ask.</p></div>`;
  }
  const done = s.rows.filter((r) => r.status === 'done');
  const best = !s.busy && done.length ? done.reduce((a, b) => (b.result.report.opportunity > a.result.report.opportunity ? b : a)) : null;
  const rows = s.rows.map((row) => {
    const name = esc(COUNTRIES.find(([c]) => c === row.cc)[2]);
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
    <button class="close" type="button" data-del="${i}" aria-label="Remove ${esc(x.kw)}">×</button>
  </li>`).join('')}</ul>
  <div class="row"><button class="btn ghost" type="button" data-act="csv">Copy as CSV</button></div>
  <div id="csvFallback"></div>`;
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
const sheet = $('#sheet');

async function openApp(key) {
  const a = state.apps.get(key);
  if (!a) return;
  const ideas = titleIdeas([a.name], { min: 1, limit: 8 });
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
    ${a.url ? `<a class="store-link" href="${esc(a.url)}" target="_blank" rel="noopener">Open in App Store ↗</a>` : ''}
    ${ideas.length ? `<section class="section"><h3>Score words from its name</h3><div class="chips">${ideas.map((i) => `<button class="chip" type="button" data-kw="${esc(i.text)}">${esc(i.text)}</button>`).join('')}</div></section>` : ''}
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
  if (kw) { sheet.close(); checkKeyword(kw.dataset.kw); }
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
  if (act === 'cs-key-cancel') { Object.assign(state.cs, { keyForm: false, needsKey: false, error: null }); refreshCs(); }
  if (act === 'cs-key-remove') { cs.setKey(''); refresh('saved'); toast('API key removed'); }
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
countrySel.innerHTML = COUNTRIES.map(([c, , short]) => `<option value="${c}">${esc(short)}</option>`).join('');
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
