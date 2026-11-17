// Loads the results of the App Store scan (scripts/scan.mjs), which the GitHub
// workflow (run by hand) publishes to this repository's `data` branch.

import { GNAME } from './constants.js';

function repoPath() {
  // On GitHub Pages the site lives at <owner>.github.io/<repo>/
  if (typeof location !== 'undefined') {
    const owner = location.hostname.match(/^([^.]+)\.github\.io$/)?.[1];
    const repo = location.pathname.split('/')[1];
    if (owner && repo) return `${owner}/${repo}`;
  }
  return 'jgcoders/asokeywordresearcher';
}

export const DATA_BASE = `https://raw.githubusercontent.com/${repoPath()}/data/`;

export class NotPublishedError extends Error {}

async function getJson(file) {
  const hour = Math.floor(Date.now() / 3.6e6); // fetch fresh data at most once an hour
  const res = await fetch(`${DATA_BASE}${file}?h=${hour}`);
  if (res.status === 404) throw new NotPublishedError('No App Store scan has been published yet.');
  if (!res.ok) throw new Error(`Scan data returned ${res.status}`);
  return res.json();
}

let summaryPromise = null;
const countryPromises = new Map();

export function loadSummary() {
  summaryPromise ??= getJson('summary.json').catch((e) => { summaryPromise = null; throw e; });
  return summaryPromise;
}

export function loadCountry(cc) {
  if (!countryPromises.has(cc)) {
    countryPromises.set(cc, getJson(`country/${cc}.json`).catch((e) => { countryPromises.delete(cc); throw e; }));
  }
  return countryPromises.get(cc);
}

/** Turn a compact scan entry into the app object the rest of the UI uses. */
export function toApp(e) {
  return {
    id: e.id, name: e.n, seller: e.s, cc: e.cc,
    ratings: e.r, rating: e.a, currentRating: e.ca, currentRatings: e.cn,
    price: 0, priceText: e.p, released: e.rl, updated: e.up,
    genreId: String(e.g), genre: GNAME[e.g] || '', icon: e.ic, url: e.u,
    rank: e.rk,
    gapInfo: { gap: e.gap, money: e.m, demand: e.d, unhappy: e.uh, beatable: e.b, rank: e.rk, prevRank: e.pr, countries: e.ic2 },
  };
}
