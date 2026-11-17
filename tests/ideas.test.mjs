import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdea, findIdea, readiness, ideasToText, titleCase, snapshotOf, summaryOf } from '../js/ideas.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const report = { empty: false, opportunity: 62, demand: 55, ease: 60, money: 70 };
const entry = { at: NOW, result: { pitch: 'Plant care without the paywall.', complaints: [{ theme: 'Paywall', mentions: 7, detail: 'x' }, { theme: 'Ads', mentions: 2 }] } };

test('titleCase', () => {
  assert.equal(titleCase('plant care app'), 'Plant Care App');
  assert.equal(titleCase('  budget planner '), 'Budget Planner');
  assert.equal(titleCase('家計簿'), '家計簿');
});

test('createIdea fills defaults and snapshots', () => {
  const i = createIdea({ kw: 'plant care', cc: 'de', category: 'Lifestyle', report, summary: entry, now: NOW });
  assert.equal(i.name, 'Plant Care');
  assert.equal(i.status, 'idea');
  assert.deepEqual(i.snapshot, { opp: 62, demand: 55, ease: 60, money: 70, at: NOW });
  assert.equal(i.summary.pitch, 'Plant care without the paywall.');
  assert.deepEqual(i.summary.complaints, [{ theme: 'Paywall', mentions: 7 }, { theme: 'Ads', mentions: 2 }]);
  assert.equal(createIdea({ now: NOW }).name, 'Untitled idea');
});

test('snapshotOf and summaryOf ignore empty input', () => {
  assert.equal(snapshotOf({ empty: true }), null);
  assert.equal(snapshotOf(null), null);
  assert.equal(summaryOf(null), null);
});

test('findIdea matches keyword case-insensitively within one country', () => {
  const list = [createIdea({ kw: 'Plant Care', cc: 'us' }), createIdea({ kw: 'plant care', cc: 'de' })];
  assert.equal(findIdea(list, ' plant care', 'de'), list[1]);
  assert.equal(findIdea(list, 'plant care', 'jp'), undefined);
  assert.equal(findIdea(list, '', 'us'), undefined);
});

test('readiness combines automatic and manual checks', () => {
  const i = createIdea({ kw: 'x', report, summary: entry, now: NOW });
  let r = readiness(i);
  assert.equal(r.total, 5);
  assert.equal(r.done, 2); // score 62 >= 55, complaint with 7 mentions
  i.priceModel = 'one-time';
  i.why = 'Free scanning and no weekly subscription.';
  i.buildable = true;
  r = readiness(i);
  assert.equal(r.done, 5);

  const bare = createIdea({ kw: 'y' });
  assert.equal(readiness(bare).done, 0);
  bare.complaintOk = true; // ticked by hand when no summary
  assert.equal(readiness(bare).items.find((x) => x.key === 'complaintOk').done, true);
  bare.why = 'too short';
  assert.equal(readiness(bare).items.find((x) => x.key === 'why').done, false);
});

test('ideasToText', () => {
  const i = createIdea({ kw: 'plant care', cc: 'de', category: 'Lifestyle', report, summary: entry, now: NOW });
  i.priceModel = 'one-time';
  i.price = '$9.99';
  const t = ideasToText([i], { countryName: () => 'Germany', now: NOW });
  assert.match(t, /^# App ideas \(2026-11-16\)/);
  assert.match(t, /## Plant Care \(Idea\)/);
  assert.match(t, /Keyword: plant care \(Germany\) · Lifestyle/);
  assert.match(t, /Charging: Free download \+ one-time unlock, \$9\.99/);
  assert.match(t, /Top complaints: Paywall \(7\), Ads \(2\)/);
  assert.match(t, /Ready: 3\/5/);
});
