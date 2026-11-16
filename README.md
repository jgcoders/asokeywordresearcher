# App Opportunity Finder

A phone-first web app for finding App Store niches and keywords where users pay and the competition is beatable. Add it to your iPhone home screen and it works like an app.

It runs entirely in the browser. There is no server and no API key: it reads Apple's public App Store data directly.

## What it does

| Tab | What you get |
|---|---|
| **Niches → All categories** | One tap scans Top Grossing in all 24 categories and ranks them by **Niche score**: room for small apps (small earners, new apps, neglected apps) weighed against market size. Each card shows an example small earner and keyword ideas. Results are saved per country. |
| **Niches → One category** | Scan a category's Top Grossing, Top Paid or Top Free chart in one country. Shows how many of the top 100 are small earners (under 5k ratings), new (released in the last 18 months) or neglected (no update in a year), plus keyword ideas taken from the names of small and new apps. |
| **Keyword** | Score a search term from its top 10 App Store results: **Demand**, **Ease** and **Money**, combined into an **Opportunity** score (0–100). |
| **Countries** | Score one keyword in the US, UK, Canada, Australia, Germany and Japan side by side. |
| **Ideas** | Turn a keyword into an idea card: name, status (Idea → Researching → Building → Launched / Dropped), country, category, how you'll charge, price, why you'd win and notes. Cards carry the keyword's scores and complaint summary, which refresh when you check the keyword again, plus a 5-point "Ready to build?" checklist. Add from the Keyword tab, from Saved, or start blank. "Copy all as text" exports every idea. Stored on this device. |
| **Saved** | Keywords you saved on this device, with "Copy as CSV". |
| **Keyword → What users complain about** | Optional. Claude (Haiku 5.5) reads the recent 1–3 star reviews of the top 10 apps and returns the main complaint themes with counts and quotes, features a new app could win with, what users say about price and ads, and a one-line pitch. Uses your own Anthropic API key, billed to your Anthropic account (usually well under 1¢). Results are kept on the device for 7 days. |
| **App details** | Tap any app to see its stats and its recent 1–3 star reviews, which show what users want fixed. |

## How the scores work

Apple publishes no download or search-volume numbers, so the scores use stand-ins:

- **Demand**: total ratings across the top 10 apps for the search, on a log scale (1k ratings = 20, 100k = 60, 1M = 80, 10M = 100).
- **Ease**: high when the typical top app has few ratings, few top apps use the keyword in their name, and several top apps are weak (under 1k ratings, rated below 4.0, or not updated in a year).
- **Money**: 20 points per top-10 app in Top Grossing for the main category, 10 per app that charges upfront.
- **Opportunity**: weighted geometric mean (demand 35%, ease 40%, money 25%), so one very weak part pulls the total down. 60+ is **Strong**, 40–59 **Worth a look**, under 40 **Weak**.

Treat scores as a way to find niches worth investigating, not as proof. Ratings counts are a proxy for downloads.

**Niche score** (All categories): room = small earners × 1.2 + new apps × 0.8 + neglected apps × 1.5 (capped at 100); size = typical top app's ratings on a log scale (1k = 33, 10k = 67, 100k = 100); score = room^0.6 × size^0.4. 65+ is **Promising**, 50–64 **Possible**. Market size is in the formula so tiny categories, where every app is small, don't win by default.

The formulas live in `js/scoring.js`; thresholds are in `LIMITS` at the top.

## Data sources

All are public Apple endpoints that allow browser requests:

- Search: `itunes.apple.com/search`
- App details: `itunes.apple.com/lookup`
- Category charts: `itunes.apple.com/{country}/rss/topgrossingapplications/...`
- Reviews: `itunes.apple.com/{country}/rss/customerreviews/...`

Apple rate-limits these (roughly 20 requests a minute), so requests are spaced out and responses are cached on the device for 6 hours.

## Complaint summaries and your API key

- The key is entered in the app, stored in this browser's `localStorage` on your device, and sent only to `api.anthropic.com`. It is never in the repository or on the website. Remove it any time from the **Saved** tab.
- Requests go straight from your phone to Anthropic using the official SDK (`@anthropic-ai/sdk` 1.8.0, bundled into `js/vendor/` so no CDN is involved). Browser use is enabled with `dangerouslyAllowBrowser`, which is acceptable here because each person uses their own key on their own device. Don't put a shared key into this app.
- The model is `claude-haiku-5-5` (set in `js/complaints.js`). It has no server-side fallback, so if a safety classifier declines a request the app shows a message instead.
- Apple's public review feed returns nothing for many apps, and also returns empty results when it's rate limiting. The app reads all top 10 apps, says how many contributed, and never calls Claude when there are too few reviews.

To rebuild the SDK bundle:

```sh
npm install @anthropic-ai/sdk@1.8.0 esbuild
printf "export { default as Anthropic } from '@anthropic-ai/sdk';\nexport { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';\n" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --target=es2020 --minify --legal-comments=eof --outfile=js/vendor/anthropic-sdk-1.8.0.js
```

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Tests

```sh
node --test tests/*.test.mjs
```

## Put it on your iPhone

1. Host it with GitHub Pages: repository **Settings → Pages → Build and deployment**, Source **Deploy from a branch**, pick the branch and `/ (root)`, then **Save**.
2. Open the Pages URL in Safari on your iPhone.
3. Tap **Share → Add to Home Screen**.

## Not yet included

- Google Play. It has no public API, so it needs a small server that scrapes store pages.
- Apple Search Ads popularity scores. These need your own Search Ads account.
