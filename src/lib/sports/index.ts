import { eplCollector as eplCollectorApiFootball } from "./api-football";
import { eplCollectorViaFootballData } from "./football-data";
import { nbaCollector as nbaCollectorMSF } from "./mysportsfeeds";
import { nbaCollectorEspn } from "./espn-nba";
import { nbaCollectorApiSports } from "./api-nba-collector";
import { nhlCollectorEspn } from "./espn-nhl";
import { mlbCollectorEspn } from "./espn-mlb";
import { buildSoccerCollector } from "./espn-soccer";
import { buildApiFootballCollector } from "./api-football-collector";
import { kboCollector } from "./kbo";
import { npbCollector } from "./npb";
import { worldCupCollector } from "./world-cup";
import { lolCollector } from "./lol";
import { LOL_LEAGUES } from "./sport-leagues";
import type { League, MatchCollector } from "./types";

const eplCollector: MatchCollector = process.env.FOOTBALL_DATA_KEY
  ? eplCollectorViaFootballData
  : eplCollectorApiFootball;

// NBA collector 우선순위:
//   1) API-Sports NBA (API_FOOTBALL_KEY 활성) — 정식 30팀만, TBD placeholder 없음, 풍부한 metadata
//      ⚠️ 2026-06-16 Ultra 만료 → Free 100/일. /games?date 일 ~16콜이라 Free 안에서 동작하지만
//      실제 일정·점수 주 소스는 TheSports collector(Vultr, NBA/NBA_SL) — 여긴 백업 겸 이중수집.
//      10월 정규시즌 전 제거 vs 재구독 결정 예정 (라이브 boxscore 호출은 2026-07-19 제거됨).
//   2) MySportsFeeds (legacy, USER 환경변수 활성 시)
//   3) ESPN free fallback (TBD placeholder 등 edge case 존재)
const nbaCollector: MatchCollector = process.env.API_FOOTBALL_KEY
  ? nbaCollectorApiSports
  : process.env.MYSPORTSFEEDS_USER &&
      process.env.MYSPORTSFEEDS_USER !== "your_username"
    ? nbaCollectorMSF
    : nbaCollectorEspn;

