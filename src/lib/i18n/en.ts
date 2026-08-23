// 영어판(/en) 표시명 사전 — 리그·국가·종목 영문명 + 지원 리그 셋 (v1: 핵심 리그만)
// 데이터(팀·선수명)는 DB 원본이 이미 영문이라 여기서는 UI 라벨만 다룬다.
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { SITE_URL } from "@/lib/site-url";

/** 리그 코드 → 영문 표시명. 없으면 코드 그대로 노출해도 대부분 영문이라 치명적이지 않다. */
export const LEAGUE_DISPLAY_EN: Record<string, string> = {
  EPL: "Premier League",
  CHAMPIONSHIP: "EFL Championship",
  LALIGA: "LaLiga",
  LALIGA_2: "LaLiga 2",
  BUNDESLIGA: "Bundesliga",
  BUNDESLIGA_2: "2. Bundesliga",
  SERIE_A: "Serie A",
  SERIE_B: "Serie B",
  LIGUE_1: "Ligue 1",
  LIGUE_2: "Ligue 2",
  MLS: "MLS",
  UCL: "UEFA Champions League",
  UEL: "UEFA Europa League",
  UECL: "UEFA Conference League",
  WORLD_CUP: "FIFA World Cup 2026",
  CLUB_WORLD_CUP: "FIFA Club World Cup",
  K_LEAGUE_1: "K League 1",
  K_LEAGUE_2: "K League 2",
  J1_LEAGUE: "J1 League",
  J2_LEAGUE: "J2 League",
  AFC_CL: "AFC Champions League Elite",
  AFC_CL_TWO: "AFC Champions League Two",
  SAUDI_PL: "Saudi Pro League",
  CSL: "Chinese Super League",
  A_LEAGUE: "A-League",
  EREDIVISIE: "Eredivisie",
  PRIMEIRA_LIGA: "Primeira Liga",
  SUPER_LIG: "Süper Lig",
  JUPILER_PL: "Belgian Pro League",
  SPL: "Scottish Premiership",
  GREEK_SL: "Greek Super League",
  EKSTRAKLASA: "Ekstraklasa",
  POLAND_1L: "I Liga",
  BULGARIA_PL: "Bulgarian First League",
  LIGA_I: "Liga I",
  SWISS_SL: "Swiss Super League",
  CHALLENGE_LEAGUE: "Swiss Challenge League",
  ARMENIA_PL: "Armenian Premier League",
  AUSTRIA_BL: "Austrian Bundesliga",
  CZECH_L: "Czech First League",
  HNL: "Croatian HNL",
  UKRAINE_PL: "Ukrainian Premier League",
  HUNGARY_NB1: "Hungarian NB I",
  SERBIA_SL: "Serbian SuperLiga",
  SLOVAKIA_SL: "Slovak Super Liga",
  SLOVENIA_SNL: "Slovenian PrvaLiga",
  CYPRUS_1D: "Cypriot First Division",
  DENMARK_SL: "Danish Superliga",
  IRELAND_PD: "League of Ireland Premier",
  BOSNIA_PL: "Bosnian Premier League",
  ALBANIA_SL: "Albanian Superliga",
  MOLDOVA_SL: "Moldovan Super Liga",
  ELITESERIEN: "Eliteserien",
  NORWAY_1L: "Norwegian First Division",
  ALLSVENSKAN: "Allsvenskan",
  SUPERETTAN: "Superettan",
  VEIKKAUSLIIGA: "Veikkausliiga",
  YKKOSLIIGA: "Ykkösliiga",
  YKKONEN: "Ykkönen",
  KAKKONEN_A: "Kakkonen Group A",
  KAKKONEN_B: "Kakkonen Group B",
  KAKKONEN_C: "Kakkonen Group C",
  URVALSDEILD: "Úrvalsdeild",
  ICELAND_1L: "1. deild karla",
  LIGA_MX: "Liga MX",
  BRASILEIRAO: "Brasileirão Série A",
  USA_USL_CH: "USL Championship",
  CANADA_PL: "Canadian Premier League",
  CANADA_CHAMP: "Canadian Championship",
  LEAGUES_CUP: "Leagues Cup",
  CHILE_PD: "Chilean Primera División",
  CHILE_PB: "Chilean Primera B",
  ECUADOR_LP: "Ecuadorian Liga Pro",
  COLOMBIA_PA: "Colombian Primera A",
  PERU_PD: "Peruvian Primera División",
  VENEZUELA_PD: "Venezuelan Primera División",
  EGYPT_PL: "Egyptian Premier League",
  MOROCCO_BP: "Botola Pro",
  SOUTHAFRICA_PSL: "South African PSL",
  UAE_PL: "UAE Pro League",
  QATAR_SL: "Qatar Stars League",
  ISRAEL_PL: "Israeli Premier League",
  INDIA_ISL: "Indian Super League",
  VIETNAM_VL1: "V.League 1",
  INDONESIA_L1: "Liga 1",
  SINGAPORE_PL: "Singapore Premier League",
  // 축구 — 컵·국제·여자·하부·기타 (SOCCER_LEAGUES 전수 커버)
  AFC_U23: "AFC U23 Asian Cup",
  ASEAN_CHAMP: "ASEAN Championship",
  BRASILEIRAO_2: "Brasileirão Série B",
  COPA_LIB: "Copa Libertadores",
  COPA_SUD: "Copa Sudamericana",
  FA_CUP: "FA Cup",
  EFL_CUP: "EFL Cup",
  SCO_LEAGUE_CUP: "Scottish League Cup",
  COPA_DEL_REY: "Copa del Rey",
  COPPA_ITALIA: "Coppa Italia",
  DFB_POKAL: "DFB-Pokal",
  COUPE_DE_FRANCE: "Coupe de France",
  KFA_CUP: "Korea Cup",
  EMPEROR_CUP: "Emperor's Cup",
  CONCACAF_CCUP: "CONCACAF Champions Cup",
  AFC_CUP: "AFC Cup",
  K3_LEAGUE: "K3 League",
  K4_LEAGUE: "K4 League",
  J3_LEAGUE: "J3 League",
  THAI_L1: "Thai League 1",
  VIETNAM_VL2: "V.League 2",
  ARGENTINA_PL: "Argentine Primera División",
  URUGUAY_PD: "Uruguayan Primera División",
  PARAGUAY_PD: "Paraguayan Primera División",
  BOLIVIA_PD: "Bolivian Primera División",
  AFCON: "Africa Cup of Nations",
  UEFA_NL: "UEFA Nations League",
  WC_QUAL: "World Cup Qualifiers",
  EURO_QUAL: "UEFA Euro Qualifiers",
  CONCACAF_GOLD: "CONCACAF Gold Cup",
  INTL_FRIENDLY: "International Friendlies",
  CLUB_FRIENDLY: "Club Friendlies",
  U20_WC: "FIFA U-20 World Cup",
  U17_WC: "FIFA U-17 World Cup",
  UEFA_U21_Q: "UEFA U21 Qualifiers",
  UEFA_U21: "UEFA U21 Championship",
  UEFA_U19: "UEFA U19 Championship",
  UEFA_U17: "UEFA U17 Championship",
  OLYMPICS_FOOTBALL: "Olympic Football",
  WSL: "Women's Super League",
  NWSL: "NWSL",
  WK_LEAGUE: "WK League",
  UEFA_WCL: "UEFA Women's Champions League",
  A_LEAGUE_W: "A-League Women",
  SUI_CUP: "Swiss Cup",
  LEAGUE_ONE: "EFL League One",
  LEAGUE_TWO: "EFL League Two",
  NATIONAL_LEAGUE: "National League",
  SCOT_CHAMPIONSHIP: "Scottish Championship",
  SCOT_LEAGUE_ONE: "Scottish League One",
  SCOT_LEAGUE_TWO: "Scottish League Two",
  LATVIA_VL: "Latvian Virslīga",
  BELARUS_PL: "Belarusian Premier League",
  ESTONIA_ML: "Estonian Meistriliiga",
  LITHUANIA_AL: "Lithuanian A Lyga",
  LEVAIN_CUP: "J.League YBC Levain Cup",
  KAZAKHSTAN_PL: "Kazakhstan Premier League",
  GEORGIA_EL: "Georgian Erovnuli Liga",
  AZERBAIJAN_PL: "Azerbaijan Premier League",
  EREDIVISIE_2: "Eerste Divisie",
  PRIMEIRA_LIGA_2: "Liga Portugal 2",
  RPL: "Russian Premier League",
  ALGERIA_L1: "Algerian Ligue 1",
  SVENSKA_CUPEN: "Svenska Cupen",
  GHANA_PL: "Ghana Premier League",
  ARG_PRIMERA_NACIONAL: "Primera Nacional",
  IRAQ_SL: "Iraq Stars League",
  MEXICO_2: "Liga de Expansión MX",
  CHINA_2: "China League One",
  IRELAND_2: "League of Ireland First Division",
  DENMARK_2: "Danish 1st Division",
  HUNGARY_2: "Hungarian NB II",
  CZECH_2: "Czech National Football League",
  AUSTRIA_2: "Austrian 2. Liga",
  BELGIUM_2: "Challenger Pro League",
  TURKEY_2: "TFF First League",
  // 야구·농구·하키
  MLB: "MLB",
  KBO: "KBO League",
  NPB: "NPB",
  CPBL: "CPBL",
  NBA: "NBA",
  WNBA: "WNBA",
  NHL: "NHL",
};

