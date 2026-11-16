// Data layer: Apple's public App Store endpoints, called straight from the browser.
// All of these send `Access-Control-Allow-Origin: *`, so no server is needed.
// Responses are trimmed to the fields we use, cached in localStorage for a few
// hours, and requests are spaced out because Apple rate-limits (roughly 20/min).

const BASE = 'https://itunes.apple.com';
const CACHE_PREFIX = 'aof-cache:';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const GAP_MS = 800; // minimum time between two requests to Apple

export const CHARTS = {
  grossing: 'topgrossingapplications',
  paid: 'toppaidapplications',
  free: 'topfreeapplications',
};

export class RateLimitError extends Error {}

// ---------- cache ----------
const memory = new Map();

function cacheGet(key) {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.d;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (raw) {
      const v = JSON.parse(raw);
      if (Date.now() - v.t < CACHE_TTL) {
        memory.set(key, v);
        return v.d;
      }
      localStorage.removeItem(CACHE_PREFIX + key);
    }
  } catch { /* storage unavailable */ }
  return null;
}

function cacheSet(key, d) {
  const v = { t: Date.now(), d };
  memory.set(key, v);
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v));
  } catch {
    // Storage full: drop all cached responses and try once more.
    pruneCache();
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v)); } catch { /* give up */ }
  }
}

export function pruneCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ---------- throttled fetch ----------
let chain = Promise.resolve();
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function throttled(fn) {
  const p = chain.then(async () => {
    const wait = Math.max(0, last + GAP_MS - Date.now());
    if (wait) await sleep(wait);
    last = Date.now();
    return fn();
  });
  chain = p.catch(() => {});
  return p;
}

async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await throttled(() => fetch(url));
    if (res.status === 403 || res.status === 429) {
      if (attempt < 2) { await sleep(4000 * (attempt + 1)); continue; }
      throw new RateLimitError('Apple is limiting requests');
    }
    if (!res.ok) throw new Error(`App Store returned ${res.status}`);
    return res.json();
  }
}

async function cached(key, loader) {
  const hit = cacheGet(key);
  if (hit) return hit;
  const d = await loader();
  cacheSet(key, d);
  return d;
}

// ---------- normalizers ----------
function normApp(r) {
  return {
    id: String(r.trackId),
    name: r.trackName || '',
    seller: r.sellerName || r.artistName || '',
    ratings: r.userRatingCount || 0,
    rating: r.averageUserRating || 0,
    price: r.price || 0,
    priceText: r.formattedPrice || '',
    released: r.releaseDate || '',
    updated: r.currentVersionReleaseDate || '',
    genreId: String(r.primaryGenreId || ''),
    genre: r.primaryGenreName || '',
    icon: r.artworkUrl100 || r.artworkUrl60 || '',
    url: r.trackViewUrl || '',
  };
}

function normChartEntry(e) {
  const imgs = e['im:image'] || [];
  return {
    id: String(e.id?.attributes?.['im:id'] || ''),
    name: e['im:name']?.label || '',
    seller: e['im:artist']?.label || '',
    icon: imgs.length ? imgs[imgs.length - 1].label : '',
    genreId: String(e.category?.attributes?.['im:id'] || ''),
  };
}

// ---------- public API ----------

/** Top apps for a search term in one storefront (same order as App Store search). */
export function search(term, country, limit = 25) {
  const t = term.trim().toLowerCase();
  return cached(`s:${country}:${limit}:${t}`, async () => {
    const url = `${BASE}/search?term=${encodeURIComponent(t)}&country=${country}&entity=software&limit=${limit}`;
    const d = await getJSON(url);
    return (d.results || []).filter((r) => r.wrapperType === 'software' || r.kind === 'software').map(normApp);
  });
}

/** A category chart (grossing / paid / free), up to 100 apps. */
export function chart(country, genreId, type = 'grossing') {
  return cached(`c:${country}:${genreId}:${type}`, async () => {
    const url = `${BASE}/${country}/rss/${CHARTS[type]}/limit=100/genre=${genreId}/json`;
    const d = await getJSON(url);
    let entries = d.feed?.entry || [];
    if (!Array.isArray(entries)) entries = [entries];
    return entries.map(normChartEntry).filter((e) => e.id);
  });
}

/** Full details (ratings, dates, price) for a list of app ids. Returns a Map id → app. */
export async function lookup(ids, country) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const apps = await cached(`l:${country}:${batch.join(',')}`, async () => {
      const d = await getJSON(`${BASE}/lookup?id=${batch.join(',')}&country=${country}`);
      return (d.results || []).map(normApp);
    });
    apps.forEach((a) => out.set(a.id, a));
  }
  return out;
}

/** The 50 most recent written reviews for an app in one storefront. */
export function reviews(id, country) {
  return cached(`r:${country}:${id}`, async () => {
    const d = await getJSON(`${BASE}/${country}/rss/customerreviews/page=1/id=${id}/sortby=mostrecent/json`);
    let entries = d.feed?.entry || [];
    if (!Array.isArray(entries)) entries = [entries];
    return entries
      .filter((e) => e['im:rating'])
      .map((e) => ({
        stars: Number(e['im:rating'].label),
        title: e.title?.label || '',
        text: e.content?.label || '',
        date: e.updated?.label || '',
        version: e['im:version']?.label || '',
      }));
  });
}
