// 전술 지표 계산 — ts 매치 캐시(팀 통계·전후반 통계·분당 모멘텀·골 빌드업 좌표)에서 해석에 쓸 숫자를 만든다.
// 순수 함수만 둔다(DB·네트워크 없음). 파생값(롱볼 비중·경합 승률 등)을 모델에게 계산시키면 틀리므로
// 코드가 계산해 프롬프트 블록과 도식 데이터로 넘기고, 모델은 서술만 한다.

export type Side = "home" | "away";

/** ts teamStats 한 팀 (쓰는 필드만) */
export interface TsTeamStat {
  team_id?: string;
  goals?: number;
  ball_possession?: number;
  passes?: number;
  passes_accuracy?: number; // 성공 개수 (비율 아님)
  long_balls?: number;
  long_balls_accuracy?: number;
  crosses?: number;
  crosses_accuracy?: number;
  key_passes?: number;
  shots?: number;
  shots_on_target?: number;
  shots_ibox?: number;
  shots_obox?: number;
  blocked_shots?: number;
  big_chance_created?: number;
  big_chance_missed?: number;
  fastbreak_shots?: number;
  corner_kicks?: number;
  duels?: number;
  duels_won?: number;
  aerial_won?: number;
  aerial_lost?: number;
  tackles?: number;
  interceptions?: number;
  clearances?: number;
  poss_losts?: number;
  fouls?: number;
  dribble?: number;
  dribble_succ?: number;
  offsides?: number;
}

export interface TeamStyle {
  possession: number | null;
  passes: number;
  passAcc: number | null; // %
  longBalls: number;
  longBallShare: number | null; // 전체 패스 중 롱볼 %
  crosses: number;
  keyPasses: number;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  onTargetShare: number | null; // 슈팅 중 유효 %
  shotsInBox: number;
  inBoxShare: number | null; // 슈팅 중 박스 안 %
  bigChances: number;
  bigChancesMissed: number;
  fastbreakShots: number;
  corners: number;
  duelWinPct: number | null;
  aerialWinPct: number | null;
  defActions: number; // 태클 + 가로채기
  clearances: number;
  possLost: number;
  fouls: number;
  dribblesSucc: number;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);

export function teamStyle(s: TsTeamStat): TeamStyle {
  const passes = n(s.passes);
  const shots = n(s.shots);
  const aerial = n(s.aerial_won) + n(s.aerial_lost);
  return {
    possession: s.ball_possession != null ? n(s.ball_possession) : null,
    passes,
    passAcc: pct(n(s.passes_accuracy), passes),
    longBalls: n(s.long_balls),
    longBallShare: pct(n(s.long_balls), passes),
    crosses: n(s.crosses),
    keyPasses: n(s.key_passes),
    goals: n(s.goals),
    shots,
    shotsOnTarget: n(s.shots_on_target),
    onTargetShare: pct(n(s.shots_on_target), shots),
    shotsInBox: n(s.shots_ibox),
    inBoxShare: pct(n(s.shots_ibox), shots),
    bigChances: n(s.big_chance_created),
    bigChancesMissed: n(s.big_chance_missed),
    fastbreakShots: n(s.fastbreak_shots),
    corners: n(s.corner_kicks),
    // ts 는 duels 를 경기 전체 경합 수(양 팀 같은 값)로, duels_won 을 그 팀이 이긴 수로 준다
    duelWinPct: pct(n(s.duels_won), n(s.duels)),
    aerialWinPct: pct(n(s.aerial_won), aerial),
    defActions: n(s.tackles) + n(s.interceptions),
    clearances: n(s.clearances),
    possLost: n(s.poss_losts),
    fouls: n(s.fouls),
    dribblesSucc: n(s.dribble_succ),
  };
}

// ── 전후반 변화 ─────────────────────────────────────────────────────────
/** ts halfTeamStats 의 통계 코드 중 teamStats 와 값이 맞는 것으로 확인한 것 (2026-09-28 EPL 실측) */
export const HALF_CODES: Array<{ code: string; key: keyof TsTeamStat; label: string }> = [
  { code: "25", key: "ball_possession", label: "점유율" },
  { code: "40", key: "passes", label: "패스" },
  { code: "42", key: "key_passes", label: "키패스" },
  { code: "43", key: "crosses", label: "크로스" },
  { code: "45", key: "long_balls", label: "롱볼" },
  { code: "21", key: "shots_on_target", label: "유효 슈팅" },
  { code: "2", key: "corner_kicks", label: "코너킥" },
  { code: "39", key: "tackles", label: "태클" },
  { code: "38", key: "interceptions", label: "가로채기" },
  { code: "36", key: "clearances", label: "클리어" },
  { code: "6", key: "fouls", label: "파울" },
];

