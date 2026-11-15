# App Opportunity Finder

A phone-first web app for finding App Store niches and keywords where users pay and the competition is beatable. Add it to your iPhone home screen and it works like an app.

It runs entirely in the browser. There is no server and no API key: it reads Apple's public App Store data directly.

## What it does

| Tab | What you get |
|---|---|
| **Niches** | Scan a category's Top Grossing, Top Paid or Top Free chart in one country. Shows how many of the top 100 are small earners (under 5k ratings), new (released in the last 18 months) or neglected (no update in a year), plus keyword ideas taken from the names of small and new apps. |
| **Keyword** | Score a search term from its top 10 App Store results: **Demand**, **Ease** and **Money**, combined into an **Opportunity** score (0–100). |
| **Countries** | Score one keyword in the US, UK, Canada, Australia, Germany and Japan side by side. |
| **Saved** | Keywords you saved on this device, with "Copy as CSV". |
| **App details** | Tap any app to see its stats and its recent 1–3 star reviews, which show what users want fixed. |

## How the scores work

Apple publishes no download or search-volume numbers, so the scores use stand-ins:

- **Demand**: total ratings across the top 10 apps for the search, on a log scale (1k ratings = 20, 100k = 60, 1M = 80, 10M = 100).
- **Ease**: high when the typical top app has few ratings, few top apps use the keyword in their name, and several top apps are weak (under 1k ratings, rated below 4.0, or not updated in a year).
- **Money**: 20 points per top-10 app in Top Grossing for the main category, 10 per app that charges upfront.
- **Opportunity**: weighted geometric mean (demand 35%, ease 40%, money 25%), so one very weak part pulls the total down. 60+ is **Strong**, 40–59 **Worth a look**, under 40 **Weak**.

Treat scores as a way to find niches worth investigating, not as proof. Ratings counts are a proxy for downloads.

The formulas live in `js/scoring.js`; thresholds are in `LIMITS` at the top.

## Data sources

All are public Apple endpoints that allow browser requests:

- Search: `itunes.apple.com/search`
- App details: `itunes.apple.com/lookup`
- Category charts: `itunes.apple.com/{country}/rss/topgrossingapplications/...`
- Reviews: `itunes.apple.com/{country}/rss/customerreviews/...`

Apple rate-limits these (roughly 20 requests a minute), so requests are spaced out and responses are cached on the device for 6 hours.

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
