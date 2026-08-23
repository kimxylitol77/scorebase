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
 * @param activeSeasonYear 레지스트리가 아는 시즌 연도(registrySeasonYear). 달력 계산값을
 *                          여기 넣지 말 것 — 멀쩡한 표를 지운다. 모르면 호출부가 게이트를 건너뛴다.
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

/**
 * 리그페이즈(또는 조별리그)를 마친 뒤 토너먼트로 넘어가는 대항전과 그 단계의 경기 수.
 * 대회마다 다르다 — 스위스식 리그페이즈(UCL·UEL·AFC 챔스 엘리트)는 8경기,
 * 4팀 조별리그(UECL·AFC 챔스2·여자 UCL·코파 리베르타도레스·코파 수다메리카나)는 6경기.
 * 상수 하나로 고정하면 6경기 대회는 가드가 영원히 안 걸려 작년 표가 새어 나오고,
 * map 에서 빠진 대회는 아예 가드 대상이 아니라 조별 순위가 녹아웃 카드에 그대로 붙는다.
 */
const LEAGUE_PHASE_MATCHES: Record<string, number> = {
  UCL: 8,
  UEL: 8,
  UECL: 6,
  AFC_CL: 8,
  AFC_CL_TWO: 6,
  UEFA_WCL: 6,
  COPA_LIB: 6,
  COPA_SUD: 6,
};
export const CONTINENTAL_KNOCKOUT = new Set(Object.keys(LEAGUE_PHASE_MATCHES));

/**
 * 대항전에서 "이전 단계(리그페이즈) 순위"를 매치 카드에 붙이면 안 되는 시점인지.
 * 리그페이즈 진행 중(최다 소화 < 리그페이즈 경기 수)이면 순위 표기를 유지하고, 마쳤으면 숨긴다.
 * 예선 단계도 마찬가지 — 직전 시즌 리그페이즈 표가 남아 있으면 경기 수를 채운 상태라 숨겨진다.
 */
export function hideStageStandings(
  league: string,
  rows: Array<{ won?: number; draw?: number; loss?: number }>,
): boolean {
  const phaseMatches = LEAGUE_PHASE_MATCHES[league];
  if (phaseMatches == null) return false;
  const maxPlayed = rows.reduce(
    (mx, r) => Math.max(mx, (r.won ?? 0) + (r.draw ?? 0) + (r.loss ?? 0)),
    0,
  );
  return maxPlayed >= phaseMatches;
}

/**
 * 아직 한 경기도 치르지 않은 순위표인가 — 개막 전 placeholder.
 *
 * 전 팀이 0승0무0패면 표의 position 은 순위가 아니라 시드·알파벳 배열일 뿐이다.
 * 그대로 카드 칩으로 내보내면 개막도 안 한 대회에 [1]·[2] 가 붙어 사실이 아닌 정보가 된다.
 * (2026-08-23 실측 — AFC_CL 32행 전원 0경기인데 12팀이 칩을 받고 있었다.)
 *
 * 빈 표는 여기서 판정하지 않는다(false) — "0경기"가 아니라 "표 없음"이라 폴백 대상이다.
 */
export function isUnplayedTable(
  rows: Array<{ won?: number; draw?: number; loss?: number }>,
): boolean {
  if (rows.length === 0) return false;
  return rows.every((r) => (r.won ?? 0) + (r.draw ?? 0) + (r.loss ?? 0) === 0);
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
  /** 이미 치른 경기가 있는가 — 있으면 "개막 전"일 수 없다(미지정이면 기존 동작). */
  hasPlayed = false,
): StandingsState {
  if (NO_STANDINGS_LEAGUES.has(league)) return "NOT_APPLICABLE";
  if (hasRows) return "READY";
  // 표가 없고 다음 경기가 미래면 보통 개막 전이다. 단 이미 치른 경기가 있으면 시즌 중인데
  // 순위 소스만 없는 것이므로 "개막 전"은 사실과 다르다 — 화면에 거짓 문구가 나간다.
  // (2026-08-21 YKKOSLIIGA 온보딩 실측: 96경기를 치른 리그에 "시즌 개막 전 · 첫 경기 8-21".)
  if (!hasPlayed && firstFixtureAt && firstFixtureAt.getTime() > now.getTime()) return "PRESEASON";
  return "MISSING";
}