/** 한국어 국가 라벨(COUNTRY_BY_LEAGUE 값) → 영문 */
export const COUNTRY_EN: Record<string, string> = {
  국제: "International",
  대한민국: "South Korea",
  일본: "Japan",
  잉글랜드: "England",
  스페인: "Spain",
  독일: "Germany",
  이탈리아: "Italy",
  프랑스: "France",
  네덜란드: "Netherlands",
  포르투갈: "Portugal",
  튀르키예: "Türkiye",
  벨기에: "Belgium",
  스코틀랜드: "Scotland",
  그리스: "Greece",
  폴란드: "Poland",
  불가리아: "Bulgaria",
  루마니아: "Romania",
  스위스: "Switzerland",
  아르메니아: "Armenia",
  오스트리아: "Austria",
  체코: "Czechia",
  크로아티아: "Croatia",
  우크라이나: "Ukraine",
  헝가리: "Hungary",
  세르비아: "Serbia",
  슬로바키아: "Slovakia",
  슬로베니아: "Slovenia",
  키프로스: "Cyprus",
  덴마크: "Denmark",
  아일랜드: "Ireland",
  보스니아: "Bosnia and Herzegovina",
  알바니아: "Albania",
  몰도바: "Moldova",
  라트비아: "Latvia",
  노르웨이: "Norway",
  스웨덴: "Sweden",
  핀란드: "Finland",
  아이슬란드: "Iceland",
  미국: "United States",
  캐나다: "Canada",
  멕시코: "Mexico",
  브라질: "Brazil",
  칠레: "Chile",
  에콰도르: "Ecuador",
  콜롬비아: "Colombia",
  페루: "Peru",
  베네수엘라: "Venezuela",
  이집트: "Egypt",
  모로코: "Morocco",
  남아프리카: "South Africa",
  UAE: "UAE",
  카타르: "Qatar",
  이스라엘: "Israel",
  사우디아라비아: "Saudi Arabia",
  인도: "India",
  베트남: "Vietnam",
  인도네시아: "Indonesia",
  싱가포르: "Singapore",
  중국: "China",
  호주: "Australia",
  대만: "Taiwan",
  유럽: "Europe",
  태국: "Thailand",
  아르헨티나: "Argentina",
  우루과이: "Uruguay",
  파라과이: "Paraguay",
  볼리비아: "Bolivia",
  벨라루스: "Belarus",
  에스토니아: "Estonia",
  리투아니아: "Lithuania",
  카자흐스탄: "Kazakhstan",
  조지아: "Georgia",
  아제르바이잔: "Azerbaijan",
  러시아: "Russia",
  알제리: "Algeria",
  가나: "Ghana",
  이라크: "Iraq",
  기타: "Other",
  "몬테네그로": "Montenegro",
  "페로 제도": "Faroe Islands",
  "코스타리카": "Costa Rica",
  "과테말라": "Guatemala",
  "온두라스": "Honduras",
  "파나마": "Panama",
  "엘살바도르": "El Salvador",
  "니카라과": "Nicaragua",
  "우즈베키스탄": "Uzbekistan",
  "룩셈부르크": "Luxembourg",
  "웨일스": "Wales",
};