export type HalfTable = Record<string, [number, number] | undefined>;
export interface HalfStats {
  ft?: HalfTable;
  p1?: HalfTable;
  p2?: HalfTable;
}
export interface HalfShift {
  label: string;
  p1: [number, number];
  p2: [number, number];
}

/**
 * 전반 → 후반 변화. 코드 번호의 뜻은 문서가 없어, 전체(ft) 값이 teamStats 와 거의 같은 코드만 쓴다
 * (리그·시즌에 따라 코드가 달라져도 틀린 숫자를 내보내지 않으려는 자기 검증).
 */
export function halfShifts(half: HalfStats | null | undefined, home: TsTeamStat, away: TsTeamStat): HalfShift[] {
  if (!half?.ft || !half.p1 || !half.p2) return [];
  const out: HalfShift[] = [];
  for (const { code, key, label } of HALF_CODES) {
    const ft = half.ft[code];
    const p1 = half.p1[code];
    const p2 = half.p2[code];
    if (!ft || !p1 || !p2) continue;
    const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(2, b * 0.08);
    if (!close(ft[0], n(home[key])) || !close(ft[1], n(away[key]))) continue;
    out.push({ label, p1, p2 });
  }
  return out;
}

// ── 모멘텀 ──────────────────────────────────────────────────────────────
export interface TsTrend {
  per?: number;
  data?: number[][]; // [전반 분당, 후반 분당], 양수 = 홈 우세
}
export interface MomentumWindow {
  from: number;
  to: number;
  avg: number; // −100~+100, 양수 = 홈
  side: Side | "even";
}
export interface Momentum {
  /** 분 → 값. 전반 1~45(+추가), 후반 46~ */
  minutes: Array<{ minute: number; value: number }>;
  windows: MomentumWindow[]; // 15분 단위
  homeShare: number; // 홈이 우세했던 분의 비율 %
  longest: { side: Side; from: number; to: number } | null;
  halfAvg: [number, number];
}

export function momentum(trend: TsTrend | null | undefined): Momentum | null {
  const d = trend?.data;
  if (!Array.isArray(d) || d.length < 2 || !d[0]?.length || !d[1]?.length) return null;
  const minutes: Momentum["minutes"] = [];
  d[0].forEach((v, i) => minutes.push({ minute: i + 1, value: n(v) }));
  d[1].forEach((v, i) => minutes.push({ minute: 46 + i, value: n(v) }));
  // 15분 창 — 추가시간은 45분·90분 창에 합친다
  const bounds: Array<[number, number, (m: number, half: 0 | 1) => boolean]> = [
    [1, 15, (m, h) => h === 0 && m <= 15],
    [16, 30, (m, h) => h === 0 && m > 15 && m <= 30],
    [31, 45, (m, h) => h === 0 && m > 30],
    [46, 60, (m, h) => h === 1 && m <= 60],
    [61, 75, (m, h) => h === 1 && m > 60 && m <= 75],
    [76, 90, (m, h) => h === 1 && m > 75],
  ];
  const tagged = [
    ...d[0].map((v, i) => ({ m: i + 1, h: 0 as const, v: n(v) })),
    ...d[1].map((v, i) => ({ m: 46 + i, h: 1 as const, v: n(v) })),
  ];
  const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const windows = bounds.map(([from, to, inWin]) => {
    const avg = avgOf(tagged.filter((t) => inWin(t.m, t.h)).map((t) => t.v));
    return { from, to, avg, side: avg >= 10 ? ("home" as const) : avg <= -10 ? ("away" as const) : ("even" as const) };
  });
  const active = tagged.filter((t) => t.v !== 0);
  const homeShare = active.length ? Math.round((active.filter((t) => t.v > 0).length / active.length) * 100) : 50;
  // 가장 긴 우세 구간 — 같은 쪽이 이어진 분(0 은 끊지 않고 넘긴다). 3분 미만은 의미 없다.
  let longest: Momentum["longest"] = null;
  let run: { side: Side; from: number; to: number; len: number } | null = null;
  for (const t of tagged) {
    if (t.v === 0) continue;
    const side: Side = t.v > 0 ? "home" : "away";
    if (run && run.side === side) {
      run.to = t.m;
      run.len += 1;
    } else {
      run = { side, from: t.m, to: t.m, len: 1 };
    }
    if (run.len >= 3 && (!longest || run.to - run.from > longest.to - longest.from)) longest = { side: run.side, from: run.from, to: run.to };
  }
  return { minutes, windows, homeShare, longest, halfAvg: [avgOf(d[0].map(n)), avgOf(d[1].map(n))] };
}

