# Pomysły na aplikacje

Notatki z badań nad pomysłami na aplikacje mobilne (Kotlin Multiplatform).
Dane o konkurencji pochodzą z App Store (iTunes Search API i autouzupełnianie)
w dniach 11–12 listopada 2026 r. Wolumeny wyszukiwań są oszacowaniami, bo Apple
i Google ich nie publikują.

| Pomysł | Status | Kategoria |
| --- | --- | --- |
| [Aplikacja z codziennymi wyzwaniami ruchowymi](#aplikacja-z-codziennymi-wyzwaniami-ruchowymi) | odłożony na później | Health & Fitness |
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
- [iTunes Search API, przykładowe zapytanie](https://itunes.apple.com/search?term=exercise+snacks&country=us&entity=software&limit=10)
  (ten sam adres z inną frazą i kodem kraju odtwarza każdy wiersz tabel)
