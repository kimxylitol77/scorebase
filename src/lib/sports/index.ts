import { eplCollector as eplCollectorApiFootball } from "./api-football";
import { eplCollectorViaFootballData } from "./football-data";
import { nbaCollector as nbaCollectorMSF } from "./mysportsfeeds";
import { nbaCollectorEspn } from "./espn-nba";
import { nhlCollectorEspn } from "./espn-nhl";
import { mlbCollectorEspn } from "./espn-mlb";
import { buildSoccerCollector } from "./espn-soccer";
import { buildApiFootballCollector } from "./api-football-collector";
import { kboCollector } from "./kbo";
import { npbCollector } from "./npb";
import { worldCupCollector } from "./world-cup";
import { lolCollector } from "./lol";
import type { League, MatchCollector } from "./types";

const eplCollector: MatchCollector = process.env.FOOTBALL_DATA_KEY
  ? eplCollectorViaFootballData
  : eplCollectorApiFootball;

const nbaCollector: MatchCollector =
  process.env.MYSPORTSFEEDS_USER &&
  process.env.MYSPORTSFEEDS_USER !== "your_username"
    ? nbaCollectorMSF
    : nbaCollectorEspn;

export const collectors: Record<League, MatchCollector> = {
  EPL: eplCollector,
  NBA: nbaCollector,
  NHL: nhlCollectorEspn,
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
};

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
