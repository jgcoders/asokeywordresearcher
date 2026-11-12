# Pomysły na aplikacje

Notatki z badań nad pomysłami na aplikacje mobilne (Kotlin Multiplatform).
Dane o konkurencji pochodzą z App Store (iTunes Search API i autouzupełnianie)
w dniach 11–12 listopada 2026 r. Wolumeny wyszukiwań są oszacowaniami, bo Apple
i Google ich nie publikują.

| Pomysł | Status | Kategoria |
| --- | --- | --- |
| [Aplikacja z codziennymi wyzwaniami ruchowymi](#aplikacja-z-codziennymi-wyzwaniami-ruchowymi) | odłożony na później | Health & Fitness |
| [AI home designer](#ai-home-designer) | odłożony na później | Lifestyle / Graphics & Design |
| [Inne sprawdzone nisze](#inne-sprawdzone-nisze) | odrzucone lub rezerwowe | różne |

---

## Aplikacja z codziennymi wyzwaniami ruchowymi

**Status: odłożony na później.** Wysoki sufit przychodu, ale bardzo silna
konkurencja i instalacje zależne od marketingu, a nie od wyszukiwania.

### Pomysł

Codzienne wyzwania, żeby się ruszyć (typu „challenge”). Rekomendowany wariant:
**mikro-ruch dla osób pracujących przy biurku**, czyli kilka 2-minutowych wyzwań
dziennie z przypomnieniami oraz wyzwania ze znajomymi lub zespołem. Mała w
budowie (bez długich treningów wideo), z naturalnym przejściem do sprzedaży firmom.

### Konkurencja (App Store, 12 listopada 2026 r.)

„Mediana” i „maks.” to liczba ocen aplikacji w pierwszych 10 wynikach.

| Fraza (kraj) | Mediana ocen top 10 | Maks. ocen | Wniosek |
| --- | --- | --- | --- |
| daily workout (USA) | 51 349 | 532 375 | zajęte |
| chair yoga (USA) | 47 391 | 119 919 | zajęte |
| walking challenge (USA) | 13 799 | 165 379 | zajęte |
| workout challenge (USA) | 9 751 | 532 375 | zajęte |
| step challenge (USA) | 5 730 | 304 705 | zajęte |
| fitness challenge (USA) | 5 022 | 58 571 | trudne |
| challenge with friends (USA) | 4 420 | 381 269 | trudne |
| fitness challenge (Niemcy) | 4 441 | 66 778 | trudne |
| 30 tage challenge (Niemcy) | 2 292 | 17 647 | trudne |
| trening w domu (Polska) | 2 205 | 6 187 | trudne |
| wall pilates (USA) | 1 623 | 714 724 | trudne |
| 30 day challenge (USA) | 1 264 | 148 830 | średnie |
| movement reminder (USA) | 895 | 16 585 | średnie |
| squat challenge (USA) | 545 | 61 812 | średnie |
| plank challenge (USA) | 354 | 2 751 | do zdobycia |
| 30 day challenge (Wlk. Brytania) | 255 | 23 214 | średnie |
| pushup challenge (USA) | 135 | 9 468 | do zdobycia |
| wyzwanie 30 dni (Polska) | 31 | 1 192 | słabo obsadzone |
| exercise snacks (USA) | 2 | 282 684 | 9 z 10 wyników poniżej 500 ocen; 5 wydanych w ostatnim roku |
| desk stretch (USA) | 0 | 3 | wszystkie 10 wydane w ostatnim roku |

Wnioski:

- Ogólne „codzienne wyzwanie treningowe” trafia w najbardziej obsadzone frazy.
- Luki są w wąskich odmianach: jedno ćwiczenie (plank, pompki) albo krótki ruch
  w ciągu dnia dla osób przy biurku („exercise snacks”, „desk stretch”).
- Nisze „exercise snacks” i „desk stretch” są świeże: zero ocen może oznaczać
  szansę albo brak ruchu z wyszukiwarki. Trzeba to sprawdzić wskaźnikiem
  popularności w Apple Search Ads.

### Opcje monetyzacji

- **Subskrypcja z paywallem po onboardingu** (standard kategorii): krótki quiz
  (cel, poziom, czas), spersonalizowany plan, paywall z okresem próbnym. Według
  raportu RevenueCat 2026 twardy paywall zamienia ok. 11% użytkowników
  w płacących, a freemium ok. 2%.
- **Plany tygodniowy i roczny**, roczny ze zniżką jako domyślny. Typowe poziomy
  w kategorii to ok. 5–8 USD tygodniowo i 30–40 USD rocznie (z wiedzy o rynku,
  nie z tego badania).
- **Dożywotni dostęp** jako trzecia opcja na paywallu.
- **Wyzwania ze znajomymi:** głównie silnik wzrostu (darmowe instalacje
  z zaproszeń); płatne mogą być prywatne grupy lub własne wyzwania.
- **Wyzwania firmowe (B2B):** firma płaci za osobę w zespole; wyższa wartość
  klienta, ale sprzedaż poza sklepem.
- **Zakład o własne pieniądze:** motywuje, ale wchodzi w przepisy o płatnościach
  i hazardzie; odradzane na start.
- **Reklamy:** tylko jako dodatek w darmowej wersji.

### Rachunek poglądowy (nie prognoza)

Założenia: plan roczny 29,99 USD, prowizja sklepu 15%.

| Instalacje miesięcznie | Konwersja do płatności | Nowi płacący | Przychód netto z nowych subskrypcji |
| --- | --- | --- | --- |
| 1 000 | 2% (freemium) | 20 | ok. 510 USD |
| 3 000 | 2% (freemium) | 60 | ok. 1 530 USD |
| 3 000 | 5% (paywall z okresem próbnym) | 150 | ok. 3 820 USD |
| 10 000 | 5% (paywall z okresem próbnym) | 500 | ok. 12 750 USD |

Co decyduje o wyniku:

- **Źródło instalacji.** Duzi gracze kupują ruch reklamami; na głównych frazach
  z samego wyszukiwania się nie przebić. Realne źródła dla małego zespołu: wąska
  fraza, krótkie wideo (TikTok, Reels), zaproszenia znajomych.
- **Utrzymanie.** Aplikacje fitness mają wysoką rezygnację. Według RevenueCat
  2026 tańsze aplikacje zatrzymują 36% subskrybentów, droższe 23%, dlatego plan
  roczny płatny z góry jest ważniejszy niż miesięczny.

### Kiedy wrócić do tego pomysłu

- Gdy będzie budżet na reklamy albo plan regularnego tworzenia krótkich wideo.
- Przed startem: sprawdzić popularność fraz „exercise snacks”, „desk stretch”,
  „pushup challenge” i „plank challenge” w Apple Search Ads oraz przeczytać
  opinie 1–3★ u konkurentów.

---

## AI home designer

**Status: odłożony na później.** Prosty w budowie, ale ogólna wersja wchodzi na
rynek z silnym liderem, a każda generacja obrazu kosztuje. Sens ma tylko w niszy.

### Pomysł

Użytkownik robi zdjęcie pokoju, wybiera styl i typ pomieszczenia, a model AI
generuje nowy wystrój z zachowaniem układu ścian, okien i perspektywy. Wynik:
porównanie przed/po, zapis, udostępnienie.

Rekomendowany wariant: **virtual staging dla agentów nieruchomości
i wynajmujących** (zdjęcie pustego mieszkania → umeblowane). Klient biznesowy
płaci regularnie, bo co miesiąc ma nowe oferty. Alternatywy: łazienka albo ogród.

### Konkurencja (App Store USA, 12 listopada 2026 r.)

„Mediana” to liczba ocen aplikacji w pierwszych 10 wynikach.

| Fraza | Mediana ocen top 10 | Lider (oceny) | Wniosek |
| --- | --- | --- | --- |
| home design | 145 996 | Design Home (517 711) | zajęte |
| interior design | 46 603 | Design Home (517 711) | zajęte |
| ai home design | 34 874 | Home AI (160 901, wydana w 2024 r.) | zajęte |
| room design | 25 815 | Redecor (271 574) | zajęte |
| ai interior design | 23 772 | Home AI (160 901) | zajęte |
| house design 3d | 19 176 | Home Design 3D (104 995) | zajęte |
| floor plan | 12 598 | Home Planner AI (46 603) | zajęte |
| exterior design ai | 10 884 | Home AI (160 901) | trudne |
| ai architect | 9 585 | Home Planner AI (46 603) | trudne |
| ai room planner | 6 214 | Home AI (160 901) | trudne |
| room redesign | 3 108 | Design Home (517 711) | trudne |
| room planner | 3 086 | Home AI (160 901) | trudne |
| landscape design | 2 178 | Planner 5D (42 745) | średnie |
| kitchen design | 1 672 | Houzz (324 996) | średnie |
| furniture ar | 1 658 | Ashley (150 997) | średnie |
| paint my room | 1 290 | 87 020 | średnie |
| garden design ai | 1 195 | iScape (28 869) | średnie |
| wall color visualizer | 749 | 11 720 | średnie |
| bathroom design | 91 | Houzz (324 996) | do zdobycia, lider to ogólna platforma |
| virtual staging | 14 | Home AI (160 901) | do zdobycia: 9 z 10 wyników poniżej 500 ocen, 5 wydanych w ostatnim roku |

Wniosek: kategoria zarabia (Home AI zdobyła 160 901 ocen w dwa lata), ale ogólny
„AI home designer” konkuruje z ugruntowanym liderem. Luki: virtual staging,
łazienka, ogród.

### Budowa

- **Czas:** szacunkowo 3–5 tygodni dla jednej osoby na pierwszą wersję.
- **Model AI:** gotowy model przez API (obraz na podstawie obrazu, z zachowaniem
  struktury pomieszczenia). Bez trenowania własnego modelu. Dostawcę i model
  wybrać po testach na prawdziwych zdjęciach.
- **Serwer jest konieczny:** klucza API nie wolno trzymać w aplikacji. Minimum to
  funkcja serwerowa (np. Cloud Functions, Cloudflare Workers), która sprawdza
  kredyty użytkownika i dopiero wtedy wywołuje model. Serwer trzyma też saldo
  kredytów.
- **Koszt generacji:** z wiedzy ogólnej rząd kilku centów za obraz, zależnie od
  modelu (do sprawdzenia w aktualnych cennikach). Limity i płatności muszą
  działać od pierwszego dnia.
- **Jakość:** model musi zachować układ pokoju (bez dorysowanych okien i krzywych
  ścian). Dobór modelu, promptów i ustawień to większość pracy.
- **KMP:** aparat i wybór zdjęć natywnie; ekrany, logika kredytów i komunikacja
  z serwerem we wspólnym kodzie.
- **Prywatność:** zdjęcia wnętrz to dane prywatne; polityka prywatności musi
  opisywać, gdzie trafiają i jak długo są przechowywane.

### Monetyzacja (natywne StoreKit 2 i Google Play Billing)

- **Twardy paywall z okresem próbnym:** 1–3 darmowe generacje, potem płatność.
- **Kredyty jako produkty zużywalne (consumable):** saldo trzymane na serwerze,
  nie w telefonie.
- **Subskrypcja z miesięczną pulą generacji** (tygodniowa i roczna), tak
  zarabiają liderzy.
- **Dla virtual staging:** plan biznesowy z większą pulą generacji i eksportem
  w wysokiej rozdzielczości.
- **Ryzyko utrzymania:** według relacji z raportu RevenueCat 2026 aplikacje AI
  zarabiają ok. 41% więcej na użytkowniku, ale tracą subskrybentów ok. 30%
  szybciej. Klient prywatny przerabia mieszkanie raz i rezygnuje.

### Kiedy wrócić do tego pomysłu

- Gdy będzie budżet na koszty generacji i serwer oraz plan dotarcia do agentów
  nieruchomości (to klient poza wyszukiwarką App Store).
- Przed startem: sprawdzić popularność fraz „virtual staging”, „bathroom design”,
  „garden design ai” w Apple Search Ads, porównać ceny i jakość modeli na
  20–30 prawdziwych zdjęciach pustych mieszkań.

---

## Inne sprawdzone nisze

| Nisza | Dane (App Store) | Ocena |
| --- | --- | --- |
| Egzaminy zawodowe w USA (elektryk Journeyman/Master, NEC) | „electrician exam prep”: mediana 67 ocen w top 10, lider 178; ceny konkurentów 4,99–119 USD | Dobra nisza, odrzucona przez użytkownika jako kierunek |
| Dziennik budowy | bautagebuch (DE) mediana 32; site diary (UK) mediana 6; site diary (USA) mediana 0 | Najlepsza alternatywa w Business; większa aplikacja (zdjęcia, pogoda, raport PDF) |
| Księga kasowa | kassenbuch (DE) mediana 284; cash book (USA) mediana 9 | Mała aplikacja; w Niemczech ugruntowani gracze |
| Czas pracy kierowcy | tachograph (UK) mediana 2; czas pracy kierowcy (PL) mediana 25 | Te same przepisy w UE; popyt potwierdzony tylko w Wlk. Brytanii |
| Dokument dostawy | lieferschein (DE) mediana 3; albarán (ES) mediana 3; packing slip (USA) mediana 20 | Mała aplikacja, słaby popyt poza Niemcami |
| Kalkulator VAT | vat calculator (USA) mediana 3; (UK) mediana 10 | Bardzo mała aplikacja; użytkownicy nie płacą |
| Narzędzie ASO dla deweloperów | aso keyword tool: maks. 26 ocen w top 10 | Za mały ruch w sklepie; ewentualnie jako produkt webowy |

Frazy zbyt konkurencyjne (mediana ocen w top 10, USA): mileage tracker 39 424,
invoice maker 27 610, time clock 20 250, cdl prep 14 969, hours tracker 14 087,
passport photo 10 071, business card scanner 10 175, citizenship test 2026 8 489.

## Źródła

- [RevenueCat: State of Subscription Apps 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)
- [9to5Mac o raporcie RevenueCat 2026](https://9to5mac.com/?p=1042212)
- [PPC Land: AI apps earn 41% more per user but churn 30% faster](https://ppc.land/ai-apps-earn-41-more-per-user-but-churn-30-faster-revenuecat-finds/)
- [iTunes Search API, przykładowe zapytanie](https://itunes.apple.com/search?term=exercise+snacks&country=us&entity=software&limit=10)
  (ten sam adres z inną frazą i kodem kraju odtwarza każdy wiersz tabel)