export const collectors: Record<League, MatchCollector> = {
  EPL: eplCollector,
  NBA: nbaCollector,
  NHL: nhlCollectorEspn,
  // IIHF_WC / KBL / WKBL: 매치 소스는 Lightsail TheSports worker (Vercel collect 안 함) — 타입 충족용 no-op.
  IIHF_WC: { league: "IIHF_WC", async fetchByDate() { return []; } },
  KBL: { league: "KBL", async fetchByDate() { return []; } },
  WKBL: { league: "WKBL", async fetchByDate() { return []; } },
  MLB: mlbCollectorEspn,
  LALIGA: buildSoccerCollector("LALIGA"),
  BUNDESLIGA: buildSoccerCollector("BUNDESLIGA"),
  SERIE_A: buildSoccerCollector("SERIE_A"),
  LIGUE_1: buildSoccerCollector("LIGUE_1"),
  MLS: buildSoccerCollector("MLS"),
  UCL: buildSoccerCollector("UCL"),
  WORLD_CUP: worldCupCollector,
  KBO: kboCollector,
  NPB: npbCollector,
  LOL: lolCollector,
  LCK_CL: lolCollector, // LCK 챌린저스(2군). collect 는 LOL_LEAGUES special-case 로 처리, Record 타입 충족용.
  LPL: lolCollector, // 중국 LPL (표시만)
  LEC: lolCollector, // 유럽 LEC (표시만)
  LCS: lolCollector, // 북미 LCS (표시만)
  EWC: lolCollector, // 이스포츠 월드컵 — 실제 수집은 Lightsail 워커(TheSports), Record 타입 충족용
  // 신규 — 아시아 축구
  J1_LEAGUE: buildApiFootballCollector("J1_LEAGUE"), // api-football (ESPN 80일 백필 timeout 회피)
  AFC_CL: buildApiFootballCollector("AFC_CL"), // api-football 통일
  K_LEAGUE_1: buildApiFootballCollector("K_LEAGUE_1"), // api-football (ESPN 미커버)
  K_LEAGUE_2: buildApiFootballCollector("K_LEAGUE_2"),
  J2_LEAGUE: buildApiFootballCollector("J2_LEAGUE"),
  SAUDI_PL: buildApiFootballCollector("SAUDI_PL"),
  // 유럽 컵
  UEL: buildApiFootballCollector("UEL"),
  UECL: buildApiFootballCollector("UECL"),
  // 유럽 메이저 2부
  CHAMPIONSHIP: buildApiFootballCollector("CHAMPIONSHIP"),
  LALIGA_2: buildApiFootballCollector("LALIGA_2"),
  BUNDESLIGA_2: buildApiFootballCollector("BUNDESLIGA_2"),
  SERIE_B: buildApiFootballCollector("SERIE_B"),
  LIGUE_2: buildApiFootballCollector("LIGUE_2"),
  // 세계 클럽 대회
  CLUB_WORLD_CUP: buildApiFootballCollector("CLUB_WORLD_CUP"),
  // 아시아 추가
  AFC_CL_TWO: buildApiFootballCollector("AFC_CL_TWO"),
  AFC_U23: buildApiFootballCollector("AFC_U23"),
  ASEAN_CHAMP: buildApiFootballCollector("ASEAN_CHAMP"),
  CSL: buildApiFootballCollector("CSL"),
  A_LEAGUE: buildApiFootballCollector("A_LEAGUE"),
  // 유럽 추가
  EREDIVISIE: buildApiFootballCollector("EREDIVISIE"),
  PRIMEIRA_LIGA: buildApiFootballCollector("PRIMEIRA_LIGA"),
  SUPER_LIG: buildApiFootballCollector("SUPER_LIG"),
  JUPILER_PL: buildApiFootballCollector("JUPILER_PL"),
  SPL: buildApiFootballCollector("SPL"),
  GREEK_SL: buildApiFootballCollector("GREEK_SL"),
  // 북중남미 추가
  BRASILEIRAO: buildApiFootballCollector("BRASILEIRAO"),
  BRASILEIRAO_2: buildApiFootballCollector("BRASILEIRAO_2"),
  LIGA_MX: buildApiFootballCollector("LIGA_MX"),
  COPA_LIB: buildApiFootballCollector("COPA_LIB"),
  COPA_SUD: buildApiFootballCollector("COPA_SUD"),
  // 유럽 + 동유럽 추가 (8월~5월 시즌)
  EKSTRAKLASA: buildApiFootballCollector("EKSTRAKLASA"),
  POLAND_1L: buildApiFootballCollector("POLAND_1L"),
  BULGARIA_PL: buildApiFootballCollector("BULGARIA_PL"),
  LIGA_I: buildApiFootballCollector("LIGA_I"),
  SWISS_SL: buildApiFootballCollector("SWISS_SL"),
  CHALLENGE_LEAGUE: buildApiFootballCollector("CHALLENGE_LEAGUE"),
  ARMENIA_PL: buildApiFootballCollector("ARMENIA_PL"),
  // 유럽 Tier 1·2 (8월~5월)
  AUSTRIA_BL: buildApiFootballCollector("AUSTRIA_BL"),
  CZECH_L: buildApiFootballCollector("CZECH_L"),
  HNL: buildApiFootballCollector("HNL"),
  UKRAINE_PL: buildApiFootballCollector("UKRAINE_PL"),
  HUNGARY_NB1: buildApiFootballCollector("HUNGARY_NB1"),
  SERBIA_SL: buildApiFootballCollector("SERBIA_SL"),
  SLOVAKIA_SL: buildApiFootballCollector("SLOVAKIA_SL"),
  SLOVENIA_SNL: buildApiFootballCollector("SLOVENIA_SNL"),
  CYPRUS_1D: buildApiFootballCollector("CYPRUS_1D"),
  DENMARK_SL: buildApiFootballCollector("DENMARK_SL"),
  // 유럽 Tier 3
  IRELAND_PD: buildApiFootballCollector("IRELAND_PD"),
  BOSNIA_PL: buildApiFootballCollector("BOSNIA_PL"),
  ALBANIA_SL: buildApiFootballCollector("ALBANIA_SL"),
  MOLDOVA_SL: buildApiFootballCollector("MOLDOVA_SL"),
  // 북유럽 (봄~가을 시즌)
  ELITESERIEN: buildApiFootballCollector("ELITESERIEN"),
  NORWAY_1L: buildApiFootballCollector("NORWAY_1L"),
  ALLSVENSKAN: buildApiFootballCollector("ALLSVENSKAN"),
  SUPERETTAN: buildApiFootballCollector("SUPERETTAN"),
  VEIKKAUSLIIGA: buildApiFootballCollector("VEIKKAUSLIIGA"),
  YKKONEN: buildApiFootballCollector("YKKONEN"),
  URVALSDEILD: buildApiFootballCollector("URVALSDEILD"),
  ICELAND_1L: buildApiFootballCollector("ICELAND_1L"),
  // 남미 추가
  CHILE_PD: buildApiFootballCollector("CHILE_PD"),
  CHILE_PB: buildApiFootballCollector("CHILE_PB"),
  ECUADOR_LP: buildApiFootballCollector("ECUADOR_LP"),
  COLOMBIA_PA: buildApiFootballCollector("COLOMBIA_PA"),
  PERU_PD: buildApiFootballCollector("PERU_PD"),
  VENEZUELA_PD: buildApiFootballCollector("VENEZUELA_PD"),
  // 기타 (아시아·중동·아프리카·북미 보강)
  EGYPT_PL: buildApiFootballCollector("EGYPT_PL"),
  ISRAEL_PL: buildApiFootballCollector("ISRAEL_PL"),
  INDIA_ISL: buildApiFootballCollector("INDIA_ISL"),
  VIETNAM_VL1: buildApiFootballCollector("VIETNAM_VL1"),
  INDONESIA_L1: buildApiFootballCollector("INDONESIA_L1"),
  SINGAPORE_PL: buildApiFootballCollector("SINGAPORE_PL"),
  UAE_PL: buildApiFootballCollector("UAE_PL"),
  QATAR_SL: buildApiFootballCollector("QATAR_SL"),
  MOROCCO_BP: buildApiFootballCollector("MOROCCO_BP"),
  SOUTHAFRICA_PSL: buildApiFootballCollector("SOUTHAFRICA_PSL"),
  USA_USL_CH: buildApiFootballCollector("USA_USL_CH"),
  CANADA_PL: buildApiFootballCollector("CANADA_PL"),
  // 컵 대회 10개 (2026-05-20 추가) — api-football fixtures
  FA_CUP: buildApiFootballCollector("FA_CUP"),
  EFL_CUP: buildApiFootballCollector("EFL_CUP"),
  SCO_LEAGUE_CUP: buildApiFootballCollector("SCO_LEAGUE_CUP"),
  COPA_DEL_REY: buildApiFootballCollector("COPA_DEL_REY"),
  COPPA_ITALIA: buildApiFootballCollector("COPPA_ITALIA"),
  DFB_POKAL: buildApiFootballCollector("DFB_POKAL"),
  COUPE_DE_FRANCE: buildApiFootballCollector("COUPE_DE_FRANCE"),
  // KFA_CUP 활성화 (2026-05-25) — api-football league id 294 (South-Korea FA Cup).
  KFA_CUP: buildApiFootballCollector("KFA_CUP"),
  EMPEROR_CUP: buildApiFootballCollector("EMPEROR_CUP"),
  CONCACAF_CCUP: buildApiFootballCollector("CONCACAF_CCUP"),
  AFC_CUP: buildApiFootballCollector("AFC_CUP"),
  // 농구 — 여자. 매치/스코어는 TheSports 워커(basketball-match-collector)가 수집 (KBL/WKBL 동일).
  // api-sports basketball(Free 100/day) collector 는 quota 소진 유발해 2026-07-10 제거.
  WNBA: { league: "WNBA", async fetchByDate() { return []; } },
  // ── 축구 23개 신규 (2026-05-22) — 모두 api-football 통합 ──
  K3_LEAGUE: buildApiFootballCollector("K3_LEAGUE"),
  K4_LEAGUE: buildApiFootballCollector("K4_LEAGUE"),
  J3_LEAGUE: buildApiFootballCollector("J3_LEAGUE"),
  THAI_L1: buildApiFootballCollector("THAI_L1"),
  VIETNAM_VL2: buildApiFootballCollector("VIETNAM_VL2"),
  ARGENTINA_PL: buildApiFootballCollector("ARGENTINA_PL"),
  URUGUAY_PD: buildApiFootballCollector("URUGUAY_PD"),
  PARAGUAY_PD: buildApiFootballCollector("PARAGUAY_PD"),
  BOLIVIA_PD: buildApiFootballCollector("BOLIVIA_PD"),
  AFCON: buildApiFootballCollector("AFCON"),
  UEFA_NL: buildApiFootballCollector("UEFA_NL"),
  WC_QUAL: buildApiFootballCollector("WC_QUAL"),
  EURO_QUAL: buildApiFootballCollector("EURO_QUAL"),
  CONCACAF_GOLD: buildApiFootballCollector("CONCACAF_GOLD"),
  INTL_FRIENDLY: buildApiFootballCollector("INTL_FRIENDLY"),
  CLUB_FRIENDLY: buildApiFootballCollector("CLUB_FRIENDLY"), // 프리시즌 클럽 친선 (af 667) — 스코어 피드 전용
  U20_WC: buildApiFootballCollector("U20_WC"),
  U17_WC: buildApiFootballCollector("U17_WC"),
  UEFA_U21_Q: buildApiFootballCollector("UEFA_U21_Q"),
  UEFA_U21: buildApiFootballCollector("UEFA_U21"),
  UEFA_U19: buildApiFootballCollector("UEFA_U19"),
  UEFA_U17: buildApiFootballCollector("UEFA_U17"),
  OLYMPICS_FOOTBALL: buildApiFootballCollector("OLYMPICS_FOOTBALL"),
  WSL: buildApiFootballCollector("WSL"),
  NWSL: buildApiFootballCollector("NWSL"),
  WK_LEAGUE: buildApiFootballCollector("WK_LEAGUE"),
  UEFA_WCL: buildApiFootballCollector("UEFA_WCL"),
  A_LEAGUE_W: buildApiFootballCollector("A_LEAGUE_W"),
  // 2026-05-24 추가 (4개)
  SUI_CUP: buildApiFootballCollector("SUI_CUP"),
  LEAGUE_ONE: buildApiFootballCollector("LEAGUE_ONE"),
  LATVIA_VL: buildApiFootballCollector("LATVIA_VL"),
  BELARUS_PL: buildApiFootballCollector("BELARUS_PL"),
  // 2026-05-24 추가 (2차, 8개)
  ESTONIA_ML: buildApiFootballCollector("ESTONIA_ML"),
  LITHUANIA_AL: buildApiFootballCollector("LITHUANIA_AL"),
  LEVAIN_CUP: buildApiFootballCollector("LEVAIN_CUP"),
  KAZAKHSTAN_PL: buildApiFootballCollector("KAZAKHSTAN_PL"),
  GEORGIA_EL: buildApiFootballCollector("GEORGIA_EL"),
  AZERBAIJAN_PL: buildApiFootballCollector("AZERBAIJAN_PL"),
  EREDIVISIE_2: buildApiFootballCollector("EREDIVISIE_2"),
  PRIMEIRA_LIGA_2: buildApiFootballCollector("PRIMEIRA_LIGA_2"),
  // 2026-05-24 추가 (3차) — TheSports cover. api-football 도 있으면 매치 보강.
  LEAGUE_TWO: buildApiFootballCollector("LEAGUE_TWO"),
  NATIONAL_LEAGUE: buildApiFootballCollector("NATIONAL_LEAGUE"),
  SCOT_CHAMPIONSHIP: buildApiFootballCollector("SCOT_CHAMPIONSHIP"),
  SCOT_LEAGUE_ONE: buildApiFootballCollector("SCOT_LEAGUE_ONE"),
  SCOT_LEAGUE_TWO: buildApiFootballCollector("SCOT_LEAGUE_TWO"),
  RPL: buildApiFootballCollector("RPL"),
  ALGERIA_L1: buildApiFootballCollector("ALGERIA_L1"),
  SVENSKA_CUPEN: buildApiFootballCollector("SVENSKA_CUPEN"),
  GHANA_PL: buildApiFootballCollector("GHANA_PL"),
  // ARG_PRIMERA_NACIONAL: TheSports worker 수집 (api-football id 131 은 실제 Primera B
  // Metropolitana(3부) 오매핑이라 제외). Vercel collect no-op — worker 가 ts 매치 push.
  ARG_PRIMERA_NACIONAL: { league: "ARG_PRIMERA_NACIONAL", async fetchByDate() { return []; } },
  // IRAQ_SL: 이라크 스타스 리그(1부) — TheSports worker 수집. Vercel collect no-op.
  IRAQ_SL: { league: "IRAQ_SL", async fetchByDate() { return []; } },
  // 9개국 2부 (2026-05-29) — TheSports worker 수집, Vercel collect no-op
  MEXICO_2: { league: "MEXICO_2", async fetchByDate() { return []; } },
  CHINA_2: { league: "CHINA_2", async fetchByDate() { return []; } },
  IRELAND_2: { league: "IRELAND_2", async fetchByDate() { return []; } },
  DENMARK_2: { league: "DENMARK_2", async fetchByDate() { return []; } },
  HUNGARY_2: { league: "HUNGARY_2", async fetchByDate() { return []; } },
  CZECH_2: { league: "CZECH_2", async fetchByDate() { return []; } },
  AUSTRIA_2: { league: "AUSTRIA_2", async fetchByDate() { return []; } },
  BELGIUM_2: { league: "BELGIUM_2", async fetchByDate() { return []; } },
  TURKEY_2: { league: "TURKEY_2", async fetchByDate() { return []; } },
};

