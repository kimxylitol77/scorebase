// 야구 선수 스탯 마스터 표 — 규정 판정·리그 백분위·파생 지표·정렬·비교. 순수 함수(DB·캐시 없음).
//   입력은 player-rankings.getBbLeagueData 의 BbPlayerRow. 규정 기준은 랭킹 페이지 POWER 와 같다
//   (타자 = 리그 최다 출장의 50% 이상, 투수 = 30이닝 이상) — 두 페이지가 다른 "규정" 을 말하지 않게.
import { POWER_MIN_GAMES_RATIO, POWER_MIN_IP, type BbPlayerRow, type BbRole } from "./player-rankings";
import { woba as wobaOf } from "./lineup-impact";
import type { MlbAdvHitting, MlbAdvPitching } from "@/lib/sports/mlb-stats-api";

export type StatUnit = "total" | "pergame";

export interface StatColumn {
  key: string;
  label: string;
  /** 낮을수록 좋은 지표 (ERA·WHIP·패) — 백분위 반전 */
  lowerIsBetter?: boolean;
  /** 소수 자리. 타율·OPS 는 3(앞 0 생략), ERA·WHIP 은 2 */
  decimals: number;
  stripLeadingZero?: boolean;
  /** 경기당 단위에서 값이 바뀌는 열 (합계 계열). false 면 비율 지표라 그대로 */
  perGame?: boolean;
}

export const BAT_COLUMNS: StatColumn[] = [
  { key: "games", label: "G", decimals: 0 },
  { key: "avg", label: "AVG", decimals: 3, stripLeadingZero: true },
  { key: "ops", label: "OPS", decimals: 3, stripLeadingZero: true },
  { key: "hits", label: "H", decimals: 0, perGame: true },
  { key: "hr", label: "HR", decimals: 0, perGame: true },
  { key: "rbi", label: "RBI", decimals: 0, perGame: true },
];
/** MLB 확장 열 — statsapi 성분에서 파생. 다른 리그는 성분이 없어 열 자체가 없다. */
export const BAT_ADV_COLUMNS: StatColumn[] = [
  { key: "woba", label: "wOBA", decimals: 3, stripLeadingZero: true },
  { key: "iso", label: "ISO", decimals: 3, stripLeadingZero: true },
  { key: "bbPct", label: "BB%", decimals: 1 },
  { key: "kPct", label: "K%", decimals: 1, lowerIsBetter: true },
];
export const PIT_ADV_COLUMNS: StatColumn[] = [
  { key: "fip", label: "FIP", decimals: 2, lowerIsBetter: true },
  { key: "kPct", label: "K%", decimals: 1 },
  { key: "bbPct", label: "BB%", decimals: 1, lowerIsBetter: true },
  { key: "hr9", label: "HR/9", decimals: 2, lowerIsBetter: true },
];
/** FIP 상수 — 리그 ERA 와 FIP 평균을 맞추는 값. 시즌마다 3.1~3.2 라 고정값 사용(상대 비교 목적). */
export const FIP_CONSTANT = 3.15;

export function columnsFor(role: BbRole, league: string): StatColumn[] {
  const base = role === "bat" ? BAT_COLUMNS : PIT_COLUMNS;
  return league === "MLB" ? [...base, ...(role === "bat" ? BAT_ADV_COLUMNS : PIT_ADV_COLUMNS)] : base;
}

export interface AdvancedInput { hitting: Record<string, MlbAdvHitting>; pitching: Record<string, MlbAdvPitching> }

/** 확장 열 값 — externalId 로 성분을 찾아 파생. 표본(PA·BF) 0 이면 null. 타자 표에선 타격 성분, 투수 표에선 투구 성분. */
export function advancedValue(r: BbPlayerRow, key: string, adv: AdvancedInput | undefined, role: BbRole = r.era != null && r.avg == null ? "pit" : "bat"): number | null {
  if (!adv || !r.externalId) return null;
  const h = adv.hitting[r.externalId], p = adv.pitching[r.externalId];
  switch (key) {
    case "woba": return h && h.pa > 0 ? wobaOf(h) : null;
    case "iso": return h && h.ab > 0 ? (h.d2b + 2 * h.d3b + 3 * h.hr) / h.ab : null;
    case "bbPct":
      if (role === "bat") return h && h.pa > 0 ? (100 * (h.bb - h.ibb)) / h.pa : null;
      return p && p.bf > 0 ? (100 * p.bb) / p.bf : null;
    case "kPct":
      if (role === "bat") return h && h.pa > 0 ? (100 * h.so) / h.pa : null;
      return p && p.bf > 0 ? (100 * p.so) / p.bf : null;
    case "fip": return p && p.ip > 0 ? (13 * p.hr + 3 * (p.bb + p.hbp) - 2 * p.so) / p.ip + FIP_CONSTANT : null;
    case "hr9": return p && p.ip > 0 ? (9 * p.hr) / p.ip : null;
    default: return null;
  }
}

export const PIT_COLUMNS: StatColumn[] = [
  { key: "games", label: "G", decimals: 0 },
  { key: "era", label: "ERA", decimals: 2, lowerIsBetter: true },
  { key: "whip", label: "WHIP", decimals: 2, lowerIsBetter: true },
  { key: "ip", label: "IP", decimals: 1, perGame: true },
  { key: "so", label: "SO", decimals: 0, perGame: true },
  { key: "k9", label: "K/9", decimals: 2 },
  { key: "w", label: "W", decimals: 0, perGame: true },
  { key: "l", label: "L", decimals: 0, lowerIsBetter: true, perGame: true },
  { key: "sv", label: "SV", decimals: 0, perGame: true },
];

