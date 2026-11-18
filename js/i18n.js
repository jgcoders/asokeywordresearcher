// Interface language. English text is the key; other languages map it to a
// translation, and anything missing falls back to English. Data (ideas, scans,
// saved keywords) stays in English; only what's shown on screen is translated.

export const LANGS = [['en', 'English'], ['pl', 'Polski']];

const KEY = 'aof:lang';

function detect() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved === 'en' || saved === 'pl') return saved;
  } catch { /* storage unavailable */ }
  try {
    if (typeof navigator !== 'undefined' && /^pl\b/i.test(navigator.language || '')) return 'pl';
  } catch { /* ignore */ }
  return 'en';
}

export let lang = detect();

export function setLang(code) {
  lang = code === 'pl' ? 'pl' : 'en';
  try { localStorage.setItem(KEY, JSON.stringify(lang)); } catch { /* ignore */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const locale = () => (lang === 'pl' ? 'pl-PL' : 'en-US');

/** Translate English text; {name} placeholders are filled from vars (not escaped). */
export function t(text, vars) {
  let s = (lang === 'pl' ? PL[text] : EN[text]) || text;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// ---------- plurals ----------
const WORDS = {
  rating: { en: ['rating', 'ratings'], pl: ['ocena', 'oceny', 'ocen'] },
  review: { en: ['review', 'reviews'], pl: ['recenzja', 'recenzje', 'recenzji'] },
  app: { en: ['app', 'apps'], pl: ['aplikacja', 'aplikacje', 'aplikacji'] },
  mention: { en: ['mention', 'mentions'], pl: ['wzmianka', 'wzmianki', 'wzmianek'] },
  category: { en: ['category', 'categories'], pl: ['kategoria', 'kategorie', 'kategorii'] },
  country: { en: ['country', 'countries'], pl: ['kraj', 'kraje', 'krajów'] },
  place: { en: ['place', 'places'], pl: ['miejsce', 'miejsca', 'miejsc'] },
  chart: { en: ['chart', 'charts'], pl: ['ranking', 'rankingi', 'rankingów'] },
  second: { en: ['second', 'seconds'], pl: ['sekunda', 'sekundy', 'sekund'] },
};

function plForm(n, [one, few, many]) {
  if (!Number.isInteger(n)) return many; // "2.1k" and fractions
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/** "12 ratings" / "12 ocen". `shown` is the number as displayed (e.g. "2.1k"). */
export function cnt(n, word, shown = n) {
  const w = WORDS[word];
  if (!w) return `${shown} ${word}`;
  const num = typeof n === 'number' ? n : Number(n);
  const isK = typeof shown === 'string' && /[kM]$/.test(shown);
  if (lang === 'pl') return `${shown} ${isK ? w.pl[2] : plForm(num, w.pl)}`;
  return `${shown} ${num === 1 && !isK ? w.en[0] : w.en[1]}`;
}

// ---------- English labels that differ from their key ----------
const EN = { 'Keyword tab': 'Keyword' };

// ---------- Polish ----------
const PL = {
  // countries, regions, categories, charts
  'United States': 'Stany Zjednoczone', US: 'USA', 'United Kingdom': 'Wielka Brytania', UK: 'Wlk. Brytania',
  Canada: 'Kanada', Australia: 'Australia', 'New Zealand': 'Nowa Zelandia', Ireland: 'Irlandia', Singapore: 'Singapur',
  Germany: 'Niemcy', France: 'Francja', Italy: 'Włochy', Spain: 'Hiszpania', Netherlands: 'Holandia', Belgium: 'Belgia',
  Austria: 'Austria', Switzerland: 'Szwajcaria', Sweden: 'Szwecja', Norway: 'Norwegia', Denmark: 'Dania', Finland: 'Finlandia',
  Poland: 'Polska', Portugal: 'Portugalia', Japan: 'Japonia', 'South Korea': 'Korea Południowa', Korea: 'Korea',
  Taiwan: 'Tajwan', 'Hong Kong': 'Hongkong', China: 'Chiny', India: 'Indie', 'United Arab Emirates': 'Zjednoczone Emiraty Arabskie',
  UAE: 'ZEA', 'Saudi Arabia': 'Arabia Saudyjska', Israel: 'Izrael', Turkey: 'Turcja', Brazil: 'Brazylia', Mexico: 'Meksyk',
  'English-speaking': 'Anglojęzyczne', Europe: 'Europa', Asia: 'Azja', 'Middle East': 'Bliski Wschód', 'Latin America': 'Ameryka Łacińska',
  Books: 'Książki', Business: 'Biznes', 'Developer Tools': 'Narzędzia dla programistów', Education: 'Edukacja', Entertainment: 'Rozrywka',
  Finance: 'Finanse', 'Food & Drink': 'Jedzenie i picie', Games: 'Gry', 'Graphics & Design': 'Grafika i projektowanie',
  'Health & Fitness': 'Zdrowie i fitness', Lifestyle: 'Styl życia', Medical: 'Medycyna', Music: 'Muzyka', Navigation: 'Nawigacja',
  News: 'Wiadomości', 'Photo & Video': 'Zdjęcia i wideo', Productivity: 'Produktywność', Reference: 'Leksykony', Shopping: 'Zakupy',
  'Social Networking': 'Serwisy społecznościowe', Sports: 'Sport', Travel: 'Podróże', Utilities: 'Narzędzia', Weather: 'Pogoda',
  'Top Grossing': 'Najbardziej dochodowe', 'Top Paid': 'Najlepsze płatne', 'Top Free': 'Najlepsze darmowe',
  'Top payers': 'Najwięcej płacą', English: 'Anglojęzyczne', 'Rich & small': 'Bogate i małe',

  // tabs and titles
  Niches: 'Nisze', Keyword: 'Słowo kluczowe', 'Keyword tab': 'Fraza', Countries: 'Kraje', Ideas: 'Pomysły', Saved: 'Zapisane', Country: 'Kraj',
  Sections: 'Sekcje',

  // time
  unknown: 'nieznane', today: 'dziś', '{n}d ago': '{n} dni temu', '{n} mo ago': '{n} mies. temu', '{n} yr ago': '{n} r. temu',
  'just now': 'przed chwilą', '{n} min ago': '{n} min temu', '{n} h ago': '{n} godz. temu', '{n} days ago': '{n} dni temu',

  // errors and toasts
  'Apple is limiting requests right now. Wait a minute, then try again.': 'Apple ogranicza teraz liczbę zapytań. Odczekaj minutę i spróbuj ponownie.',
  "You're offline. Connect to the internet and try again.": 'Brak połączenia z internetem. Połącz się i spróbuj ponownie.',
  "Couldn't load data from the App Store. Try again in a moment.": 'Nie udało się pobrać danych z App Store. Spróbuj za chwilę.',
  'Removed from Saved': 'Usunięto z zapisanych',
  'Keyword saved': 'Zapisano słowo kluczowe',
  'All changes saved': 'Zapisano zmiany',
  'Added to Ideas': 'Dodano do pomysłów',
  "Couldn't save. This browser is blocking storage.": 'Nie udało się zapisać. Ta przeglądarka blokuje zapis danych.',
  'Idea deleted': 'Pomysł usunięty',
  'API key saved on this device': 'Klucz API zapisany na tym urządzeniu',
  'API key removed': 'Klucz API usunięty',
  'No ideas to copy yet': 'Nie ma jeszcze pomysłów do skopiowania',
  'Copied all ideas': 'Skopiowano wszystkie pomysły',
  'Copied as CSV': 'Skopiowano jako CSV',
  "Couldn't copy automatically. Select the text below and copy it.": 'Nie udało się skopiować automatycznie. Zaznacz tekst poniżej i skopiuj go.',
  'Language changed': 'Zmieniono język',

  // scores and verdicts
  Strong: 'Mocne', 'Worth a look': 'Warte uwagi', Weak: 'Słabe', Hot: 'Gorąca', Low: 'Niska',
  Promising: 'Obiecująca', Possible: 'Możliwa', Tough: 'Trudna',
  'Big market': 'Duży rynek', 'Medium market': 'Średni rynek', 'Small market': 'Mały rynek',
  'Many small apps make money here. A newcomer can realistically get a share.': 'Wiele małych aplikacji tu zarabia. Nowa aplikacja ma realną szansę na udział w rynku.',
  'Many small apps reach this chart. Visibility is achievable.': 'Wiele małych aplikacji trafia do tego rankingu. Da się tu zostać zauważonym.',
  'Some room for smaller apps, but the top is held by big ones.': 'Jest trochę miejsca dla mniejszych aplikacji, ale szczyt należy do dużych.',
  'Dominated by big, established apps. Hard for a newcomer.': 'Dominują duże, znane aplikacje. Trudno tu wejść nowej.',
  'This chart is empty for this country.': 'Ten ranking jest pusty w tym kraju.',

  // tags
  'Gap {n}': 'Luka {n}', 'Small earner': 'Mały, ale zarabia', 'Under 1k ratings': 'Poniżej 1 tys. ocen', 'Low rated ★{r}': 'Niska ocena ★{r}',
  'No update in 1 yr+': 'Brak aktualizacji od roku+', New: 'Nowa', Paid: 'Płatna',
  '{ratings} · ★{r} · updated {ago}': '{ratings} · ★{r} · aktualizacja {ago}',
  'No ratings yet · updated {ago}': 'Brak ocen · aktualizacja {ago}', 'No details available': 'Brak szczegółów',
  'Up {n} places (was #{was})': 'W górę o {n} miejsc (było #{was})', 'New in Top Grossing': 'Nowa w najbardziej dochodowych',
  'No update in {n} mo': 'Brak aktualizacji od {n} mies.', 'Charts in {n} countries': 'W rankingach w {n} krajach',
  '#{rank} in Top Grossing': '#{rank} w najbardziej dochodowych',

  // niches
  'Niches view': 'Widok nisz', 'Top apps': 'Najlepsze aplikacje', Categories: 'Kategorie', 'One category': 'Jedna kategoria',
  'Biggest gaps': 'Największe luki', Rising: 'Rosnące', 'New earners': 'Nowe zarabiające',
  'Each App Store scan scores every Top Grossing app in {c} countries and {g} categories. High Gap scores are apps people pay for but are unhappy with.':
    'Każdy skan App Store ocenia wszystkie najbardziej dochodowe aplikacje w {c} krajach i {g} kategoriach. Wysoka luka to aplikacje, za które ludzie płacą, ale nie są z nich zadowoleni.',
  'All countries': 'Wszystkie kraje', 'All categories': 'Wszystkie kategorie', Category: 'Kategoria',
  'Loading the latest scan…': 'Wczytywanie najnowszego skanu…',
  'No App Store scan has been published yet.': 'Nie opublikowano jeszcze żadnego skanu App Store.',
  'Start one from GitHub (Actions → App Store scan → Run workflow). Until then, use <b>Categories</b> or <b>One category</b> to scan live.':
    'Uruchom go w GitHub (Actions → App Store scan → Run workflow). Do tego czasu użyj <b>Kategorii</b> albo <b>Jednej kategorii</b>, żeby skanować na żywo.',
  "Couldn't load the latest scan. Check your connection and try again.": 'Nie udało się wczytać najnowszego skanu. Sprawdź połączenie i spróbuj ponownie.',
  'Try again': 'Spróbuj ponownie',
  'Updated {ago} · {charts}': 'Zaktualizowano {ago} · {charts}', ' · trends since {date}': ' · trendy od {date}',
  'Trends appear once the scan has run on two different days. Check back tomorrow.': 'Trendy pojawią się, gdy skan zostanie wykonany w dwa różne dni. Zajrzyj jutro.',
  'Loading {name}…': 'Wczytywanie: {name}…',
  'Nothing here for this filter.': 'Brak wyników dla tego filtra.',
  'Nothing here for this filter. The overall list keeps the best 150 apps; pick a country to see more for one category.':
    'Brak wyników dla tego filtra. Lista ogólna zawiera 150 najlepszych aplikacji; wybierz kraj, aby zobaczyć więcej w jednej kategorii.',
  'Gap score = Top Grossing rank (30%) + ratings count (20%) + unhappy users: rated below the typical app in its chart, or not updated for months (30%) + not a giant worldwide (20%). Sports, news, social, entertainment and music apps get a discount because content rights or networks protect them. Tap an app for details and complaints.':
    'Luka = pozycja w najbardziej dochodowych (30%) + liczba ocen (20%) + niezadowoleni użytkownicy: ocena niższa niż typowa w rankingu albo brak aktualizacji od miesięcy (30%) + brak giganta na świecie (20%). Aplikacje sportowe, informacyjne, społecznościowe, rozrywkowe i muzyczne mają obniżony wynik, bo chronią je prawa do treści lub sieć użytkowników. Dotknij aplikacji, aby zobaczyć szczegóły i skargi.',
  'Apps that climbed at least 10 places in Top Grossing and are now in the top 50. A niche that is heating up.':
    'Aplikacje, które awansowały o co najmniej 10 miejsc w najbardziej dochodowych i są teraz w pierwszej pięćdziesiątce. Nisza, która się rozgrzewa.',
  'Apps with under 5k ratings that entered the top 60 in Top Grossing. Small apps starting to earn.':
    'Aplikacje z mniej niż 5 tys. ocen, które weszły do pierwszej sześćdziesiątki najbardziej dochodowych. Małe aplikacje, które zaczynają zarabiać.',
  'Gap score {n}': 'Luka {n}',
  'All {g} categories in {country}, ranked by room for small apps, market size and the biggest Gap scores. Change the country at the top.':
    'Wszystkie {g} kategorie w kraju: {country}, uszeregowane według miejsca dla małych aplikacji, wielkości rynku i największych luk. Kraj zmienisz na górze.',
  'Scan live now': 'Skanuj teraz na żywo',
  '{size} · typical top app has {n}': '{size} · typowa czołowa aplikacja ma {n}',
  'Niche score {n}, {label}': 'Wynik niszy {n}, {label}',
  '{n} small earners': 'Małe, ale zarabiają: {n}', '{n} new': 'Nowe: {n}', '{n} neglected': 'Zaniedbane: {n}',
  'Example: <b>{name}</b> is #{rank} in Top Grossing with {ratings}.': 'Przykład: <b>{name}</b> jest #{rank} w najbardziej dochodowych i ma {ratings}.',
  'Biggest gap: <b>{name}</b> (Gap {n})': 'Największa luka: <b>{name}</b> (luka {n})',
  'See the full chart →': 'Zobacz cały ranking →',
  'Apple asked us to slow down. Waiting 30 seconds, then continuing…': 'Apple poprosiło o zwolnienie. Czekamy 30 sekund i kontynuujemy…',
  'Scanning {name} · {i} of {n}': 'Skanowanie: {name} · {i} z {n}',
  '{error} Categories scanned so far are below.': '{error} Poniżej kategorie zeskanowane do tej pory.',
  'Scanned live {ago}.': 'Zeskanowano na żywo {ago}.',
  'From the App Store scan of {date} ({ago}).': 'Ze skanu App Store z {date} ({ago}).',
  'The latest scan has no data for {country}.': 'Najnowszy skan nie ma danych dla kraju: {country}.',
  'No App Store scan is available yet.': 'Nie ma jeszcze skanu App Store.',
  'Tap <b>Scan live now</b> to rank every category in {country}.': 'Dotknij <b>Skanuj teraz na żywo</b>, aby uszeregować wszystkie kategorie w kraju: {country}.',
  'A live scan takes 1–2 minutes. Scanning again within 6 hours is almost instant.': 'Skan na żywo trwa 1–2 minuty. Ponowny skan w ciągu 6 godzin jest prawie natychmiastowy.',
  'Best bets in {country}: <b>{list}</b>.': 'Najlepsze szanse w kraju {country}: <b>{list}</b>.',
  'No category in {country} scores as Promising right now. Look at the Possible ones.': 'Żadna kategoria w kraju {country} nie jest teraz obiecująca. Spójrz na możliwe.',
  ' Note: to publish in China, Apple requires a government ICP filing for your app, which is hard for developers outside China.':
    ' Uwaga: aby publikować w Chinach, Apple wymaga rządowej rejestracji ICP aplikacji, co jest trudne dla twórców spoza Chin.',
  " {n} couldn't be loaded.": ' Nie udało się wczytać: {n}.',
  'Score = half room for small apps (small earners, new and neglected apps, weighed against market size) and half the average of the 5 biggest Gap scores. 55+ Promising, 45–54 Possible. Tap a keyword to score it.':
    'Wynik = w połowie miejsce dla małych aplikacji (małe zarabiające, nowe i zaniedbane aplikacje, w odniesieniu do wielkości rynku), a w połowie średnia 5 największych luk. 55+ obiecujące, 45–54 możliwe. Dotknij słowa kluczowego, aby je ocenić.',
  'See which apps earn money in a category and how many of them are small. Many small earners means a newcomer can get in.':
    'Zobacz, które aplikacje zarabiają w danej kategorii i ile z nich jest małych. Wiele małych zarabiających oznacza, że nowa aplikacja ma szansę.',
  Chart: 'Ranking', 'Scan category': 'Skanuj kategorię',
  'Reading {chart} for {genre} in {country}…': 'Wczytywanie: {chart}, {genre}, {country}…',
  'Pick a category and tap <b>Scan category</b>.': 'Wybierz kategorię i dotknij <b>Skanuj kategorię</b>.',
  'Start with Top Grossing. It shows where users actually pay. Health &amp; Fitness, Productivity, Education and Lifestyle are good first scans for small, paid apps.':
    'Zacznij od najbardziej dochodowych. Pokazują, gdzie użytkownicy naprawdę płacą. Zdrowie i fitness, Produktywność, Edukacja i Styl życia to dobre kategorie na początek dla małych, płatnych aplikacji.',
  'Words that repeat in the names of small and new apps. Tap one to score it.': 'Słowa powtarzające się w nazwach małych i nowych aplikacji. Dotknij, aby ocenić.',
  'No repeating words found in this chart.': 'W tym rankingu nie ma powtarzających się słów.',
  'small earners (under 5k ratings)': 'małe zarabiające (poniżej 5 tys. ocen)', 'small apps (under 5k ratings)': 'małe aplikacje (poniżej 5 tys. ocen)',
  'released in the last 18 months': 'wydane w ostatnich 18 miesiącach', 'not updated in a year': 'bez aktualizacji od roku',
  'Keyword ideas': 'Pomysły na słowa kluczowe', 'The chart ({n})': 'Ranking ({n})', 'Show all apps': 'Pokaż wszystkie', 'Only small &amp; new': 'Tylko małe i nowe',
  'No small or new apps in this chart.': 'W tym rankingu nie ma małych ani nowych aplikacji.',

  // keyword
  'Score a search term: how many people want it, how beatable the top 10 apps are, and whether they make money.':
    'Oceń frazę wyszukiwania: ilu ludzi jej szuka, czy da się pokonać 10 czołowych aplikacji i czy one zarabiają.',
  'e.g. plant care': 'np. plant care', Check: 'Sprawdź',
  'Checking "{kw}" in {country}…': 'Sprawdzanie „{kw}” w kraju: {country}…',
  'Type a search term and tap <b>Check</b>, or try one of these:': 'Wpisz frazę i dotknij <b>Sprawdź</b> albo wypróbuj jedną z tych:',
  'No apps found for "{kw}" in {country}. Try a shorter or more common phrase.': 'Nie znaleziono aplikacji dla „{kw}” w kraju: {country}. Spróbuj krótszej lub popularniejszej frazy.',
  'Top {n} apps have {ratings} combined.': '{n} czołowych aplikacji ma łącznie {ratings}.',
  ' Few people use apps for this.': ' Mało osób korzysta z takich aplikacji.',
  'Typical top app has {ratings}. {hits} of {n} have this keyword in their name. {weak} look beatable (few ratings, low rating, or no update in a year).':
    'Typowa czołowa aplikacja ma {ratings}. {hits} z {n} ma tę frazę w nazwie. Do pokonania wygląda: {weak} (mało ocen, niska ocena albo brak aktualizacji od roku).',
  'None of the top apps are in Top Grossing or charge upfront.': 'Żadna z czołowych aplikacji nie jest w najbardziej dochodowych ani nie jest płatna z góry.',
  '{hits} of {n} are in Top Grossing{forGenre}. {paid} charge upfront.': '{hits} z {n} jest w najbardziej dochodowych{forGenre}. Płatne z góry: {paid}.',
  ' for {genre}': ' w kategorii {genre}',
  'Opportunity score {n} out of 100': 'Wynik szansy {n} na 100', 'Opportunity score · {country}': 'Wynik szansy · {country}',
  'Saved ✓': 'Zapisano ✓', Save: 'Zapisz', 'Compare countries': 'Porównaj kraje', 'Open idea': 'Otwórz pomysł', 'Add to ideas': 'Dodaj do pomysłów',
  Demand: 'Popyt', Ease: 'Łatwość', Money: 'Pieniądze',
  'Top {n} for this search': '{n} czołowych dla tej frazy',
  'Tap an app to read what its users complain about. Scores are estimates from public App Store data; ratings stand in for downloads.':
    'Dotknij aplikacji, aby przeczytać, na co skarżą się jej użytkownicy. Wyniki to szacunki z publicznych danych App Store; oceny zastępują liczbę pobrań.',

  // complaints
  'What users complain about': 'Na co skarżą się użytkownicy', 'Starting…': 'Uruchamianie…',
  'Let Claude read the recent 1–3 star reviews of the top {n} apps and list what users want fixed.':
    'Pozwól Claude przeczytać najnowsze recenzje 1–3 gwiazdki {n} czołowych aplikacji i wypisać, co użytkownicy chcą poprawić.',
  'Summarize complaints': 'Podsumuj skargi',
  'Uses your own Anthropic API key and is billed to your Anthropic account, usually well under 1¢ per summary with Claude Haiku 5.5. Results stay on this device for 7 days.':
    'Używa Twojego klucza API Anthropic i jest rozliczane na Twoim koncie Anthropic, zwykle znacznie poniżej 1 centa za podsumowanie z Claude Haiku 5.5. Wyniki zostają na tym urządzeniu przez 7 dni.',
  'Anthropic API key': 'Klucz API Anthropic',
  'Create a key in the Anthropic Console (console.anthropic.com → API keys); your account needs some credit. The key is stored only on this device and sent only to Anthropic.':
    'Utwórz klucz w Anthropic Console (console.anthropic.com → API keys); konto musi mieć środki. Klucz jest przechowywany tylko na tym urządzeniu i wysyłany tylko do Anthropic.',
  'Save key and summarize': 'Zapisz klucz i podsumuj', Cancel: 'Anuluj',
  'How a new app could win': 'Jak nowa aplikacja może wygrać', 'Price and ads': 'Cena i reklamy', Pitch: 'Hasło',
  'Based on {reviews} of {apps} (Apple\'s feed has reviews for only some apps) · {model} · {cost} · {ago} ·':
    'Na podstawie: {reviews}, {apps} (kanał Apple ma recenzje tylko części aplikacji) · {model} · {cost} · {ago} ·',
  'Summarize again': 'Podsumuj ponownie',
  "Couldn't summarize the reviews. Try again in a minute.": 'Nie udało się podsumować recenzji. Spróbuj za minutę.',
  'under 0.1¢': 'poniżej 0,1¢', 'about {n}¢': 'około {n}¢', 'about ${n}': 'około ${n}',

  // compare
  'Countries: <b>{list}</b>': 'Kraje: <b>{list}</b>',
  '{n} of {max} max selected · about {secs} seconds per comparison.': 'Wybrano {n} z maks. {max} · około {secs} s na porównanie.',
  'Score one keyword in several countries at once. Look for a country where demand exists but competition is weaker.':
    'Oceń jedno słowo kluczowe w kilku krajach naraz. Szukaj kraju, gdzie jest popyt, ale słabsza konkurencja.',
  'e.g. budget planner': 'np. budget planner', Compare: 'Porównaj', 'Keyword to compare': 'Słowo kluczowe do porównania',
  'Outside English-speaking countries, most people search in their own language. Also try the translated keyword, for example "Pflanzenpflege" (German) or "家計簿" (Japanese).':
    'Poza krajami anglojęzycznymi większość ludzi szuka w swoim języku. Wypróbuj też przetłumaczoną frazę, np. „Pflanzenpflege” (niemiecki), „planer budżetu” (polski) albo „家計簿” (japoński).',
  'Pick your countries, type a keyword and tap <b>Compare</b>. Apple limits how fast we can ask, so each country takes a couple of seconds.':
    'Wybierz kraje, wpisz słowo kluczowe i dotknij <b>Porównaj</b>. Apple ogranicza tempo zapytań, więc każdy kraj zajmuje kilka sekund.',
  Waiting: 'Czeka', 'Checking…': 'Sprawdzanie…', Failed: 'Błąd', Skipped: 'Pominięto', 'No apps found': 'Nie znaleziono aplikacji',
  Score: 'Wynik', 'Top app': 'Czołowa aplikacja', 'Best: {country}. ': 'Najlepszy: {country}. ', 'Tap a country to see its full breakdown.': 'Dotknij kraju, aby zobaczyć szczegóły.',

  // saved + settings
  'Claude API key': 'Klucz API Claude', 'Saved on this device. Used only for complaint summaries.': 'Zapisany na tym urządzeniu. Używany tylko do podsumowań skarg.',
  'Remove key': 'Usuń klucz', "No key saved. You'll be asked for one the first time you summarize complaints.": 'Brak zapisanego klucza. Poprosimy o niego przy pierwszym podsumowaniu skarg.',
  'Nothing saved yet.': 'Nic jeszcze nie zapisano.',
  'Check a keyword and tap <b>Save</b> to keep it here. Saved keywords stay on this device.': 'Sprawdź słowo kluczowe i dotknij <b>Zapisz</b>, aby je tu zachować. Zapisane słowa zostają na tym urządzeniu.',
  'Keywords you saved on this device. Tap one to check it again with fresh data.': 'Słowa kluczowe zapisane na tym urządzeniu. Dotknij, aby sprawdzić je ponownie na świeżych danych.',
  Idea: 'Pomysł', 'Remove {kw}': 'Usuń {kw}', 'Copy as CSV': 'Kopiuj jako CSV', Settings: 'Ustawienia', Language: 'Język',
  'Guide and tutorial': 'Przewodnik i samouczek', 'Show the welcome tutorial again': 'Pokaż ponownie samouczek powitalny',
  'Reset guide progress': 'Zresetuj postęp przewodnika', 'Guide progress reset': 'Postęp przewodnika zresetowany',

  // ideas
  'Turn promising keywords into app ideas. Write down why you\'d win and how you\'ll charge, and see how ready each idea is. Ideas stay on this device.':
    'Zamieniaj obiecujące słowa kluczowe w pomysły na aplikacje. Zapisz, dlaczego wygrasz i jak będziesz zarabiać, i zobacz, jak gotowy jest każdy pomysł. Pomysły zostają na tym urządzeniu.',
  'New idea': 'Nowy pomysł', 'Copy all as text': 'Kopiuj wszystko jako tekst', 'Untitled idea': 'Pomysł bez nazwy', 'Ready {d}/{t}': 'Gotowe {d}/{t}',
  'No ideas yet.': 'Nie ma jeszcze pomysłów.',
  'Check a keyword and tap <b>Add to ideas</b>, or tap <b>New idea</b> to start from scratch.': 'Sprawdź słowo kluczowe i dotknij <b>Dodaj do pomysłów</b> albo dotknij <b>Nowy pomysł</b>, aby zacząć od zera.',
  All: 'Wszystkie', 'No ideas with this status.': 'Brak pomysłów z tym statusem.',
  'Check again': 'Sprawdź ponownie', 'Check keyword': 'Sprawdź słowo kluczowe', 'No scores yet.': 'Brak wyników.',
  'Add a keyword to score this idea.': 'Dodaj słowo kluczowe, aby ocenić ten pomysł.',
  opportunity: 'szansa', demand: 'popyt', ease: 'łatwość', money: 'pieniądze',
  'Checked {ago} in {country}. Scores update whenever you check this keyword again.': 'Sprawdzono {ago} w kraju: {country}. Wyniki aktualizują się przy każdym ponownym sprawdzeniu.',
  'Summarize complaints for "{kw}" on the Keyword tab and they\'ll show up here.': 'Podsumuj skargi dla „{kw}” w zakładce Słowo kluczowe, a pojawią się tutaj.',
  'its keyword': 'jego słowa kluczowego',
  'From the keyword score': 'Z wyniku słowa kluczowego', 'From the complaint summary': 'Z podsumowania skarg',
  "From How you'll charge": 'Z pola „Jak będziesz zarabiać”', "Write at least a sentence in Why I'd win": 'Napisz co najmniej zdanie w „Dlaczego wygram”',
  'Changes save automatically': 'Zmiany zapisują się automatycznie', Name: 'Nazwa', Status: 'Status', Price: 'Cena',
  "How you'll charge": 'Jak będziesz zarabiać', 'e.g. $4.99/month': 'np. 19,99 zł/mies.', "Why I'd win": 'Dlaczego wygram',
  'What will you do better than the top apps?': 'Co zrobisz lepiej niż czołowe aplikacje?', Scores: 'Wyniki', 'Ready to build?': 'Gotowe do budowy?',
  Notes: 'Notatki', 'Anything else: features, names, links': 'Cokolwiek jeszcze: funkcje, nazwy, linki', 'Delete idea': 'Usuń pomysł',
  'Delete "{name}"?': 'Usunąć „{name}”?', Delete: 'Usuń', Close: 'Zamknij',
  'Better {name}': 'Lepszy {name}',
  'Competitor: {name} ({seller}), {rankPart}{ratings}, {r}★, updated {ago}.': 'Konkurent: {name} ({seller}), {rankPart}{ratings}, {r}★, aktualizacja {ago}.',
  '#{rank} in {genre} Top Grossing, Gap score {gap}, ': '#{rank} w najbardziej dochodowych ({genre}), luka {gap}, ',
  'unknown developer': 'nieznany twórca',
  Researching: 'Badanie', Building: 'Budowa', Launched: 'Wydany', Dropped: 'Porzucony',
  'Not decided': 'Nie zdecydowano', 'Free trial + subscription': 'Darmowy okres próbny + subskrypcja',
  'Free download + one-time unlock': 'Darmowe pobranie + jednorazowe odblokowanie', 'Paid upfront': 'Płatna z góry',
  'Free with optional upgrade': 'Darmowa z opcjonalnym ulepszeniem',
  'Opportunity score 55+ in its country': 'Wynik szansy 55+ w swoim kraju', 'A complaint I can fix (3+ mentions)': 'Skarga, którą umiem rozwiązać (3+ wzmianki)',
  'I can build version 1 in 2–4 weeks': 'Zbuduję wersję 1 w 2–4 tygodnie', 'Pricing decided': 'Cena ustalona', "I can say why I'd win": 'Umiem powiedzieć, dlaczego wygram',

  // app sheet
  'App details': 'Szczegóły aplikacji', 'ratings in {country}': 'oceny w kraju: {country}', 'average rating': 'średnia ocena',
  'first released': 'pierwsze wydanie', 'last update': 'ostatnia aktualizacja', price: 'cena', category: 'kategoria', Free: 'Darmowa',
  'Gap score {n} · {label}': 'Luka {n} · {label}', 'money (#{rank} in Top Grossing)': 'pieniądze (#{rank} w najbardziej dochodowych)',
  'demand (ratings)': 'popyt (oceny)', 'unhappy users': 'niezadowoleni użytkownicy', beatable: 'do pokonania',
  'Open in App Store ↗': 'Otwórz w App Store ↗', 'Score words from its name': 'Oceń słowa z nazwy',
  'Reading recent reviews…': 'Czytanie najnowszych recenzji…',
  'Recent 1–3 star reviews from {country}. Repeated complaints are features a better app could get right.':
    'Najnowsze recenzje 1–3 gwiazdki z kraju: {country}. Powtarzające się skargi to funkcje, które lepsza aplikacja może zrobić dobrze.',
  '{n} stars': 'gwiazdki: {n}', 'version {v}': 'wersja {v}',
  'No 1–3 star reviews among the {n} most recent. Users seem happy, so this app is harder to beat.': 'Brak recenzji 1–3 gwiazdki wśród {n} najnowszych. Użytkownicy wydają się zadowoleni, więc tę aplikację trudniej pokonać.',
  "Apple's review feed returned no reviews for this app in this country. This happens for many apps, so it doesn't mean users are happy.":
    'Kanał recenzji Apple nie zwrócił recenzji tej aplikacji w tym kraju. Zdarza się to przy wielu aplikacjach, więc nie oznacza to, że użytkownicy są zadowoleni.',

  // info popups
  'What does this mean?': 'Co to znaczy?', 'Got it': 'Rozumiem',
  'Opportunity score': 'Wynik szansy',
  'How good this keyword is for a new app, from 0 to 100. It combines Demand, Ease and Money, and one weak part pulls the whole score down. 60+ is strong, 40–59 is worth a look.':
    'Jak dobre jest to słowo kluczowe dla nowej aplikacji, od 0 do 100. Łączy Popyt, Łatwość i Pieniądze, a jedna słaba część obniża cały wynik. 60+ to mocny wynik, 40–59 warto się przyjrzeć.',
  'How many people use apps for this search. Based on the combined ratings of the top 10 apps, because Apple doesn\'t publish downloads (roughly 1–2% of users leave a rating).':
    'Ilu ludzi korzysta z aplikacji dla tej frazy. Na podstawie łącznej liczby ocen 10 czołowych aplikacji, bo Apple nie publikuje liczby pobrań (ocenę zostawia około 1–2% użytkowników).',
  'How beatable the top 10 apps are. Higher when they have few ratings, don\'t use the keyword in their name, are rated low or haven\'t been updated for a year.':
    'Jak łatwo pokonać 10 czołowych aplikacji. Wyżej, gdy mają mało ocen, nie mają frazy w nazwie, są nisko oceniane albo nie były aktualizowane od roku.',
  'Whether apps for this search earn money. Points for top apps that are in Top Grossing for their category, and for apps that charge upfront.':
    'Czy aplikacje dla tej frazy zarabiają. Punkty za czołowe aplikacje, które są w najbardziej dochodowych w swojej kategorii, i za aplikacje płatne z góry.',
  'Gap score': 'Luka',
  'For one app in Top Grossing. High when people pay for it (its rank), use it (ratings), are unhappy with it (rated below the typical app in its chart, or not updated for months), and it isn\'t a giant. A high Gap score means users are waiting for a better app. 55+ is Hot.':
    'Dla jednej aplikacji z najbardziej dochodowych. Wysoka, gdy ludzie za nią płacą (pozycja), używają jej (oceny), są z niej niezadowoleni (ocena niższa niż typowa w rankingu albo brak aktualizacji od miesięcy) i nie jest gigantem. Wysoka luka oznacza, że użytkownicy czekają na lepszą aplikację. 55+ to gorąca.',
  'Category score': 'Wynik kategorii',
  'How open a category is to a new app in this country. Half is room for small apps (small earners, new and neglected apps, weighed against market size) and half is the average of its 5 biggest Gap scores. 55+ is Promising.':
    'Jak otwarta jest kategoria na nową aplikację w tym kraju. W połowie to miejsce dla małych aplikacji (małe zarabiające, nowe i zaniedbane aplikacje, w odniesieniu do wielkości rynku), a w połowie średnia 5 największych luk. 55+ to obiecująca.',
  'Results of the latest App Store scan across 33 countries and 24 categories. Biggest gaps: apps people pay for but dislike. Rising: apps climbing Top Grossing. New earners: small apps that just started earning.':
    'Wyniki najnowszego skanu App Store z 33 krajów i 24 kategorii. Największe luki: aplikacje, za które ludzie płacą, ale ich nie lubią. Rosnące: aplikacje pnące się w najbardziej dochodowych. Nowe zarabiające: małe aplikacje, które właśnie zaczęły zarabiać.',
  'Small earners': 'Małe, ale zarabiają',
  'Apps in Top Grossing with under 5,000 ratings. Many of them means small developers make money here.':
    'Aplikacje w najbardziej dochodowych z mniej niż 5000 ocen. Jeśli jest ich dużo, mali twórcy tu zarabiają.',
  'New apps': 'Nowe aplikacje',
  'Apps released in the last 18 months. When new apps reach the chart, the category isn\'t locked by old players.':
    'Aplikacje wydane w ostatnich 18 miesiącach. Gdy nowe aplikacje trafiają do rankingu, kategoria nie jest zamknięta przez starych graczy.',
  'Neglected apps': 'Zaniedbane aplikacje',
  'Apps not updated for a year. Their users often switch to a better-maintained alternative.':
    'Aplikacje bez aktualizacji od roku. Ich użytkownicy często przechodzą do lepiej utrzymywanej alternatywy.',
  'Reads one chart live: Top Grossing (where people pay), Top Paid or Top Free. Start with Top Grossing.':
    'Wczytuje na żywo jeden ranking: najbardziej dochodowe (gdzie ludzie płacą), najlepsze płatne albo najlepsze darmowe. Zacznij od najbardziej dochodowych.',
  'Scores the same keyword in several countries. Look for a country where Demand is decent but Ease is higher. Tap a row for the full breakdown.':
    'Ocenia to samo słowo kluczowe w kilku krajach. Szukaj kraju, gdzie Popyt jest przyzwoity, a Łatwość wyższa. Dotknij wiersza, aby zobaczyć szczegóły.',
  'Complaint summary': 'Podsumowanie skarg',
  'Claude reads recent 1–3 star reviews of the top apps and groups them into themes, with features a new app could win with. Needs your own Anthropic API key and usually costs well under 1 cent.':
    'Claude czyta najnowsze recenzje 1–3 gwiazdki czołowych aplikacji i grupuje je w tematy, wraz z funkcjami, którymi nowa aplikacja mogłaby wygrać. Wymaga Twojego klucza API Anthropic i zwykle kosztuje znacznie poniżej 1 centa.',
  'Turn a keyword or a competitor into an idea card. Scores and complaints attach automatically, and the checklist shows when an idea is ready to build.':
    'Zamień słowo kluczowe albo konkurenta w kartę pomysłu. Wyniki i skargi dołączają się automatycznie, a lista kontrolna pokazuje, kiedy pomysł jest gotowy do budowy.',
  'Five checks from the research method: a good score, a complaint you can fix, a small first version, a pricing plan and a clear reason you\'d win. 4 of 5 means you have a real candidate.':
    'Pięć kontroli z metody badania: dobry wynik, skarga, którą umiesz rozwiązać, mała pierwsza wersja, plan cenowy i jasny powód, dlaczego wygrasz. 4 z 5 oznacza prawdziwego kandydata.',

  // welcome
  'Welcome': 'Witaj',
  'Find an app idea people will pay for': 'Znajdź pomysł na aplikację, za którą ludzie zapłacą',
  'This app reads public App Store data in 33 countries and shows where users pay, where they are unhappy, and where a small developer can win.':
    'Ta aplikacja czyta publiczne dane App Store z 33 krajów i pokazuje, gdzie użytkownicy płacą, gdzie są niezadowoleni i gdzie mały twórca może wygrać.',
  'Choose your language': 'Wybierz język',
  'How the scores work': 'Jak działają wyniki',
  'Every score is 0–100 and built from public signals: ratings stand in for downloads, Top Grossing shows money, and low ratings or old updates show unhappy users. Tap any ⓘ for an explanation.':
    'Każdy wynik to 0–100 i powstaje z publicznych sygnałów: oceny zastępują liczbę pobrań, najbardziej dochodowe pokazują pieniądze, a niskie oceny lub stare aktualizacje pokazują niezadowolenie. Dotknij dowolnego ⓘ, aby zobaczyć wyjaśnienie.',
  'Green is good, amber is worth a look, red is weak.': 'Zielony jest dobry, bursztynowy wart uwagi, czerwony słaby.',
  'Follow the guide': 'Idź za przewodnikiem',
  'The guide takes you from a country to an idea that\'s ready to build in 8 steps. Steps tick themselves off as you use the app. Open it any time with the Guide button.':
    'Przewodnik prowadzi od wyboru kraju do pomysłu gotowego do budowy w 8 krokach. Kroki odhaczają się same, gdy korzystasz z aplikacji. Otwórz go w dowolnej chwili przyciskiem Przewodnik.',
  Next: 'Dalej', Back: 'Wstecz', Skip: 'Pomiń', 'Start the guide': 'Zacznij przewodnik',

  // guide
  Guide: 'Przewodnik', 'Find your app idea': 'Znajdź swój pomysł na aplikację', 'Go': 'Przejdź', 'Done': 'Zrobione',
  'All steps done. You have an idea that\'s ready to build. Run the steps again for your next idea.': 'Wszystkie kroki zrobione. Masz pomysł gotowy do budowy. Przejdź kroki ponownie dla kolejnego pomysłu.',
  'Pick your target country': 'Wybierz kraj docelowy',
  'Choose where you want to sell, using the country picker at the top. Countries where people pay a lot: US, UK, Germany, Japan, Switzerland, the Nordics.':
    'Wybierz, gdzie chcesz sprzedawać, w wyborze kraju na górze. Kraje, gdzie ludzie dużo płacą: USA, Wielka Brytania, Niemcy, Japonia, Szwajcaria, kraje nordyckie.',
  'Use {country}': 'Wybierz: {country}',
  'Find a promising category': 'Znajdź obiecującą kategorię',
  'Niches → Categories ranks every category in your country. Look for Promising (55+) and note its keyword ideas.':
    'Nisze → Kategorie szereguje wszystkie kategorie w Twoim kraju. Szukaj obiecujących (55+) i zanotuj ich pomysły na słowa kluczowe.',
  'Spot apps people pay for but dislike': 'Znajdź aplikacje, za które ludzie płacą, ale ich nie lubią',
  'Niches → Top apps lists the biggest Gap scores. Open one and see why its users are unhappy.':
    'Nisze → Najlepsze aplikacje pokazuje największe luki. Otwórz jedną i zobacz, dlaczego jej użytkownicy są niezadowoleni.',
  'Score a keyword': 'Oceń słowo kluczowe',
  'Tap a keyword idea or type one on the Keyword tab. Aim for an Opportunity score of 55 or more.':
    'Dotknij pomysłu na słowo kluczowe albo wpisz je w zakładce Słowo kluczowe. Celuj w wynik szansy 55 lub więcej.',
  'Compare countries': 'Porównaj kraje',
  'On the Countries tab, score the same keyword in several countries and find where competition is weaker.':
    'W zakładce Kraje oceń to samo słowo kluczowe w kilku krajach i znajdź, gdzie konkurencja jest słabsza.',
  'Read what users complain about': 'Przeczytaj, na co skarżą się użytkownicy',
  'Open a competitor\'s details or summarize complaints for your keyword. Repeated complaints are your feature list.':
    'Otwórz szczegóły konkurenta albo podsumuj skargi dla swojego słowa kluczowego. Powtarzające się skargi to Twoja lista funkcji.',
  'Save it as an idea': 'Zapisz to jako pomysł',
  'Tap Add to ideas on a keyword or an app. The idea keeps its scores and complaints.': 'Dotknij Dodaj do pomysłów przy słowie kluczowym lub aplikacji. Pomysł zachowuje swoje wyniki i skargi.',
  'Get an idea ready to build': 'Przygotuj pomysł do budowy',
  'Fill in why you\'d win and how you\'ll charge, and tick the checklist. At 4 of 5 you have a real candidate.':
    'Uzupełnij, dlaczego wygrasz i jak będziesz zarabiać, i odhacz listę kontrolną. Przy 4 z 5 masz prawdziwego kandydata.',
  'Step {n} of {total}': 'Krok {n} z {total}', '{done} of {total} done': 'Zrobione: {done} z {total}', 'Open the guide': 'Otwórz przewodnik',
  // complaint summary messages
  'Add your Anthropic API key first.': 'Najpierw dodaj swój klucz API Anthropic.',
  'Reading reviews of {name} ({i} of {n})…': 'Czytanie recenzji: {name} ({i} z {n})…',
  "Apple's review feed returned no reviews for any of the top {n} apps, so there's nothing to summarize. Nothing was sent to Claude. Try another keyword or country.":
    'Kanał recenzji Apple nie zwrócił recenzji dla żadnej z {n} czołowych aplikacji, więc nie ma czego podsumować. Nic nie zostało wysłane do Claude. Spróbuj innego słowa kluczowego lub kraju.',
  "Only {reviews} came back (Apple returned reviews for {fed} of {n} apps). That's too few to summarize, so nothing was sent to Claude.":
    'Wróciło tylko: {reviews} (Apple zwróciło recenzje dla {fed} z {n} aplikacji). To za mało na podsumowanie, więc nic nie zostało wysłane do Claude.',
  '{model} is reading {reviews}…': '{model} czyta: {reviews}…',
  'Claude declined to summarize these reviews. Try another keyword.': 'Claude odmówił podsumowania tych recenzji. Spróbuj innego słowa kluczowego.',
  'The summary was cut off. Tap Summarize again.': 'Podsumowanie zostało ucięte. Dotknij Podsumuj ponownie.',
  "Claude's answer couldn't be read. Tap Summarize again.": 'Nie udało się odczytać odpowiedzi Claude. Dotknij Podsumuj ponownie.',
  'Your API key was not accepted. Check it and paste it again.': 'Twój klucz API nie został przyjęty. Sprawdź go i wklej ponownie.',
  "Your API key doesn't have access to this model.": 'Twój klucz API nie ma dostępu do tego modelu.',
  'Your Anthropic account hit its rate limit. Try again in a minute.': 'Twoje konto Anthropic osiągnęło limit zapytań. Spróbuj za minutę.',
  'Anthropic rejected the request: {msg}': 'Anthropic odrzucił zapytanie: {msg}',
  'Claude is temporarily unavailable. Try again in a minute.': 'Claude jest chwilowo niedostępny. Spróbuj za minutę.',
  "Couldn't reach Anthropic. Check your connection and try again.": 'Nie udało się połączyć z Anthropic. Sprawdź połączenie i spróbuj ponownie.',
  'Anthropic returned an error ({status}). Try again in a minute.': 'Anthropic zwrócił błąd ({status}). Spróbuj za minutę.',

  // idea export
  'Score: {opp} (Demand {d} · Ease {e} · Money {m}), checked {date}': 'Wynik: {opp} (Popyt {d} · Łatwość {e} · Pieniądze {m}), sprawdzono {date}',
  Charging: 'Zarabianie', 'Top complaints': 'Główne skargi', Ready: 'Gotowe', 'App ideas': 'Pomysły na aplikacje',
};



if (typeof document !== 'undefined') document.documentElement.lang = lang;
