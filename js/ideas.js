// Idea board: storage and pure helpers. Ideas live in this device's
// localStorage, like saved keywords.

const KEY = 'aof:ideas';

export const STATUSES = [
  ['idea', 'Idea'],
  ['research', 'Researching'],
  ['build', 'Building'],
  ['launched', 'Launched'],
  ['dropped', 'Dropped'],
];
export const STATUS_LABEL = Object.fromEntries(STATUSES);

export const PRICE_MODELS = [
  ['', 'Not decided'],
  ['trial-sub', 'Free trial + subscription'],
  ['one-time', 'Free download + one-time unlock'],
  ['paid', 'Paid upfront'],
  ['freemium', 'Free with optional upgrade'],
];
export const PRICE_LABEL = Object.fromEntries(PRICE_MODELS);

export const READY_SCORE = 55;
export const READY_MENTIONS = 3;
export const READY_WHY_CHARS = 20;

// ---------- storage ----------
export function loadIdeas() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Returns false when the browser refused to store (private mode, storage full). */
export function saveIdeas(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ---------- helpers ----------
const norm = (s) => String(s || '').trim().toLowerCase();

export function findIdea(list, kw, cc) {
  if (!norm(kw)) return undefined;
  return list.find((i) => norm(i.kw) === norm(kw) && i.cc === cc);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function titleCase(text) {
  return String(text || '').trim().replace(/(^|\s)(\p{Ll})/gu, (m, sp, ch) => sp + ch.toUpperCase());
}

export function snapshotOf(report, now = Date.now()) {
  if (!report || report.empty) return null;
  return { opp: report.opportunity, demand: report.demand, ease: report.ease, money: report.money, at: now };
}

/** Keep the part of a complaint summary an idea card needs. */
export function summaryOf(entry) {
  if (!entry?.result) return null;
  const r = entry.result;
  return {
    pitch: r.pitch || '',
    complaints: (r.complaints || []).slice(0, 5).map((c) => ({ theme: c.theme, mentions: c.mentions || 0 })),
    at: entry.at || Date.now(),
  };
}

export function createIdea({ kw = '', cc = 'us', category = '', report = null, summary = null, now = Date.now() } = {}) {
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    name: titleCase(kw) || 'Untitled idea',
    kw: String(kw || '').trim(),
    cc,
    category,
    status: 'idea',
    priceModel: '',
    price: '',
    why: '',
    notes: '',
    buildable: false,
    complaintOk: false,
    snapshot: snapshotOf(report, now),
    summary: summaryOf(summary),
  };
}

/** The five checks from the decision table. Some are worked out from data, the rest are ticked by hand. */
export function readiness(idea) {
  const topMentions = Math.max(0, ...((idea.summary?.complaints || []).map((c) => c.mentions || 0)));
  const complaintAuto = topMentions >= READY_MENTIONS;
  const items = [
    { key: 'score', label: `Opportunity score ${READY_SCORE}+ in its country`, done: (idea.snapshot?.opp ?? 0) >= READY_SCORE, auto: true },
    { key: 'complaintOk', label: `A complaint I can fix (${READY_MENTIONS}+ mentions)`, done: complaintAuto || !!idea.complaintOk, auto: complaintAuto },
    { key: 'buildable', label: 'I can build version 1 in 2–4 weeks', done: !!idea.buildable, auto: false },
    { key: 'price', label: 'Pricing decided', done: !!idea.priceModel, auto: true },
    { key: 'why', label: "I can say why I'd win", done: String(idea.why || '').trim().length >= READY_WHY_CHARS, auto: true },
  ];
  return { items, done: items.filter((i) => i.done).length, total: items.length };
}

/** Plain-text export for pasting into notes or a message. */
export function ideasToText(list, { countryName = (c) => c.toUpperCase(), now = Date.now() } = {}) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const blocks = list.map((i) => {
    const r = readiness(i);
    const lines = [`## ${i.name} (${STATUS_LABEL[i.status] || i.status})`];
    if (i.kw) lines.push(`Keyword: ${i.kw} (${countryName(i.cc)})${i.category ? ` · ${i.category}` : ''}`);
    if (i.snapshot) lines.push(`Score: ${i.snapshot.opp} (Demand ${i.snapshot.demand} · Ease ${i.snapshot.ease} · Money ${i.snapshot.money}), checked ${day(i.snapshot.at)}`);
    if (i.priceModel || i.price) lines.push(`Charging: ${[PRICE_LABEL[i.priceModel] || '', i.price].filter(Boolean).join(', ')}`);
    if (i.why) lines.push(`Why I'd win: ${i.why}`);
    if (i.summary?.pitch) lines.push(`Pitch: ${i.summary.pitch}`);
    if (i.summary?.complaints?.length) lines.push(`Top complaints: ${i.summary.complaints.map((c) => `${c.theme} (${c.mentions})`).join(', ')}`);
    if (i.notes) lines.push(`Notes: ${i.notes}`);
    lines.push(`Ready: ${r.done}/${r.total}`);
    return lines.join('\n');
  });
  return [`# App ideas (${day(now)})`, ...blocks].join('\n\n');
}
