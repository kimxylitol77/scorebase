// TheSports basketball cache.detailLive → 쿼터별 점수 + 진행 라벨 추출.
// scores 페이지 카드 / 라이브 상세 API 양쪽에서 공유 (단일 진실).
//
// cache.detailLive.score = [matchId, status_id, ?, [home 쿼터배열], [away 쿼터배열]]
// cache.detailLive.timer = [?, ?, ?, 현재 쿼터 잔여초(카운트다운)]
// status_id: 2/4/6/8 = Q1~Q4 진행, 3/5/7 = 쿼터 사이 휴식(3=1Q종료,5=하프,7=3Q종료),
//            9/13 = 연장, 11 = 중단, 10/14 = 종료, 12 = 취소.

import type { PeriodLinescore } from "../live-scores";
import { mapBasketballStatus } from "./status-codes";
import type { MatchStatus } from "../types";

/** status_id + 잔여초 → "3Q 6:02" / "하프타임" 같은 진행 라벨. */
export function basketballLiveLabel(
  statusId: number,
  remainingSec: number | null,
): string | null {
  const clock =
    remainingSec != null && Number.isFinite(remainingSec) && remainingSec >= 0
      ? `${Math.floor(remainingSec / 60)}:${String(remainingSec % 60).padStart(2, "0")}`
      : null;
  switch (statusId) {
    case 2:
      return clock ? `1Q ${clock}` : "1Q";
    case 4:
      return clock ? `2Q ${clock}` : "2Q";
    case 6:
      return clock ? `3Q ${clock}` : "3Q";
    case 8:
      return clock ? `4Q ${clock}` : "4Q";
    case 3:
      return "1쿼터 종료";
    case 5:
      return "하프타임";
    case 7:
      return "3쿼터 종료";
    case 9:
    case 13:
      return clock ? `연장 ${clock}` : "연장";
    case 11:
      return "중단";
    default:
      return null;
  }
}

export interface BasketballCacheLive {
  periodLinescore: PeriodLinescore | null;
  statusLabel: string | null;
  status: MatchStatus | null;
}

/** detailLive 캐시 객체에서 쿼터별 점수 + 진행 라벨 + 매치 상태 추출. */
export function extractBasketballFromCache(
  detailLive: unknown,
): BasketballCacheLive {
  const empty: BasketballCacheLive = {
    periodLinescore: null,
    statusLabel: null,
    status: null,
  };
  if (!detailLive || typeof detailLive !== "object") return empty;
  const dl = detailLive as { score?: unknown; timer?: unknown };
  const bScore = Array.isArray(dl.score) ? (dl.score as unknown[]) : undefined;
  if (!bScore) return empty;

  const statusId = Number(bScore[1]);
  const timerArr = Array.isArray(dl.timer) ? (dl.timer as unknown[]) : undefined;
  const remaining = timerArr ? Number(timerArr[3]) : NaN;

  const status = Number.isFinite(statusId)
    ? mapBasketballStatus(statusId)
    : null;
  const statusLabel = Number.isFinite(statusId)
    ? basketballLiveLabel(statusId, Number.isFinite(remaining) ? remaining : null)
    : null;

  let periodLinescore: PeriodLinescore | null = null;
  const homeArr = bScore[3];
  const awayArr = bScore[4];
  if (Array.isArray(homeArr) && Array.isArray(awayArr)) {
    const toNum = (x: unknown): number | null => {
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    };
    const homePeriods = homeArr.map(toNum);
    const awayPeriods = awayArr.map(toNum);
    // 트레일링 OT 컬럼(정규 4쿼터 초과)이 양 팀 모두 0이면 제거.
    let len = Math.max(homePeriods.length, awayPeriods.length);
    while (
      len > 4 &&
      (homePeriods[len - 1] ?? 0) === 0 &&
      (awayPeriods[len - 1] ?? 0) === 0
    ) {
      len--;
    }
    const hp = homePeriods.slice(0, len);
    const ap = awayPeriods.slice(0, len);
    const sum = (arr: (number | null)[]) =>
      arr.reduce<number>((s, n) => s + (n ?? 0), 0);
    if (hp.length > 0 || ap.length > 0) {
      periodLinescore = {
        homePeriods: hp,
        awayPeriods: ap,
        homeScore: sum(hp),
        awayScore: sum(ap),
      };
    }
  }

  return { periodLinescore, statusLabel, status };
}