// ── 골 장면 ─────────────────────────────────────────────────────────────
export interface TsGoalLine {
  pass?: Array<{ x?: string | number; y?: string | number; assist?: number; belong?: number; shooter?: number; player_id?: string; shirt_number?: string | number }>;
  time?: number; // 초
  number?: number;
  own_goal?: number;
}
export interface GoalStep {
  x: number; // 0~100, 공격 방향이 100 이 되도록 정규화
  y: number; // 0~100
  playerId: string | null;
  shirt: string | null;
  isAssist: boolean;
  isShooter: boolean;
}
export interface GoalSequence {
  number: number;
  minute: number;
  side: Side;
  ownGoal: boolean;
  steps: GoalStep[];
  /** 슈팅 이전 연결 수 */
  passes: number;
  startZone: "자기 진영" | "중원" | "상대 진영" | "박스 근처";
  shotZone: "박스 안 중앙" | "박스 안 측면" | "박스 밖";
  kind: "단독 마무리" | "짧은 연결" | "긴 빌드업";
}

/** ts 좌표는 홈이 x=100 쪽으로, 원정이 x=0 쪽으로 공격한다(2026-09-28 EPL 5-3 경기로 확인). 공격 방향을 100 으로 통일한다. */
export function goalSequences(lines: TsGoalLine[] | null | undefined): GoalSequence[] {
  if (!Array.isArray(lines)) return [];
  const out: GoalSequence[] = [];
  for (const g of lines) {
    const raw = (g.pass ?? []).filter((p) => p && p.x != null && p.y != null);
    if (raw.length === 0) continue;
    const shooter = raw.find((p) => n(p.shooter) === 1) ?? raw[raw.length - 1];
    // 자책골은 슈터의 소속이 득점 팀의 반대다
    const belong = n(shooter.belong);
    const ownGoal = n(g.own_goal) === 1;
    const side: Side = (belong === 1) !== ownGoal ? "home" : "away";
    const attackRight = belong === 1;
    const steps: GoalStep[] = raw.map((p) => {
      const x = n(p.x);
      const y = n(p.y);
      return {
        x: Math.round((attackRight ? x : 100 - x) * 10) / 10,
        y: Math.round((attackRight ? y : 100 - y) * 10) / 10,
        playerId: p.player_id ?? null,
        shirt: p.shirt_number != null ? String(p.shirt_number) : null,
        isAssist: n(p.assist) === 1,
        isShooter: n(p.shooter) === 1,
      };
    });
    const first = steps[0];
    const last = steps[steps.length - 1];
    const startZone = first.x < 40 ? "자기 진영" : first.x < 60 ? "중원" : first.x < 80 ? "상대 진영" : "박스 근처";
    // 페널티 박스 — 길이 16.5m/105m ≈ 84.3 이상, 폭 40.3m/68m ≈ 가운데 59%
    const inBox = last.x >= 84.3 && last.y >= 20.4 && last.y <= 79.6;
    const shotZone = !inBox ? "박스 밖" : last.y >= 36.8 && last.y <= 63.2 ? "박스 안 중앙" : "박스 안 측면";
    const passes = steps.length - 1;
    out.push({
      number: n(g.number) || out.length + 1,
      minute: Math.max(1, Math.ceil(n(g.time) / 60)),
      side,
      ownGoal,
      steps,
      passes,
      startZone,
      shotZone,
      kind: passes === 0 ? "단독 마무리" : passes <= 2 ? "짧은 연결" : "긴 빌드업",
    });
  }
  return out;
}

// ── 프롬프트 블록 ───────────────────────────────────────────────────────
export interface TacticalInsights {
  style: { home: TeamStyle; away: TeamStyle } | null;
  halves: HalfShift[];
  momentum: Momentum | null;
  goals: GoalSequence[];
}

const v = (x: number | null, unit = "") => (x == null ? "-" : `${x}${unit}`);

