// 순위 캐시의 "시즌 일치" 판정 — 순수 함수 (DB 접근 없음).
//
// 문제: 순위 캐시에는 시즌 표기가 들어 있는데(ts=season uuid, af=season 연도) 화면 쪽은
// 그걸 보지 않고 리그 코드만으로 캐시를 읽었다. 그래서 시즌이 바뀌어도 poller 가 지난 시즌
// uuid 로 조회하는 한 캐시는 작년 표에 동결되고, 새 시즌 경기 카드에 작년 순위가 붙었다.
//
// 여기서 정하는 규칙.
//   - ACTIVE 시즌과 같은 시즌의 캐시만 쓴다.
//   - 레지스트리에 ACTIVE 가 없으면(도입 전·미검증 리그) 기존 동작 유지 — 도입만으로 화면이 바뀌지 않게.
//   - 축구만 대상. 야구/농구 등은 별도 파이프라인이라 건드리지 않는다.

import { SOCCER_LEAGUES } from "../sport-leagues";
import { NO_STANDINGS_LEAGUES } from "../season-calendar";

export type GateReason =
  | "ok"
  | "no-registry"      // ACTIVE 레지스트리 없음 — 기존 동작 유지
  | "not-gated"        // 비축구 — 대상 아님
  | "season-mismatch"; // 이전 시즌 캐시

export interface GateVerdict {
  usable: boolean;
  reason: GateReason;
  detail?: string;
}

const OK: GateVerdict = { usable: true, reason: "ok" };

/** 시즌 게이트 적용 대상인가 (축구만). */
export function isSeasonGated(league: string): boolean {
  return SOCCER_LEAGUES.has(league);
}

/**
 * TheSports 순위 캐시를 이 시즌에 써도 되는가.
 * @param activeSeasonId 레지스트리의 ACTIVE season uuid (없으면 null)
 * @param cacheSeasonId  캐시에 기록된 season uuid
 */
export function tsCacheUsable(
  league: string,
  activeSeasonId: string | null,
  cacheSeasonId: string | null,
): GateVerdict {
  if (!isSeasonGated(league)) return { usable: true, reason: "not-gated" };
  if (!activeSeasonId) return { usable: true, reason: "no-registry" };
  if (!cacheSeasonId || cacheSeasonId !== activeSeasonId) {
    return {
      usable: false,
      reason: "season-mismatch",
      detail: `캐시 season=${cacheSeasonId ?? "없음"} ≠ ACTIVE season=${activeSeasonId}`,
    };
  }
  return OK;
}

/**
 * api-football 순위 캐시를 이 시즌에 써도 되는가.
 * ts 와 달리 af 캐시는 시즌을 "연도"로 들고 있어 ACTIVE seasonYear 와 직접 비교한다.
 * @param activeSeasonYear resolveSeasonYear() 결과 (레지스트리 → 없으면 달력 계산)
 */
export function afCacheUsable(
  league: string,
  activeSeasonYear: number | null,
  cacheSeason: number | null,
): GateVerdict {
  if (!isSeasonGated(league)) return { usable: true, reason: "not-gated" };
  if (activeSeasonYear == null) return { usable: true, reason: "no-registry" };
  if (cacheSeason == null || cacheSeason !== activeSeasonYear) {
    return {
      usable: false,
      reason: "season-mismatch",
      detail: `캐시 season=${cacheSeason ?? "없음"} ≠ 현재 시즌=${activeSeasonYear}`,
    };
  }
  return OK;
}

/** 리그페이즈(스위스 8경기)를 마친 뒤 토너먼트로 넘어가는 유럽 대항전. */
export const CONTINENTAL_KNOCKOUT = new Set(["UCL", "UEL", "UECL"]);
/** 리그페이즈 경기 수 — 최다 소화 팀이 이 수를 채웠으면 단계가 넘어간 것으로 본다. */
const LEAGUE_PHASE_MATCHES = 8;

/**
 * 유럽 대항전에서 "이전 단계(리그페이즈) 순위"를 매치 카드에 붙이면 안 되는 시점인지.
 * 리그페이즈 진행 중(최다 소화 < 8)이면 순위 표기를 유지하고, 마쳤으면 숨긴다.
 * 예선 단계도 마찬가지 — 직전 시즌 리그페이즈 표가 남아 있으면 8경기를 채운 상태라 숨겨진다.
 */
export function hideStageStandings(
  league: string,
  rows: Array<{ won?: number; draw?: number; loss?: number }>,
): boolean {
  if (!CONTINENTAL_KNOCKOUT.has(league)) return false;
  const maxPlayed = rows.reduce(
    (mx, r) => Math.max(mx, (r.won ?? 0) + (r.draw ?? 0) + (r.loss ?? 0)),
    0,
  );
  return maxPlayed >= LEAGUE_PHASE_MATCHES;
}

export type StandingsState =
  /** 쓸 수 있는 순위표가 있다 */
  | "READY"
  /** 개막 전 — 순위표가 없는 게 정상. 지난 시즌 표를 대신 보여주면 안 된다. */
  | "PRESEASON"
  /** 순위표를 요구하지 않는 대회(친선) */
  | "NOT_APPLICABLE"
  /** 개막했는데 쓸 수 있는 순위 소스가 없다 — 운영자에게 보고할 예외 */
  | "MISSING";

/**
 * 화면이 "시즌 개막 전"과 "순위 소스 없음"을 구분할 수 있게 상태를 판정한다.
 * @param hasRows 시즌 게이트를 통과한 순위 행이 있는가
 * @param firstFixtureAt 이 리그의 가장 이른 예정 경기 (없으면 null)
 */
export function standingsState(
  league: string,
  hasRows: boolean,
  firstFixtureAt: Date | null,
  now: Date = new Date(),
): StandingsState {
  if (NO_STANDINGS_LEAGUES.has(league)) return "NOT_APPLICABLE";
  if (hasRows) return "READY";
  if (firstFixtureAt && firstFixtureAt.getTime() > now.getTime()) return "PRESEASON";
  return "MISSING";
}