/** 종목 코드 → 영문 라벨 (SPORTS.label 은 한국어) */
export const SPORT_LABEL_EN: Record<string, string> = {
  soccer: "Football",
  baseball: "Baseball",
  basketball: "Basketball",
  volleyball: "Volleyball",
  hockey: "Ice Hockey",
  esports: "Esports",
  mma: "MMA",
  tennis: "Tennis",
  golf: "Golf",
  f1: "F1",
  all: "Sports",
};

export function enLeagueName(code: string): string {
  return LEAGUE_DISPLAY_EN[code] ?? code.replace(/_/g, " ");
}

export function enCountryName(ko: string): string {
  return COUNTRY_EN[ko] ?? ko;
}

/** /en/predictions/[league] 지원 리그 — AI 예측(predHome 등)이 실제로 쌓이는 핵심 리그. */
export const EN_PREDICTION_LEAGUES = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "K_LEAGUE_1",
  "MLB",
  "KBO",
  "NPB",
  "NBA",
  "NHL",
] as const;

export const EN_PREDICTION_LEAGUE_SET = new Set<string>(EN_PREDICTION_LEAGUES);

/** 야구 리그 — 순위표를 승률(PCT)·게임차(GB) 컬럼으로 표시 */
export const BASEBALL_LEAGUES_EN = new Set(["MLB", "KBO", "NPB", "CPBL"]);

