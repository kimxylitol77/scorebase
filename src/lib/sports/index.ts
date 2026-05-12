import { eplCollector as eplCollectorApiFootball } from "./api-football";
import { eplCollectorViaFootballData } from "./football-data";
import { nbaCollector as nbaCollectorMSF } from "./mysportsfeeds";
import { nbaCollectorEspn } from "./espn-nba";
import { nhlCollectorEspn } from "./espn-nhl";
import { mlbCollectorEspn } from "./espn-mlb";
import { buildSoccerCollector } from "./espn-soccer";
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
