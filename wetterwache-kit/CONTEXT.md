# Project context: "Wetterwache" (iOS weather-warning app)

> Paste this whole file as the first message in a new chat. It tells the assistant who I am, what we're building and how to teach me.

---

## 1. How I want you to work with me

- **I'm new to Swift and Xcode.** This is my first native iOS app. I know the App Store side (keywords, competitors) but not iOS development.
- **Teach me step by step.** One small step at a time, then wait until I say it works before continuing.
- For every step tell me:
  1. **What** we're doing and **why** (2–3 sentences, plain language).
  2. **Where to click in Xcode** (menu names, buttons, which file to open or create).
  3. The **complete file content** to paste. Never send partial snippets with "…rest of code"; always the whole file, so I can replace it.
  4. **How to test it**: what I should see in the Simulator or on my iPhone.
- When I paste an error, explain what it means in simple words, then give the fix.
- Prefer **modern, simple Apple APIs**: SwiftUI, SwiftData, async/await, `@Observable`. No third-party libraries unless there is no reasonable Apple way (and tell me why).
- Keep code **small and readable**: short files, clear names, comments only where something isn't obvious.
- Remind me to **commit to Git** after each working milestone (Xcode → Integrate → Commit).
- If something I ask for is risky (App Store rejection, privacy, licensing, cost), tell me before doing it.

## 2. What we're building

**Wetterwache** ("weather watch"): one app for **official severe-weather warnings in Austria, Germany and later Switzerland**, with a clean forecast and alerts for all the places I care about.

**Why this app (market research I already did):**
- Keyword "Unwetter Warnung" scores **71 in Austria, 72 in Germany, 69 in Switzerland** on my ASO tool (demand + weak competition + money). "weather warnings" scores 68 in the UK/AU.
- **Austria has no good dedicated warning app**: Unwetterzentrale Österreich earns in Top Grossing (Weather) at **2.1★ with no update in 19 months**. The App Store results for "Unwetter Warnung" in Austria are generic weather apps.
- Germany has the official free **DWD WarnWetter** (4.6★) and Switzerland has **Wetter Alarm** (4.5★). They each cover only one country.
- **Our angle:** *one* calm, beautiful app for warnings across **D-A-CH**, for people whose life crosses borders (commuters, skiers, family and holiday homes in another country), with **per-place alerts** and **widgets**.

**Target users:** people in Austria (launch market), then Germany and Switzerland; German-speaking first, English second.

**Monetization:** free download + **"Wetterwache Pro"** subscription (StoreKit 2):
- Free: 1 place, warnings and forecast in the app.
- Pro (about €1.99/month or €12.99/year, with a 7-day free trial): unlimited places, **push alerts** with my own thresholds (e.g. "only orange and red", "only thunderstorms and hail"), widgets, quiet hours.
- No ads. No tracking.

## 3. Features

### MVP (version 1.0, Austria + Germany)
1. **Places:** add places by search (city / address) or "My location". Store them on the device.
2. **Warnings per place:** current and upcoming official warnings with level colour (yellow / orange / red / violet), type icon (thunderstorm, wind, rain, snow, ice, heat, frost), valid from–to, description text, and the issuing service.
3. **Overview screen:** a list of my places, each showing the highest active warning level at a glance.
4. **Forecast:** current conditions + next 24 hours + 7 days (Apple WeatherKit).
5. **Warning map:** a map with my places and their warning level (MapKit).
6. **Notifications:** alert me when a new warning appears for one of my places (see section 5 for how).
7. **Widgets:** home-screen and lock-screen widget showing the warning level of my main place.
8. **Pro subscription** with a paywall and "Restore purchases".
9. **Settings:** units, alert levels per place, quiet hours, language, about/sources/legal.
10. **German and English** (String Catalog).

### Later (1.1+)
- Switzerland (once MeteoSwiss offers an official warnings API; check MeteoAlarm as an alternative).
- Rain radar (needs a radar data source; decide later).
- "Rain in the next hour" (WeatherKit minute forecast, where available).
- Apple Watch complication, Live Activity during an active red warning.
- Share a place with family ("Warn me for my parents' home").