/** 프롬프트에 넣을 사람이 읽는 블록. nameOf 는 ts 선수 id → 한글 이름. */
export function insightLines(ins: TacticalInsights, home: string, away: string, nameOf: (id: string | null) => string | null): string[] {
  const out: string[] = [];
  if (ins.style) {
    const h = ins.style.home;
    const a = ins.style.away;
    const row = (label: string, hv: string, av: string) => `  - ${label}: ${home} ${hv} / ${away} ${av}`;
    out.push(
      [
        "[스타일 지표] (코드가 계산한 값 — 이 숫자만 인용)",
        row("점유율", v(h.possession, "%"), v(a.possession, "%")),
        row("패스(성공률)", `${h.passes}회(${v(h.passAcc, "%")})`, `${a.passes}회(${v(a.passAcc, "%")})`),
        row("롱볼(전체 패스 중 비중)", `${h.longBalls}회(${v(h.longBallShare, "%")})`, `${a.longBalls}회(${v(a.longBallShare, "%")})`),
        row("크로스", `${h.crosses}회`, `${a.crosses}회`),
        row("키패스", `${h.keyPasses}회`, `${a.keyPasses}회`),
        row("득점", `${h.goals}골`, `${a.goals}골`),
        row("슈팅", `${h.shots}회`, `${a.shots}회`),
        row("유효 슈팅(슈팅 중 비중)", `${h.shotsOnTarget}회(${v(h.onTargetShare, "%")})`, `${a.shotsOnTarget}회(${v(a.onTargetShare, "%")})`),
        row("박스 안 슈팅(슈팅 중 비중)", `${h.shotsInBox}회(${v(h.inBoxShare, "%")})`, `${a.shotsInBox}회(${v(a.inBoxShare, "%")})`),
        row("빅찬스 창출(놓친 수)", `${h.bigChances}회(${h.bigChancesMissed})`, `${a.bigChances}회(${a.bigChancesMissed})`),
        row("역습 슈팅", `${h.fastbreakShots}회`, `${a.fastbreakShots}회`),
        row("경합 승률", v(h.duelWinPct, "%"), v(a.duelWinPct, "%")),
        row("공중볼 승률", v(h.aerialWinPct, "%"), v(a.aerialWinPct, "%")),
        row("태클+가로채기", `${h.defActions}회`, `${a.defActions}회`),
        row("클리어", `${h.clearances}회`, `${a.clearances}회`),
        row("볼 소유 상실", `${h.possLost}회`, `${a.possLost}회`),
        row("드리블 성공", `${h.dribblesSucc}회`, `${a.dribblesSucc}회`),
        row("파울", `${h.fouls}회`, `${a.fouls}회`),
      ].join("\n"),
    );
  }
  if (ins.halves.length) {
    out.push(
      [
        "[전후반 변화] (전반 → 후반)",
        ...ins.halves.map((s) => `  - ${s.label}: ${home} ${s.p1[0]} → ${s.p2[0]} / ${away} ${s.p1[1]} → ${s.p2[1]}`),
      ].join("\n"),
    );
  }
  if (ins.momentum) {
    const m = ins.momentum;
    const who = (s: Side | "even") => (s === "home" ? `${home} 우세` : s === "away" ? `${away} 우세` : "팽팽");
    out.push(
      [
        "[경기 흐름] (분당 공격 압력. 득점이 아니라 어느 쪽이 상대 진영에서 공격을 이어갔는지)",
        ...m.windows.map((w) => `  - ${w.from}~${w.to}분: ${who(w.side)}`),
        `  - 공격 압력이 있던 시간 중 ${home} 쪽 비율 ${m.homeShare}%`,
        ...(m.longest ? [`  - 가장 길게 이어진 우세: ${m.longest.side === "home" ? home : away}, ${m.longest.from}~${m.longest.to}분`] : []),
      ].join("\n"),
    );
  }
  if (ins.goals.length) {
    out.push(
      [
        "[골 장면] (좌표로 본 득점 과정)",
        ...ins.goals.map((g) => {
          const team = g.side === "home" ? home : away;
          const shooter = g.steps.find((s) => s.isShooter) ?? g.steps[g.steps.length - 1];
          const assist = g.steps.find((s) => s.isAssist);
          const sName = nameOf(shooter.playerId);
          const aName = assist ? nameOf(assist.playerId) : null;
          const chain = g.passes === 0 ? "연결 없이 마무리" : `${g.startZone}에서 시작해 ${g.passes}번 연결`;
          return `  - ${g.minute}분 ${team}${g.ownGoal ? " (상대 자책골)" : sName ? ` ${sName}` : ""}: ${chain}, 슈팅 위치 ${g.shotZone}${aName ? `, 마지막 패스 ${aName}` : ""}`;
        }),
      ].join("\n"),
    );
  }
  return out;
}
