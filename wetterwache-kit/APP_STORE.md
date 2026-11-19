# Wetterwache: App Store kit

Everything for App Store Connect. German is the main language (launch in **Austria**, then **Germany**); English is the second localization.

Character limits are checked: title and subtitle up to 30, keywords up to 100, promotional text up to 170.

---

## 1. Name, subtitle, keywords

### German (Deutsch): primary
| Field | Text | Length |
|---|---|---|
| **App name** | `Wetterwache: Unwetterwarnung` | 28 |
| **Subtitle** | `Gewitter, Sturm & Hagel Alarm` | 29 |
| **Keywords** | `unwetter,warnung,regenradar,starkregen,blitz,schnee,glatteis,orkan,hitze,frost,wetter,warnapp,push` | 98 |

### English (U.K.)
| Field | Text | Length |
|---|---|---|
| **App name** | `Wetterwache: Storm Warnings` | 27 |
| **Subtitle** | `Thunder, wind & hail alerts` | 27 |
| **Keywords** | `weather,warning,alert,severe,thunderstorm,lightning,rain,flood,snow,ice,heat,austria,germany,push` | 97 |

**Keyword rules used:**
- Words already in the name or subtitle aren't repeated (Apple combines them).
- No competitor or agency names (DWD, ZAMG, GeoSphere): App Review rejects trademarked keywords.
- Commas only, no spaces.

**Re-check after launch** with the ASO tool's Keyword and Countries tabs (AT, DE, CH). Swap out keywords that don't rank top 20 after 4 weeks.

---

## 2. Promotional text (can change anytime without review)

**DE:** `Offizielle Unwetterwarnungen für Österreich und Deutschland in einer App. Alle deine Orte, ein Blick: Gewitter, Sturm, Hagel, Starkregen.` (137)

**EN:** `Official severe-weather warnings for Austria and Germany in one app. All your places at a glance: thunderstorms, wind, hail and heavy rain.` (139)

---

## 3. Description

### DE
```
Wetterwache zeigt dir offizielle Unwetterwarnungen für alle Orte, die dir wichtig sind: Zuhause, Arbeit, die Eltern, die Skihütte. In Österreich und Deutschland, in einer ruhigen, klaren App.

WARUM WETTERWACHE
• Offizielle Warnungen von GeoSphere Austria und dem Deutschen Wetterdienst
• Alle deine Orte auf einen Blick, mit der höchsten Warnstufe in Farbe
• Gewitter, Sturm, Hagel, Starkregen, Schnee, Glatteis, Hitze und Frost
• Warnungen über Grenzen hinweg: ideal für Pendler, Skifahrer und Ferienhäuser
• Klare Vorhersage für heute und die nächsten 7 Tage
• Karte mit allen Orten und ihren Warnstufen
• Widgets für Home- und Sperrbildschirm
• Keine Werbung, kein Tracking

WETTERWACHE PRO
• Unbegrenzt viele Orte
• Push-Alarme für neue Warnungen, mit deinen eigenen Stufen
• Nur das, was dich interessiert: z. B. nur Gewitter und Hagel ab Stufe Orange
• Ruhezeiten in der Nacht
• Alle Widgets

Pro ist ein Abo (monatlich oder jährlich) mit kostenloser Testphase. Die Zahlung erfolgt über deine Apple-ID. Das Abo verlängert sich automatisch, wenn es nicht mindestens 24 Stunden vor Ablauf in den Einstellungen deiner Apple-ID gekündigt wird.

Datenquellen: GeoSphere Austria (CC BY 4.0), Deutscher Wetterdienst, Apple Weather.
Wetterwache zeigt offizielle Warnungen, ist aber kein amtlicher Warndienst. Im Ernstfall befolge die Anweisungen der Behörden.

Nutzungsbedingungen: [Link]
Datenschutz: [Link]
```

### EN
```
Wetterwache shows official severe-weather warnings for every place you care about: home, work, your parents, the ski lodge. Across Austria and Germany, in one calm, clear app.

WHY WETTERWACHE
• Official warnings from GeoSphere Austria and Germany's weather service (DWD)
• All your places at a glance, with the highest warning level in colour
• Thunderstorms, wind, hail, heavy rain, snow, ice, heat and frost
• Warnings across borders: made for commuters, skiers and holiday homes
• Clear forecast for today and the next 7 days
• Map with all your places and their warning levels
• Home and Lock Screen widgets
• No ads, no tracking

WETTERWACHE PRO
• Unlimited places
• Push alerts for new warnings, with your own levels
• Only what matters to you, e.g. only thunderstorms and hail from orange up
• Quiet hours at night
• All widgets

Pro is a subscription (monthly or yearly) with a free trial. Payment is charged to your Apple ID. It renews automatically unless cancelled at least 24 hours before the end of the period in your Apple ID settings.

Data sources: GeoSphere Austria (CC BY 4.0), Deutscher Wetterdienst, Apple Weather.
Wetterwache shows official warnings but is not an official warning service. In an emergency, follow the instructions of the authorities.

Terms of Use: [link]
Privacy Policy: [link]
```

---

## 4. Screenshots

**Size:** iPhone 6.9" display, **1320 × 2868 px** (Simulator: iPhone 16 Pro Max or newer "Pro Max", ⌘S saves a screenshot). App Store Connect scales them for smaller iPhones. Make the app **iPhone-only** for v1, so no iPad screenshots are needed.

