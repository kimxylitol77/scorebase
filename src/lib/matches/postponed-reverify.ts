// POSTPONED 로 고착된 af 축구 행을 af 현재 상태로 되살릴지 판정(순수 함수)
//
// 왜 필요한가. TS_COVERED 리그의 af 행은 collect 가 건너뛰고, 한 번 POSTPONED 가 되면
// thesports-cache 는 워커 푸시를 무시하고 stale 검증 잡은 SCHEDULED·LIVE 만 본다 —
// 되돌릴 경로가 하나도 없다. 2026-09-24 실측 88경기: 실제로 치른 경기(af FT)가 "연기"로,
// 재편성된 경기가 옛 날짜에 "연기"로 남아 새 날짜 일정에서 빠져 있었다.

export type AfVerify = {
  short: string;
  goalsHome: number | null;
  goalsAway: number | null;
  date: string | null;
};

export type PostponedPlan =
  | { kind: "finish"; homeScore: number; awayScore: number; startTime: Date }
  | { kind: "reschedule"; startTime: Date }
  | { kind: "keep" };

/** af 가 종료로 보는 코드. 연장·승부차기 종료 포함. */
const AF_FINISHED = new Set(["FT", "AET", "PEN"]);
/** af 가 아직 안 열린 경기로 보는 코드. */
const AF_NOT_STARTED = new Set(["NS", "TBD"]);

/**
 * af 가 종료(점수 있음) → 종료 확정(킥오프도 af 값으로).
 * af 가 미래 날짜의 미시작 → 그 날짜로 옮겨 예정으로 되돌림.
 * 그 외(af 도 연기·취소·진행 중·지난 날짜의 미시작·날짜 불명) → 그대로 둔다.
 */
export function planPostponedReverify(v: AfVerify, now: Date): PostponedPlan {
  const at = v.date ? new Date(v.date) : null;
  if (!at || Number.isNaN(at.getTime())) return { kind: "keep" };
  if (AF_FINISHED.has(v.short) && v.goalsHome != null && v.goalsAway != null) {
    // 미래 시각의 "종료"는 소스 오류 — 확정하지 않는다.
    if (at.getTime() > now.getTime()) return { kind: "keep" };
    return { kind: "finish", homeScore: v.goalsHome, awayScore: v.goalsAway, startTime: at };
  }
  if (AF_NOT_STARTED.has(v.short) && at.getTime() > now.getTime()) {
    return { kind: "reschedule", startTime: at };
  }
  return { kind: "keep" };
}

/**
 * raw 가 이 externalId 의 af fixture 원본인가. ESPN 축구 이벤트 id(6자리)도 숫자라 af fixture id 로
 * 오조회될 수 있어서, af 로 확인할 행은 raw 로 출처를 확정한다.
 */
export function isAfFixtureRaw(raw: unknown, externalId: string): boolean {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return false;
    }
  }
  const id = (obj as { fixture?: { id?: unknown } } | null)?.fixture?.id;
  return id != null && String(id) === externalId;
}
