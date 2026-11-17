#!/usr/bin/env node
// Nightly scan: reads Top Grossing in every country × category, scores every
// app (Gap score) and every category, finds trends against earlier days, and
// writes JSON files that the app loads.
//
// Usage:
//   node scripts/nightly-scan.mjs --out <dir> [--prev <dir>] [--countries us,de] [--genres 6013,6015]
//
// --prev is the previous output (the `data` branch); its ranks/ folder is used
// for trends and carried forward. Uses the same scoring code as the app.

import fs from 'node:fs';
import path from 'node:path';
import * as api from '../js/api.js';
import { COUNTRIES, GENRES, GNAME } from '../js/constants.js';
import { nicheReport, appGap, ratingBaseline, categoryScore, pickIdeas } from '../js/scoring.js';

const DAY = 86400000;
const KEEP_RANK_DAYS = 8; // trend window: compare with ~7 days ago
const MAX_FAILURE_SHARE = 0.25; // publish nothing if more than this many categories fail
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
if (!args.out) {
  console.error('Usage: node scripts/nightly-scan.mjs --out <dir> [--prev <dir>] [--countries us,de] [--genres 6013,6015]');
  process.exit(2);
}
const pick = (list, arg, key) => (arg ? list.filter((x) => arg.split(',').includes(String(x[key]))) : list);
const countries = pick(COUNTRIES, args.countries, 0).map((c) => c[0]);
const genres = pick(GENRES, args.genres, 0).map((g) => String(g[0]));

const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);

// ---------- previous ranks (for trends) ----------
function loadPrevRanks(prevDir) {
  const dir = prevDir && path.join(prevDir, 'ranks');
  if (!dir || !fs.existsSync(dir)) return { files: [], base: null };
  const files = fs.readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => ({ f, date: f.slice(0, 10), age: Math.round((now - Date.parse(f.slice(0, 10))) / DAY) }))
    .filter((x) => x.age >= 1 && x.age <= KEEP_RANK_DAYS)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Compare with the snapshot closest to 7 days ago (the oldest one we kept).
  const baseFile = files.find((x) => x.age <= 7) || files[files.length - 1];
  const base = baseFile ? { date: baseFile.date, map: JSON.parse(fs.readFileSync(path.join(dir, baseFile.f), 'utf8')) } : null;
  return { files: files.map((x) => path.join(dir, x.f)), base };
}

const prev = loadPrevRanks(args.prev);
console.log(`Scanning ${countries.length} countries × ${genres.length} categories. Trends vs ${prev.base?.date || 'nothing yet'}.`);

// ---------- scan ----------
const round2 = (n) => Math.round((n || 0) * 100) / 100;

function entryFor(a, g, prevList) {
  let pr;
  if (prevList) {
    const at = prevList.indexOf(a.id);
    pr = at >= 0 ? at + 1 : -1; // -1: was not in the chart then
  }
  return {
    id: a.id, n: a.name, s: a.seller, cc: a.cc, g: a.genreChart, rk: a.rank,
    r: a.ratings || 0, a: round2(a.rating), ca: round2(a.currentRating), cn: a.currentRatings || 0,
    up: (a.updated || '').slice(0, 10), rl: (a.released || '').slice(0, 10),
    p: a.priceText || '', ic: a.icon || '', u: a.url || '',
    gap: g.gap, m: g.money, d: g.demand, uh: g.unhappy, b: g.beatable,
    ...(pr !== undefined ? { pr } : {}),
  };
}

async function scanCategory(cc, gid) {
  const chart = await api.chart(cc, gid, 'grossing');
  if (!chart.length) return null;
  const details = await api.lookup(chart.map((c) => c.id), cc);
  const apps = chart.map((c, i) => ({ ...c, ...(details.get(c.id) || {}), rank: i + 1, cc, genreChart: gid }));
  const rep = nicheReport(apps, { isGrossing: true, now });
  const baseline = ratingBaseline(apps);
  const gaps = apps.map((a) => appGap(a, { rank: a.rank, baseline, now }));
  const cat = categoryScore(rep, gaps.map((g) => g.gap));
  const prevList = prev.base?.map?.[cc]?.[gid];
  const entries = apps.map((a, i) => entryFor(a, gaps[i], prevList));
  return { chartIds: chart.map((c) => c.id), rep, cat, entries, baseline };
}

const categories = [];
const countryFiles = {};
const ranksToday = {};
const allEntries = [];
const failures = [];
const total = countries.length * genres.length;
let done = 0;
const started = Date.now();

