// 야구 승리확률(WE) 테이블 조회 + 전술 시나리오 헬퍼 — /tools/{league}-win-probability 도구 공용.
// 테이블은 scripts/build-we-table.mjs 가 사전계산한 data/we-{league}.json.

export interface WeTable {
  league: string;
  dmin: number;
  dmax: number;
  trials: number;
  env: Record<string, number>;
  // t[inning-1][half(0=초,1=말)][outs][baseCode(0~7)][diff - dmin] = 공격팀 승리확률
  t: number[][][][][];
}

export interface GameState {
  inning: number; // 1~9
  bottom: boolean; // true=말
  outs: number; // 0~2
  b1: boolean;
  b2: boolean;
  b3: boolean;
  diff: number; // 공격팀 점수 - 상대 점수
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function baseCode(s: Pick<GameState, "b1" | "b2" | "b3">): number {
  return (s.b1 ? 1 : 0) | (s.b2 ? 2 : 0) | (s.b3 ? 4 : 0);
}

/** 공격팀(현재 타석) 승리확률 0~1. 입력은 범위 밖이어도 클램프. */
export function lookupWe(tbl: WeTable, s: GameState): number {
  const i = clamp(s.inning, 1, 9);
  const o = clamp(s.outs, 0, 2);
  const d = clamp(s.diff, tbl.dmin, tbl.dmax);
  return tbl.t[i - 1][s.bottom ? 1 : 0][o][baseCode(s)][d - tbl.dmin];
}

// ── 전술 시나리오 — 결과 상태를 만들어 WE 를 다시 조회하면 ΔWE 가 나온다 ──

/** 보내기 번트 — 주자 한 칸 진루, 아웃 +1. 3루 주자는 득점. 2아웃이면 불가(null). */
export function afterBunt(s: GameState): GameState | null {
  if (s.outs >= 2) return null;
  return { ...s, diff: s.diff + (s.b3 ? 1 : 0), b3: s.b2, b2: s.b1, b1: false, outs: s.outs + 1 };
}

/** 2루 도루 — 1루 주자만 있고 2루 빌 때만. 성공/실패 두 상태 반환(null=불가). */
export function stealStates(s: GameState): { succ: GameState; fail: GameState } | null {
  if (!(s.b1 && !s.b2)) return null;
  return {
    succ: { ...s, b1: false, b2: true },
    fail: { ...s, b1: false, outs: s.outs + 1 },
  };
}

/** 고의4구 — 1루가 비었을 때만(수비 선택). 공격팀 입장 ΔWE 는 보통 음수. */
export function afterIbb(s: GameState): GameState | null {
  if (s.b1) return null;
  return { ...s, b1: true };
}

/** KBO 평균 도루 성공률(근사) — 도루 기대 WE 가중치. */
export const STEAL_SUCCESS = 0.68;
