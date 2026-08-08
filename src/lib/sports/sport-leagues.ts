// 종목(sport) ↔ 리그(league) 매핑 + 한글 라벨.
// /scores 페이지 종목 탭에서 사용.

export type SportCode = "all" | "soccer" | "baseball" | "basketball" | "volleyball" | "hockey" | "esports" | "mma" | "tennis" | "golf" | "f1";

interface SportMeta {
  code: SportCode;
  label: string;
  emoji: string;
  leagues: string[]; // 우리 League 코드 (대문자)
}

// 모든 리그 묶음 — `all` 처리용 (URL 호환성, sportTab 노출 X)
export const ALL_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "K3_LEAGUE", "K4_LEAGUE",
  // J3 제외 (2026-08-08 사용자 결정) — 3부라 한국 독자 관심이 낮은데, ts 수집이 붙다 말아
  // 라운드의 절반만 DB 에 들어오고 나머지는 af orphan 카드로만 뜨는 반쪽 상태였다.
  "J1_LEAGUE", "J2_LEAGUE",
  "AFC_CL", "AFC_CL_TWO", "AFC_U23", "ASEAN_CHAMP", "SAUDI_PL",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I", "SWISS_SL", "CHALLENGE_LEAGUE", "ARMENIA_PL",
  "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
  "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
  "IRELAND_PD", "BOSNIA_PL", "ALBANIA_SL", "MOLDOVA_SL",
  "ELITESERIEN", "NORWAY_1L", "ALLSVENSKAN", "SUPERETTAN",
  "VEIKKAUSLIIGA", "YKKONEN", "URVALSDEILD", "ICELAND_1L",
  "LIGA_MX", "BRASILEIRAO", "ARGENTINA_PL", "COPA_LIB", "COPA_SUD",
  "CHILE_PD", "CHILE_PB", "ECUADOR_LP", "COLOMBIA_PA", "PERU_PD", "VENEZUELA_PD",
  "URUGUAY_PD", "PARAGUAY_PD", "BOLIVIA_PD",
  "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL", "VIETNAM_VL1", "VIETNAM_VL2",
  "INDONESIA_L1", "SINGAPORE_PL", "THAI_L1",
  "UAE_PL", "QATAR_SL", "MOROCCO_BP", "SOUTHAFRICA_PSL",
  "USA_USL_CH", "CANADA_PL",
  "CSL", "A_LEAGUE",
  "CLUB_WORLD_CUP",
  // 국가대표 토너 / 예선 / 친선
  "AFCON", "UEFA_NL", "WC_QUAL", "EURO_QUAL", "CONCACAF_GOLD",
  "INTL_FRIENDLY", "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL",
  "UEFA_U21_Q", "UEFA_U21", "UEFA_U19", "UEFA_U17",
  "CLUB_FRIENDLY", // 국제 클럽 친선 (프리시즌) — 스코어 피드 전용
  // 여자 축구
  "WSL", "NWSL", "WK_LEAGUE", "UEFA_WCL", "A_LEAGUE_W",
  // 컵 대회
  "FA_CUP", "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
  "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "CONCACAF_CCUP", "AFC_CUP",
  "KBO", "NPB", "MLB",
  // 2026-05-27 야구 9개 확장 — TheSports unique_tournament 매핑
  "CPBL", "WBC", "WBSC_PREMIER_12", "ASIAN_GAMES_BB", "OLYMPICS_BB",
  "KBO_FUTURES", "NPB_MINOR", "CARIBBEAN_SERIES", "LMB",
  "NBA", "WNBA", "KBL", "WKBL", "NBA_SL", "NHL", "IIHF_WC", "LOL", "LCK_CL", "LPL", "LEC", "LCS", "EWC", "UFC",
  // 2026-08-04 오세아니아 하키 — NHL 오프시즌(6~9월) 하키 탭을 채우는 남반구 정규시즌
  "AIHL", "NZIHL",
  // 2026-07-23 테니스·골프·F1 — ESPN 직접 fetch 표시 전용 (DB 수집 없음, docs/tennis-golf-scores)
  "ATP", "WTA", "PGA", "LPGA", "F1",
  // 2026-06-12 배구 — TheSports unique_tournament 기반 (VNL 남/여 / AVC 네이션스컵 여자 / 유럽 골든리그 여자)
  "VNL", "VNL_W", "AVC_NATIONS_W", "EGL_W",
  // 2026-08-01 V-리그(한국 남녀) — 10월 개막 대비 선등록 (ts utid 남 kn54qldhe9nrvy9 / 여 d23xmvzhowyqg8n)
  "V_LEAGUE", "V_LEAGUE_W",
  // KOVO컵(프리시즌 컵, 통상 8~9월) — utid 남 4zp5rzdh70oq82w / 여 j1l4rjdh12dr7vx
  "KOVO_CUP", "KOVO_CUP_W",
  // 2026-05-24 추가
  "SUI_CUP", "LEAGUE_ONE", "LATVIA_VL", "BELARUS_PL",
  // 2026-05-24 추가 (2차, 8개)
  "ESTONIA_ML", "LITHUANIA_AL", "LEVAIN_CUP", "KAZAKHSTAN_PL",
  "GEORGIA_EL", "AZERBAIJAN_PL", "EREDIVISIE_2", "PRIMEIRA_LIGA_2",
  // 2026-05-24 추가 (3차, 10개) — TheSports 업그레이드 후
  "LEAGUE_TWO", "NATIONAL_LEAGUE",
  "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
  "RPL", "ALGERIA_L1",
  "SVENSKA_CUPEN", "GHANA_PL", "ARG_PRIMERA_NACIONAL",
  "IRAQ_SL",
  "MEXICO_2", "CHINA_2", "IRELAND_2", "DENMARK_2", "HUNGARY_2",
  "CZECH_2", "AUSTRIA_2", "BELGIUM_2", "TURKEY_2",
  // 2026-08-01 추가 — 7m 커버리지 대조 16개 (af orphan 표시 전용, DB 수집 X)
  "COPA_DO_BRASIL", "PORTUGAL_SUPER_CUP", "RUSSIA_FNL",
  "ETTAN_NORRA", "ETTAN_SODRA", "NORWAY_2D_G1", "NORWAY_2D_G2",
  "KAKKONEN_A", "KAKKONEN_B", "KAKKONEN_C",
  "ROMANIA_L2", "CHINA_3",
  "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN", "UZBEKISTAN_SL",
  // 2026-08-02 추가 — 잔여 성인 남자 1부 7개 (af orphan 표시 전용)
  "WALES_PL", "MONTENEGRO_1L", "LUXEMBOURG_ND", "FAROE_PL",
  "PANAMA_LPF", "ELSALVADOR_PD", "NICARAGUA_PD",
];