for (const cc of countries) {
  countryFiles[cc] = { cc, generatedAt: new Date(now).toISOString(), categories: [] };
  for (const gid of genres) {
    let res = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await scanCategory(cc, gid);
        break;
      } catch (e) {
        if (attempt === 0 && e instanceof api.RateLimitError) {
          console.warn(`  rate limited at ${cc}/${gid}, waiting 60s`);
          await sleep(60000);
          continue;
        }
        failures.push({ cc, g: gid, error: String(e.message || e) });
        break;
      }
    }
    done++;
    if (!res) continue;
    const { chartIds, rep, cat, entries, baseline } = res;
    (ranksToday[cc] ??= {})[gid] = chartIds;
    allEntries.push(...entries);
    const byGap = [...entries].sort((x, y) => y.gap - x.gap);
    const smallEarner = entries.find((e) => e.r > 0 && e.r < 5000);
    const row = {
      cc, g: gid, s: cat.score, n: cat.niche, gt: cat.gapTop, sz: cat.sizeLabel,
      bl: round2(baseline), sm: rep.small, fr: rep.fresh, st: rep.stale, md: Math.round(rep.medianRatings),
      ideas: pickIdeas(rep.ideas.map((i) => i.text), GNAME[gid]),
      ex: smallEarner ? { n: smallEarner.n, rk: smallEarner.rk, r: smallEarner.r } : null,
      top: byGap[0] ? { n: byGap[0].n, gap: byGap[0].gap } : null,
    };
    categories.push(row);
    countryFiles[cc].categories.push({ ...row, apps: byGap.slice(0, 10) });
    if (done % 24 === 0 || done === total) {
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`  ${done}/${total} categories · ${mins} min · ${failures.length} failed`);
    }
  }
}

if (failures.length > total * MAX_FAILURE_SHARE) {
  console.error(`Too many failures (${failures.length} of ${total}); not publishing.`);
  console.error(failures.slice(0, 10));
  process.exit(1);
}

// ---------- leaderboards ----------
// The same app often ranks in many countries; keep its best entry and count the rest.
function bestPerApp(list, better) {
  const best = new Map();
  const count = new Map();
  for (const e of list) {
    count.set(e.id, (count.get(e.id) || 0) + 1);
    const cur = best.get(e.id);
    if (!cur || better(e, cur)) best.set(e.id, e);
  }
  return [...best.values()].map((e) => ({ ...e, ic2: count.get(e.id) }));
}

const leaderboard = bestPerApp(allEntries, (a, b) => a.gap > b.gap)
  .sort((a, b) => b.gap - a.gap)
  .slice(0, 150);

const hasTrend = !!prev.base;
const risers = hasTrend
  ? bestPerApp(allEntries.filter((e) => e.pr > 0 && e.rk <= 50 && e.pr - e.rk >= 10), (a, b) => (a.pr - a.rk) > (b.pr - b.rk))
    .sort((a, b) => (b.pr - b.rk) - (a.pr - a.rk))
    .slice(0, 60)
  : [];
const newcomers = hasTrend
  ? bestPerApp(allEntries.filter((e) => e.pr === -1 && e.rk <= 60 && e.r < 5000), (a, b) => a.rk < b.rk)
    .sort((a, b) => a.rk - b.rk)
    .slice(0, 60)
  : [];

// ---------- write ----------
const out = args.out;
fs.mkdirSync(path.join(out, 'country'), { recursive: true });
fs.mkdirSync(path.join(out, 'ranks'), { recursive: true });

const summary = {
  v: 1,
  generatedAt: new Date(now).toISOString(),
  minutes: Math.round((Date.now() - started) / 60000),
  trendSince: prev.base?.date || null,
  countries,
  genres,
  scanned: categories.length,
  failed: failures.length,
  categories,
  leaderboard,
  risers,
  newcomers,
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary));
for (const [cc, file] of Object.entries(countryFiles)) {
  fs.writeFileSync(path.join(out, 'country', `${cc}.json`), JSON.stringify(file));
}
fs.writeFileSync(path.join(out, 'ranks', `${today}.json`), JSON.stringify(ranksToday));
for (const f of prev.files) {
  const name = path.basename(f);
  if (name !== `${today}.json`) fs.copyFileSync(f, path.join(out, 'ranks', name));
}
fs.writeFileSync(path.join(out, 'README.md'), `# Nightly App Store scan data

Written by \`scripts/nightly-scan.mjs\` (workflow: \`.github/workflows/nightly-scan.yml\`).
This branch is replaced on every run. Last run: ${summary.generatedAt}.

- \`summary.json\`: category scores for every country, top Gap-score apps, risers and new earners
- \`country/<cc>.json\`: the 10 highest Gap-score apps of every category in one country
- \`ranks/<date>.json\`: Top Grossing order per country and category, kept ${KEEP_RANK_DAYS} days for trends
`);

const kb = (f) => Math.round(fs.statSync(path.join(out, f)).size / 1024);
console.log(`Done in ${summary.minutes} min: ${categories.length} categories, ${failures.length} failed, summary.json ${kb('summary.json')} KB.`);
