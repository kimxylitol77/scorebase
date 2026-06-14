// FIFA 남자 국가대표 랭킹 — /scores 매치 카드 + 매치 상세에서 국가대항 경기의
// [순위] 자리에 "FIFA N위" 를 표시할 때 사용.
//
// 데이터 소스: FIFA/Coca-Cola Men's World Ranking 2026-04-01 공식 (211개국).
//   - TheSports.com API 에는 FIFA 랭킹 endpoint 가 없음 (client.ts 의 match/standings/
//     stats 만 제공, Pro season endpoint 401 — memory feedback_ts_pro_replace_audit).
//   - FIFA 랭킹은 분기 1회(연 4~6회) 갱신이라 정적 JSON 으로 관리해도 충분.
//   - 갱신: 새 랭킹 발표 시 fifa-rankings.json 만 교체 (다음 발표 2026-06-09).
//
// 클럽 리그(EPL/이라크 스타스 리그 등)는 절대 건드리지 않음 — 기존 리그 standings 순위 유지.
// 여기서 다루는 건 "국가대항 시니어 대회" 뿐. (청소년 U17/U20/U21·올림픽 U23 은 시니어
// FIFA 랭킹이 무의미·오해 소지 → 제외.)

import rankingsData from "./fifa-rankings.json";

/** 랭킹 발표 일자 (UI 툴팁/주석용). */
export const FIFA_RANKING_DATE = "2026-04-01";

/**
 * FIFA 랭킹을 표시할 국가대항 시니어 대회 리그 코드.
 * 이 set 에 속한 리그의 매치는 standings 순위 대신 FIFA 랭킹을 [순위] 자리에 표시한다.
 * (청소년/U23/여자 대회는 제외 — 시니어 남자 FIFA 랭킹과 무관.)
 */
export const NATIONAL_TEAM_LEAGUES = new Set<string>([
  "INTL_FRIENDLY", // 국가대표 친선 (A매치) — 1순위 대상
  "WC_QUAL", // 월드컵 예선
  "EURO_QUAL", // 유로 예선
  "UEFA_NL", // UEFA 네이션스 리그
  "AFCON", // 아프리카 네이션스컵
  "CONCACAF_GOLD", // CONCACAF 골드컵
  "WORLD_CUP", // FIFA 월드컵 (본선)
]);

/** 리그가 FIFA 랭킹 표시 대상(국가대항)인지. */
export function isNationalTeamLeague(league: string | null | undefined): boolean {
  return league != null && NATIONAL_TEAM_LEAGUES.has(league);
}

interface FifaRankEntry {
  rank: number;
  name: string;
}