// externalId 가 api-football fixture id 인 리그 집합 (= buildApiFootballCollector 등록 리그).
// collectors 단일 진실에서 source 태그로 파생 — 신규 api-football 리그 추가 시 자동 포함.
// cleanup-stale-scheduled cron 이 ESPN/TheSports/baseball id 를 api-football 에 잘못 조회하는 것 방지.
export const API_FOOTBALL_LEAGUES: ReadonlySet<League> = new Set(
  (Object.entries(collectors) as [League, MatchCollector][])
    .filter(([, c]) => c.source === "api-football")
    .map(([league]) => league),
);

export {
  eplCollector,
  nbaCollector,
  nhlCollectorEspn as nhlCollector,
  mlbCollectorEspn as mlbCollector,
  kboCollector,
  npbCollector,
  worldCupCollector,
  lolCollector,
};
export * from "./types";

// 리그 → primary collector source. collect.ts / backfill.ts 의 Team upsert 가
// resolveTeamId(league, source, ...) 호출 시 source 결정에 사용.
// 추가 source (ts-matches route 의 'thesports', live API 의 'api-sports' 등) 는
// 해당 호출 시점에 직접 source 명시.
const SOCCER_ESPN_LEAGUES: ReadonlyArray<string> = [
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
];

export function getPrimarySource(league: League): string {
  if (league === "EPL") {
    return process.env.FOOTBALL_DATA_KEY ? "football-data" : "api-football";
  }
  // 클럽 친선은 워커(collect-friendlies)에서 TheSports 로 수집 — 팀은 thesports source 로 해석해야
  // cross-league lookup 이 도메스틱 리그 행(EPL 맨유 등)을 재사용한다(별도 친선 행 양산 방지).
  if (league === "CLUB_FRIENDLY") return "thesports";
  if (league === "NBA") return "thesports";
  if (league === "NHL") return "thesports";
  if (league === "MLB") return "espn";
  if (league === "WNBA") return "thesports";
  if (league === "KBL" || league === "WKBL") return "thesports";
  if (league === "KBO") return "kbo";
  if (league === "NPB") return "npb";
  if (LOL_LEAGUES.has(league)) return "leaguepedia";
  if (league === "WORLD_CUP") return "world-cup";
  if (SOCCER_ESPN_LEAGUES.includes(league)) return "espn";
  // 그 외 축구 리그는 모두 buildApiFootballCollector
  return "api-football";
}