export const SPORTS: SportMeta[] = [
  {
    code: "soccer",
    label: "축구",
    emoji: "⚽",
    leagues: [
      "K_LEAGUE_1", "K_LEAGUE_2", "K3_LEAGUE", "K4_LEAGUE",
      "AFC_CL", "AFC_CL_TWO", "AFC_U23", "ASEAN_CHAMP",
      "J1_LEAGUE", "J2_LEAGUE", // J3 제외 — ALL_LEAGUES 주석 참고
      "UCL", "UEL", "UECL",
      "EPL", "CHAMPIONSHIP",
      "LALIGA", "LALIGA_2",
      "BUNDESLIGA", "BUNDESLIGA_2",
      "SERIE_A", "SERIE_B",
      "LIGUE_1", "LIGUE_2",
      "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
      "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I", "SWISS_SL", "CHALLENGE_LEAGUE", "ARMENIA_PL",
      "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
      "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
      "IRELAND_PD", "BOSNIA_PL", "ALBANIA_SL", "MOLDOVA_SL",
      "ELITESERIEN", "NORWAY_1L", "ALLSVENSKAN", "SUPERETTAN",
      "VEIKKAUSLIIGA", "YKKONEN", "URVALSDEILD", "ICELAND_1L",
      "MLS", "LIGA_MX", "BRASILEIRAO", "ARGENTINA_PL", "COPA_LIB", "COPA_SUD",
      "CHILE_PD", "CHILE_PB", "ECUADOR_LP", "COLOMBIA_PA", "PERU_PD", "VENEZUELA_PD",
      "URUGUAY_PD", "PARAGUAY_PD", "BOLIVIA_PD",
      "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL",
      "VIETNAM_VL1", "VIETNAM_VL2", "INDONESIA_L1", "SINGAPORE_PL", "THAI_L1",
      "UAE_PL", "QATAR_SL", "MOROCCO_BP", "SOUTHAFRICA_PSL",
      "USA_USL_CH", "CANADA_PL",
      "CSL", "A_LEAGUE", "SAUDI_PL",
      "CLUB_WORLD_CUP", "WORLD_CUP",
      // 국가대표 토너 / 예선 / 친선
      "AFCON", "UEFA_NL", "WC_QUAL", "EURO_QUAL", "CONCACAF_GOLD",
      "INTL_FRIENDLY", "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL",
      "UEFA_U21_Q", "UEFA_U21", "UEFA_U19", "UEFA_U17",
      "CLUB_FRIENDLY", // 국제 클럽 친선 (프리시즌) — 스코어 피드 전용
      // 여자 축구
      "WSL", "NWSL", "WK_LEAGUE", "UEFA_WCL", "A_LEAGUE_W",
      // 컵 대회 — 메이저 5 + 한국·일본·CONCACAF·AFC + 스위스
      "FA_CUP", "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
      "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "CONCACAF_CCUP", "AFC_CUP",
      "SUI_CUP",
      // 2026-05-24 추가 — 잉글랜드 3부 + 발트/동유럽
      "LEAGUE_ONE", "LATVIA_VL", "BELARUS_PL",
      // 2026-05-24 추가 (2차) — 발트/CIS + 일본컵 + 네덜란드/포르투갈 2부
      "ESTONIA_ML", "LITHUANIA_AL", "LEVAIN_CUP", "KAZAKHSTAN_PL",
      "GEORGIA_EL", "AZERBAIJAN_PL", "EREDIVISIE_2", "PRIMEIRA_LIGA_2",
      // 2026-05-24 추가 (3차) — TheSports 업그레이드 후 검증된 10개
      "LEAGUE_TWO", "NATIONAL_LEAGUE",
      "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
      "RPL", "ALGERIA_L1",
      "SVENSKA_CUPEN", "GHANA_PL", "ARG_PRIMERA_NACIONAL",
      "IRAQ_SL",
      "MEXICO_2", "CHINA_2", "IRELAND_2", "DENMARK_2", "HUNGARY_2",
      "CZECH_2", "AUSTRIA_2", "BELGIUM_2", "TURKEY_2",
      // 2026-08-01 추가 — 7m 커버리지 대조 16개 (af orphan 표시 전용)
      "COPA_DO_BRASIL", "PORTUGAL_SUPER_CUP", "RUSSIA_FNL",
      "ETTAN_NORRA", "ETTAN_SODRA", "NORWAY_2D_G1", "NORWAY_2D_G2",
      "KAKKONEN_A", "KAKKONEN_B", "KAKKONEN_C",
      "ROMANIA_L2", "CHINA_3",
      "COSTA_RICA_PD", "GUATEMALA_LN", "HONDURAS_LN", "UZBEKISTAN_SL",
      // 2026-08-02 추가 — 잔여 성인 남자 1부 7개 (af orphan 표시 전용)
      "WALES_PL", "MONTENEGRO_1L", "LUXEMBOURG_ND", "FAROE_PL",
      "PANAMA_LPF", "ELSALVADOR_PD", "NICARAGUA_PD",
    ],
  },
  {
    code: "baseball",
    label: "야구",
    emoji: "⚾",
    leagues: [
      "KBO", "NPB", "MLB",
      "CPBL", "WBC", "WBSC_PREMIER_12", "ASIAN_GAMES_BB", "OLYMPICS_BB",
      "KBO_FUTURES", "NPB_MINOR", "CARIBBEAN_SERIES", "LMB",
    ],
  },
  {
    code: "basketball",
    label: "농구",
    emoji: "🏀",
    leagues: ["NBA", "WNBA", "KBL", "WKBL", "NBA_SL"],
  },
  {
    code: "volleyball",
    label: "배구",
    emoji: "🏐",
    // 2026-06-12 신설 — TheSports 배구. V-리그는 10월 개막 시 추가 예정([[feedback_thesports_volleyball_shapes]]).
    // 2026-08-01 V-리그 남녀 추가 — 10월 개막 대비 선등록 (수집·라이브·배당은 리그 코드만으로 자동)
    leagues: ["V_LEAGUE", "V_LEAGUE_W", "KOVO_CUP", "KOVO_CUP_W", "VNL", "VNL_W", "AVC_NATIONS_W", "EGL_W"],
  },
  {
    code: "hockey",
    label: "하키",
    emoji: "🏒",
    // 2026-08-04 AIHL·NZIHL 추가 — NHL 이 6~9월 오프시즌이라 하키 탭이 비는 구간을 남반구 리그가 메운다
    leagues: ["NHL", "IIHF_WC", "AIHL", "NZIHL"],
  },
  {
    code: "esports",
    label: "e스포츠",
    emoji: "🎮",
    // "LOL"=LCK 본선(+Road to MSI, 코드 유지). "LCK_CL"=2군. "LPL/LEC/LCS"=해외(표시만).
    // "EWC"=이스포츠 월드컵(국제 — T1·TL·KC 등 지역 혼합). BDL tournament→league 는 lol.ts,
    // TheSports tournament→league 는 lol-thesports.ts(TS_LOL_TOURNAMENTS) 소스.
    leagues: ["LOL", "LCK_CL", "LPL", "LEC", "LCS", "EWC"],
  },
  {
    code: "mma",
    label: "UFC",
    emoji: "🥊",
    leagues: ["UFC"],
  },
  {
    code: "tennis",
    label: "테니스",
    emoji: "🎾",
    // 2026-07-23 신설 — ESPN scoreboard 직접 fetch (DB 수집 없음, 표시 전용)
    leagues: ["ATP", "WTA"],
  },
  {
    code: "golf",
    label: "골프",
    emoji: "⛳",
    // 2026-07-23 신설 — ESPN 리더보드 직접 fetch (DB 수집 없음, 표시 전용)
    leagues: ["PGA", "LPGA"],
  },
  {
    code: "f1",
    label: "F1",
    emoji: "🏎️",
    // 2026-07-23 신설 — ESPN 그랑프리 세션/결과 직접 fetch (DB 수집 없음, 표시 전용)
    leagues: ["F1"],
  },
];