/** /en/standings/[league] 지원 리그 — ko standings generateMetadata 의 hreflang 판정과
 *  en 페이지 VALID 가 공유하는 단일 출처. 축구=getFullStandings, 야구=fetchBaseballTable→calc,
 *  NHL=공식 API(fetchNhlStandings) 컨퍼런스 표. NBA(소스 정비 중)·WNBA 는 제외 — 지원 시 추가. */
export const EN_STANDINGS_LEAGUE_SET = new Set<string>([
  ...SOCCER_LEAGUES,
  "MLB",
  "KBO",
  "NPB",
  "CPBL",
  "NHL",
]);

/** DB Team.name 이 한글로 저장된 리그(KBO·NPB)의 한→영 공식 팀명.
 *  그 외 리그는 DB 원본이 이미 영문이라 매핑 불필요 (fallback = 원본 반환). */
const TEAM_NAME_EN: Record<string, string> = {
  // MLB (mlb-player-extras 의 teamLabel 이 한국어 축약형)
  "애리조나": "Diamondbacks",
  "애틀랜타": "Braves",
  "볼티모어": "Orioles",
  "보스턴": "Red Sox",
  "시카고C": "Cubs",
  "시카고W": "White Sox",
  "신시내티": "Reds",
  "클리블랜드": "Guardians",
  "콜로라도": "Rockies",
  "디트로이트": "Tigers",
  "휴스턴": "Astros",
  "캔자스시티": "Royals",
  "LA에인절스": "Angels",
  "LA다저스": "Dodgers",
  "마이애미": "Marlins",
  "밀워키": "Brewers",
  "미네소타": "Twins",
  "뉴욕메츠": "Mets",
  "뉴욕양키스": "Yankees",
  "오클랜드": "Athletics",
  "필라델피아": "Phillies",
  "피츠버그": "Pirates",
  "샌디에이고": "Padres",
  "샌프란시스코": "Giants",
  "시애틀": "Mariners",
  "세인트루이스": "Cardinals",
  "탬파베이": "Rays",
  "텍사스": "Rangers",
  "토론토": "Blue Jays",
  "워싱턴": "Nationals",
  // KBO
  "LG 트윈스": "LG Twins",
  "삼성 라이온즈": "Samsung Lions",
  "NC 다이노스": "NC Dinos",
  "키움 히어로즈": "Kiwoom Heroes",
  "KT 위즈": "KT Wiz",
  "한화 이글스": "Hanwha Eagles",
  "SSG 랜더스": "SSG Landers",
  "KIA 타이거즈": "KIA Tigers",
  "두산 베어스": "Doosan Bears",
  "롯데 자이언츠": "Lotte Giants",
  // NPB
  "주니치 드래곤스": "Chunichi Dragons",
  "홋카이도 닛폰햄 파이터즈": "Hokkaido Nippon-Ham Fighters",
  "사이타마 세이부 라이온스": "Saitama Seibu Lions",
  "오릭스 버팔로스": "ORIX Buffaloes",
  "도쿄 야쿠르트 스왈로스": "Tokyo Yakult Swallows",
  "한신 타이거스": "Hanshin Tigers",
  "요미우리 자이언츠": "Yomiuri Giants",
  "요코하마 디엔에이 베이스타스": "Yokohama DeNA BayStars",
  "지바 롯데 마린스": "Chiba Lotte Marines",
  "도호쿠 라쿠텐 골든이글스": "Tohoku Rakuten Golden Eagles",
  "후쿠오카 소프트뱅크 호크스": "Fukuoka SoftBank Hawks",
  "히로시마 도요 카프": "Hiroshima Toyo Carp",
  // NPB 축약형 + e스포츠 — /scores 카드는 풀네임이 아니라 축약형으로 온다 (2026-08 실측)
  "닛폰햄": "Nippon-Ham",
  "지바롯데": "Chiba Lotte",
  "한신": "Hanshin",
  "요코하마": "Yokohama",
  "오릭스": "ORIX",
  "소프트뱅크": "SoftBank",
  "야쿠르트": "Yakult",
  "주니치": "Chunichi",
  "히로시마": "Hiroshima",
  "요미우리": "Yomiuri",
  "세이부": "Seibu",
  "라쿠텐": "Rakuten",
  "농심 레드포스": "Nongshim RedForce",
  "BNK 피어엑스": "BNK FearX",
  "한화생명e스포츠": "Hanwha Life Esports",
  "시프터스": "Shifters",
  "프나틱": "Fnatic",
  "무비스타 코이": "Movistar KOI",
  "SK 게이밍": "SK Gaming",
  "플라이퀘스트": "FlyQuest",
  "센티넬스": "Sentinels",
  "디그니타스": "Dignitas",
  "디스가이즈드": "Disguised",
  // NBA·KBO 축약·EPL 일부 — DB Team.name 이 한글인 종목 (2026-08 /en/standings 실측)
  "LA 레이커스": "Los Angeles Lakers",
  "LA 클리퍼스": "LA Clippers",
  "오클라호마시티 썬더": "Oklahoma City Thunder",
  "미네소타 팀버울브스": "Minnesota Timberwolves",
  "보스턴 셀틱스": "Boston Celtics",
  "필라델피아 76ers": "Philadelphia 76ers",
  "클리블랜드 캐벌리어스": "Cleveland Cavaliers",
  "덴버 너기츠": "Denver Nuggets",
  "피닉스 선스": "Phoenix Suns",
  "뉴욕 닉스": "New York Knicks",
  "밀워키 벅스": "Milwaukee Bucks",
  "마이애미 히트": "Miami Heat",
  "골든스테이트 워리어스": "Golden State Warriors",
  "댈러스 매버릭스": "Dallas Mavericks",
  "새크라멘토 킹스": "Sacramento Kings",
  "뉴올리언스 펠리컨스": "New Orleans Pelicans",
  "인디애나 페이서스": "Indiana Pacers",
  "올랜도 매직": "Orlando Magic",
  "애틀랜타 호크스": "Atlanta Hawks",
  "시카고 불스": "Chicago Bulls",
  "브루클린 네츠": "Brooklyn Nets",
  "토론토 랩터스": "Toronto Raptors",
  "샬럿 호네츠": "Charlotte Hornets",
  "워싱턴 위저즈": "Washington Wizards",
  "디트로이트 피스톤스": "Detroit Pistons",
  "휴스턴 로키츠": "Houston Rockets",
  "샌안토니오 스퍼스": "San Antonio Spurs",
  "멤피스 그리즐리스": "Memphis Grizzlies",
  "유타 재즈": "Utah Jazz",
  "포틀랜드 트레일블레이저스": "Portland Trail Blazers",
  "롯데": "Lotte",
  "삼성": "Samsung",
  "키움": "Kiwoom",
  "두산": "Doosan",
  "한화": "Hanwha",
  "LG": "LG",
  "KIA": "KIA",
  "KT": "KT",
  "SSG": "SSG",
  "NC": "NC",
  "브렌트퍼드": "Brentford",
  "아스널": "Arsenal",
  "에버턴": "Everton",
  "입스위치": "Ipswich Town",
  "헐 시티": "Hull City",
  "디트로이트 피스턴스": "Detroit Pistons",
  "카르민 코프": "Kapfenberger SV",
};

