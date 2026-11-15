// Scoring: pure functions, no network or DOM, so they can be unit tested.
//
// Ratings counts stand in for downloads (Apple publishes no download numbers),
// Top Grossing presence stands in for revenue. These are signals, not facts.

export const DAY = 86400000;

export const LIMITS = {
  beatableRatings: 1000, // a top-10 app with fewer ratings than this is beatable
  smallEarnerRatings: 5000, // a Top Grossing app with fewer ratings than this is a "small earner"
  lowRating: 4.0, // average rating below this means unhappy users
  minRatingsForRating: 20, // ignore the average when an app has too few ratings
  staleDays: 365, // not updated in a year
  newDays: 540, // released within ~18 months
};

export const clamp = (n, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

export function daysSince(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  return Number.isNaN(t) ? Infinity : Math.floor((now - t) / DAY);
}

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const hasLatin = (w) => /[a-z0-9]/.test(w);

/** True when every word of the keyword appears in the title (plural-tolerant). */
export function titleMatches(title, keyword) {
  const words = tokens(keyword);
  if (!words.length) return false;
  const set = new Set(tokens(title));
  const lower = String(title || '').toLowerCase().normalize('NFKC');
  return words.every((w) =>
    hasLatin(w)
      ? set.has(w) || set.has(w + 's') || set.has(w + 'es') || (w.endsWith('s') && set.has(w.slice(0, -1)))
      : lower.includes(w), // CJK titles have no spaces between words
  );
}

/** Per-app signals used for chips and scores. */
export function appFlags(app, { now = Date.now(), grossingIds = null } = {}) {
  const ratings = app.ratings || 0;
  return {
    beatable: ratings < LIMITS.beatableRatings,
    smallEarner: ratings < LIMITS.smallEarnerRatings,
    lowRated: ratings >= LIMITS.minRatingsForRating && app.rating > 0 && app.rating < LIMITS.lowRating,
    stale: daysSince(app.updated, now) > LIMITS.staleDays,
    isNew: daysSince(app.released, now) < LIMITS.newDays,
    grossing: grossingIds ? grossingIds.has(String(app.id)) : false,
    paid: (app.price || 0) > 0,
  };
}

/**
 * Score a keyword from its top search results.
 *  demand: how many people use apps for this search (combined ratings, log scale)
 *  ease:   how beatable the top 10 are (typical ratings, keyword in titles, weak apps)
 *  money:  how many of the top 10 earn (Top Grossing) or charge upfront
 *  opportunity: weighted geometric mean, so one very weak part pulls it down
 */
export function keywordReport(apps, keyword, { grossingIds = null, now = Date.now() } = {}) {
  const top = apps.slice(0, 10);
  const n = top.length;
  if (!n) {
    return { empty: true, n: 0, opportunity: 0, demand: 0, ease: 0, money: 0, verdict: verdictFor(0), facts: {} };
  }

  const ratings = top.map((a) => a.ratings || 0);
  const totalRatings = ratings.reduce((s, r) => s + r, 0);
  const medianRatings = median(ratings);
  const flags = top.map((a) => appFlags(a, { now, grossingIds }));

  const titleHits = top.filter((a) => titleMatches(a.name, keyword)).length;
  const weak = flags.filter((f) => f.beatable || f.lowRated || f.stale).length;
  const grossingHits = flags.filter((f) => f.grossing).length;
  const paidHits = flags.filter((f) => f.paid).length;

  // 100 ratings → 0, 1k → 20, 10k → 40, 100k → 60, 1M → 80, 10M → 100
  const demand = Math.round(clamp((Math.log10(totalRatings + 1) - 2) * 20));

  // Typical app: 10 ratings → 0, 100 → 25, 1k → 50, 10k → 75, 100k → 100
  const typicalStrength = clamp((Math.log10(medianRatings + 1) - 1) * 25);
  const strength = 0.6 * typicalStrength + 0.4 * (titleHits / n) * 100;
  const ease = Math.round(clamp(0.75 * (100 - strength) + 25 * (weak / n)));

  const money = Math.round(clamp(grossingHits * 20 + paidHits * 10));

  const opportunity = Math.round(
    Math.pow(Math.max(demand, 1), 0.35) * Math.pow(Math.max(ease, 1), 0.4) * Math.pow(Math.max(money, 15), 0.25),
  );

  return {
    empty: false,
    n,
    opportunity,
    demand,
    ease,
    money,
    verdict: verdictFor(opportunity),
    flags,
    facts: { totalRatings, medianRatings, titleHits, weak, grossingHits, paidHits },
  };
}

export function verdictFor(score) {
  if (score >= 60) return { key: 'strong', label: 'Strong' };
  if (score >= 40) return { key: 'maybe', label: 'Worth a look' };
  return { key: 'weak', label: 'Weak' };
}

/** Summary of a category chart. */
export function nicheReport(apps, { isGrossing = true, now = Date.now() } = {}) {
  const flags = apps.map((a) => appFlags(a, { now }));
  const total = apps.length;
  const small = flags.filter((f) => f.smallEarner).length;
  const fresh = flags.filter((f) => f.isNew).length;
  const stale = flags.filter((f) => f.stale).length;
  const lowRated = flags.filter((f) => f.lowRated).length;
  const share = total ? small / total : 0;

  let read;
  if (!total) read = 'This chart is empty for this country.';
  else if (share >= 0.25) read = isGrossing
    ? 'Many small apps make money here. A newcomer can realistically get a share.'
    : 'Many small apps reach this chart. Visibility is achievable.';
  else if (share >= 0.1) read = 'Some room for smaller apps, but the top is held by big ones.';
  else read = 'Dominated by big, established apps. Hard for a newcomer.';

  const ideaSource = apps.filter((a, i) => flags[i].smallEarner || flags[i].isNew).map((a) => a.name);

  return {
    total,
    small,
    fresh,
    stale,
    lowRated,
    medianRatings: median(apps.map((a) => a.ratings || 0)),
    read,
    flags,
    ideas: titleIdeas(ideaSource.length >= 5 ? ideaSource : apps.map((a) => a.name)),
  };
}

const STOP = new Set(
  ('the and for with your you my me our app apps a an of to in on by at or is it this that from free pro plus lite hd ' +
    'premium best top official new edition version mobile ios iphone ipad der die das und für mit von la le les de des et')
    .split(' '),
);

/**
 * Words and two-word phrases that repeat across app names.
 * Counted once per app, so brand names (which appear once) drop out.
 */
export function titleIdeas(names, { min = 2, limit = 16 } = {}) {
  const counts = new Map();
  const add = (k) => counts.set(k, (counts.get(k) || 0) + 1);

  for (const name of names) {
    const words = tokens(name);
    const seen = new Set();
    words.forEach((w, i) => {
      const ok = (x) => x && x.length > 1 && !STOP.has(x) && !/^\d+$/.test(x);
      if (ok(w)) seen.add(w);
      const next = words[i + 1];
      if (ok(w) && ok(next)) seen.add(`${w} ${next}`);
    });
    seen.forEach(add);
  }

  return [...counts.entries()]
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1] || (b[0].includes(' ') ? 1 : 0) - (a[0].includes(' ') ? 1 : 0))
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
}

export function mostCommon(values) {
  const c = new Map();
  values.filter(Boolean).forEach((v) => c.set(v, (c.get(v) || 0) + 1));
  let best = null;
  let n = 0;
  c.forEach((k, v) => { if (k > n) { n = k; best = v; } });
  return best;
}
