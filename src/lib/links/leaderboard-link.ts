// 리더보드 선수 행의 링크 판정 — 단일 출처.
//
// 화면(LeagueLeaderBoard)과 감시(health-checks/link-health)가 같은 함수를 쓴다.
// 감시가 externalId 유무만 보던 때는 2026-08-01 K리그 사건(= id 는 있는데 링크가
// 안 걸림)을 재현 테스트에서 못 잡았다. 판정이 두 곳에 있으면 감시가 화면을 못 따라간다.

import { SOCCER_PLAYER_PAGE_LEAGUE_SET } from "@/lib/players/soccer-player-page";

// /players/[pid] 페이지가 view 를 가진 리그.
// 축구는 페이지가 지원하는 목록을 그대로 쓴다 — 여기만 좁으면 갈 데가 있는데도 링크가 안 걸린다
// (2026-08-01: 축구 26개 리그가 이 게이트에서만 빠져 리더보드가 통째로 죽어 있었다).
const PLAYER_PAGE_LEAGUES = new Set([
  ...SOCCER_PLAYER_PAGE_LEAGUE_SET,
  "KBO", "NPB", "MLB", "NBA", "NHL", "LOL",
]);

/** af player id 는 숫자, TheSports player id 는 영숫자 혼합. 링크 분기의 기준. */
export const isTsPlayerId = (id: string) => !/^\d+$/.test(id);

/**
 * 리더보드 한 행이 갈 곳. null 이면 그 행은 링크 없이 텍스트로만 렌더된다.
 *
 * 확장 축구 리그(K리그1·K리그2 등)는 af 매핑이 없어 externalId 가 TheSports player id 로
 * 저장된다. ts id 의 정본 페이지는 /transfers 통합 선수 페이지 → 리그 화이트리스트가 아니라
 * id 모양으로 판정해야 리그를 늘릴 때마다 링크가 조용히 끊기지 않는다.
 */
/**
 * 이 리그에 선수 상세 페이지가 존재하는가 — externalId 가 채워져 있어도 갈 곳이 없으면 false.
 *
 * KBL·WKBL·V-리그는 리더보드만 있고 선수 페이지가 없어(선수 DB 미수집) 어떤 id 를 넣어도
 * 링크가 안 걸린다. 감시가 이걸 "링크 결손"으로 올리면 고칠 수 없는 알림이 매일 뜬다 —
 * 결손이 아니라 미구현이므로 검사 대상에서 뺀다(선수 페이지가 생기면 자동으로 다시 대상).
 */
export function hasPlayerPage(league: string, isSoccerLeague: boolean): boolean {
  if (isSoccerLeague) return true; // ts id → /transfers, af id → /players 로 갈 수 있다
  return PLAYER_PAGE_LEAGUES.has(league);
}

export function leaderPlayerHref(
  league: string,
  externalId: string | null,
  isSoccerLeague: boolean,
): string | null {
  if (!externalId) return null;
  // 축구는 리그가 아니라 id 모양으로 갈라야 한다 — 같은 리그 안에 두 체계가 섞여 있다.
  // 빅4·월드컵을 리그 이름으로 /transfers 에 몰아주던 때는 af 숫자 id 190건이 전부 404 였다
  // (2026-08-20 실측: /transfers/1100 = 404, /players/1100?league=EPL = 307 → 정상).
  if (isSoccerLeague && isTsPlayerId(externalId)) return `/transfers/${externalId}`;
  if (!PLAYER_PAGE_LEAGUES.has(league)) return null;
  if (league === "MLB") return `/players/${externalId}`;
  return `/players/${externalId}?league=${league}`;
}
