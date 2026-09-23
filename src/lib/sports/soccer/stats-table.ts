// 축구 선수 스탯 마스터 표 — 열 정의·규정(분 40%)·90분당·리그 백분위. 순수 함수. 백분위·정렬·서식은 야구 표 모듈을 공용으로 쓴다.
import { percentile, type StatColumn, type StatCell, type StatRow } from "@/lib/sports/baseball/stats-table";

export type SoccerUnit = "total" | "per90";
export type SoccerPos = "ALL" | "G" | "D" | "M" | "F";

/** ts 시즌 아카이브 stat + 로더가 붙인 이름·평점 */
export interface SoccerSeasonRow {
  playerId: string;
  name: string;
  team: string;
  pos: string | null; // G/D/M/F
  photo: string | null;
  matches: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  shots: number;
  sot: number;
  keyPasses: number;
  passAcc: number | null;
  tackles: number;
  interceptions: number;
  yellow: number;
  red: number;
  saves: number;
  cleanSheets: number | null;
  conceded: number | null;
  rating: number | null; // 분 가중 평점(경기 로그), 없으면 null
  ratedMinutes: number;
}

/** 90분당 환산 열은 per90 = true */
export const FIELD_COLUMNS: StatColumn[] = [
  { key: "matches", label: "출전", decimals: 0 },
  { key: "starts", label: "선발", decimals: 0 },
  { key: "minutes", label: "분", decimals: 0 },
  { key: "goals", label: "골", decimals: 0, perGame: true },
  { key: "assists", label: "도움", decimals: 0, perGame: true },
  { key: "shots", label: "슈팅", decimals: 0, perGame: true },
  { key: "sot", label: "유효슛", decimals: 0, perGame: true },
  { key: "keyPasses", label: "키패스", decimals: 0, perGame: true },
  { key: "passAcc", label: "패스%", decimals: 0 },
  { key: "tackles", label: "태클", decimals: 0, perGame: true },
  { key: "interceptions", label: "인터셉트", decimals: 0, perGame: true },
  { key: "yellow", label: "경고", decimals: 0, lowerIsBetter: true, perGame: true },
  { key: "rating", label: "평점", decimals: 2 },
];
export const GK_COLUMNS: StatColumn[] = [
  { key: "matches", label: "출전", decimals: 0 },
  { key: "starts", label: "선발", decimals: 0 },
  { key: "minutes", label: "분", decimals: 0 },
  { key: "saves", label: "세이브", decimals: 0, perGame: true },
  { key: "cleanSheets", label: "클린시트", decimals: 0 },
  { key: "conceded", label: "실점", decimals: 0, lowerIsBetter: true, perGame: true },
  { key: "passAcc", label: "패스%", decimals: 0 },
  { key: "yellow", label: "경고", decimals: 0, lowerIsBetter: true, perGame: true },
  { key: "rating", label: "평점", decimals: 2 },
];
/** 규정 = 리그 최다 출전 분의 40% 이상 */
export const QUAL_MINUTES_RATIO = 0.4;

export function columnsForPos(pos: SoccerPos): StatColumn[] {
  return pos === "G" ? GK_COLUMNS : FIELD_COLUMNS;
}

export function soccerValue(r: SoccerSeasonRow, col: StatColumn, unit: SoccerUnit): number | null {
  const v = (r as unknown as Record<string, number | null>)[col.key];
  if (v == null) return null;
  if (unit === "per90" && col.perGame) return r.minutes > 0 ? (v * 90) / r.minutes : null;
  return v;
}

export function buildSoccerStatRows(rows: SoccerSeasonRow[], pos: SoccerPos, unit: SoccerUnit): { rows: StatRow[]; qualifiedCount: number; minMinutes: number } {
  const cols = columnsForPos(pos);
  // 포지션 필: G 는 GK 만, D/M/F 는 해당 포지션만, ALL 은 GK 를 뺀 필드 전원(열이 필드 기준이라)
  const pool = rows.filter((r) => (pos === "ALL" ? r.pos !== "G" : r.pos === pos));
  const maxMin = pool.reduce((m, r) => Math.max(m, r.minutes), 0);
  const minMinutes = Math.ceil(maxMin * QUAL_MINUTES_RATIO);
  const qual = pool.filter((r) => r.minutes >= minMinutes && minMinutes > 0);
  const poolValues: Record<string, number[]> = {};
  for (const c of cols) poolValues[c.key] = qual.map((r) => soccerValue(r, c, unit)).filter((v): v is number => v != null);
  const out: StatRow[] = pool.map((r) => {
    const q = r.minutes >= minMinutes && minMinutes > 0;
    const cells: Record<string, StatCell> = {};
    for (const c of cols) {
      const v = soccerValue(r, c, unit);
      cells[c.key] = { value: v, pct: q && v != null ? percentile(poolValues[c.key], v, c.lowerIsBetter) : null };
    }
    return { key: r.playerId, name: r.name, nameEn: null, team: r.team, externalId: r.playerId, logId: null, qualified: q, cells };
  });
  return { rows: out, qualifiedCount: qual.length, minMinutes };
}
