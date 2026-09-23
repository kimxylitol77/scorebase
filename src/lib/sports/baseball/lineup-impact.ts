// MLB 라인업 임팩트 산식 — 확정 타순의 기대득점(xR)과 선수별 교체 Δ. 순수 함수만(외부 호출 없음).
//   wOBA 선형가중치(FanGraphs 고정값) → 리그 평균 대비 득점 환산(wOBA 스케일 1.2) → 타순별 타석수 가중.
//   근거·상수 이력은 docs/mlb-lineup-impact/plan.md.

export interface BattingComponents {
  pa: number;
  ab: number;
  h: number;
  d2b: number;
  d3b: number;
  hr: number;
  bb: number;
  ibb: number;
  hbp: number;
  sf: number;
}

export interface LineupBatter {
  pid: number;
  name: string;
  /** 타순 1~9 */
  slot: number;
  comp: BattingComponents;
}

export interface LeagueContext {
  /** 리그 팀당 경기당 득점 */
  rpg: number;
  /** 리그 평균 wOBA */
  woba: number;
}

export interface PlayerImpact {
  pid: number;
  name: string;
  slot: number;
  /** 시즌 wOBA (표본 부족이면 리그 평균으로 수축된 값) */
  woba: number;
  /** 원시 wOBA — 성분이 없으면 null */
  wobaRaw: number | null;
  pa: number;
  /** 수축 적용 여부 (시즌 PA < SHRINK_PA) */
  shrunk: boolean;
  /** 경기당 타석 기대치 (타순 기반) */
  paPerGame: number;
  /** 벤치 평균 타자로 교체했을 때 팀 기대득점 변화 (양수 = 이 선수가 있어 득) */
  delta: number;
}

export interface LineupImpact {
  /** 팀 기대득점 (경기당) */
  xr: number;
  /** 리그 평균 대비 */
  vsLeague: number;
  benchWoba: number;
  /** 벤치 표본이 없어 리그 평균으로 대체했는지 */
  benchFallback: boolean;
  players: PlayerImpact[];
}

/** FanGraphs 선형가중치 (연도별 미세 변동은 무시 — 상대 비교가 목적) */
export const WOBA_WEIGHTS = { bb: 0.69, hbp: 0.72, single: 0.89, double: 1.27, triple: 1.62, hr: 2.1 } as const;
export const WOBA_SCALE = 1.2;
/** 이 타석수 미만이면 리그 평균 쪽으로 수축 */
export const SHRINK_PA = 50;
/** 리그 상수 fetch 실패 시 폴백 (2026-09-23 실측 4.484 / 통상 .312) */
export const LEAGUE_FALLBACK: LeagueContext = { rpg: 4.48, woba: 0.312 };

/** 시즌 wOBA. 분모 0 이면 null. */
export function woba(c: BattingComponents): number | null {
  const singles = c.h - c.d2b - c.d3b - c.hr;
  const ubb = c.bb - c.ibb;
  const denom = c.ab + ubb + c.sf + c.hbp;
  if (denom <= 0) return null;
  const num =
    WOBA_WEIGHTS.bb * ubb +
    WOBA_WEIGHTS.hbp * c.hbp +
    WOBA_WEIGHTS.single * singles +
    WOBA_WEIGHTS.double * c.d2b +
    WOBA_WEIGHTS.triple * c.d3b +
    WOBA_WEIGHTS.hr * c.hr;
  return num / denom;
}

/** 타순별 경기당 타석 기대치 — 1번 4.65 … 9번 3.77 (합 ≈ 37.9). */
export function paForSlot(slot: number): number {
  return 4.65 - 0.11 * (slot - 1);
}

/** 표본 부족 수축: PA 가 적을수록 리그 평균 쪽으로. */
export function shrinkWoba(w: number, pa: number, lg: number, k = SHRINK_PA): number {
  return (pa * w + k * lg) / (pa + k);
}

/** PA 가중 평균 wOBA (벤치·리그 계산 공용). 표본 없으면 null. */
export function pooledWoba(list: BattingComponents[]): number | null {
  const sum = list.reduce(
    (a, c) => ({ pa: a.pa + c.pa, ab: a.ab + c.ab, h: a.h + c.h, d2b: a.d2b + c.d2b, d3b: a.d3b + c.d3b, hr: a.hr + c.hr, bb: a.bb + c.bb, ibb: a.ibb + c.ibb, hbp: a.hbp + c.hbp, sf: a.sf + c.sf }),
    { pa: 0, ab: 0, h: 0, d2b: 0, d3b: 0, hr: 0, bb: 0, ibb: 0, hbp: 0, sf: 0 },
  );
  return woba(sum);
}

/**
 * 라인업 기대득점과 선수별 Δ.
 *  xR = lgR/G + Σ PA(slot)·(wOBA_i − lgwOBA)/1.2
 *  Δ_i = PA(slot)·(wOBA_i − wOBA_bench)/1.2   (벤치 없으면 리그 평균 기준)
 */
export function computeLineupImpact(lineup: LineupBatter[], bench: BattingComponents[], lg: LeagueContext): LineupImpact {
  const benchRaw = pooledWoba(bench.filter((b) => b.pa > 0));
  const benchFallback = benchRaw == null;
  // 벤치도 표본 수축 — 4~5명 합계라 대개 충분하지만 시즌 초엔 아니다
  const benchPa = bench.reduce((a, b) => a + b.pa, 0);
  const benchWoba = benchRaw == null ? lg.woba : shrinkWoba(benchRaw, benchPa, lg.woba);

  const players: PlayerImpact[] = lineup.map((b) => {
    const raw = woba(b.comp);
    const shrunk = raw == null || b.comp.pa < SHRINK_PA;
    const w = raw == null ? lg.woba : shrinkWoba(raw, b.comp.pa, lg.woba);
    const paPerGame = paForSlot(b.slot);
    return {
      pid: b.pid,
      name: b.name,
      slot: b.slot,
      woba: w,
      wobaRaw: raw,
      pa: b.comp.pa,
      shrunk,
      paPerGame,
      delta: (paPerGame * (w - benchWoba)) / WOBA_SCALE,
    };
  });
  const xr = lg.rpg + players.reduce((a, p) => a + (p.paPerGame * (p.woba - lg.woba)) / WOBA_SCALE, 0);
  return { xr, vsLeague: xr - lg.rpg, benchWoba, benchFallback, players };
}
