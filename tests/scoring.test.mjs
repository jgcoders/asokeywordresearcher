import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keywordReport, nicheReport, titleIdeas, titleMatches, appFlags, median, mostCommon, verdictFor, DAY,
} from '../js/scoring.js';

const NOW = Date.parse('2026-11-15T00:00:00Z');
const daysAgo = (d) => new Date(NOW - d * DAY).toISOString();
const app = (o = {}) => ({
  id: String(o.id ?? Math.random()), name: 'Some App', ratings: 100, rating: 4.5, price: 0,
  updated: daysAgo(30), released: daysAgo(1000), ...o,
});

test('median', () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('titleMatches handles plurals, punctuation and CJK', () => {
  assert.ok(titleMatches('Plant Care: Watering Reminder', 'plant care'));
  assert.ok(titleMatches('Plants Care', 'plant care'));
  assert.ok(titleMatches('Habit Tracker', 'habit trackers'));
  assert.ok(!titleMatches('Car Care Pro', 'card'));
  assert.ok(titleMatches('マネーフォワード ME - 家計簿アプリ', '家計簿'));
  assert.ok(!titleMatches('Anything', ''));
});

test('appFlags', () => {
  const f = appFlags(app({ ratings: 50, rating: 3.2, updated: daysAgo(400), released: daysAgo(100), price: 2.99, id: '7' }),
    { now: NOW, grossingIds: new Set(['7']) });
  assert.deepEqual(f, { beatable: true, smallEarner: true, lowRated: true, stale: true, isNew: true, grossing: true, paid: true });
  // too few ratings to judge the average
  assert.equal(appFlags(app({ ratings: 5, rating: 1 }), { now: NOW }).lowRated, false);
});

test('keywordReport: empty results', () => {
  const r = keywordReport([], 'x');
  assert.equal(r.empty, true);
  assert.equal(r.opportunity, 0);
});

test('keywordReport: crowded market scores low on ease', () => {
  const giants = Array.from({ length: 10 }, (_, i) => app({ id: i, name: 'Photo Editor X', ratings: 500000 }));
  const r = keywordReport(giants, 'photo editor', { now: NOW });
  assert.ok(r.demand >= 90, `demand ${r.demand}`);
  assert.ok(r.ease <= 10, `ease ${r.ease}`);
  assert.equal(r.verdict.key, 'weak');
});

test('keywordReport: weak competition + money scores high', () => {
  const ids = new Set();
  const apps = Array.from({ length: 10 }, (_, i) => {
    if (i < 4) ids.add(String(i));
    return app({ id: i, name: i % 2 ? 'Tool' : 'Garden Planner', ratings: i < 3 ? 40000 : 300, rating: i > 6 ? 3.5 : 4.6 });
  });
  const r = keywordReport(apps, 'garden planner', { now: NOW, grossingIds: ids });
  assert.equal(r.facts.grossingHits, 4);
  assert.equal(r.facts.titleHits, 5);
  assert.ok(r.ease >= 50, `ease ${r.ease}`);
  assert.ok(r.money >= 80, `money ${r.money}`);
  assert.ok(r.opportunity >= 55, `opportunity ${r.opportunity}`);
});

test('keywordReport: scores stay within 0–100', () => {
  const r = keywordReport([app({ ratings: 0 })], 'a b c', { now: NOW });
  for (const k of ['demand', 'ease', 'money', 'opportunity']) assert.ok(r[k] >= 0 && r[k] <= 100, `${k}=${r[k]}`);
});

test('verdictFor thresholds', () => {
  assert.equal(verdictFor(60).key, 'strong');
  assert.equal(verdictFor(59).key, 'maybe');
  assert.equal(verdictFor(39).key, 'weak');
});

test('titleIdeas counts each phrase once per app and drops brands', () => {
  const ideas = titleIdeas([
    'Sleepo: Sleep Sounds', 'Calmy - Sleep Sounds & Rain', 'Sleep Sounds by Zen', 'Rain Sounds Free', 'Sleep Sleep Sleep',
  ]);
  const map = Object.fromEntries(ideas.map((i) => [i.text, i.count]));
  assert.equal(map['sleep sounds'], 3);
  assert.equal(map.sleep, 4);
  assert.equal(map.sleepo, undefined);
  assert.equal(map.free, undefined);
  assert.equal(map.by, undefined);
});

test('nicheReport counts small earners', () => {
  const apps = [
    ...Array.from({ length: 3 }, (_, i) => app({ id: i, ratings: 200, name: 'Tiny Budget' })),
    ...Array.from({ length: 7 }, (_, i) => app({ id: 10 + i, ratings: 900000, name: 'Giant Bank' })),
  ];
  const r = nicheReport(apps, { now: NOW });
  assert.equal(r.total, 10);
  assert.equal(r.small, 3);
  assert.match(r.read, /Many small apps/);
});

test('mostCommon', () => {
  assert.equal(mostCommon(['a', 'b', 'b', '', null]), 'b');
  assert.equal(mostCommon([]), null);
});
