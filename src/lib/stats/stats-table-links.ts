// 스탯 마스터 표 5종(축구·야구·농구·하키·e스포츠)의 진입 링크 정본 — 리그 페이지 데이터 칩·sitemap 이 같은 목록을 본다.
import { SOCCER_STATS_LEAGUES } from "@/lib/sports/soccer/stats-data";
import { LOL_STATS_LEAGUES } from "@/lib/sports/esports/stats-data";
import { TS_HOCKEY_LEAGUES } from "@/lib/sports/hockey/stats-data";
import { BB_LEAGUES } from "@/lib/sports/baseball/player-rankings";

const SOCCER = new Set<string>(SOCCER_STATS_LEAGUES);
const BASEBALL = new Set<string>(BB_LEAGUES);
const HOCKEY = new Set<string>(["NHL", ...TS_HOCKEY_LEAGUES]);
const LOL = new Set<string>(LOL_STATS_LEAGUES);

/** 이 리그의 스탯 표 주소. 표가 없는 리그는 null — 호출부는 칩을 만들지 않는다. */
export function statsTableHref(league: string): string | null {
  if (SOCCER.has(league)) return `/soccer/stats?league=${league}`;
  if (BASEBALL.has(league)) return `/baseball/stats?league=${league}&role=bat`;
  if (HOCKEY.has(league)) return `/hockey/stats?league=${league}&role=skater`;
  if (league === "KBL") return "/basketball/stats";
  if (LOL.has(league)) return `/esports/stats?league=${league}`;
  return null;
}

/** sitemap 등록 경로 — 각 페이지 generateMetadata 의 canonical 과 글자 단위로 같아야 한다(다르면 중복 URL 신호). */
export function statsTableSitemapPaths(): string[] {
  return [
    ...SOCCER_STATS_LEAGUES.map((l) => `/soccer/stats?league=${l}`),
    ...BB_LEAGUES.flatMap((l) => [`/baseball/stats?league=${l}&role=bat`, `/baseball/stats?league=${l}&role=pit`]),
    "/basketball/stats",
    ...[...HOCKEY].flatMap((l) => [`/hockey/stats?league=${l}&role=skater`, `/hockey/stats?league=${l}&role=goalie`]),
    ...LOL_STATS_LEAGUES.map((l) => `/esports/stats?league=${l}`),
  ];
}
