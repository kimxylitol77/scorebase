// 시즌 시뮬 결과를 믿어도 되는지 판정 — DB 일정이 잘린 리그의 극단 우승확률(99.9%) 차단.
//
// 배경 (2026-08-27 실측). /predictions/K_LEAGUE_1 과 /predictions/MLS 가 우승확률 99.9% 를
// 렌더하고 있었다. 원인은 모델이 아니라 입력이다 — 잔여 일정이 DB 에 통째로 없어서
// 시뮬레이터가 "거의 끝난 시즌"으로 읽었다.
//   K리그1  팀당 26경기(정원 38) · 예정 7건 · 잔여 최종일 9/27
//   MLS     팀당 19~23 로 제각각 · 예정 15건 · 잔여 최종일 8/30 (정규는 10월까지)
//
// 기각한 설계 2가지 — 둘 다 실측이 무너뜨렸다.
//   (1) 직전 시즌 팀당 경기수를 기준선으로: K리그1 은 직전 시즌 매치가 DB 에 0건이고,
//       MLS 는 직전 시즌마저 불완전(팀당 중앙 12)이라 비율 1.83 로 오히려 통과한다.
//   (2) 라운드로빈 하한(2×(N-1)): K리그1 은 12팀이라 하한 22 인데 실제 26 이라 통과한다.
//       (K리그는 3라운드 로빈 33 + 스플릿 5 = 38 이라 하한으로는 원리상 못 잡는다.)
//
// 그래서 "일정이 완전한가"를 절대 판정하지 않는다 — 시즌 정원을 DB 만으로는 알 수 없다.
// 대신 **시뮬이 극단값을 낼 때만** 그 극단값이 스스로 모순되지 않는지 검사한다.
// 시즌 초처럼 확률이 퍼져 있는 리그는 아예 검사 대상이 아니라 오탐 위험이 없다.

/** 이 확률 이상을 "극단"으로 보고 검증을 요구한다. 미만이면 무조건 통과. */
export const EXTREME_CHAMPION = 0.9;
/** 팀별 총경기 산포 허용치 — (max-min)/median. 야구 우천 순연 정도는 통과해야 한다. */
export const SPREAD_LIMIT = 0.1;
/** 검사 1(산포)을 적용할 하한 — 팀당 잔여가 이 미만이면 이미 끝난 리그라 편차가 결손이 아니다. */
export const SPREAD_MIN_REMAINING = 0.5;
/** 팀당 잔여가 이 미만이면 "시즌 막바지" 주장으로 본다. */
export const ENDGAME_REMAINING = 2;
/** 막바지 주장이 참이라면 마지막 예정일이 이 일수 안에 있어야 한다. */
export const ENDGAME_MAX_DAYS = 21;

export interface IntegrityMatch {
  status: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
}

/** 차단 사유 구분자 — 화면 문구를 언어별로 만들 수 있게 코드로도 준다 (/en 은 영어 문구). */
export type IntegrityFailure = "team-total-spread" | "no-remaining" | "endgame-calendar";