// 매칭 키 정규화: 소문자 + 발음구별기호 제거 + 구두점→공백 + 불용어(and/the/of) 제거.
//   "Côte d'Ivoire" → "cote d ivoire", "Bosnia & Herzegovina" → "bosnia herzegovina",
//   "The Gambia" → "gambia", "São Tomé and Príncipe" → "sao tome principe".
// 한글 입력은 소문자/발음구별기호/불용어 영향이 없어 공백 정규화만 적용된다.
const STOPWORDS = new Set(["and", "the", "of"]);
function normalizeKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // 발음구별기호 제거
    .toLowerCase()
    .replace(/[.'’`&,()/\\-]/g, " ") // 구두점 → 공백
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

// 변형 영문명 → JSON canonical 영문명.
// TheSports 등 데이터 소스가 쓰는 형태 + 흔한 별칭을 FIFA JSON 의 이름으로 연결.
// (team-names.ts 국가대표 섹션의 실제 원문 키와 정렬.)
const ENGLISH_ALIASES: Record<string, string> = {
  // team-names.ts 국가대표 섹션 원문 형태 (실관측)
  "Cape Verde Islands": "Cabo Verde",
  "Cape Verde": "Cabo Verde",
  "FYR Macedonia": "North Macedonia",
  Macedonia: "North Macedonia",
  "Rep. Of Ireland": "Republic of Ireland",
  "Rep of Ireland": "Republic of Ireland",
  Ireland: "Republic of Ireland",
  "Hong Kong": "Hong Kong, China",
  Kyrgyzstan: "Kyrgyz Republic",
  China: "China PR",
  // 흔한 영문 변형 (방어적)
  "South Korea": "Korea Republic",
  Korea: "Korea Republic",
  "Republic of Korea": "Korea Republic",
  "North Korea": "Korea DPR",
  "DPR Korea": "Korea DPR",
  Iran: "IR Iran",
  "Türkiye": "Turkey",
  Turkiye: "Turkey",
  Czechia: "Czechia",
  "Czech Republic": "Czechia",
  "United States": "USA",
  "United States of America": "USA",
  "Ivory Coast": "Côte d'Ivoire",
  "DR Congo": "Congo DR",
  "Democratic Republic of the Congo": "Congo DR",
  "Congo-Kinshasa": "Congo DR",
  "Republic of the Congo": "Congo",
  "Congo-Brazzaville": "Congo",
  UAE: "United Arab Emirates",
  Bosnia: "Bosnia and Herzegovina",
  "Bosnia & Herzegovina": "Bosnia and Herzegovina",
  "Bosnia-Herzegovina": "Bosnia and Herzegovina",
  Taiwan: "Chinese Taipei",
  Brunei: "Brunei Darussalam",
  "East Timor": "Timor-Leste",
  Holland: "Netherlands",
  Gambia: "The Gambia",
  Macao: "Macau",
  "Saint Kitts and Nevis": "St Kitts and Nevis",
  "Saint Lucia": "St Lucia",
  "Saint Vincent and the Grenadines": "St Vincent and the Grenadines",
  "Sao Tome and Principe": "São Tomé and Príncipe",
  Swaziland: "Eswatini",
};

// 한글 국가명 → JSON canonical 영문명 (안전망).
// 영문 경로가 1순위지만, raw 영문이 예상 밖일 때 toKoreanTeamName 결과(한글)로도 매칭.
// COUNTRY_FLAG / team-names.ts 국가대표 섹션의 한글 표기와 정렬.
const KOREAN_ALIASES: Record<string, string> = {
  프랑스: "France",
  스페인: "Spain",
  아르헨티나: "Argentina",
  잉글랜드: "England",
  포르투갈: "Portugal",
  브라질: "Brazil",
  네덜란드: "Netherlands",
  모로코: "Morocco",
  벨기에: "Belgium",
  독일: "Germany",
  크로아티아: "Croatia",
  이탈리아: "Italy",
  콜롬비아: "Colombia",
  세네갈: "Senegal",
  멕시코: "Mexico",
  미국: "USA",
  우루과이: "Uruguay",
  일본: "Japan",
  스위스: "Switzerland",
  덴마크: "Denmark",
  이란: "IR Iran",
  튀르키예: "Turkey",
  터키: "Turkey",
  에콰도르: "Ecuador",
  오스트리아: "Austria",
  대한민국: "Korea Republic",
  한국: "Korea Republic",
  나이지리아: "Nigeria",
  호주: "Australia",
  알제리: "Algeria",
  이집트: "Egypt",
  캐나다: "Canada",
  노르웨이: "Norway",
  우크라이나: "Ukraine",
  파나마: "Panama",
  코트디부아르: "Côte d'Ivoire",
  폴란드: "Poland",
  러시아: "Russia",
  웨일스: "Wales",
  스웨덴: "Sweden",
  세르비아: "Serbia",
  파라과이: "Paraguay",
  체코: "Czechia",
  헝가리: "Hungary",
  스코틀랜드: "Scotland",
  튀니지: "Tunisia",
  카메룬: "Cameroon",
  콩고민주공화국: "Congo DR",
  그리스: "Greece",
  슬로바키아: "Slovakia",
  베네수엘라: "Venezuela",
  우즈베키스탄: "Uzbekistan",
  코스타리카: "Costa Rica",
  말리: "Mali",
  페루: "Peru",
  칠레: "Chile",
  카타르: "Qatar",
  루마니아: "Romania",
  이라크: "Iraq",
  슬로베니아: "Slovenia",
  아일랜드: "Republic of Ireland",
  남아프리카공화국: "South Africa",
  남아프리카: "South Africa",
  남아공: "South Africa",
  사우디아라비아: "Saudi Arabia",
  요르단: "Jordan",
  알바니아: "Albania",
  "보스니아 헤르체고비나": "Bosnia and Herzegovina",
  보스니아: "Bosnia and Herzegovina",
  온두라스: "Honduras",
  북마케도니아: "North Macedonia",
  아랍에미리트: "United Arab Emirates",
  카보베르데: "Cabo Verde",
  북아일랜드: "Northern Ireland",
  자메이카: "Jamaica",
  조지아: "Georgia",
  핀란드: "Finland",
  가나: "Ghana",
  아이슬란드: "Iceland",
  볼리비아: "Bolivia",
  이스라엘: "Israel",
  코소보: "Kosovo",
  오만: "Oman",
  기니: "Guinea",
  몬테네그로: "Montenegro",
  퀴라소: "Curaçao",
  시리아: "Syria",
  뉴질랜드: "New Zealand",
  불가리아: "Bulgaria",
  앙골라: "Angola",
  바레인: "Bahrain",
  태국: "Thailand",
  중국: "China PR",
  팔레스타인: "Palestine",
  벨라루스: "Belarus",
  룩셈부르크: "Luxembourg",
  베트남: "Vietnam",
  엘살바도르: "El Salvador",
  아르메니아: "Armenia",
  카자흐스탄: "Kazakhstan",
  레바논: "Lebanon",
  키프로스: "Cyprus",
  에스토니아: "Estonia",
  라트비아: "Latvia",
  리투아니아: "Lithuania",
  몰도바: "Moldova",
  아제르바이잔: "Azerbaijan",
  인도네시아: "Indonesia",
  인도: "India",
  말레이시아: "Malaysia",
  필리핀: "Philippines",
  북한: "Korea DPR",
  대만: "Chinese Taipei",
  홍콩: "Hong Kong, China",
  싱가포르: "Singapore",
  쿠웨이트: "Kuwait",
  몽골: "Mongolia",
  지브롤터: "Gibraltar",
  리히텐슈타인: "Liechtenstein",
  산마리노: "San Marino",
};

// canonical 영문명 → rank 빌드 후, alias(영문/한글)도 같은 rank 로 등록.
const RANK_BY_KEY = new Map<string, number>();
for (const entry of rankingsData as FifaRankEntry[]) {
  RANK_BY_KEY.set(normalizeKey(entry.name), entry.rank);
}
for (const [alias, canonical] of [
  ...Object.entries(ENGLISH_ALIASES),
  ...Object.entries(KOREAN_ALIASES),
]) {
  const rank = RANK_BY_KEY.get(normalizeKey(canonical));
  if (rank != null) RANK_BY_KEY.set(normalizeKey(alias), rank);
}

/**
 * 국가대표 팀명 → FIFA 랭킹(1-based). 매칭 실패 시 null (배지 미표시 → graceful).
 * @param nameEn 원문(주로 영문) 팀명 — 1순위 매칭
 * @param nameKo 한글 팀명 (toKoreanTeamName 결과) — 영문 실패 시 안전망
 */
export function getFifaRank(
  nameEn: string | null | undefined,
  nameKo?: string | null | undefined,
): number | null {
  for (const candidate of [nameEn, nameKo]) {
    if (!candidate) continue;
    const rank = RANK_BY_KEY.get(normalizeKey(candidate));
    if (rank != null) return rank;
  }
  return null;
}

/** FIFA 랭킹 전체 목록 (rank asc) — /predictions 등 랭킹 표 렌더용. */
export const FIFA_RANKINGS: ReadonlyArray<FifaRankEntry> =
  rankingsData as FifaRankEntry[];

// FIFA 영문 canonical → 한글 표시명 (KOREAN_ALIASES 역매핑, 먼저 등록된 한글 우선).
// 같은 국가에 한글 별칭이 여러 개면 가장 먼저 정의한 정식 표기 채택(대한민국>한국, 튀르키예>터키 등).
const EN_TO_KO_DISPLAY: Record<string, string> = {};
for (const [ko, en] of Object.entries(KOREAN_ALIASES)) {
  if (EN_TO_KO_DISPLAY[en] === undefined) EN_TO_KO_DISPLAY[en] = ko;
}

/** FIFA 영문 canonical 국가명 → 한글 표시명. 매핑 없으면 null (호출측에서 영문 fallback). */
export function fifaCountryKo(nameEn: string): string | null {
  return EN_TO_KO_DISPLAY[nameEn] ?? null;
}

// FIFA 영문 canonical → ISO 3166-1 alpha-2 (국기 emoji 생성용).
// 잉글랜드/스코틀랜드/웨일스는 regional-indicator 가 없어 subdivision 태그 시퀀스로 별도 처리.
// 북아일랜드는 표준 emoji 가 없어 국기 미표시(graceful).
const EN_TO_ISO2: Record<string, string> = {
  France: "FR", Spain: "ES", Argentina: "AR", Portugal: "PT", Brazil: "BR",
  Netherlands: "NL", Morocco: "MA", Belgium: "BE", Germany: "DE", Croatia: "HR",
  Italy: "IT", Colombia: "CO", Senegal: "SN", Mexico: "MX", USA: "US",
  Uruguay: "UY", Japan: "JP", Switzerland: "CH", Denmark: "DK", "IR Iran": "IR",
  Turkey: "TR", Ecuador: "EC", Austria: "AT", "Korea Republic": "KR", Nigeria: "NG",
  Australia: "AU", Algeria: "DZ", Egypt: "EG", Canada: "CA", Norway: "NO",
  Ukraine: "UA", Panama: "PA", "Côte d'Ivoire": "CI", Poland: "PL", Russia: "RU",
  Sweden: "SE", Serbia: "RS", Paraguay: "PY", Czechia: "CZ", Hungary: "HU",
  Tunisia: "TN", Cameroon: "CM", "Congo DR": "CD", Greece: "GR", Slovakia: "SK",
  Venezuela: "VE", Uzbekistan: "UZ", "Costa Rica": "CR", Mali: "ML", Peru: "PE",
  Chile: "CL", Qatar: "QA", Romania: "RO", Iraq: "IQ", Slovenia: "SI",
  "Republic of Ireland": "IE", "South Africa": "ZA", "Saudi Arabia": "SA",
  "Burkina Faso": "BF", Jordan: "JO", Albania: "AL", "Bosnia and Herzegovina": "BA",
  Honduras: "HN", "North Macedonia": "MK", "United Arab Emirates": "AE", "Cabo Verde": "CV",
  Jamaica: "JM", Georgia: "GE", Finland: "FI", Ghana: "GH", Iceland: "IS",
  Bolivia: "BO", Israel: "IL", Kosovo: "XK", Oman: "OM", Guinea: "GN",
  Montenegro: "ME", "Curaçao": "CW", Haiti: "HT", Syria: "SY", "New Zealand": "NZ",
  Bulgaria: "BG", Gabon: "GA", Uganda: "UG", Angola: "AO", Benin: "BJ",
  Bahrain: "BH", Zambia: "ZM", Thailand: "TH", "China PR": "CN", Palestine: "PS",
  Guatemala: "GT", Belarus: "BY", Luxembourg: "LU", Vietnam: "VN", "El Salvador": "SV",
  Mozambique: "MZ", "Trinidad and Tobago": "TT", Tajikistan: "TJ", Madagascar: "MG",
  "Equatorial Guinea": "GQ", Armenia: "AM", "Kyrgyz Republic": "KG", Lebanon: "LB",
  Comoros: "KM", Kazakhstan: "KZ", Kenya: "KE", Libya: "LY", Tanzania: "TZ",
  Niger: "NE", Mauritania: "MR", "The Gambia": "GM", Sudan: "SD", "Korea DPR": "KP",
  "Sierra Leone": "SL", Namibia: "NA", Togo: "TG", Indonesia: "ID", "Faroe Islands": "FO",
  Azerbaijan: "AZ", Suriname: "SR", Cyprus: "CY", Malawi: "MW", Rwanda: "RW",
  Estonia: "EE", Zimbabwe: "ZW", Nicaragua: "NI", "Guinea-Bissau": "GW", Congo: "CG",
  Kuwait: "KW", Philippines: "PH", India: "IN", Latvia: "LV", Malaysia: "MY",
  "Central African Republic": "CF", Liberia: "LR", Turkmenistan: "TM", Burundi: "BI",
  "Dominican Republic": "DO", Ethiopia: "ET", Lesotho: "LS", Botswana: "BW", Singapore: "SG",
  Lithuania: "LT", Yemen: "YE", Guyana: "GY", "New Caledonia": "NC", "St Kitts and Nevis": "KN",
  "Solomon Islands": "SB", Fiji: "FJ", "Hong Kong, China": "HK", "Puerto Rico": "PR", Tahiti: "PF",
  Myanmar: "MM", Moldova: "MD", Vanuatu: "VU", Malta: "MT", "Antigua and Barbuda": "AG",
  Grenada: "GD", Cuba: "CU", Eswatini: "SZ", Bermuda: "BM", "St Lucia": "LC",
  "Papua New Guinea": "PG", Afghanistan: "AF", "South Sudan": "SS",
  "St Vincent and the Grenadines": "VC", Maldives: "MV", Andorra: "AD", "Chinese Taipei": "TW",
  Montserrat: "MS", Nepal: "NP", Cambodia: "KH", Mauritius: "MU", Barbados: "BB",
  Belize: "BZ", Bangladesh: "BD", Dominica: "DM", Chad: "TD", Eritrea: "ER",
  Laos: "LA", Bhutan: "BT", Mongolia: "MN", "Cook Islands": "CK", Aruba: "AW",
  Samoa: "WS", "Sri Lanka": "LK", "American Samoa": "AS", "Brunei Darussalam": "BN", Macau: "MO",
  "Cayman Islands": "KY", "São Tomé and Príncipe": "ST", Djibouti: "DJ", Somalia: "SO",
  Tonga: "TO", "Timor-Leste": "TL", Guam: "GU", Pakistan: "PK", Gibraltar: "GI",
  Seychelles: "SC", "Turks and Caicos Islands": "TC", Liechtenstein: "LI", Bahamas: "BS",
  "British Virgin Islands": "VG", "US Virgin Islands": "VI", Anguilla: "AI", "San Marino": "SM",
};

// regional-indicator 가 없는 영국 구성국 — subdivision 태그 시퀀스로 국기 생성.
const SUBDIVISION_FLAG: Record<string, string> = {
  England: "gbeng",
  Scotland: "gbsct",
  Wales: "gbwls",
};

function regionalIndicator(iso2: string): string {
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
function subdivisionFlag(sub: string): string {
  let s = String.fromCodePoint(0x1f3f4); // 흑색 깃발
  for (const ch of sub) s += String.fromCodePoint(0xe0000 + ch.charCodeAt(0));
  return s + String.fromCodePoint(0xe007f); // cancel tag
}

/** FIFA 영문 canonical 국가명 → 국기 emoji. 매핑 없으면 "" (graceful 미표시). */
export function fifaFlag(nameEn: string): string {
  // TheSports 등 변형 영문명을 FIFA canonical 로 정규화 후 ISO2 조회.
  // 예: "South Korea"→"Korea Republic", "Türkiye"→"Turkey", "Czech Republic"→"Czechia".
  const canonical = ENGLISH_ALIASES[nameEn] ?? nameEn;
  if (SUBDIVISION_FLAG[canonical]) return subdivisionFlag(SUBDIVISION_FLAG[canonical]);
  const iso2 = EN_TO_ISO2[canonical] ?? EN_TO_ISO2[nameEn];
  return iso2 ? regionalIndicator(iso2) : "";
}
