// Complaint summary: reads recent 1–3 star reviews of the top apps for a
// keyword and asks Claude to group them into themes a new app could fix.
//
// Runs in the browser with the user's own Anthropic API key, which is kept in
// this device's localStorage and sent only to api.anthropic.com.

import * as api from './api.js';
import { t, cnt, lang } from './i18n.js';

export const MODEL = 'claude-haiku-5-5';
export const MODEL_LABEL = 'Claude Haiku 5.5';
// Names for models that may appear on summaries saved earlier.
export const MODEL_LABELS = { 'claude-haiku-5-5': 'Claude Haiku 5.5', 'claude-opus-5-5': 'Claude Opus 5.5' };
// USD per token for Claude Haiku 5.5. The higher rate applies when the prompt is over 100K tokens.
const PRICE = { input: 0.1 / 1e6, output: 0.5 / 1e6, longInput: 0.5 / 1e6, longOutput: 2.5 / 1e6, longAbove: 100000 };
const KEY_STORE = 'aof:anthropicKey';
const CACHE_PREFIX = 'aof:complaints:';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
// Apple's public review feed is empty for many apps, so read all ten.
export const APPS_TO_READ = 10;
const MIN_REVIEWS = 3;

// ---------- API key ----------
export function getKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}
export function setKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch { /* storage unavailable */ }
}

// ---------- cache ----------
// Summaries are written in the interface language, so cache them per language.
const cacheKey = (kw, cc) => `${CACHE_PREFIX}${cc}|${kw.trim().toLowerCase()}${lang === 'en' ? '' : `|${lang}`}`;

export function getCached(kw, cc) {
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(kw, cc)) || 'null');
    if (v && Date.now() - v.at < CACHE_TTL) return v;
  } catch { /* ignore */ }
  return null;
}

function setCached(kw, cc, v) {
  try { localStorage.setItem(cacheKey(kw, cc), JSON.stringify(v)); } catch { /* ignore */ }
}

// ---------- errors ----------
export class SummaryError extends Error {
  constructor(message, { needsKey = false } = {}) {
    super(message);
    this.needsKey = needsKey;
  }
}

// The SDK is ~370 KB, so it is only downloaded the first time someone summarizes.
let sdkPromise;
const loadSdk = () => (sdkPromise ??= import('./vendor/anthropic-sdk-1.8.0.js'));

// ---------- output shape ----------
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'complaints', 'features', 'pricing', 'pitch'],
  properties: {
    summary: { type: 'string', description: 'Two or three sentences on what frustrates users of these apps overall.' },
    complaints: {
      type: 'array',
      description: 'The most common complaint themes, most frequent first. At most 6.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['theme', 'detail', 'mentions', 'apps', 'quote'],
        properties: {
          theme: { type: 'string', description: 'Short label of at most 6 words.' },
          detail: { type: 'string', description: 'One or two sentences explaining the complaint.' },
          mentions: { type: 'integer', description: 'How many of the provided reviews raise this complaint.' },
          apps: { type: 'array', items: { type: 'string' }, description: 'Names of the apps whose reviews raise it, exactly as given.' },
          quote: { type: 'string', description: 'A short verbatim quote (at most about 25 words) from one of those reviews.' },
        },
      },
    },
    features: {
      type: 'array',
      description: '3 to 5 features or product choices a new app could use to win these unhappy users.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['idea', 'why'],
        properties: {
          idea: { type: 'string', description: 'The feature or choice, in a few words.' },
          why: { type: 'string', description: 'Which complaint it answers, in one sentence.' },
        },
      },
    },
    pricing: { type: 'string', description: 'What reviewers say about price, subscriptions, paywalls and ads. Say so plainly if they say little.' },
    pitch: { type: 'string', description: 'One sentence positioning a new app that fixes the top complaints.' },
  },
};

const SYSTEM = `You help an independent app developer decide what app to build. You will get recent 1-3 star App Store reviews of the top apps for one search keyword.

Group the complaints into themes and report what a new app would need to do better. Base every statement only on the reviews provided: do not invent complaints, numbers or quotes. Count mentions by going through the reviews, and keep quotes verbatim. Ignore reviews that are only bug reports about a single device or spam. Write plainly for someone who will read this on a phone.`;

const xmlEscape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Fetch recent 1–3 star reviews for the top apps. */
export async function collectReviews(apps, cc, onProgress = () => {}) {
  const top = apps.slice(0, APPS_TO_READ);
  const out = [];
  for (let i = 0; i < top.length; i++) {
    onProgress(i, top.length, top[i].name);
    try {
      const all = await api.reviews(top[i].id, cc);
      const bad = all.filter((r) => r.stars <= 3);
      out.push({ app: top[i], reviews: bad, read: all.length });
    } catch (e) {
      if (e instanceof api.RateLimitError) throw new SummaryError(t('Apple is limiting requests right now. Wait a minute, then try again.'));
      out.push({ app: top[i], reviews: [], read: 0 });
    }
  }
  return out;
}