export function toEnglishTeamName(name: string): string {
  return TEAM_NAME_EN[name] ?? name;
}

/** /en/injuries/[league] 지원 리그 — 영문 원본 소스만 (축구=af, 미국리그=ESPN).
 *  KBO·NPB 는 한국어 공시 소스라 제외. ko injuries hreflang 판정과 공유하는 단일 출처. */
export const EN_INJURY_SOCCER = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "K_LEAGUE_1", "SAUDI_PL", "J1_LEAGUE",
] as const;
export const EN_INJURY_ESPN = ["NBA", "MLB", "NHL"] as const;
export const EN_INJURY_LEAGUE_SET = new Set<string>([...EN_INJURY_SOCCER, ...EN_INJURY_ESPN]);

/** 리더보드 카테고리 코드 → 영문 라벨 (leagueLeader.unit 이 한국어라 코드 기준 매핑) */
export const LEADER_CATEGORY_EN: Record<string, string> = {
  GOAL: "Goals",
  ASSIST: "Assists",
  YELLOW: "Yellow cards",
  RED: "Red cards",
  BA: "Batting average",
  HR: "Home runs",
  RBI: "RBIs",
  K: "Strikeouts",
  ERA: "ERA",
  WIN: "Wins",
  SAVE: "Saves",
  SB: "Stolen bases",
  PTS: "Points per game",
  REB: "Rebounds",
  AST: "Assists",
  STL: "Steals",
  BLK: "Blocks",
  POINTS: "Points",
  GOAL_NHL: "Goals",
  ASSIST_NHL: "Assists",
  SAVE_PCT: "Save %",
  CS: "CS",
  KDA: "KDA",
  KILL: "Kills",
};