// 야구 리그 집합 — SPORTS.baseball.leagues 단일 진실에서 빌드.
// 8군데에 중복 정의돼 있던 inline set 통합 (2026-05-27 LMB POSTPONED 오표시 사고).
// 마이너 리그(LMB/CPBL/KBO_FUTURES 등) 누락 시 thesports-cache 가 야구를 축구로
// 잘못 분류해 status_id 매핑 실패 → SCHEDULED stuck.
export const BASEBALL_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "baseball")?.leagues ?? [],
);

// 하키 리그 집합 — SPORTS.hockey.leagues 단일 진실에서 빌드 (inline hardcode 금지).
// thesports-cache 가 mapIceHockeyStatus 분기에 사용. predictionEngine 의 inline set 도 이걸로 통합 가능.
export const HOCKEY_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "hockey")?.leagues ?? [],
);

// 농구 리그 집합 — SPORTS.basketball.leagues 단일 진실. thesports-cache 가 mapBasketballStatus 분기에 사용.
export const BASKETBALL_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "basketball")?.leagues ?? [],
);

// 배구 리그 집합 — SPORTS.volleyball.leagues 단일 진실. 세트 기반 status(432~440)·score(ft=세트) 분기에 사용.
export const VOLLEYBALL_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "volleyball")?.leagues ?? [],
);

// MMA(UFC) 리그 집합 — 경기는 The Odds API, 파이터 프로필은 api-sports /fighters.
// 팀 스포츠가 아니라 파이터(개인)지만 Match.homeTeam/awayTeam(=파이터 Team) 재사용.
export const MMA_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "mma")?.leagues ?? [],
);

// e스포츠(LoL) 리그 집합 — SPORTS.esports.leagues 단일 진실. "LOL"=LCK 본선(코드 유지),
// "LCK_CL"=2군 등. league→sport 매핑·라우트·sitemap 분기가 이 Set 으로 자동화된다.
export const LOL_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "esports")?.leagues ?? [],
);

// 국가대표 대회 리그 — 이 리그 소속 Team 은 클럽 페이지(/teams) 대신
// 국가대표 페이지(/national-teams)가 단일 진실 (팀 페이지 이원화 방지).
export const NATIONAL_TEAM_LEAGUES = new Set([
  "WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL", "AFCON",
  "CONCACAF_GOLD", "INTL_FRIENDLY", "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL",
]);

// 축구 리그 집합 — SPORTS.soccer.leagues 단일 진실 (K리그·월드컵 등 전부 포함).
export const SOCCER_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

// 무승부가 정규 결과로 존재하는 종목 = 축구만. 야구(KBO/NPB 는 무 제도 있으나 예측·UI 는
// 승패 2지선다로 통일)·농구·하키(OT/SO)·MMA·LoL(BO 시리즈) 은 무승부 표기 안 함.
// hideDraw / hasDraw / showDraw 분기의 단일 진실 — inline 블랙리스트(NBA/KBO/NPB...) 금지.
export function leagueHasDraw(league: string): boolean {
  return SOCCER_LEAGUES.has(league);
}

export function leaguesForSport(code: SportCode): string[] {
  if (code === "all") return ALL_LEAGUES;
  return SPORTS.find((s) => s.code === code)?.leagues ?? ALL_LEAGUES;
}

