// 리그별 "현재 시즌" 시작 하한 계산 — 시즌 시뮬·순위가 지난 시즌까지 누적되는 버그 방지.
// (predictions/[league] 가 무제한 findMany 로 두 시즌을 합산 → KBO 승점 231·MLB 다저스
//  우승 99.9% 같은 불가능 수치. 2026-07-02 감사 A2)

/**
 * 시즌 경계(월/일) — 이 날짜의 "가장 최근 발생일"이 현재 시즌 시작 하한.
 * 경계는 각 리그 오프시즌 한복판으로 잡아 시즌 중 데이터가 잘리지 않게 한다.
 * 여기 없는 리그(WORLD_CUP 등 단일 대회)는 null — 필터 없음.
 */
const SEASON_BOUNDARY: Record<string, { month: number; day: number }> = {
  // 봄 개막 · 연내 종료
  KBO: { month: 2, day: 1 },
  NPB: { month: 2, day: 1 },
  // MLB 는 2~3월 시범경기가 DB 에 수집돼 있어(2026-03 완료 390건, 시범 3/24 종료·정규
  // 개막 3/26 실측) 경계를 3/25 로. 국제 개막 시리즈(3/18~) 있는 해엔 그 1~2경기가
  // 잘리는 허용 오차 — 근본 해결은 수집 단계 preseason 태깅(후속).
  MLB: { month: 3, day: 25 },
  MLS: { month: 2, day: 1 },
  K_LEAGUE_1: { month: 2, day: 1 },
  K_LEAGUE_2: { month: 2, day: 1 },
  J1_LEAGUE: { month: 2, day: 1 },
  J2_LEAGUE: { month: 2, day: 1 },
  WNBA: { month: 2, day: 1 },
  // 여름 개막 유럽 축구 (8월 개막 · 이듬해 5월 종료)
  EPL: { month: 7, day: 1 },
  LALIGA: { month: 7, day: 1 },
  BUNDESLIGA: { month: 7, day: 1 },
  SERIE_A: { month: 7, day: 1 },
  LIGUE_1: { month: 7, day: 1 },
  UCL: { month: 7, day: 1 },
  UEL: { month: 7, day: 1 },
  UECL: { month: 7, day: 1 },
  AFC_CL: { month: 7, day: 1 },
  // 가을 개막 겨울 리그 (10월 개막 · 이듬해 6월 종료)
  NBA: { month: 8, day: 1 },
  NHL: { month: 8, day: 1 },
  // LCK (1월 개막 · 9월 종료)
  LOL: { month: 12, day: 1 },
};

/** 현재 시즌 시작 하한 — 경계일의 가장 최근 발생일. 경계 미정의 리그는 null. */
export function currentSeasonStart(league: string, now: Date = new Date()): Date | null {
  const b = SEASON_BOUNDARY[league];
  if (!b) return null;
  const y = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(y, b.month - 1, b.day));
  return candidate.getTime() <= now.getTime()
    ? candidate
    : new Date(Date.UTC(y - 1, b.month - 1, b.day));
}

/** 직전 시즌 시작일 (start 기준 1년 전) — 오프시즌 폴백용. */
export function previousSeasonStart(start: Date): Date {
  return new Date(
    Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate()),
  );
}