/** ko↔en hreflang alternates.languages — 지원 경로만 호출부에서 판정 후 사용. */
export function koEnLanguages(koPath: string, enPath: string) {
  return {
    ko: `${SITE_URL}${koPath}`,
    en: `${SITE_URL}${enPath}`,
    "x-default": `${SITE_URL}${koPath}`,
  };
}

/**
 * UFC 체급명 한글 → 영문.
 * MmaRanking.displayName 이 한글로만 저장돼 있어 영어판(/en/rankings/ufc)에서 갈아끼운다.
 * 소스에 한글 키를 두면 en-mirror 추출기가 "미번역" 으로 잡으므로 여기(사전 파일)에 둔다.
 */
export const UFC_WEIGHT_CLASS_EN: Record<string, string> = {
  "파운드-포-파운드 (남)": "Pound-for-Pound (Men)",
  "파운드-포-파운드 (여)": "Pound-for-Pound (Women)",
  "플라이급": "Flyweight",
  "밴텀급": "Bantamweight",
  "페더급": "Featherweight",
  "라이트급": "Lightweight",
  "웰터급": "Welterweight",
  "미들급": "Middleweight",
  "라이트헤비급": "Light Heavyweight",
  "헤비급": "Heavyweight",
  "여자 스트로급": "Women's Strawweight",
  "여자 플라이급": "Women's Flyweight",
  "여자 밴텀급": "Women's Bantamweight",
  "여자 페더급": "Women's Featherweight",
};

