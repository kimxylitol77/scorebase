// LoL 선수 스탯 마스터 표 — 경기(세트) 집계 열, 규정(세트 40%), 리그 백분위. 백분위·정렬·서식은 야구 표 모듈 공용.
import { percentile, type StatColumn, type StatCell, type StatRow } from "@/lib/sports/baseball/stats-table";

export type EsportsUnit = "pergame" | "total";

export interface LolSeasonRow {
  playerId: string;
  name: string;
  team: string;
  pos: string | null;
  games: number;
  kills: number; deaths: number; assists: number; kda: number; csPerGame: number; csPerMin: number; wins: number; winRate: number;
}

export const LOL_COLUMNS: StatColumn[] = [
  { key: "games", label: "세트", decimals: 0, group: "프로필", desc: "출전 세트 수", noLeader: true },
  { key: "winRate", label: "승률", decimals: 1, group: "프로필", desc: "세트 승률(%)", headline: true },
  { key: "kills", label: "K", decimals: 0, perGame: true, group: "전투", desc: "킬", headline: true },
  { key: "deaths", label: "D", decimals: 0, lowerIsBetter: true, perGame: true, group: "전투", desc: "데스" },
  { key: "assists", label: "A", decimals: 0, perGame: true, group: "전투", desc: "어시스트" },
  { key: "kda", label: "KDA", decimals: 2, group: "전투", desc: "(킬 + 어시스트) ÷ 데스", headline: true },
  { key: "csPerGame", label: "CS", decimals: 0, group: "성장", desc: "세트당 CS" },
  { key: "csPerMin", label: "CS/분", decimals: 2, group: "성장", desc: "분당 CS" },
];
export const QUAL_GAMES_RATIO = 0.4;

export function lolValue(r: LolSeasonRow, col: StatColumn, unit: EsportsUnit): number | null {
  const v = (r as unknown as Record<string, number | null>)[col.key];
  if (v == null) return null;
  if (col.key === "winRate") return v * 100;
  if (unit === "pergame" && col.perGame) return r.games > 0 ? v / r.games : null;
  return v;
}

export function buildLolStatRows(rows: LolSeasonRow[], unit: EsportsUnit): { rows: StatRow[]; qualifiedCount: number; minGames: number } {
  const cols = LOL_COLUMNS;
  const maxG = rows.reduce((m, r) => Math.max(m, r.games), 0);
  const minGames = Math.ceil(maxG * QUAL_GAMES_RATIO);
  const isQ = (r: LolSeasonRow) => minGames > 0 && r.games >= minGames;
  const qual = rows.filter(isQ);
  const poolValues: Record<string, number[]> = {};
  for (const c of cols) poolValues[c.key] = qual.map((r) => lolValue(r, c, unit)).filter((v): v is number => v != null);
  const out: StatRow[] = rows.map((r) => {
    const q = isQ(r);
    const cells: Record<string, StatCell> = {};
    for (const c of cols) {
      const v = lolValue(r, c, unit);
      cells[c.key] = { value: v, pct: q && v != null ? percentile(poolValues[c.key], v, c.lowerIsBetter) : null };
    }
    return { key: r.playerId, name: r.name, nameEn: null, team: r.team, externalId: r.playerId, logId: null, qualified: q, cells };
  });
  return { rows: out, qualifiedCount: qual.length, minGames };
}
