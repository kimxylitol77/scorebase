// 매치 상세(/live/...)로 가는 경로를 한 곳에서 정한다 — 리그별 라우트 규칙이 갈려 링크가 조용히 404 나던 것을 막는다.
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

/** 정적 라우트 /live/kbo|npb|mlb 가 동적 /live/[league] 를 선점한 야구 리그 */
const BASEBALL_SELF_ROUTE = new Set(["KBO", "NPB", "MLB"]);

/**
 * 매치 상세 경로.
 *
 * 주의. e스포츠를 `league === "LOL"` 로만 특례 처리하면 LCK_CL·LPL·LEC·LCS·EWC 가
 * `/live/{대문자}` 로 나가는데, 동적 라우트의 지원 리그 집합에 e스포츠가 없어 404 가 된다.
 * 리그 이름을 나열하지 말고 LOL_LEAGUES 집합으로 판정해야 리그가 늘어도 링크가 안 끊긴다.
 */
export function matchLiveHref(league: string, externalId: string): string {
  if (BASEBALL_SELF_ROUTE.has(league)) return `/live/${league.toLowerCase()}/${externalId}`;
  if (LOL_LEAGUES.has(league)) return `/live/lol/${externalId}`;
  return `/live/${league}/${externalId}`;
}