export function enWeightClass(ko: string): string {
  return UFC_WEIGHT_CLASS_EN[ko] ?? ko;
}

/**
 * 포지션 코드 → 영문 라벨. lib/players/grid-position 의 POS_KO 와 짝.
 * 영어판 선수 페이지가 세부 포지션을 영어로 표기할 때 쓴다.
 */
export const POS_EN: Record<string, string> = {
  GK: "Goalkeeper",
  LB: "Left-back", LWB: "Left wing-back", CB: "Centre-back", RB: "Right-back", RWB: "Right wing-back",
  CDM: "Defensive midfielder", LM: "Left midfielder", CM: "Central midfielder",
  RM: "Right midfielder", CAM: "Attacking midfielder",
  LW: "Left winger", RW: "Right winger", SS: "Second striker", ST: "Striker", CF: "Centre-forward",
};

/**
 * 선수 레이더 축 라벨 한글 → 영문. lib/player-radar 의 label 과 짝.
 * 레이더는 클라이언트에서 그려져 SSR HTML 에 안 나오므로 en-mirror 의 HTML 검증이
 * 잡지 못한다 — 축 라벨을 바꿀 땐 브라우저로 직접 확인할 것.
 */
export const RADAR_AXIS_EN: Record<string, string> = {
  "골/90": "Goals/90",
  "도움/90": "Assists/90",
  "슈팅 정확도": "Shot accuracy",
  "키패스/90": "Key passes/90",
  "패스 정확도": "Pass accuracy",
  "드리블 성공률": "Dribble success",
  "경합 승률": "Duels won",
  "수비/90": "Def. actions/90",
};

/**
 * 라이브 경기 상태 라벨 한글 → 영문.
 * `lib/sports/live-scores.ts` 의 soccerStatusLabel 이 "전반 23'" 처럼 한국어로 만들고,
 * 그 파일은 미러 대상이 아니라 표시 직전에 갈아끼운다.
 */
export function enMatchStatus(label: string | null | undefined): string | null {
  if (!label) return label ?? null;
  return label
    .replace(/^전반\s*/, "1H ")
    .replace(/^후반\s*/, "2H ")
    .replace(/^연장\s*/, "ET ")
    .replace(/^승부차기$/, "Pens")
    .replace(/(\d+)회\s*초/, "Top $1")
    .replace(/(\d+)회\s*말/, "Bot $1")
    .replace(/(\d+)쿼터/, "Q$1")
    .replace(/(\d+)피리어드/, "P$1")
    .replace(/(\d+)세트/, "Set $1")
    .trim();
}

/** mlb-player-extras·kbo-official 이 만들어 내려보내는 한국어 스플릿 라벨을 영어로 되돌린다.
 *  (라벨이 lib 안에서 조립돼 미러 사전으로는 못 잡는다) */
export function enSplitLabel(label: string): string {
  const m = /^(\d+)팀$/.exec(label);
  if (m) return `${m[1]} teams`;
  const mm = /^(\d+)월$/.exec(label);
  if (mm) return MONTH_EN[Number(mm[1])] ?? label;
  return SPLIT_LABEL_EN[label] ?? toEnglishTeamName(label);
}

const SPLIT_LABEL_EN: Record<string, string> = {
  "vs 좌타": "vs LHB", "vs 우타": "vs RHB", "vs 좌투": "vs LHP", "vs 우투": "vs RHP",
  "홈": "Home", "원정": "Away", "전체": "Total",
};

const MONTH_EN: Record<number, string> = {
  1: "March/April", 2: "March/April", 3: "March/April", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
};