export const LEAGUE_DISPLAY: Record<string, string> = {
  ATP: "ATP 투어",
  WTA: "WTA 투어",
  PGA: "PGA 투어",
  LPGA: "LPGA 투어",
  F1: "포뮬러 1",
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵 2026",
  K_LEAGUE_1: "K리그 1",
  K_LEAGUE_2: "K리그 2",
  J1_LEAGUE: "J1 리그",
  J2_LEAGUE: "J2 리그",
  AFC_CL: "AFC 챔피언스리그",
  SAUDI_PL: "사우디 프로 리그",
  UEL: "유로파 리그",
  UECL: "유로파 컨퍼런스",
  CHAMPIONSHIP: "잉글랜드 챔피언십",
  LALIGA_2: "라리가 2",
  BUNDESLIGA_2: "분데스리가 2",
  SERIE_B: "세리에 B",
  LIGUE_2: "리그 2",
  CLUB_WORLD_CUP: "FIFA 클럽 월드컵",
  AFC_CL_TWO: "AFC 챔피언스리그 2",
  AFC_U23: "AFC U23 아시안컵",
  ASEAN_CHAMP: "ASEAN 챔피언십",
  CSL: "중국 슈퍼리그",
  A_LEAGUE: "A-리그",
  EREDIVISIE: "에레디비시",
  PRIMEIRA_LIGA: "프리메이라 리가",
  SUPER_LIG: "쉬페르 리그",
  JUPILER_PL: "주피러 프로 리그",
  SPL: "스코틀랜드 프리미어십",
  GREEK_SL: "그리스 슈퍼리그",
  EKSTRAKLASA: "에크스트라클라사",
  POLAND_1L: "폴란드 I 리가",
  BULGARIA_PL: "불가리아 퍼스트 리그",
  LIGA_I: "루마니아 리가 I",
  SWISS_SL: "스위스 슈퍼리그",
  CHALLENGE_LEAGUE: "스위스 챌린지 리그",
  ARMENIA_PL: "아르메니아 프리미어 리그",
  AUSTRIA_BL: "오스트리아 분데스리가",
  CZECH_L: "체코 1부",
  HNL: "크로아티아 HNL",
  UKRAINE_PL: "우크라이나 프리미어 리그",
  HUNGARY_NB1: "헝가리 NB I",
  SERBIA_SL: "세르비아 슈퍼리가",
  SLOVAKIA_SL: "슬로바키아 슈퍼리가",
  SLOVENIA_SNL: "슬로베니아 1. SNL",
  CYPRUS_1D: "키프로스 1부",
  DENMARK_SL: "덴마크 슈페르리가",
  IRELAND_PD: "아일랜드 프리미어",
  BOSNIA_PL: "보스니아 프리미어",
  ALBANIA_SL: "알바니아 슈페르리가",
  MOLDOVA_SL: "몰도바 슈페르리가",
  ELITESERIEN: "노르웨이 엘리테세리엔",
  NORWAY_1L: "노르웨이 1부 디비전",
  ALLSVENSKAN: "스웨덴 알스벤스칸",
  SUPERETTAN: "스웨덴 수페레탄",
  VEIKKAUSLIIGA: "핀란드 베이카우슬리가",
  YKKONEN: "핀란드 위쾨넨",
  URVALSDEILD: "아이슬란드 우르발스데일드",
  ICELAND_1L: "아이슬란드 1부 데일드",
  CHILE_PD: "칠레 프리메라 디비시온",
  CHILE_PB: "칠레 프리메라 B",
  ECUADOR_LP: "에콰도르 리가 프로",
  COLOMBIA_PA: "콜롬비아 프리메라 A",
  PERU_PD: "페루 프리메라 디비시온",
  VENEZUELA_PD: "베네수엘라 프리메라 디비시온",
  EGYPT_PL: "이집트 프리미어 리그",
  ISRAEL_PL: "이스라엘 리가트 하알",
  INDIA_ISL: "인도 슈퍼 리그",
  VIETNAM_VL1: "베트남 V-리그 1",
  INDONESIA_L1: "인도네시아 리가 1",
  SINGAPORE_PL: "싱가포르 프리미어 리그",
  UAE_PL: "UAE 프로 리그",
  QATAR_SL: "카타르 스타스 리그",
  MOROCCO_BP: "모로코 보톨라 프로",
  SOUTHAFRICA_PSL: "남아공 PSL",
  USA_USL_CH: "USL 챔피언십",
  CANADA_PL: "캐나다 프리미어 리그",
  BRASILEIRAO: "브라질 세리에 A",
  LIGA_MX: "리가 MX",
  COPA_LIB: "코파 리베르타도레스",
  COPA_SUD: "코파 수다메리카나",
  FA_CUP: "FA컵",
  EFL_CUP: "카라바오 컵",
  SCO_LEAGUE_CUP: "스코틀랜드 리그컵",
  COPA_DEL_REY: "코파 델 레이",
  COPPA_ITALIA: "코파 이탈리아",
  DFB_POKAL: "DFB-포칼",
  COUPE_DE_FRANCE: "쿠프 드 프랑스",
  KFA_CUP: "KFA컵",
  EMPEROR_CUP: "천황배",
  CONCACAF_CCUP: "CONCACAF 챔피언스컵",
  AFC_CUP: "AFC컵",
  // 신규 추가 (23개)
  K3_LEAGUE: "K3리그",
  K4_LEAGUE: "K4리그",
  J3_LEAGUE: "J3 리그",
  ARGENTINA_PL: "아르헨티나 프리메라",
  URUGUAY_PD: "우루과이 프리메라",
  PARAGUAY_PD: "파라과이 프리메라",
  BOLIVIA_PD: "볼리비아 프리메라",
  THAI_L1: "태국 1부",
  VIETNAM_VL2: "베트남 V-리그 2",
  AFCON: "아프리카 네이션스컵",
  UEFA_NL: "UEFA 네이션스 리그",
  WC_QUAL: "월드컵 예선",
  EURO_QUAL: "유로 예선",
  CONCACAF_GOLD: "CONCACAF 골드컵",
  INTL_FRIENDLY: "국가대표 친선",
  CLUB_FRIENDLY: "클럽 친선",
  U20_WC: "U-20 월드컵",
  U17_WC: "U-17 월드컵",
  UEFA_U21_Q: "UEFA U21 챔피언십 예선",
  UEFA_U21: "UEFA U21 챔피언십",
  UEFA_U19: "UEFA U19 챔피언십",
  UEFA_U17: "UEFA U17 챔피언십",
  OLYMPICS_FOOTBALL: "올림픽 축구",
  WSL: "WSL (잉글랜드 여자)",
  NWSL: "NWSL (미국 여자)",
  WK_LEAGUE: "WK리그",
  UEFA_WCL: "UEFA 여자 챔피언스리그",
  A_LEAGUE_W: "A-리그 여자",
  KBO: "KBO 리그",
  NPB: "NPB 일본프로야구",
  MLB: "메이저리그",
  // 2026-05-27 야구 9개 확장
  CPBL: "CPBL 대만프로야구",
  WBC: "WBC 월드베이스볼클래식",
  WBSC_PREMIER_12: "WBSC 프리미어 12",
  ASIAN_GAMES_BB: "아시안게임 야구",
  OLYMPICS_BB: "올림픽 야구",
  KBO_FUTURES: "KBO 퓨처스리그",
  NPB_MINOR: "NPB 2군",
  CARIBBEAN_SERIES: "카리브 시리즈",
  LMB: "멕시칸 리그",
  NBA: "NBA",
  WNBA: "WNBA",
  NBA_SL: "NBA 서머리그",
  NHL: "NHL",
  IIHF_WC: "세계선수권",
  AIHL: "호주 아이스하키",
  NZIHL: "뉴질랜드 아이스하키",
  KBL: "KBL",
  WKBL: "WKBL",
  V_LEAGUE: "V-리그 (남)",
  V_LEAGUE_W: "V-리그 (여)",
  KOVO_CUP: "KOVO컵 (남)",
  KOVO_CUP_W: "KOVO컵 (여)",
  VNL: "발리볼 네이션스리그 (남)",
  VNL_W: "발리볼 네이션스리그 (여)",
  AVC_NATIONS_W: "AVC 네이션스컵 (여)",
  EGL_W: "유럽 발리볼리그 (여)", // CEV European League — 골든+실버 통합 utid (26팀 실측)
  LOL: "LCK",
  LCK_CL: "LCK CL",
  LPL: "LPL",
  LEC: "LEC",
  LCS: "LCS",
  EWC: "이스포츠 월드컵",
  UFC: "UFC",
  // 2026-05-24 추가
  SUI_CUP: "스위스컵",
  LEAGUE_ONE: "잉글랜드 리그 원",
  LATVIA_VL: "라트비아 비르슬리가",
  BELARUS_PL: "벨라루스 프리미어",
  // 2026-05-24 추가 (2차)
  ESTONIA_ML: "에스토니아 메이스트리리가",
  LITHUANIA_AL: "리투아니아 A 리가",
  LEVAIN_CUP: "르베인 컵",
  KAZAKHSTAN_PL: "카자흐스탄 프리미어",
  GEORGIA_EL: "조지아 에로브눌리",
  AZERBAIJAN_PL: "아제르바이잔 프리미어",
  EREDIVISIE_2: "에이르스터 디비시",
  PRIMEIRA_LIGA_2: "포르투갈 리가 2",
  // 2026-05-24 추가 (3차)
  LEAGUE_TWO: "잉글랜드 리그 투",
  NATIONAL_LEAGUE: "잉글랜드 내셔널리그",
  SCOT_CHAMPIONSHIP: "스코티시 챔피언십",
  SCOT_LEAGUE_ONE: "스코티시 리그 원",
  SCOT_LEAGUE_TWO: "스코티시 리그 투",
  RPL: "러시아 프리미어리그",
  ALGERIA_L1: "알제리 리그 1",
  SVENSKA_CUPEN: "스벤스카 컵",
  GHANA_PL: "가나 프리미어리그",
  ARG_PRIMERA_NACIONAL: "아르헨티나 프리메라 나시오날",
  IRAQ_SL: "이라크 스타스 리그",
  MEXICO_2: "멕시코 리가 엑스판시온", // 2026-08-01 개칭 반영 (구 아센소 MX)
  CHINA_2: "중국 리그원",
  IRELAND_2: "아일랜드 1부 디비전",
  DENMARK_2: "덴마크 1.디비전",
  HUNGARY_2: "헝가리 NB II",
  CZECH_2: "체코 2부",
  AUSTRIA_2: "오스트리아 2.리가",
  BELGIUM_2: "벨기에 챌린저 프로",
  TURKEY_2: "튀르키예 1.리그",
  // 2026-08-01 추가 — 7m 커버리지 대조 16개
  COPA_DO_BRASIL: "코파 두 브라질",
  PORTUGAL_SUPER_CUP: "포르투갈 수페르컵",
  RUSSIA_FNL: "러시아 FNL",
  ETTAN_NORRA: "스웨덴 에탄 노라",
  ETTAN_SODRA: "스웨덴 에탄 쇠드라",
  NORWAY_2D_G1: "노르웨이 2.디비션 1조",
  NORWAY_2D_G2: "노르웨이 2.디비션 2조",
  KAKKONEN_A: "핀란드 카코넨 A",
  KAKKONEN_B: "핀란드 카코넨 B",
  KAKKONEN_C: "핀란드 카코넨 C",
  ROMANIA_L2: "루마니아 리가 II",
  CHINA_3: "중국 리그투",
  COSTA_RICA_PD: "코스타리카 프리메라",
  GUATEMALA_LN: "과테말라 리가 나시오날",
  HONDURAS_LN: "온두라스 리가 나시오날",
  UZBEKISTAN_SL: "우즈베키스탄 슈퍼리가",
  // 2026-08-02 추가 — 잔여 성인 남자 1부 7개
  WALES_PL: "웨일스 컴리 프리미어",
  MONTENEGRO_1L: "몬테네그로 1부",
  LUXEMBOURG_ND: "룩셈부르크 내셔널 디비전",
  FAROE_PL: "페로 제도 프리미어",
  PANAMA_LPF: "파나마 LPF",
  ELSALVADOR_PD: "엘살바도르 프리메라",
  NICARAGUA_PD: "니카라과 프리메라",
};

