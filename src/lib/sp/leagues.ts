// sportspredictions.live 지원 리그 — URL 슬러그 ↔ DB 코드 매핑 + 표시명·종목. EN_PREDICTION_LEAGUES 와 동일 집합.
import { EN_PREDICTION_LEAGUES } from "@/lib/i18n/en";

export type SpSport = "football" | "baseball" | "basketball" | "hockey";

export interface SpLeague {
  code: (typeof EN_PREDICTION_LEAGUES)[number];
  slug: string;
  name: string;
  short: string;
  sport: SpSport;
}

export const SP_LEAGUES: SpLeague[] = [
  { code: "EPL", slug: "premier-league", name: "Premier League", short: "EPL", sport: "football" },
  { code: "LALIGA", slug: "laliga", name: "LaLiga", short: "LaLiga", sport: "football" },
  { code: "BUNDESLIGA", slug: "bundesliga", name: "Bundesliga", short: "Bundesliga", sport: "football" },
  { code: "SERIE_A", slug: "serie-a", name: "Serie A", short: "Serie A", sport: "football" },
  { code: "LIGUE_1", slug: "ligue-1", name: "Ligue 1", short: "Ligue 1", sport: "football" },
  { code: "UCL", slug: "champions-league", name: "Champions League", short: "UCL", sport: "football" },
  { code: "MLS", slug: "mls", name: "MLS", short: "MLS", sport: "football" },
  { code: "K_LEAGUE_1", slug: "k-league", name: "K League 1", short: "K League", sport: "football" },
  { code: "NBA", slug: "nba", name: "NBA", short: "NBA", sport: "basketball" },
  { code: "NHL", slug: "nhl", name: "NHL", short: "NHL", sport: "hockey" },
  { code: "MLB", slug: "mlb", name: "MLB", short: "MLB", sport: "baseball" },
  { code: "KBO", slug: "kbo", name: "KBO League", short: "KBO", sport: "baseball" },
  { code: "NPB", slug: "npb", name: "NPB", short: "NPB", sport: "baseball" },
];

export const SP_LEAGUE_CODES = SP_LEAGUES.map((l) => l.code);
const BY_CODE = new Map(SP_LEAGUES.map((l) => [l.code as string, l]));
const BY_SLUG = new Map(SP_LEAGUES.map((l) => [l.slug, l]));

export function leagueByCode(code: string): SpLeague | undefined {
  return BY_CODE.get(code);
}
export function leagueBySlug(slug: string): SpLeague | undefined {
  return BY_SLUG.get(slug);
}
/** 무승부가 있는 종목(축구)만 3분할 확률 바. */
export function hasDraw(code: string): boolean {
  return BY_CODE.get(code)?.sport === "football";
}