export interface IntegrityResult {
  /** false 면 우승확률을 노출하지 않는다. */
  trustworthy: boolean;
  /** 화면에 띄울 한국어 사유. trustworthy 면 null. */
  reason: string | null;
  /** 같은 사유의 영어 문구 (/en 용). trustworthy 면 null. */
  reasonEn: string | null;
  /** 차단 사유 코드. trustworthy 면 null. */
  failure: IntegrityFailure | null;
  teamCount: number;
  medianTotal: number;
  spreadRatio: number;
  remainingPerTeam: number;
  /** 마지막 예정 경기까지 남은 일수. 예정 0건이면 null. */
  daysToLastScheduled: number | null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * 시즌 시뮬 입력 일정이 극단 확률을 뒷받침하는지 판정.
 *
 * @param matches 시즌 창으로 이미 잘라낸 매치 (page 가 쓰는 것과 같은 배열)
 * @param topChampion 시뮬이 낸 1위 팀의 우승확률 (0~1)
 */
export function checkScheduleIntegrity(
  matches: IntegrityMatch[],
  topChampion: number,
  now: Date = new Date(),
): IntegrityResult {
  const base: IntegrityResult = {
    trustworthy: true,
    reason: null,
    reasonEn: null,
    failure: null,
    teamCount: 0,
    medianTotal: 0,
    spreadRatio: 0,
    remainingPerTeam: 0,
    daysToLastScheduled: null,
  };

  // 극단값이 아니면 검사하지 않는다 — 시즌 초·중반 리그는 여기서 끝.
  if (topChampion < EXTREME_CHAMPION) return base;

  // 팀별 총경기(완료+예정) 집계
  const total = new Map<number, number>();
  const remaining = new Map<number, number>();
  let lastScheduled: Date | null = null;
  for (const m of matches) {
    const counted = m.status === "FINISHED" || m.status === "SCHEDULED";
    if (!counted) continue;
    for (const t of [m.homeTeamId, m.awayTeamId]) {
      total.set(t, (total.get(t) ?? 0) + 1);
      if (m.status === "SCHEDULED") remaining.set(t, (remaining.get(t) ?? 0) + 1);
    }
    if (m.status === "SCHEDULED" && (!lastScheduled || m.startTime > lastScheduled)) {
      lastScheduled = m.startTime;
    }
  }
  if (total.size === 0) return base;

  // 오염 team row 배제 — 컵 상대·친선 상대가 매치에 섞이면 1~2경기짜리 팀이 생겨
  // 산포가 통째로 망가진다 (실측: CHAMPIONSHIP 에 1경기 팀 1개, KBO·MLB 에도 있음).
  const med0 = median([...total.values()]);
  const valid = [...total.entries()].filter(([, n]) => n >= med0 / 2);
  if (valid.length === 0) return base;

  const totals = valid.map(([, n]) => n);
  const medianTotal = median(totals);
  const spreadRatio = medianTotal > 0 ? (Math.max(...totals) - Math.min(...totals)) / medianTotal : 0;
  const remainingSum = valid.reduce((s, [id]) => s + (remaining.get(id) ?? 0), 0);
  const remainingPerTeam = remainingSum / valid.length;
  const daysToLastScheduled = lastScheduled
    ? (lastScheduled.getTime() - now.getTime()) / 86_400_000
    : null;

  const out: IntegrityResult = {
    ...base,
    teamCount: valid.length,
    medianTotal,
    spreadRatio,
    remainingPerTeam,
    daysToLastScheduled,
  };

  // 검사 1 — 아직 경기가 남았는데 팀별 총경기가 제각각이면 일정이 불완전하다.
  // 같은 리그 같은 시점에 팀마다 총 경기수가 다를 수는 없다. (MLS 가 여기서 걸린다.)
  //
  // 잔여가 거의 0 인 리그는 제외한다 — 이미 다 치른 뒤의 팀별 편차는 결손이 아니라
  // 포맷(플레이오프 진출 여부 등) 때문이다. 실측: LCK 는 팀별 41~48 경기(산포 0.16)로
  // 정상인데, 이 하한이 없으면 시즌 마지막 날 99.9% 가 오탐으로 차단됐다.
  if (remainingPerTeam >= SPREAD_MIN_REMAINING && spreadRatio > SPREAD_LIMIT) {
    return {
      ...out,
      trustworthy: false,
      failure: "team-total-spread",
      reason: `팀별 총 경기수가 어긋납니다 (최소 ${Math.min(...totals)} · 최대 ${Math.max(...totals)}) — 일정 일부가 아직 등록되지 않았습니다`,
      reasonEn: `Teams have different total match counts (min ${Math.min(...totals)}, max ${Math.max(...totals)}) — part of the schedule has not been published yet.`,
    };
  }

  // 검사 2 — 예정 경기가 하나도 없으면 시뮬할 게 없다.
  // 시즌이 진짜 끝났다면 우승팀은 확률이 아니라 사실이라 시뮬을 보여줄 이유가 없고,
  // 끝나지 않았는데 잔여 0 이면 일정이 통째로 빠진 것이다. 어느 쪽이든 노출하지 않는다.
  // (K리그2 가 며칠 뒤 이 상태가 된다 — 잔여 최종일이 3일 뒤인데 그 이후 일정이 없다.)
  if (daysToLastScheduled === null) {
    return {
      ...out,
      trustworthy: false,
      failure: "no-remaining",
      reason: "남은 일정이 없습니다 — 시즌 종료 또는 다음 일정 미등록",
      reasonEn: "No remaining fixtures — the season is over, or the next fixtures are not published yet.",
    };
  }

  // 검사 3 — "막바지라 확정적"이라는 주장과 달력이 모순되면 잘린 일정이다.
  // 정말 팀당 1경기 남았다면 그 경기가 3주 뒤일 수 없다. (K리그1 이 여기서 걸린다.)
  if (
    remainingPerTeam < ENDGAME_REMAINING &&
    daysToLastScheduled !== null &&
    daysToLastScheduled > ENDGAME_MAX_DAYS
  ) {
    return {
      ...out,
      trustworthy: false,
      failure: "endgame-calendar",
      reason: `남은 경기가 팀당 ${remainingPerTeam.toFixed(1)}경기인데 마지막 일정이 ${Math.round(daysToLastScheduled)}일 뒤입니다 — 이후 일정이 아직 등록되지 않았습니다`,
      reasonEn: `Only ${remainingPerTeam.toFixed(1)} matches per team remain, yet the final fixture is ${Math.round(daysToLastScheduled)} days away — later fixtures have not been published yet.`,
    };
  }

  return out;
}
