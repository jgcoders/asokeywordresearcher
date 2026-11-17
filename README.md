# App Store scan data

Written by `scripts/scan.mjs` (workflow: `.github/workflows/app-store-scan.yml`, run by hand).
This branch is replaced on every run. Last run: 2026-11-17T10:56:05.647Z.

- `summary.json`: category scores for every country, top Gap-score apps, risers and new earners
- `country/<cc>.json`: the 10 highest Gap-score apps of every category in one country
- `ranks/<date>.json`: Top Grossing order per country and category, kept 30 days for trends
