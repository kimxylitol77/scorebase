// 농구(KBL) 선수 스탯 마스터 표 — 시즌 평균 열, 규정(경기 40%), 리그 백분위. 백분위·정렬·서식은 야구 표 모듈 공용.
//   KBL 공식 API 가 주는 값은 이미 경기당 평균이라 "합계" 는 평균 × 경기수로 만든다.
import { percentile, type StatColumn, type StatCell, type StatRow } from "@/lib/sports/baseball/stats-table";

export type BasketballUnit = "pergame" | "total";

export interface BasketballSeasonRow {
  playerId: string;
  name: string;
  team: string;
  pos: string | null;
  gp: number;
  min: number; // 경기당 분
  pts: number; reb: number; ast: number; stl: number; blk: number; tpm: number; fgPct: number | null;
}

export const KBL_COLUMNS: StatColumn[] = [
  { key: "gp", label: "G", decimals: 0, group: "프로필", desc: "출전 경기", noLeader: true },
  { key: "min", label: "MIN", decimals: 1, group: "프로필", desc: "경기당 출전 시간(분)" },
  { key: "pts", label: "PTS", decimals: 1, perGame: true, group: "공격", desc: "득점", headline: true },
  { key: "reb", label: "REB", decimals: 1, perGame: true, group: "공격", desc: "리바운드", headline: true },
  { key: "ast", label: "AST", decimals: 1, perGame: true, group: "공격", desc: "어시스트", headline: true },
  { key: "tpm", label: "3PM", decimals: 1, perGame: true, group: "공격", desc: "3점 성공" },
  { key: "fgPct", label: "FG%", decimals: 1, group: "효율", desc: "야투 성공률" },
  { key: "stl", label: "STL", decimals: 1, perGame: true, group: "수비", desc: "스틸" },
  { key: "blk", label: "BLK", decimals: 1, perGame: true, group: "수비", desc: "블록" },
];
export const QUAL_GP_RATIO = 0.4;

/** 값 — API 는 경기당 평균. 합계 단위면 × 경기수. */
export function basketballValue(r: BasketballSeasonRow, col: StatColumn, unit: BasketballUnit): number | null {
  const v = (r as unknown as Record<string, number | null>)[col.key];
  if (v == null) return null;
  if (unit === "total" && col.perGame) return v * r.gp;
  return v;
}

export function buildBasketballStatRows(rows: BasketballSeasonRow[], unit: BasketballUnit): { rows: StatRow[]; qualifiedCount: number; minGp: number } {
  const cols = KBL_COLUMNS;
  const maxGp = rows.reduce((m, r) => Math.max(m, r.gp), 0);
  const minGp = Math.ceil(maxGp * QUAL_GP_RATIO);
  const isQ = (r: BasketballSeasonRow) => minGp > 0 && r.gp >= minGp;
  const qual = rows.filter(isQ);
  const poolValues: Record<string, number[]> = {};
  for (const c of cols) poolValues[c.key] = qual.map((r) => basketballValue(r, c, unit)).filter((v): v is number => v != null);
  const out: StatRow[] = rows.map((r) => {
    const q = isQ(r);
    const cells: Record<string, StatCell> = {};
    for (const c of cols) {
      const v = basketballValue(r, c, unit);
      cells[c.key] = { value: v, pct: q && v != null ? percentile(poolValues[c.key], v, c.lowerIsBetter) : null };
    }
    return { key: r.playerId, name: r.name, nameEn: null, team: r.team, externalId: r.playerId, logId: null, qualified: q, cells };
  });
  return { rows: out, qualifiedCount: qual.length, minGp };
}
