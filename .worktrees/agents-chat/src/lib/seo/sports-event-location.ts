// SportsEvent JSON-LD 의 location 필드 빌더.
// Google Rich Results 검증에 필수 (offline event = location required).
// matchRaw 에 venue 정보가 있으면 추출, 없으면 리그 대표 도시 fallback.

export interface CountryInfo {
  name: string;
  code: string;
  defaultCity: string;
}

// 리그별 홈 국가/대표 도시. 90+ 리그 커버 — venue.city 미상시 fallback.
export const LEAGUE_COUNTRY: Record<string, CountryInfo> = {
  // 유럽 Top 5 + 컵
  EPL:           { name: "England",        code: "GB", defaultCity: "London" },
  LALIGA:        { name: "Spain",          code: "ES", defaultCity: "Madrid" },
  BUNDESLIGA:    { name: "Germany",        code: "DE", defaultCity: "Berlin" },
  SERIE_A:       { name: "Italy",          code: "IT", defaultCity: "Rome" },
  LIGUE_1:       { name: "France",         code: "FR", defaultCity: "Paris" },
  UCL:           { name: "Europe",         code: "EU", defaultCity: "London" },
  UEL:           { name: "Europe",         code: "EU", defaultCity: "London" },
  UECL:          { name: "Europe",         code: "EU", defaultCity: "London" },
  WORLD_CUP:     { name: "USA / Canada / Mexico", code: "US", defaultCity: "New York" },
  CLUB_WORLD_CUP:{ name: "United States",  code: "US", defaultCity: "New York" },
  // 유럽 2부
  CHAMPIONSHIP:  { name: "England",        code: "GB", defaultCity: "London" },
  LALIGA_2:      { name: "Spain",          code: "ES", defaultCity: "Madrid" },
  BUNDESLIGA_2:  { name: "Germany",        code: "DE", defaultCity: "Berlin" },
  SERIE_B:       { name: "Italy",          code: "IT", defaultCity: "Rome" },
  LIGUE_2:       { name: "France",         code: "FR", defaultCity: "Paris" },
  // 유럽 기타
  EREDIVISIE:    { name: "Netherlands",    code: "NL", defaultCity: "Amsterdam" },
  PRIMEIRA_LIGA: { name: "Portugal",       code: "PT", defaultCity: "Lisbon" },
  SUPER_LIG:     { name: "Turkey",         code: "TR", defaultCity: "Istanbul" },
  JUPILER_PL:    { name: "Belgium",        code: "BE", defaultCity: "Brussels" },
  SPL:           { name: "Scotland",       code: "GB", defaultCity: "Glasgow" },
  GREEK_SL:      { name: "Greece",         code: "GR", defaultCity: "Athens" },
  EKSTRAKLASA:   { name: "Poland",         code: "PL", defaultCity: "Warsaw" },
  POLAND_1L:     { name: "Poland",         code: "PL", defaultCity: "Warsaw" },
  BULGARIA_PL:   { name: "Bulgaria",       code: "BG", defaultCity: "Sofia" },
  LIGA_I:        { name: "Romania",        code: "RO", defaultCity: "Bucharest" },
  SWISS_SL:      { name: "Switzerland",    code: "CH", defaultCity: "Zurich" },
  CHALLENGE_LEAGUE:{ name: "Switzerland",  code: "CH", defaultCity: "Zurich" },
  ARMENIA_PL:    { name: "Armenia",        code: "AM", defaultCity: "Yerevan" },
  AUSTRIA_BL:    { name: "Austria",        code: "AT", defaultCity: "Vienna" },
  CZECH_L:       { name: "Czech Republic", code: "CZ", defaultCity: "Prague" },
  HNL:           { name: "Croatia",        code: "HR", defaultCity: "Zagreb" },
  UKRAINE_PL:    { name: "Ukraine",        code: "UA", defaultCity: "Kyiv" },
  HUNGARY_NB1:   { name: "Hungary",        code: "HU", defaultCity: "Budapest" },
  SERBIA_SL:     { name: "Serbia",         code: "RS", defaultCity: "Belgrade" },
  SLOVAKIA_SL:   { name: "Slovakia",       code: "SK", defaultCity: "Bratislava" },
  SLOVENIA_SNL:  { name: "Slovenia",       code: "SI", defaultCity: "Ljubljana" },
  CYPRUS_1D:     { name: "Cyprus",         code: "CY", defaultCity: "Nicosia" },
  DENMARK_SL:    { name: "Denmark",        code: "DK", defaultCity: "Copenhagen" },
  IRELAND_PD:    { name: "Ireland",        code: "IE", defaultCity: "Dublin" },
  BOSNIA_PL:     { name: "Bosnia and Herzegovina", code: "BA", defaultCity: "Sarajevo" },
  ALBANIA_SL:    { name: "Albania",        code: "AL", defaultCity: "Tirana" },
  MOLDOVA_SL:    { name: "Moldova",        code: "MD", defaultCity: "Chisinau" },
  // 북유럽
  ELITESERIEN:   { name: "Norway",         code: "NO", defaultCity: "Oslo" },
  NORWAY_1L:     { name: "Norway",         code: "NO", defaultCity: "Oslo" },
  ALLSVENSKAN:   { name: "Sweden",         code: "SE", defaultCity: "Stockholm" },
  SUPERETTAN:    { name: "Sweden",         code: "SE", defaultCity: "Stockholm" },
  VEIKKAUSLIIGA: { name: "Finland",        code: "FI", defaultCity: "Helsinki" },
  YKKONEN:       { name: "Finland",        code: "FI", defaultCity: "Helsinki" },
  URVALSDEILD:   { name: "Iceland",        code: "IS", defaultCity: "Reykjavik" },
  ICELAND_1L:    { name: "Iceland",        code: "IS", defaultCity: "Reykjavik" },
  // 아시아 축구
  K_LEAGUE_1:    { name: "South Korea",    code: "KR", defaultCity: "Seoul" },
  K_LEAGUE_2:    { name: "South Korea",    code: "KR", defaultCity: "Seoul" },
  J1_LEAGUE:     { name: "Japan",          code: "JP", defaultCity: "Tokyo" },
  J2_LEAGUE:     { name: "Japan",          code: "JP", defaultCity: "Tokyo" },
  AFC_CL:        { name: "Asia",           code: "AS", defaultCity: "Seoul" },
  AFC_CL_TWO:    { name: "Asia",           code: "AS", defaultCity: "Seoul" },
  AFC_U23:       { name: "Asia",           code: "AS", defaultCity: "Seoul" },
  SAUDI_PL:      { name: "Saudi Arabia",   code: "SA", defaultCity: "Riyadh" },
  CSL:           { name: "China",          code: "CN", defaultCity: "Beijing" },
  A_LEAGUE:      { name: "Australia",      code: "AU", defaultCity: "Sydney" },
  // 아시아·중동·아프리카
  INDIA_ISL:     { name: "India",          code: "IN", defaultCity: "Mumbai" },
  VIETNAM_VL1:   { name: "Vietnam",        code: "VN", defaultCity: "Ho Chi Minh City" },
  INDONESIA_L1:  { name: "Indonesia",      code: "ID", defaultCity: "Jakarta" },
  SINGAPORE_PL:  { name: "Singapore",      code: "SG", defaultCity: "Singapore" },
  UAE_PL:        { name: "United Arab Emirates", code: "AE", defaultCity: "Dubai" },
  QATAR_SL:      { name: "Qatar",          code: "QA", defaultCity: "Doha" },
  ISRAEL_PL:     { name: "Israel",         code: "IL", defaultCity: "Tel Aviv" },
  EGYPT_PL:      { name: "Egypt",          code: "EG", defaultCity: "Cairo" },
  MOROCCO_BP:    { name: "Morocco",        code: "MA", defaultCity: "Casablanca" },
  SOUTHAFRICA_PSL:{ name: "South Africa",  code: "ZA", defaultCity: "Johannesburg" },
  // 북중남미
  MLS:           { name: "United States",  code: "US", defaultCity: "New York" },
  USA_USL_CH:    { name: "United States",  code: "US", defaultCity: "New York" },
  CANADA_PL:     { name: "Canada",         code: "CA", defaultCity: "Toronto" },
  LIGA_MX:       { name: "Mexico",         code: "MX", defaultCity: "Mexico City" },
  BRASILEIRAO:   { name: "Brazil",         code: "BR", defaultCity: "Rio de Janeiro" },
  COPA_LIB:      { name: "South America",  code: "SA", defaultCity: "Buenos Aires" },
  COPA_SUD:      { name: "South America",  code: "SA", defaultCity: "Buenos Aires" },
  CHILE_PD:      { name: "Chile",          code: "CL", defaultCity: "Santiago" },
  CHILE_PB:      { name: "Chile",          code: "CL", defaultCity: "Santiago" },
  ECUADOR_LP:    { name: "Ecuador",        code: "EC", defaultCity: "Quito" },
  COLOMBIA_PA:   { name: "Colombia",       code: "CO", defaultCity: "Bogota" },
  PERU_PD:       { name: "Peru",           code: "PE", defaultCity: "Lima" },
  VENEZUELA_PD:  { name: "Venezuela",      code: "VE", defaultCity: "Caracas" },
  // 야구·농구·하키·e스포츠
  KBO:           { name: "South Korea",    code: "KR", defaultCity: "Seoul" },
  NPB:           { name: "Japan",          code: "JP", defaultCity: "Tokyo" },
  MLB:           { name: "United States",  code: "US", defaultCity: "New York" },
  NBA:           { name: "United States",  code: "US", defaultCity: "New York" },
  NHL:           { name: "United States",  code: "US", defaultCity: "New York" },
  LOL:           { name: "South Korea",    code: "KR", defaultCity: "Seoul" },
};