**Rules:**
- Screenshots must show the real app.
- Use realistic places and warnings. Take them on a day with real warnings, or use a debug "demo data" switch that shows a saved real warning.
- The first 3 matter most: most people never swipe further.

| # | Screen to capture | Caption DE | Caption EN |
|---|---|---|---|
| 1 | Places overview with coloured warning badges (Wien, Salzburg, München, Innsbruck) | **Alle Unwetterwarnungen. Ein Blick.** | **Every storm warning. One glance.** |
| 2 | Warning detail: orange thunderstorm, official text, source | **Offizielle Warnungen aus Österreich und Deutschland** | **Official warnings for Austria and Germany** |
| 3 | Lock screen with a Wetterwache notification + widget | **Alarm, bevor das Gewitter kommt** | **Alerts before the storm arrives** |
| 4 | Map with places and warning colours | **Deine Orte auf der Karte** | **Your places on the map** |
| 5 | Pro settings: choose levels and types per place | **Nur die Warnungen, die dich betreffen** | **Only the warnings you care about** |
| 6 | 7-day forecast | **Klare Vorhersage für 7 Tage** | **A clear 7-day forecast** |

**Caption style:** large bold text at the top (2 short lines max), the app screenshot below inside a phone frame, and the app's deep blue→teal background (the icon colours). Ask for a screenshot template once you have real app screenshots, and I'll make one that adds captions and frames automatically.

**App preview video (optional, later):** 15–20 s screen recording: open app → orange warning → detail → widget.

---

## 5. Other App Store Connect fields

| Field | Value |
|---|---|
| Primary category | **Weather** |
| Secondary category | Utilities |
| Age rating | 4+ (no objectionable content) |
| Price | Free, with in-app subscription |
| Subscriptions | Group "Wetterwache Pro": monthly €1.99, yearly €12.99 (7-day free trial on yearly). Optional later: lifetime €29.99 as a non-consumable |
| Copyright | `2027 <Your Name>` |
| Support URL | your website /support (required) |
| Marketing URL | your website (optional) |
| Privacy Policy URL | your website /privacy (**required**) |

### App Privacy ("nutrition label"), suggested answers
- **Location → Precise Location** (if you use GPS for "My location") → used for **App Functionality** → **not linked** to the user → **not used for tracking**.
  - Reason: coordinates are sent to the warning and weather services to fetch data for that place.
- No other data collected (no account, no analytics). Purchases are handled by Apple and don't need declaring.
- If you add analytics or crash reporting later, update this.

### Notes for App Review (paste into "Notes")
```
Wetterwache shows official weather warnings from GeoSphere Austria (CC BY 4.0) and Deutscher Wetterdienst, and forecasts from Apple WeatherKit. Sources and licences are shown in Settings → About & Sources. Warnings depend on real weather; if there are none at the time of review, enable Settings → Demo data to see sample warnings. Pro features can be tested with the sandbox subscription.
```

---

## 6. What else the app needs (launch checklist)

**Legal and accounts**
- [ ] **Apple Developer Program** ($99/year), needed for WeatherKit, TestFlight and the App Store.
- [ ] **Paid Apps Agreement**, tax and bank details in App Store Connect, needed before you can sell subscriptions.
- [ ] **EU trader status (Digital Services Act):** required to sell in the EU. Your name, address, phone and email become public on the App Store. Use a business address if you don't want your home address shown.
- [ ] **Website** with **Privacy Policy**, **Support/contact**, **Terms of Use (EULA)**, and an **Impressum** (legally required in Austria and Germany for commercial offerings). A simple GitHub Pages site is enough.
- [ ] Check the **data licences** (GeoSphere CC BY 4.0, DWD terms at dwd.de/copyright, WeatherKit attribution rules) and show the attributions in the app.

**In the app**
- [ ] Onboarding (3 screens): what it does → allow location → allow notifications (ask only when the user adds a place, not at first launch).
- [ ] **Disclaimer** "not an official warning service" in onboarding and About.
- [ ] **About & Sources** screen with licences and the Apple Weather attribution.
- [ ] Paywall that shows price, trial length, auto-renew terms, links to Terms and Privacy, and **Restore purchases**.
- [ ] **Empty states** ("No warnings for Wien right now ✓") and **offline/error states**.
- [ ] **Demo data switch** (for App Review and for screenshots).
- [ ] German + English texts; VoiceOver labels on warning colours; Dynamic Type.
- [ ] Rating prompt (`requestReview`) after a positive moment, e.g. the third time a warning was useful, never on first launch.
- [ ] Optional: privacy-friendly analytics (TelemetryDeck) to see which features are used.

**Before release**
- [ ] **TestFlight** beta with 10–20 people in Austria, during real weather.
- [ ] Test background alerts for a week on your own phone (measure how late they arrive).
- [ ] Test with no internet, with location denied, with 20 places.

**Launch timing tip:** thunderstorm season in Austria and Germany is roughly **May–August**, and searches for "Unwetter" spike then. Aim to be live by **April**, so the app has ratings before the season starts.

**After launch**
- [ ] Watch keyword ranks in the ASO tool (AT/DE) weekly. Update keywords after 4 weeks.
- [ ] Ask happy users for ratings after a storm passes.
- [ ] Post in local communities (r/Austria, regional Facebook groups, ski and hiking forums) during the first big storm of the season.