export interface StatCell {
  value: number | null;
  /** 규정 표본 안 백분위 0~100. 규정 미달·값 없음이면 null */
  pct: number | null;
}
export interface StatRow {
  key: string;
  name: string;
  nameEn: string | null;
  team: string;
  externalId: string | null;
  logId: string | null;
  qualified: boolean;
  cells: Record<string, StatCell>;
}

/** 역할별 행 선별. NPB 는 투수 row 에도 타율이 실려 오므로 투수(10이닝 이상)는 타자 표에서 뺀다 — 단 안타 20 이상(투타 겸업)은 남긴다. */
export function rowsForRole(rows: BbPlayerRow[], role: BbRole): BbPlayerRow[] {
  if (role === "pit") return rows.filter((r) => r.era != null && r.ip != null && r.ip > 0);
  return rows.filter((r) => r.avg != null && r.games > 0 && !((r.ip ?? 0) >= 10 && (r.hits ?? 0) < 20));
}

export function isQualified(r: BbPlayerRow, role: BbRole, maxGames: number): boolean {
  return role === "pit" ? (r.ip ?? 0) >= POWER_MIN_IP : maxGames > 0 && r.games >= maxGames * POWER_MIN_GAMES_RATIO;
}

/** 열 값 — 파생(K/9)·경기당 환산 포함. */
export function statValue(r: BbPlayerRow, col: StatColumn, unit: StatUnit, adv?: AdvancedInput, role?: BbRole): number | null {
  if (["woba", "iso", "bbPct", "kPct", "fip", "hr9"].includes(col.key)) return advancedValue(r, col.key, adv, role);
  const base: Record<string, number | null> = {
    games: r.games, avg: r.avg, ops: r.ops, hits: r.hits, hr: r.hr, rbi: r.rbi,
    era: r.era, whip: r.whip, ip: r.ip, so: r.so, w: r.w, l: r.l, sv: r.sv,
    k9: r.ip && r.ip > 0 && r.so != null ? (r.so * 9) / r.ip : null,
  };
  const v = base[col.key];
  if (v == null) return null;
  if (unit === "pergame" && col.perGame) return r.games > 0 ? v / r.games : null;
  return v;
}

/** 규정 표본 안에서 "나보다 못한 값의 비율". 동률은 절반만 센다. */
export function percentile(values: number[], v: number, lowerIsBetter = false): number {
  if (values.length === 0) return 0;
  let worse = 0, tie = 0;
  for (const x of values) {
    if (x === v) tie++;
    else if (lowerIsBetter ? x > v : x < v) worse++;
  }
  return Math.round(((worse + (tie - 1) / 2) / values.length) * 100);
}

export function buildStatRows(rows: BbPlayerRow[], role: BbRole, unit: StatUnit, cols: StatColumn[] = role === "bat" ? BAT_COLUMNS : PIT_COLUMNS, adv?: AdvancedInput): { rows: StatRow[]; qualifiedCount: number; minGames: number } {
  const pool = rowsForRole(rows, role);
  const maxGames = pool.reduce((m, r) => Math.max(m, r.games), 0);
  const minGames = Math.ceil(maxGames * POWER_MIN_GAMES_RATIO);
  const qual = pool.filter((r) => isQualified(r, role, maxGames));
  // 열별 규정 표본 값 (백분위 모집단)
  const poolValues: Record<string, number[]> = {};
  for (const c of cols) poolValues[c.key] = qual.map((r) => statValue(r, c, unit, adv, role)).filter((v): v is number => v != null);
  const out: StatRow[] = pool.map((r) => {
    const q = isQualified(r, role, maxGames);
    const cells: Record<string, StatCell> = {};
    for (const c of cols) {
      const v = statValue(r, c, unit, adv, role);
      cells[c.key] = { value: v, pct: q && v != null ? percentile(poolValues[c.key], v, c.lowerIsBetter) : null };
    }
    // 시즌 중 이적 선수는 팀별 행이 따로 있어 externalId 만으론 키가 겹친다(MLB 실측 669330·621345) → 팀을 붙인다
    return { key: `${r.key}@${r.team}`, name: r.name, nameEn: r.nameEn, team: r.team, externalId: r.externalId, logId: r.logId, qualified: q, cells };
  });
  return { rows: out, qualifiedCount: qual.length, minGames };
}

/** 정렬 — 값 없음은 항상 뒤. dir=desc 가 기본(낮을수록 좋은 열은 asc 가 "좋은 순"). */
export function sortStatRows(rows: StatRow[], key: string, dir: "asc" | "desc"): StatRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name, "ko") * sign;
    const av = a.cells[key]?.value, bv = b.cells[key]?.value;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * sign || a.name.localeCompare(b.name, "ko");
  });
}

export function formatStat(v: number | null, col: StatColumn, unit: StatUnit): string {
  if (v == null) return "—";
  const d = unit === "pergame" && col.perGame ? 2 : col.decimals;
  const s = v.toFixed(d);
  return col.stripLeadingZero ? s.replace(/^0/, "") : s;
}
