// 하키(NHL) 선수 스탯 마스터 표 — 스케이터/골리 열, 규정(경기 40%), 리그 백분위. 백분위·정렬·서식은 야구 표 모듈 공용.
import { percentile, type StatColumn, type StatCell, type StatRow } from "@/lib/sports/baseball/stats-table";

export type HockeyRole = "skater" | "goalie";
export type HockeyUnit = "total" | "pergame";

export interface HockeySeasonRow {
  playerId: number;
  /** ts 집계 리그의 원본 선수 id (해시). NHL 은 없음 */
  tsId?: string;
  photo?: string | null;
  name: string;
  team: string;
  pos: string; // C/L/R/D/G
  gp: number;
  // 스케이터
  goals?: number; assists?: number; points?: number; plusMinus?: number; pim?: number; shots?: number; shootingPct?: number | null;
  toiPerGame?: number; ppGoals?: number; ppPoints?: number; gwg?: number; faceoffPct?: number | null; hits?: number; blocks?: number;
  // 골리
  gs?: number; wins?: number; losses?: number; otl?: number; gaa?: number | null; savePct?: number | null; saves?: number; shotsAgainst?: number; shutouts?: number;
}

export const SKATER_COLUMNS: StatColumn[] = [
  { key: "gp", label: "GP", decimals: 0, group: "프로필", desc: "출전 경기", noLeader: true },
  { key: "toiPerGame", label: "TOI", decimals: 1, group: "프로필", desc: "경기당 빙상 시간(분)" },
  { key: "goals", label: "G", decimals: 0, perGame: true, group: "득점", desc: "골", headline: true },
  { key: "assists", label: "A", decimals: 0, perGame: true, group: "득점", desc: "어시스트", headline: true },
  { key: "points", label: "P", decimals: 0, perGame: true, group: "득점", desc: "포인트 = 골 + 어시스트", headline: true },
  { key: "ppPoints", label: "PPP", decimals: 0, perGame: true, group: "득점", desc: "파워플레이 포인트" },
  { key: "gwg", label: "GWG", decimals: 0, perGame: true, group: "득점", desc: "결승골" },
  { key: "shots", label: "S", decimals: 0, perGame: true, group: "슈팅", desc: "슈팅" },
  { key: "shootingPct", label: "S%", decimals: 1, group: "슈팅", desc: "슈팅 성공률 = 골 ÷ 슈팅 × 100" },
  { key: "plusMinus", label: "+/−", decimals: 0, group: "기타", desc: "플러스마이너스(빙상에 있을 때 팀 득실)" },
  { key: "hits", label: "HIT", decimals: 0, perGame: true, group: "기타", desc: "히트(바디체크)" },
  { key: "blocks", label: "BLK", decimals: 0, perGame: true, group: "기타", desc: "블록슛" },
  { key: "faceoffPct", label: "FO%", decimals: 1, group: "기타", desc: "페이스오프 승률" },
  { key: "pim", label: "PIM", decimals: 0, lowerIsBetter: true, perGame: true, group: "기타", desc: "페널티 분" },
];
export const GOALIE_COLUMNS: StatColumn[] = [
  { key: "gp", label: "GP", decimals: 0, group: "프로필", desc: "출전 경기", noLeader: true },
  { key: "gs", label: "GS", decimals: 0, group: "프로필", desc: "선발 출전", noLeader: true },
  { key: "wins", label: "W", decimals: 0, perGame: true, group: "성적", desc: "승", headline: true },
  { key: "losses", label: "L", decimals: 0, lowerIsBetter: true, perGame: true, group: "성적", desc: "패" },
  { key: "otl", label: "OTL", decimals: 0, lowerIsBetter: true, perGame: true, group: "성적", desc: "연장·승부치기 패" },
  { key: "gaa", label: "GAA", decimals: 2, lowerIsBetter: true, group: "방어", desc: "경기당 실점 = 실점 × 60 ÷ 출전 분", headline: true },
  { key: "savePct", label: "SV%", decimals: 3, stripLeadingZero: true, group: "방어", desc: "세이브율 = 세이브 ÷ 피슈팅", headline: true },
  { key: "saves", label: "SV", decimals: 0, perGame: true, group: "방어", desc: "세이브" },
  { key: "shotsAgainst", label: "SA", decimals: 0, perGame: true, group: "방어", desc: "피슈팅" },
  { key: "shutouts", label: "SO", decimals: 0, group: "방어", desc: "무실점 경기" },
];
export const QUAL_GP_RATIO = 0.4;

/** ts 경기 캐시로 집계하는 리그(KHL)는 코드가 골·도움·유효슛·+/-·TOI·세이브·선방률뿐이라 열 부분집합 */
const TS_SKATER_KEYS = new Set(["gp", "toiPerGame", "goals", "assists", "points", "shots", "shootingPct", "plusMinus"]);
const TS_GOALIE_KEYS = new Set(["gp", "gs", "gaa", "savePct", "saves", "shotsAgainst"]);

export function columnsForRole(role: HockeyRole, source: "nhl" | "ts" = "nhl"): StatColumn[] {
  const base = role === "goalie" ? GOALIE_COLUMNS : SKATER_COLUMNS;
  if (source === "nhl") return base;
  const keep = role === "goalie" ? TS_GOALIE_KEYS : TS_SKATER_KEYS;
  return base.filter((c) => keep.has(c.key));
}

export function hockeyValue(r: HockeySeasonRow, col: StatColumn, unit: HockeyUnit): number | null {
  const v = (r as unknown as Record<string, number | null | undefined>)[col.key];
  if (v == null) return null;
  if (unit === "pergame" && col.perGame) return r.gp > 0 ? v / r.gp : null;
  return v;
}

export function buildHockeyStatRows(rows: HockeySeasonRow[], role: HockeyRole, unit: HockeyUnit, cols: StatColumn[] = columnsForRole(role)): { rows: StatRow[]; qualifiedCount: number; minGp: number } {
  const pool = rows.filter((r) => (role === "goalie" ? r.pos === "G" : r.pos !== "G"));
  const maxGp = pool.reduce((m, r) => Math.max(m, role === "goalie" ? (r.gs ?? 0) : r.gp), 0);
  const minGp = Math.ceil(maxGp * QUAL_GP_RATIO);
  const isQ = (r: HockeySeasonRow) => minGp > 0 && (role === "goalie" ? (r.gs ?? 0) : r.gp) >= minGp;
  const qual = pool.filter(isQ);
  const poolValues: Record<string, number[]> = {};
  for (const c of cols) poolValues[c.key] = qual.map((r) => hockeyValue(r, c, unit)).filter((v): v is number => v != null);
  const out: StatRow[] = pool.map((r) => {
    const q = isQ(r);
    const cells: Record<string, StatCell> = {};
    for (const c of cols) {
      const v = hockeyValue(r, c, unit);
      cells[c.key] = { value: v, pct: q && v != null ? percentile(poolValues[c.key], v, c.lowerIsBetter) : null };
    }
    const key = r.tsId ?? String(r.playerId);
    return { key, name: r.name, nameEn: null, team: r.team, externalId: key, logId: null, qualified: q, cells };
  });
  return { rows: out, qualifiedCount: qual.length, minGp };
}