/** 정렬 우선순위 (낮을수록 위) — KBO/NPB 한국 시청자 우선 */
export const LEAGUE_ORDER: Record<string, number> = {
  KBO: 0,
  KBO_FUTURES: 0.5,
  NPB: 1,
  NPB_MINOR: 1.5,
  MLB: 2,
  CPBL: 2.5,
  WBC: 2.6,
  WBSC_PREMIER_12: 2.65,
  ASIAN_GAMES_BB: 2.7,
  OLYMPICS_BB: 2.75,
  LMB: 2.8,
  CARIBBEAN_SERIES: 2.85,
  K_LEAGUE_1: 5,
  K_LEAGUE_2: 6,
  AFC_CL: 7,
  AFC_CL_TWO: 7.5,
  AFC_U23: 7.7,
  ASEAN_CHAMP: 7.8,
  J1_LEAGUE: 8,
  J2_LEAGUE: 9,
  EPL: 10,
  CHAMPIONSHIP: 10.5,
  UCL: 11,
  UEL: 11.5,
  UECL: 11.7,
  LALIGA: 12,
  LALIGA_2: 12.5,
  BUNDESLIGA: 13,
  BUNDESLIGA_2: 13.5,
  SERIE_A: 14,
  SERIE_B: 14.5,
  LIGUE_1: 15,
  LIGUE_2: 15.5,
  EREDIVISIE: 15.6,
  PRIMEIRA_LIGA: 15.65,
  SUPER_LIG: 15.7,
  JUPILER_PL: 15.75,
  SPL: 15.8,
  GREEK_SL: 15.85,
  SWISS_SL: 15.86,
  AUSTRIA_BL: 15.861,
  EKSTRAKLASA: 15.87,
  DENMARK_SL: 15.872,
  CZECH_L: 15.873,
  HNL: 15.874,
  UKRAINE_PL: 15.875,
  LIGA_I: 15.88,
  BULGARIA_PL: 15.89,
  ARMENIA_PL: 15.9,
  HUNGARY_NB1: 15.901,
  SERBIA_SL: 15.902,
  SLOVAKIA_SL: 15.903,
  SLOVENIA_SNL: 15.904,
  CYPRUS_1D: 15.905,
  BOSNIA_PL: 15.906,
  ALBANIA_SL: 15.907,
  MOLDOVA_SL: 15.908,
  IRELAND_PD: 15.909,
  CHALLENGE_LEAGUE: 15.91,
  POLAND_1L: 15.92,
  ELITESERIEN: 15.93,
  ALLSVENSKAN: 15.931,
  VEIKKAUSLIIGA: 15.932,
  URVALSDEILD: 15.933,
  NORWAY_1L: 15.934,
  SUPERETTAN: 15.935,
  YKKONEN: 15.936,
  ICELAND_1L: 15.937,
  COLOMBIA_PA: 16.21,
  CHILE_PD: 16.22,
  ECUADOR_LP: 16.23,
  PERU_PD: 16.24,
  VENEZUELA_PD: 16.25,
  CHILE_PB: 16.26,
  USA_USL_CH: 16.51,
  CANADA_PL: 16.52,
  EGYPT_PL: 16.6,
  MOROCCO_BP: 16.61,
  SOUTHAFRICA_PSL: 16.62,
  UAE_PL: 16.63,
  QATAR_SL: 16.64,
  ISRAEL_PL: 16.65,
  INDIA_ISL: 16.7,
  VIETNAM_VL1: 16.71,
  INDONESIA_L1: 16.72,
  SINGAPORE_PL: 16.73,
  MLS: 16,
  LIGA_MX: 16.1,
  BRASILEIRAO: 16.2,
  COPA_LIB: 16.3,
  COPA_SUD: 16.35,
  CSL: 16.4,
  A_LEAGUE: 16.45,
  SAUDI_PL: 16.5,
  CLUB_WORLD_CUP: 17,
  WORLD_CUP: 18,
  // 청소년 대표 — WORLD_CUP 다음 그룹
  UEFA_U21_Q: 18.1,
  UEFA_U21: 18.2,
  UEFA_U19: 18.3,
  UEFA_U17: 18.4,
  U20_WC: 18.5,
  U17_WC: 18.6,
  // 컵 대회 — 각 자국 리그 그룹 바로 뒤 (소수점 .6~.7 대 활용)
  KFA_CUP: 5.5, // K리그 바로 다음
  EMPEROR_CUP: 8.5, // J리그 다음
  AFC_CUP: 7.8, // AFC_CL_TWO 다음
  FA_CUP: 10.1, // EPL 다음 — 컵 노출 우선
  EFL_CUP: 10.2,
  COPA_DEL_REY: 12.1, // LALIGA 다음
  DFB_POKAL: 13.1, // BUNDESLIGA 다음
  COPPA_ITALIA: 14.1, // SERIE_A 다음
  COUPE_DE_FRANCE: 15.1, // LIGUE_1 다음
  SCO_LEAGUE_CUP: 15.85, // SPL(15.8) 다음
  CONCACAF_CCUP: 16.05, // MLS 다음
  // 2026-05-24 추가
  LEAGUE_ONE: 10.6, // CHAMPIONSHIP 다음 (EFL 3부)
  SUI_CUP: 15.865, // SWISS_SL 옆
  LATVIA_VL: 15.911, // 발트해 — 봄~가을 그룹
  BELARUS_PL: 15.912,
  // 2026-05-24 추가 (2차)
  EREDIVISIE_2: 15.61, // EREDIVISIE 옆 (네덜란드 2부)
  PRIMEIRA_LIGA_2: 15.66, // PRIMEIRA_LIGA 옆 (포르투갈 2부)
  LEVAIN_CUP: 8.6, // J리그 + EMPEROR_CUP 다음 (J리그컵)
  ESTONIA_ML: 15.913, // 발트 — LATVIA_VL/BELARUS_PL 옆
  LITHUANIA_AL: 15.914,
  GEORGIA_EL: 15.915, // CIS 봄~가을
  AZERBAIJAN_PL: 15.916,
  KAZAKHSTAN_PL: 16.66, // 아시아·중동 그룹
  // 2026-05-24 추가 (3차)
  LEAGUE_TWO: 10.7, // LEAGUE_ONE 다음 (EFL 4부)
  NATIONAL_LEAGUE: 10.8, // LEAGUE_TWO 다음 (5부)
  SCOT_CHAMPIONSHIP: 10.91, // SPL 다음 (스코틀랜드 2부)
  SCOT_LEAGUE_ONE: 10.92,
  SCOT_LEAGUE_TWO: 10.93,
  RPL: 15.99, // 러시아 — 동유럽 그룹
  SVENSKA_CUPEN: 15.71, // 스웨덴 ALLSVENSKAN 옆 (컵)
  ALGERIA_L1: 16.71, // 아프리카 — MOROCCO_BP 옆
  GHANA_PL: 16.72,
  ARG_PRIMERA_NACIONAL: 16.91, // 아르헨티나 — ARGENTINA_PL 다음
  IRAQ_SL: 17.5, // 이라크 — 아시아 1부
  MEXICO_2: 16.6, CHINA_2: 17.6, IRELAND_2: 15.5, DENMARK_2: 16.3,
  HUNGARY_2: 16.4, CZECH_2: 16.35, AUSTRIA_2: 16.25, BELGIUM_2: 16.2, TURKEY_2: 16.55,
  // 2026-08-01 추가 — 각 상위 리그 바로 다음 소수점
  PORTUGAL_SUPER_CUP: 15.67, // PRIMEIRA_LIGA_2(15.66) 다음
  ROMANIA_L2: 15.885, // LIGA_I(15.88) 다음
  RUSSIA_FNL: 15.995, // RPL(15.99) 다음
  NORWAY_2D_G1: 15.9341, NORWAY_2D_G2: 15.9342, // NORWAY_1L(15.934) 다음
  ETTAN_NORRA: 15.9351, ETTAN_SODRA: 15.9352, // SUPERETTAN(15.935) 다음
  KAKKONEN_A: 15.9361, KAKKONEN_B: 15.9362, KAKKONEN_C: 15.9363, // YKKONEN(15.936) 다음
  COSTA_RICA_PD: 16.12, GUATEMALA_LN: 16.13, HONDURAS_LN: 16.14, // LIGA_MX(16.1) 다음 중미
  COPA_DO_BRASIL: 16.21, // BRASILEIRAO(16.2) 다음
  UZBEKISTAN_SL: 16.67, // KAZAKHSTAN_PL(16.66) 다음
  CHINA_3: 17.65, // CHINA_2(17.6) 다음
  // 2026-08-02 추가 — 잔여 성인 남자 1부 7개
  WALES_PL: 10.94, // SCOT_LEAGUE_TWO(10.93) 다음 — 영국권
  LUXEMBOURG_ND: 15.68, // PORTUGAL_SUPER_CUP(15.67) 다음 — 서유럽
  FAROE_PL: 15.9365, // 북유럽 그룹 끝 (KAKKONEN_C 15.9363 다음)
  MONTENEGRO_1L: 15.997, // 동유럽 그룹 (RUSSIA_FNL 15.995 다음)
  PANAMA_LPF: 16.15, ELSALVADOR_PD: 16.16, NICARAGUA_PD: 16.17, // 중미 (HONDURAS_LN 16.14 다음)
  NBA: 20,
  NBA_SL: 20.5,
  NHL: 21,
  IIHF_WC: 22,
  AIHL: 22.3, // NHL·세계선수권 다음 — 국내 수요는 낮지만 하키 안에서는 정규시즌
  NZIHL: 22.6,
  KBL: 23,
  WKBL: 24,
  V_LEAGUE: 24.5, // 한국 프로배구 남자부 — KBL/WKBL 급 국내 수요
  V_LEAGUE_W: 24.6, // 한국 프로배구 여자부 — 여자부 인기가 남자부와 대등
  KOVO_CUP: 24.7, // 프리시즌 컵 (통상 8~9월) — 정규리그보단 뒤
  KOVO_CUP_W: 24.8,
  VNL: 25, // 배구 — 국대 한국전 수요 (AVC 에 한국 여자 출전)
  VNL_W: 25.05, // 여자 발리볼 네이션스리그 — 세계 최상위 대회 (한국 미출전)
  AVC_NATIONS_W: 25.1,
  EGL_W: 25.2,
  LOL: 30,
  LCK_CL: 30.5,
  LPL: 30.6,
  LEC: 30.7,
  LCS: 30.8,
  EWC: 30.9,
  UFC: 40,
};

