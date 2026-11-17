// Countries and categories, shared by the app and the nightly scan (scripts/nightly-scan.mjs).

// [App Store country code, name, short label, region]
export const COUNTRIES = [
  ['us', 'United States', 'US', 'English-speaking'],
  ['gb', 'United Kingdom', 'UK', 'English-speaking'],
  ['ca', 'Canada', 'Canada', 'English-speaking'],
  ['au', 'Australia', 'Australia', 'English-speaking'],
  ['nz', 'New Zealand', 'New Zealand', 'English-speaking'],
  ['ie', 'Ireland', 'Ireland', 'English-speaking'],
  ['sg', 'Singapore', 'Singapore', 'English-speaking'],
  ['de', 'Germany', 'Germany', 'Europe'],
  ['fr', 'France', 'France', 'Europe'],
  ['it', 'Italy', 'Italy', 'Europe'],
  ['es', 'Spain', 'Spain', 'Europe'],
  ['nl', 'Netherlands', 'Netherlands', 'Europe'],
  ['be', 'Belgium', 'Belgium', 'Europe'],
  ['at', 'Austria', 'Austria', 'Europe'],
  ['ch', 'Switzerland', 'Switzerland', 'Europe'],
  ['se', 'Sweden', 'Sweden', 'Europe'],
  ['no', 'Norway', 'Norway', 'Europe'],
  ['dk', 'Denmark', 'Denmark', 'Europe'],
  ['fi', 'Finland', 'Finland', 'Europe'],
  ['pl', 'Poland', 'Poland', 'Europe'],
  ['pt', 'Portugal', 'Portugal', 'Europe'],
  ['jp', 'Japan', 'Japan', 'Asia'],
  ['kr', 'South Korea', 'Korea', 'Asia'],
  ['tw', 'Taiwan', 'Taiwan', 'Asia'],
  ['hk', 'Hong Kong', 'Hong Kong', 'Asia'],
  ['cn', 'China', 'China', 'Asia'],
  ['in', 'India', 'India', 'Asia'],
  ['ae', 'United Arab Emirates', 'UAE', 'Middle East'],
  ['sa', 'Saudi Arabia', 'Saudi Arabia', 'Middle East'],
  ['il', 'Israel', 'Israel', 'Middle East'],
  ['tr', 'Turkey', 'Turkey', 'Middle East'],
  ['br', 'Brazil', 'Brazil', 'Latin America'],
  ['mx', 'Mexico', 'Mexico', 'Latin America'],
];
export const CNAME = Object.fromEntries(COUNTRIES.map(([c, n]) => [c, n]));
export const CSHORT = Object.fromEntries(COUNTRIES.map(([c, , sh]) => [c, sh]));
export const REGIONS = [...new Set(COUNTRIES.map((c) => c[3]))];

export const GENRES = [
  [6018, 'Books'], [6000, 'Business'], [6026, 'Developer Tools'], [6017, 'Education'], [6016, 'Entertainment'],
  [6015, 'Finance'], [6023, 'Food & Drink'], [6014, 'Games'], [6027, 'Graphics & Design'], [6013, 'Health & Fitness'],
  [6012, 'Lifestyle'], [6020, 'Medical'], [6011, 'Music'], [6010, 'Navigation'], [6009, 'News'],
  [6008, 'Photo & Video'], [6007, 'Productivity'], [6006, 'Reference'], [6024, 'Shopping'], [6005, 'Social Networking'],
  [6004, 'Sports'], [6003, 'Travel'], [6002, 'Utilities'], [6001, 'Weather'],
];
export const GNAME = Object.fromEntries(GENRES.map(([id, n]) => [String(id), n]));
