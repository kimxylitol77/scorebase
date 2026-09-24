// 토너먼트 허브(빅매치 허브) 공용 규칙 — 빅매치 선정·한국시간 표기. 대회별 규칙은 nations-league·afcon 에.
// prisma 를 들이지 않는다(테스트가 DB 없이 돌아야 한다).

export interface HubMatchLite {
  id: number;
  matchday: number;
  status: string;
  startTime: Date;
  /** 양 팀 순위 합(국가대표=FIFA 순위) — 동률 처리용. 모르면 null */
  rankSum: number | null;
  /** 두 팀 중 약한 쪽 순위 — 작을수록 "둘 다 강한" 경기. 빅매치 1순위 기준. 모르면 null */
  rankWorst: number | null;
}

/** 빅매치 정렬 — 약한 쪽 순위가 높을수록(둘 다 강할수록) 앞, 같으면 순위 합, 같으면 킥오프.
 *  순위 합만 보면 6위 vs 84위 같은 일방적 경기가 뽑힌다(AFCON 모로코–가봉, 2026-09-24). */
function byStrength<T extends HubMatchLite>(x: T, y: T): number {
  return (
    (x.rankWorst ?? 999) - (y.rankWorst ?? 999) ||
    (x.rankSum ?? 999) - (y.rankSum ?? 999) ||
    x.startTime.getTime() - y.startTime.getTime()
  );
}

/**
 * 빅매치 한 경기.
 *  1) 진행 중 경기가 있으면 가장 먼저 시작한 것
 *  2) 없으면 아직 안 치른 가장 이른 라운드에서 두 팀 다 강한 경기(약한 쪽 순위가 가장 높은 것)
 *  3) 다 끝났으면 마지막으로 끝난 경기
 * 시계(Date.now)를 보지 않는다 — 상태는 수집기가 관리하는 status 가 정본이다.
 */
export function pickSpotlight<T extends HubMatchLite>(matches: T[]): T | null {
  if (matches.length === 0) return null;
  const byStart = (x: T, y: T) => x.startTime.getTime() - y.startTime.getTime();

  const live = matches.filter((m) => m.status === "LIVE").sort(byStart);
  if (live.length > 0) return live[0];

  const upcoming = matches.filter((m) => m.status === "SCHEDULED");
  if (upcoming.length > 0) {
    const md = Math.min(...upcoming.map((m) => m.matchday));
    const pool = upcoming.filter((m) => m.matchday === md);
    return pool.sort(byStrength)[0];
  }

  const done = matches.filter((m) => m.status === "FINISHED").sort(byStart);
  return done.length > 0 ? done[done.length - 1] : null;
}

/** 빅매치와 같은 라운드의 나머지 경기 — 빅매치와 같은 기준(둘 다 강한 경기 먼저). */
export function sameRoundOthers<T extends HubMatchLite>(matches: T[], featured: T): T[] {
  return matches.filter((m) => m.matchday === featured.matchday && m.id !== featured.id).sort(byStrength);
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 한국시간 "9/25 (금) 03:45" — 서버 TZ 와 무관하게 KST 로 고정. */
export function kstKickoff(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${WEEKDAY[k.getUTCDay()]}) ${hh}:${mm}`;
}