/** 매치 raw JSON 에서 venue 추출 (api-football / football-data 등 다양한 포맷 대응) */
function extractVenue(rawMatch: unknown): { name?: string; city?: string } {
  if (!rawMatch) return {};
  try {
    const r = typeof rawMatch === "string" ? JSON.parse(rawMatch) : (rawMatch as Record<string, unknown>);
    if (!r || typeof r !== "object") return {};
    const obj = r as Record<string, unknown>;
    const fixture = obj.fixture as Record<string, unknown> | undefined;
    const fixtureVenue = fixture?.venue as Record<string, unknown> | undefined;
    const venue = obj.venue;
    let name: string | undefined;
    let city: string | undefined;
    if (fixtureVenue && typeof fixtureVenue === "object") {
      name = typeof fixtureVenue.name === "string" ? fixtureVenue.name : undefined;
      city = typeof fixtureVenue.city === "string" ? fixtureVenue.city : undefined;
    }
    if (!name && venue) {
      if (typeof venue === "string") name = venue;
      else if (typeof venue === "object" && venue) {
        const v = venue as Record<string, unknown>;
        name = typeof v.name === "string" ? v.name : undefined;
        city = city ?? (typeof v.city === "string" ? v.city : undefined);
      }
    }
    return { name, city };
  } catch {
    return {};
  }
}

/** SportsEvent JSON-LD location 빌더 — venue raw 추출 + 리그 대표 도시 fallback. */
export function buildSportsEventLocation(opts: {
  league: string;
  homeName: string;
  rawMatch?: unknown;
}) {
  const country = LEAGUE_COUNTRY[opts.league];
  const venue = extractVenue(opts.rawMatch);
  const stadiumName = venue.name ?? `${opts.homeName} Home Stadium`;
  return {
    "@type": "Place" as const,
    name: stadiumName,
    address: {
      "@type": "PostalAddress" as const,
      streetAddress: stadiumName,
      addressLocality: venue.city ?? country?.defaultCity ?? "Unknown",
      addressCountry: country?.code ?? "US",
    },
  };
}