/** 축구 사이드바 — 인기 리그 (상단 고정 노출) */
export const POPULAR_SOCCER_LEAGUES: string[] = [
  "UCL",
  "UEL",
  "UECL",
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "K_LEAGUE_1",
];

/** 축구 리그 → 국가명 (사이드바 그룹화). 대륙 대회는 "국제". */
export const COUNTRY_BY_LEAGUE: Record<string, string> = {
  // 대한민국
  K_LEAGUE_1: "대한민국",
  K_LEAGUE_2: "대한민국",
  // 일본
  J1_LEAGUE: "일본",
  J2_LEAGUE: "일본",
  // 잉글랜드
  EPL: "잉글랜드",
  CHAMPIONSHIP: "잉글랜드",
  // 스페인
  LALIGA: "스페인",
  LALIGA_2: "스페인",
  // 독일
  BUNDESLIGA: "독일",
  BUNDESLIGA_2: "독일",
  // 이탈리아
  SERIE_A: "이탈리아",
  SERIE_B: "이탈리아",
  // 프랑스
  LIGUE_1: "프랑스",
  LIGUE_2: "프랑스",
  // 그 외 유럽
  EREDIVISIE: "네덜란드",
  PRIMEIRA_LIGA: "포르투갈",
  SUPER_LIG: "튀르키예",
  JUPILER_PL: "벨기에",
  SPL: "스코틀랜드",
  GREEK_SL: "그리스",
  EKSTRAKLASA: "폴란드",
  POLAND_1L: "폴란드",
  BULGARIA_PL: "불가리아",
  LIGA_I: "루마니아",
  SWISS_SL: "스위스",
  CHALLENGE_LEAGUE: "스위스",
  ARMENIA_PL: "아르메니아",
  AUSTRIA_BL: "오스트리아",
  CZECH_L: "체코",
  HNL: "크로아티아",
  UKRAINE_PL: "우크라이나",
  HUNGARY_NB1: "헝가리",
  SERBIA_SL: "세르비아",
  SLOVAKIA_SL: "슬로바키아",
  SLOVENIA_SNL: "슬로베니아",
  CYPRUS_1D: "키프로스",
  DENMARK_SL: "덴마크",
  IRELAND_PD: "아일랜드",
  BOSNIA_PL: "보스니아",
  ALBANIA_SL: "알바니아",
  MOLDOVA_SL: "몰도바",
  ELITESERIEN: "노르웨이",
  NORWAY_1L: "노르웨이",
  ALLSVENSKAN: "스웨덴",
  SUPERETTAN: "스웨덴",
  VEIKKAUSLIIGA: "핀란드",
  YKKONEN: "핀란드",
  URVALSDEILD: "아이슬란드",
  ICELAND_1L: "아이슬란드",
  // 북·중미
  MLS: "미국",
  USA_USL_CH: "미국",
  CANADA_PL: "캐나다",
  LIGA_MX: "멕시코",
  // 남미
  BRASILEIRAO: "브라질",
  CHILE_PD: "칠레",
  CHILE_PB: "칠레",
  ECUADOR_LP: "에콰도르",
  COLOMBIA_PA: "콜롬비아",
  PERU_PD: "페루",
  VENEZUELA_PD: "베네수엘라",
  // 아프리카·중동·아시아
  EGYPT_PL: "이집트",
  MOROCCO_BP: "모로코",
  SOUTHAFRICA_PSL: "남아프리카",
  UAE_PL: "UAE",
  QATAR_SL: "카타르",
  ISRAEL_PL: "이스라엘",
  SAUDI_PL: "사우디아라비아",
  INDIA_ISL: "인도",
  VIETNAM_VL1: "베트남",
  INDONESIA_L1: "인도네시아",
  SINGAPORE_PL: "싱가포르",
  CSL: "중국",
  A_LEAGUE: "호주",
  // 국제 / 대륙 대회
  UCL: "국제",
  UEL: "국제",
  UECL: "국제",
  AFC_CL: "국제",
  AFC_CL_TWO: "국제",
  AFC_U23: "국제",
  ASEAN_CHAMP: "국제",
  AFC_CUP: "국제",
  CONCACAF_CCUP: "국제",
  COPA_LIB: "국제",
  COPA_SUD: "국제",
  CLUB_WORLD_CUP: "국제",
  WORLD_CUP: "국제",
  // 자국 컵 — 리그와 동일 국가
  FA_CUP: "잉글랜드",
  EFL_CUP: "잉글랜드",
  SCO_LEAGUE_CUP: "스코틀랜드",
  COPA_DEL_REY: "스페인",
  COPPA_ITALIA: "이탈리아",
  DFB_POKAL: "독일",
  COUPE_DE_FRANCE: "프랑스",
  KFA_CUP: "대한민국",
  EMPEROR_CUP: "일본",
  // 야구·농구·하키·e스포츠
  KBO: "대한민국",
  KBO_FUTURES: "대한민국",
  NPB: "일본",
  NPB_MINOR: "일본",
  MLB: "미국",
  CPBL: "대만",
  LMB: "멕시코",
  // 국제 야구 토너먼트
  WBC: "국제",
  WBSC_PREMIER_12: "국제",
  ASIAN_GAMES_BB: "국제",
  OLYMPICS_BB: "국제",
  CARIBBEAN_SERIES: "국제",
  NBA: "미국",
  WNBA: "미국",
  NBA_SL: "미국",
  NHL: "미국",
  IIHF_WC: "국제",
  AIHL: "호주",
  NZIHL: "뉴질랜드",
  KBL: "대한민국",
  WKBL: "대한민국",
  LOL: "대한민국",
  LCK_CL: "대한민국",
  LPL: "중국",
  LEC: "유럽",
  LCS: "미국",
  UFC: "미국",
  // 신규 추가 (23개)
  K3_LEAGUE: "대한민국",
  K4_LEAGUE: "대한민국",
  WK_LEAGUE: "대한민국",
  J3_LEAGUE: "일본",
  THAI_L1: "태국",
  VIETNAM_VL2: "베트남",
  ARGENTINA_PL: "아르헨티나",
  URUGUAY_PD: "우루과이",
  PARAGUAY_PD: "파라과이",
  BOLIVIA_PD: "볼리비아",
  WSL: "잉글랜드",
  NWSL: "미국",
  A_LEAGUE_W: "호주",
  // 국제 대회
  AFCON: "국제",
  UEFA_NL: "국제",
  WC_QUAL: "국제",
  EURO_QUAL: "국제",
  CONCACAF_GOLD: "국제",
  INTL_FRIENDLY: "국제",
  CLUB_FRIENDLY: "국제",
  U20_WC: "국제",
  U17_WC: "국제",
  UEFA_U21_Q: "국제",
  UEFA_U21: "국제",
  UEFA_U19: "국제",
  UEFA_U17: "국제",
  OLYMPICS_FOOTBALL: "국제",
  UEFA_WCL: "국제",
  // 2026-05-24 추가
  SUI_CUP: "스위스",
  LEAGUE_ONE: "잉글랜드",
  LATVIA_VL: "라트비아",
  BELARUS_PL: "벨라루스",
  // 2026-05-24 추가 (2차)
  ESTONIA_ML: "에스토니아",
  LITHUANIA_AL: "리투아니아",
  LEVAIN_CUP: "일본",
  KAZAKHSTAN_PL: "카자흐스탄",
  GEORGIA_EL: "조지아",
  AZERBAIJAN_PL: "아제르바이잔",
  EREDIVISIE_2: "네덜란드",
  PRIMEIRA_LIGA_2: "포르투갈",
  // 2026-05-24 추가 (3차)
  LEAGUE_TWO: "잉글랜드",
  NATIONAL_LEAGUE: "잉글랜드",
  SCOT_CHAMPIONSHIP: "스코틀랜드",
  SCOT_LEAGUE_ONE: "스코틀랜드",
  SCOT_LEAGUE_TWO: "스코틀랜드",
  RPL: "러시아",
  ALGERIA_L1: "알제리",
  SVENSKA_CUPEN: "스웨덴",
  GHANA_PL: "가나",
  ARG_PRIMERA_NACIONAL: "아르헨티나",
  IRAQ_SL: "이라크",
  MEXICO_2: "멕시코",
  CHINA_2: "중국",
  IRELAND_2: "아일랜드",
  DENMARK_2: "덴마크",
  HUNGARY_2: "헝가리",
  CZECH_2: "체코",
  AUSTRIA_2: "오스트리아",
  BELGIUM_2: "벨기에",
  TURKEY_2: "튀르키예",
  // 2026-08-01 추가 — 7m 커버리지 대조 16개
  COPA_DO_BRASIL: "브라질",
  PORTUGAL_SUPER_CUP: "포르투갈",
  RUSSIA_FNL: "러시아",
  ETTAN_NORRA: "스웨덴",
  ETTAN_SODRA: "스웨덴",
  NORWAY_2D_G1: "노르웨이",
  NORWAY_2D_G2: "노르웨이",
  KAKKONEN_A: "핀란드",
  KAKKONEN_B: "핀란드",
  KAKKONEN_C: "핀란드",
  ROMANIA_L2: "루마니아",
  CHINA_3: "중국",
  COSTA_RICA_PD: "코스타리카",
  GUATEMALA_LN: "과테말라",
  HONDURAS_LN: "온두라스",
  UZBEKISTAN_SL: "우즈베키스탄",
  // 2026-08-02 추가 — 잔여 성인 남자 1부 7개
  WALES_PL: "웨일스",
  MONTENEGRO_1L: "몬테네그로",
  LUXEMBOURG_ND: "룩셈부르크",
  FAROE_PL: "페로 제도",
  PANAMA_LPF: "파나마",
  ELSALVADOR_PD: "엘살바도르",
  NICARAGUA_PD: "니카라과",
};