## 4. Data sources (check the licence for each before launch)

| What | Source | Notes |
|---|---|---|
| **Austria warnings** | **GeoSphere Austria** warnings API (used by the Home Assistant integration): `https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon={lon}&lat={lat}&lang=de` | Free, no API key. Licence **CC BY 4.0**, credit "GeoSphere Austria". Covers settled areas (not high-alpine terrain). **First fetch the real JSON in Terminal (`curl`), then build the Swift models from it.** |
| **Germany warnings** | **DWD** (Deutscher Wetterdienst) via **Bright Sky** API: `https://api.brightsky.dev/alerts?lat={lat}&lon={lon}` | Free, no key. Credit "Quelle: Deutscher Wetterdienst". Bright Sky is a free community service; for production, plan a fallback (DWD's own open-data CAP feed). **Read the DWD terms at dwd.de/copyright before launch.** |
| **Switzerland warnings** | Not in v1. MeteoSwiss has no public warnings API yet (planned). | Revisit for v1.1. |
| **Forecast** | **Apple WeatherKit** (Swift framework) | Included with the Apple Developer Program: **500,000 calls/month free**. Requires the WeatherKit capability, plus showing **Apple Weather attribution** (logo + legal link) in the app. Severe-weather alerts from WeatherKit only exist in some regions, so use them as a bonus, not the main source. |
| **Place search** | MapKit (`MKLocalSearch`) | Free, Apple. |

**Important rules:**
- Show the **source of every warning** ("GeoSphere Austria", "Deutscher Wetterdienst") and an **About / Sources** screen with the licences.
- Add a disclaimer: *"Wetterwache shows official warnings but is not an official warning service. In an emergency follow the instructions of the authorities."*
- Never change the meaning of a warning. Show the official text.

## 5. Notifications: the honest plan

Warnings matter most when the app is closed, so this is the hardest part.

- **v1.0 (no server):** `BGAppRefreshTask` checks warnings in the background and posts **local notifications**. iOS decides *when* background refresh runs, so alerts can be **late** (minutes to hours). Say so honestly in the app: *"Alerts are checked in the background; for instant alerts enable Pro push"*. Or keep push as a v1.1 launch blocker if testing shows it's too slow.
- **v1.1 (real push):** a tiny server job (e.g. **Cloudflare Workers** cron every 5 minutes, free tier) polls the warning feeds and sends push notifications via **Firebase Cloud Messaging topics** (one topic per area, e.g. Austrian municipality or DWD warn-cell). The app subscribes to the topics for my places. **No user location is stored on the server**, which is a privacy win and also an App Store selling point.
- Teach me this part slowly when we get there.

## 6. Technical setup

- **Xcode:** latest version from the Mac App Store. **A Mac is required** (or a rented cloud Mac).
- **Deployment target:** iOS 17.0 (SwiftData, `@Observable`, new MapKit for SwiftUI, `SubscriptionStoreView`).
- **Bundle ID:** `com.<myname>.wetterwache` (I'll tell you my name/domain).
- **Capabilities:** WeatherKit, Background Modes (Background fetch), Push Notifications (v1.1), App Groups (to share data with widgets), In-App Purchase.
- **Info.plist texts (German + English):**
  - `NSLocationWhenInUseUsageDescription`: "Wetterwache uses your location to show warnings and weather where you are."
  - (Only if needed later) `NSLocationAlwaysAndWhenInUseUsageDescription`.
- **Architecture (simple MVVM):**

```
Wetterwache/
  App/            WetterwacheApp.swift, AppState.swift
  Models/         Place.swift (SwiftData), Warning.swift, WarningLevel.swift, WarningType.swift
  Services/       AustriaWarningService.swift, GermanyWarningService.swift,
                  WarningService.swift (picks the right one by country),
                  ForecastService.swift (WeatherKit), LocationService.swift,
                  NotificationService.swift, BackgroundRefresh.swift, StoreService.swift (StoreKit 2)
  Views/          PlacesListView, PlaceDetailView, WarningRow, WarningDetailView,
                  ForecastView, WarningMapView, AddPlaceView, SettingsView,
                  PaywallView, OnboardingView, AboutSourcesView
  Widgets/        (Widget extension target) WarningWidget.swift
  Resources/      Localizable.xcstrings, Assets.xcassets (AppIcon 1024×1024 is ready)
```

- **One shared model** for warnings from every country:

```swift
enum WarningLevel: Int, Codable, Comparable { case none = 0, yellow, orange, red, violet }
enum WarningType: String, Codable { case thunderstorm, wind, rain, snow, ice, heat, frost, fog, flood, other }
struct WeatherWarning: Identifiable, Codable, Hashable {
    let id: String
    let level: WarningLevel
    let type: WarningType
    let title: String
    let description: String
    let instruction: String?
    let start: Date
    let end: Date?
    let source: String        // "GeoSphere Austria" / "Deutscher Wetterdienst"
}
```

  Each country service converts its own JSON into `WeatherWarning`. (DWD severity minor/moderate/severe/extreme ≈ yellow/orange/red/violet; check GeoSphere's level numbers in the real JSON.)

- **Design:** calm and clear. System fonts, SF Symbols (`cloud.bolt.rain.fill`, `wind`, `snowflake`, `thermometer.sun.fill`, `exclamationmark.triangle.fill`), warning colours yellow `#F5C400`, orange `#FF8A00`, red `#E5322D`, violet `#8E44AD`. Light and dark mode. Large tap targets. Accessibility labels on warning badges ("Orange warning: thunderstorm").
- **App icon:** done (`AppIcon-1024.png`, storm cloud with amber lightning on deep blue→teal).

## 7. Build plan (milestones; teach me in this order)

0. **Setup:** Apple ID → Xcode → create project "Wetterwache" (iOS App, SwiftUI, Swift, SwiftData storage) → run "Hello" in the Simulator → run on my iPhone (free signing) → put it in Git.
1. **SwiftUI basics in our project:** a list of hard-coded places, navigation to a detail screen. Explain `View`, `@State`, `List`, `NavigationStack`.
2. **Places with SwiftData:** add/delete places, search with MapKit, "My location" with CoreLocation permission.
3. **Austria warnings:** inspect the JSON with `curl`, write `Codable` models, fetch with `async/await`, show them in `PlaceDetailView`. Error and empty states ("No warnings").
4. **Germany warnings:** same with Bright Sky; `WarningService` chooses the service by country.
5. **Overview:** highest warning level per place, pull-to-refresh, coloured badges.
6. **Forecast with WeatherKit:** enrol in the Apple Developer Program ($99/year) first, add the capability, show current + hourly + daily, add Apple Weather attribution.
7. **Warning map** (MapKit for SwiftUI).
8. **Local notifications + background refresh.**
9. **Widgets** (Widget extension + App Group).
10. **Pro subscription** (StoreKit 2, `SubscriptionStoreView`, StoreKit configuration file for testing, restore purchases, free vs Pro limits).
11. **German/English** with a String Catalog; onboarding (3 screens); settings; About & Sources; disclaimer.
12. **App Store prep:** screenshots, privacy policy, TestFlight beta with friends in Austria, submit for review.
13. **v1.1:** server push (Cloudflare Worker + Firebase topics), Switzerland.

## 8. App Store details (already decided)

- **Name (title, 30 chars max):** `Wetterwache: Unwetterwarnung`
- **Subtitle (DE):** `Gewitter, Sturm & Hagel Alarm`
- **Category:** Weather (secondary: Utilities). **Age rating:** 4+.
- **Launch countries:** Austria first, then Germany; Switzerland in v1.1.
- Full metadata (keywords, descriptions, screenshot captions) is in my separate `APP_STORE.md`. Ask me for it when we reach milestone 12.

## 9. First task

Start with **milestone 0**. Ask me first:
1. Do I have a Mac, and which macOS version?
2. Is Xcode installed?
3. Do I already have a paid Apple Developer account?

Then guide me through creating the project.
