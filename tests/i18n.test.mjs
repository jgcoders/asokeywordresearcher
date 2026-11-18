import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, setLang, cnt } from '../js/i18n.js';
import { COUNTRIES, GENRES } from '../js/constants.js';
import { STATUSES, PRICE_MODELS, readiness, createIdea } from '../js/ideas.js';
import { verdictFor, gapVerdict, categoryVerdict, nicheScore, nicheReport } from '../js/scoring.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const js = (f) => fs.readFileSync(path.join(here, '..', 'js', f), 'utf8');

// Words that are the same in Polish.
const SAME = new Set(['Australia', 'Austria', 'Korea', 'Status', 'Gap {n}', 'English']);

function literalArgs(src) {
  // first argument of t('…') / t("…")
  const out = [];
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(src))) out.push(m[2].replace(/\\'/g, "'").replace(/\\"/g, '"'));
  return out;
}

function blockStrings(src, name) {
  const start = src.indexOf(`const ${name} = `);
  assert.ok(start >= 0, `${name} not found`);
  // walk to the matching closing bracket, skipping strings and template literals
  let i = src.indexOf('=', start) + 1;
  while (/\s/.test(src[i])) i++;
  const open = src[i];
  const close = { '[': ']', '{': '}' }[open];
  let depth = 0;
  let end = i;
  for (; end < src.length; end++) {
    const ch = src[end];
    if (ch === "'" || ch === '"' || ch === '`') {
      for (end++; end < src.length && src[end] !== ch; end++) if (src[end] === '\\') end++;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close && --depth === 0) break;
  }
  // drop arrow-function bodies (navigation code) so only data strings remain
  const block = src.slice(i, end + 1).replace(/=>\s*\{[^]*?\n {4}\},?/g, '').replace(/=>\s*`[^`]*`/g, '').replace(/=>[^,\n]*/g, '');
  const out = [];
  const re = /(['"])((?:\\.|(?!\1).)*)\1/g;
  let m;
  while ((m = re.exec(block))) {
    const s = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (/^[#.[]/.test(s) || s.includes('[data-') || /^[a-z-]+$/.test(s) || s.length < 3) continue; // ids, selectors, keys
    out.push(s);
  }
  return out;
}

function untranslated(keys) {
  setLang('pl');
  const miss = [...new Set(keys)].filter((k) => k && !SAME.has(k) && t(k) === k);
  setLang('en');
  return miss;
}

test('every t("…") literal in the app has a Polish translation', () => {
  const keys = ['app.js', 'complaints.js', 'ideas.js'].flatMap((f) => literalArgs(js(f)));
  assert.ok(keys.length > 150, `found only ${keys.length} keys`);
  assert.deepEqual(untranslated(keys), []);
});

test('texts passed to t() through variables have Polish translations', () => {
  const app = js('app.js');
  const keys = [
    ...['INFO', 'GUIDE', 'WELCOME', 'READY_HINT', 'TOP_KINDS', 'COMPARE_PRESETS', 'CHART_LABEL'].flatMap((n) => blockStrings(app, n)),
    ...COUNTRIES.flatMap(([, name, short, region]) => [name, short, region]),
    ...GENRES.map(([, n]) => n),
    ...STATUSES.map(([, l]) => l),
    ...PRICE_MODELS.map(([, l]) => l),
    ...readiness(createIdea({ kw: 'x' })).items.map((i) => i.label),
    ...[0, 45, 70].flatMap((n) => [verdictFor(n).label, gapVerdict(n).label, categoryVerdict(n).label]),
    ...[{ small: 0, fresh: 0, stale: 0, medianRatings: 10 }, { small: 30, fresh: 0, stale: 0, medianRatings: 3000 }, { small: 60, fresh: 10, stale: 0, medianRatings: 100000 }]
      .map((r) => nicheScore(r).sizeLabel),
    ...[[], [{ ratings: 100 }, { ratings: 100 }, { ratings: 1e6 }], Array.from({ length: 10 }, (_, i) => ({ ratings: i < 3 ? 100 : 1e6 })), Array.from({ length: 10 }, () => ({ ratings: 1e6 }))]
      .flatMap((apps) => [nicheReport(apps).read, nicheReport(apps, { isGrossing: false }).read]),
    'Waiting', 'Checking…', 'Failed', 'Skipped',
  ];
  assert.deepEqual(untranslated(keys), []);
});

test('placeholders survive translation', () => {
  setLang('pl');
  const keys = ['app.js', 'complaints.js', 'ideas.js'].flatMap((f) => literalArgs(js(f)));
  const bad = [...new Set(keys)].filter((k) => {
    const want = (k.match(/\{\w+\}/g) || []).sort().join();
    const got = (t(k).match(/\{\w+\}/g) || []).sort().join();
    return want !== got;
  });
  setLang('en');
  assert.deepEqual(bad, []);
});

test('Polish plurals', () => {
  setLang('pl');
  assert.equal(cnt(1, 'review'), '1 recenzja');
  assert.equal(cnt(3, 'review'), '3 recenzje');
  assert.equal(cnt(5, 'review'), '5 recenzji');
  assert.equal(cnt(13, 'review'), '13 recenzji');
  assert.equal(cnt(24, 'review'), '24 recenzje');
  assert.equal(cnt(2100, 'rating', '2.1k'), '2.1k ocen');
  setLang('en');
  assert.equal(cnt(1, 'review'), '1 review');
  assert.equal(cnt(2, 'review'), '2 reviews');
});
