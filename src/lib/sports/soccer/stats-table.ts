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
  { key: "matches", label: "출전", decimals: 0, group: "출전", desc: "출전 경기 수", noLeader: true },
  { key: "starts", label: "선발", decimals: 0, group: "출전", desc: "선발 출전 수", noLeader: true },
  { key: "minutes", label: "분", decimals: 0, group: "출전", desc: "출전 시간(분)", noLeader: true },
  { key: "goals", label: "골", decimals: 0, perGame: true, group: "공격", desc: "득점", headline: true },
  { key: "assists", label: "도움", decimals: 0, perGame: true, group: "공격", desc: "도움", headline: true },
  { key: "shots", label: "슈팅", decimals: 0, perGame: true, group: "공격", desc: "슈팅 수" },
  { key: "sot", label: "유효슛", decimals: 0, perGame: true, group: "공격", desc: "골문 안으로 향한 슈팅" },
  { key: "keyPasses", label: "키패스", decimals: 0, perGame: true, group: "공격", desc: "슈팅으로 이어진 패스" },
  { key: "passAcc", label: "패스%", decimals: 0, group: "기타", desc: "패스 성공률" },
  { key: "tackles", label: "태클", decimals: 0, perGame: true, group: "수비", desc: "태클 수" },
  { key: "interceptions", label: "인터셉트", decimals: 0, perGame: true, group: "수비", desc: "가로채기" },
  { key: "yellow", label: "경고", decimals: 0, lowerIsBetter: true, perGame: true, group: "기타", desc: "옐로카드" },
  { key: "rating", label: "평점", decimals: 2, group: "기타", desc: "경기 로그 평점의 출전 분 가중 평균 (시즌 7/1 이후 전 대회, 10분 이상 출전)", headline: true },
];
export const GK_COLUMNS: StatColumn[] = [
  { key: "matches", label: "출전", decimals: 0, group: "출전", desc: "출전 경기 수", noLeader: true },
  { key: "starts", label: "선발", decimals: 0, group: "출전", desc: "선발 출전 수", noLeader: true },
  { key: "minutes", label: "분", decimals: 0, group: "출전", desc: "출전 시간(분)", noLeader: true },
  { key: "saves", label: "세이브", decimals: 0, perGame: true, group: "GK", desc: "선방", headline: true },
  { key: "cleanSheets", label: "클린시트", decimals: 0, group: "GK", desc: "무실점 경기", headline: true },
  { key: "conceded", label: "실점", decimals: 0, lowerIsBetter: true, perGame: true, group: "GK", desc: "실점", headline: true },
  { key: "passAcc", label: "패스%", decimals: 0, group: "기타", desc: "패스 성공률" },
  { key: "yellow", label: "경고", decimals: 0, lowerIsBetter: true, perGame: true, group: "기타", desc: "옐로카드" },
  { key: "rating", label: "평점", decimals: 2, group: "기타", desc: "경기 로그 평점의 출전 분 가중 평균" },
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