/** 국가명 → 국기 유니코드 이모지. "국제"는 지구본. */
export const COUNTRY_FLAG: Record<string, string> = {
  국제: "🌍",
  대한민국: "🇰🇷",
  일본: "🇯🇵",
  잉글랜드: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  스페인: "🇪🇸",
  독일: "🇩🇪",
  이탈리아: "🇮🇹",
  프랑스: "🇫🇷",
  네덜란드: "🇳🇱",
  포르투갈: "🇵🇹",
  튀르키예: "🇹🇷",
  벨기에: "🇧🇪",
  스코틀랜드: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  그리스: "🇬🇷",
  폴란드: "🇵🇱",
  불가리아: "🇧🇬",
  루마니아: "🇷🇴",
  스위스: "🇨🇭",
  아르메니아: "🇦🇲",
  오스트리아: "🇦🇹",
  체코: "🇨🇿",
  크로아티아: "🇭🇷",
  우크라이나: "🇺🇦",
  헝가리: "🇭🇺",
  세르비아: "🇷🇸",
  슬로바키아: "🇸🇰",
  슬로베니아: "🇸🇮",
  키프로스: "🇨🇾",
  덴마크: "🇩🇰",
  아일랜드: "🇮🇪",
  보스니아: "🇧🇦",
  알바니아: "🇦🇱",
  몰도바: "🇲🇩",
  노르웨이: "🇳🇴",
  스웨덴: "🇸🇪",
  핀란드: "🇫🇮",
  아이슬란드: "🇮🇸",
  미국: "🇺🇸",
  캐나다: "🇨🇦",
  멕시코: "🇲🇽",
  브라질: "🇧🇷",
  칠레: "🇨🇱",
  에콰도르: "🇪🇨",
  콜롬비아: "🇨🇴",
  페루: "🇵🇪",
  베네수엘라: "🇻🇪",
  이집트: "🇪🇬",
  모로코: "🇲🇦",
  남아프리카: "🇿🇦",
  UAE: "🇦🇪",
  카타르: "🇶🇦",
  이스라엘: "🇮🇱",
  사우디아라비아: "🇸🇦",
  인도: "🇮🇳",
  베트남: "🇻🇳",
  인도네시아: "🇮🇩",
  싱가포르: "🇸🇬",
  중국: "🇨🇳",
  유럽: "🇪🇺",
  대만: "🇹🇼",
  호주: "🇦🇺",
  뉴질랜드: "🇳🇿",
  // 신규
  아르헨티나: "🇦🇷",
  우루과이: "🇺🇾",
  파라과이: "🇵🇾",
  볼리비아: "🇧🇴",
  태국: "🇹🇭",
  // 2026-05-24 추가
  라트비아: "🇱🇻",
  벨라루스: "🇧🇾",
  // 2026-05-24 추가 (2차)
  에스토니아: "🇪🇪",
  리투아니아: "🇱🇹",
  카자흐스탄: "🇰🇿",
  조지아: "🇬🇪",
  아제르바이잔: "🇦🇿",
  // 2026-05-24 추가 (3차)
  러시아: "🇷🇺",
  알제리: "🇩🇿",
  가나: "🇬🇭",
  // 2026-08-01 추가
  코스타리카: "🇨🇷",
  과테말라: "🇬🇹",
  온두라스: "🇭🇳",
  우즈베키스탄: "🇺🇿",
  // 2026-08-02 추가
  웨일스: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  몬테네그로: "🇲🇪",
  룩셈부르크: "🇱🇺",
  "페로 제도": "🇫🇴",
  파나마: "🇵🇦",
  엘살바도르: "🇸🇻",
  니카라과: "🇳🇮",
};