function buildPrompt(keyword, countryName, groups) {
  const blocks = groups
    .filter((g) => g.reviews.length)
    .map((g) => {
      const a = g.app;
      const reviews = g.reviews
        .map((r) => `  <review stars="${r.stars}">${xmlEscape(r.title)}: ${xmlEscape(r.text)}</review>`)
        .join('\n');
      return `<app name="${xmlEscape(a.name)}" average_rating="${(a.rating || 0).toFixed(1)}" ratings="${a.ratings || 0}" price="${xmlEscape(a.priceText || 'Free')}">\n${reviews}\n</app>`;
    })
    .join('\n\n');
  return `Keyword: "${keyword}"\nCountry: ${countryName}\n\n${blocks}`;
}

/**
 * Summarize complaints for a keyword result. Uses the cache unless `fresh`.
 * Returns { at, result, reviewCount, appCount, apps, cost, model }.
 */
export async function summarize({ keyword, country, countryName, apps, fresh = false, language = 'en', onStep = () => {} }) {
  if (!fresh) {
    const hit = getCached(keyword, country);
    if (hit) return hit;
  }
  const key = getKey();
  if (!key) throw new SummaryError(t('Add your Anthropic API key first.'), { needsKey: true });

  const groups = await collectReviews(apps, country, (i, n, name) => onStep(t('Reading reviews of {name} ({i} of {n})…', { name, i: i + 1, n })));
  const reviewCount = groups.reduce((s, g) => s + g.reviews.length, 0);
  if (reviewCount < MIN_REVIEWS) {
    const fed = groups.filter((g) => g.read > 0).length;
    throw new SummaryError(fed === 0
      ? t("Apple's review feed returned no reviews for any of the top {n} apps, so there's nothing to summarize. Nothing was sent to Claude. Try another keyword or country.", { n: groups.length })
      : t("Only {reviews} came back (Apple returned reviews for {fed} of {n} apps). That's too few to summarize, so nothing was sent to Claude.", { reviews: cnt(reviewCount, 'review'), fed, n: groups.length }));
  }

  onStep(t('{model} is reading {reviews}…', { model: MODEL_LABEL, reviews: cnt(reviewCount, 'review') }));
  const { Anthropic, betaJSONSchemaOutputFormat } = await loadSdk();
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });

  let res;
  try {
    res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // Claude Haiku 5.5 has no server-side fallback; a decline is handled below.
      output_config: { effort: 'medium', format: betaJSONSchemaOutputFormat(SCHEMA) },
      system: language === 'pl' ? `${SYSTEM}\n\nWrite every text field in Polish. Keep the quotes verbatim in the language of the review, and keep app names as they are.` : SYSTEM,
      messages: [{ role: 'user', content: buildPrompt(keyword, countryName, groups) }],
    });
  } catch (e) {
    throw toSummaryError(e, Anthropic);
  }

  if (res.stop_reason === 'refusal') throw new SummaryError(t('Claude declined to summarize these reviews. Try another keyword.'));
  if (res.stop_reason === 'max_tokens') throw new SummaryError(t('The summary was cut off. Tap Summarize again.'));
  const result = res.parsed_output;
  if (!result) throw new SummaryError(t("Claude's answer couldn't be read. Tap Summarize again."));

  const u = res.usage || {};
  const promptTokens = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const long = promptTokens > PRICE.longAbove;
  const cost = promptTokens * (long ? PRICE.longInput : PRICE.input)
    + (u.output_tokens || 0) * (long ? PRICE.longOutput : PRICE.output);
  const entry = {
    at: Date.now(),
    result,
    reviewCount,
    appCount: groups.filter((g) => g.reviews.length).length,
    apps: groups.map((g) => g.app.name),
    cost,
    model: res.model || MODEL,
  };
  setCached(keyword, country, entry);
  return entry;
}

function toSummaryError(e, Anthropic) {
  if (e instanceof Anthropic.AuthenticationError) return new SummaryError(t('Your API key was not accepted. Check it and paste it again.'), { needsKey: true });
  if (e instanceof Anthropic.PermissionDeniedError) return new SummaryError(t("Your API key doesn't have access to this model."));
  if (e instanceof Anthropic.RateLimitError) return new SummaryError(t('Your Anthropic account hit its rate limit. Try again in a minute.'));
  if (e instanceof Anthropic.BadRequestError) return new SummaryError(t('Anthropic rejected the request: {msg}', { msg: e.message }));
  if (e instanceof Anthropic.InternalServerError) return new SummaryError(t('Claude is temporarily unavailable. Try again in a minute.'));
  if (e instanceof Anthropic.APIConnectionError) return new SummaryError(t("Couldn't reach Anthropic. Check your connection and try again."));
  if (e instanceof Anthropic.APIError) return new SummaryError(t('Anthropic returned an error ({status}). Try again in a minute.', { status: e.status }));
  return new SummaryError(t("Couldn't summarize the reviews. Try again in a minute."));
}