/** 리그 코드 → 국기 emoji (없으면 빈 문자열). UI 라벨 옆 표시용. */
export function getLeagueFlag(league: string): string {
  const country = COUNTRY_BY_LEAGUE[league];
  if (!country) return "";
  return COUNTRY_FLAG[country] ?? "";
}

/** 국가 정렬 순서 — 국제·대한민국·일본 우선, 나머지 A–Z (한국어 가나다순). */
export const COUNTRY_ORDER: string[] = [
  "국제",
  "대한민국",
  "일본",
  "잉글랜드",
  "스페인",
  "독일",
  "이탈리아",
  "프랑스",
  "네덜란드",
  "포르투갈",
  "튀르키예",
  "벨기에",
  "룩셈부르크",
  "스코틀랜드",
  "웨일스",
  "그리스",
  "폴란드",
  "불가리아",
  "루마니아",
  "스위스",
  "아르메니아",
  "오스트리아",
  "체코",
  "크로아티아",
  "우크라이나",
  "헝가리",
  "세르비아",
  "슬로바키아",
  "슬로베니아",
  "몬테네그로",
  "키프로스",
  "덴마크",
  "아일랜드",
  "보스니아",
  "알바니아",
  "몰도바",
  "라트비아",
  "리투아니아",
  "에스토니아",
  "벨라루스",
  "조지아",
  "아제르바이잔",
  "러시아",
  "노르웨이",
  "스웨덴",
  "핀란드",
  "아이슬란드",
  "페로 제도",
  "미국",
  "캐나다",
  "멕시코",
  "코스타리카",
  "과테말라",
  "온두라스",
  "파나마",
  "엘살바도르",
  "니카라과",
  "브라질",
  "칠레",
  "에콰도르",
  "콜롬비아",
  "페루",
  "베네수엘라",
  "아르헨티나",
  "이집트",
  "모로코",
  "알제리",
  "가나",
  "남아프리카",
  "UAE",
  "카타르",
  "이스라엘",
  "사우디아라비아",
  "인도",
  "베트남",
  "인도네시아",
  "싱가포르",
  "중국",
  "대만",
  "카자흐스탄",
  "우즈베키스탄",
  "호주",
  "뉴질랜드",
];
