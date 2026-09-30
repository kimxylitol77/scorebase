// 하키 박스스코어 공용 계산 — TheSports detailLive.players/incidents/stats 를 게임센터(서버)·선수 기록 표(클라)가 같이 읽는다.
// 선수 코드: 20(1골리/2스케이터)·21포인트·22 PIM·23 TOI(초)·26골·27어시·28유효슛·29히트·30블록·32 FO%·56(+/-)·78턴오버·79가로채기·24세이브·25 SV%.
// 팀 코드(stats[0]): 6 유효슛·14 히트·15 FO 승·16 FO%·11 PIM·19 턴오버·18 가로채기 (2026-09-29 MTL@TOR ESPN 대조).
//   8 은 블록이 아니다(상대 팀 블록 값과 같음) → 블록은 선수 코드 30 합계.
import { goalieRating, skaterRating } from "./game-score";

export interface HockeyPlayerRow {
  id: string;
  stats: Array<[number, number]>;
}
export interface HockeyIncident {
  type: number;
  second?: number;
  position?: number; // 1=home, 2=away
  player_id?: string;
  assists1_id?: string;
  assists2_id?: string;
  home_score?: number;
  away_score?: number;
  card_minute?: number;
}
export type HockeyTeamStats = Array<[number, Array<[number, number, number]>]>;

export function statOf(row: HockeyPlayerRow, id: number): number | undefined {
  return row.stats.find(([s]) => s === id)?.[1];
}
export const isGoalie = (r: HockeyPlayerRow) => statOf(r, 20) === 1;
export const isSkater = (r: HockeyPlayerRow) => statOf(r, 20) === 2;

export function goalsAgainstOf(r: HockeyPlayerRow): number | null {
  const sv = statOf(r, 24);
  const pct = statOf(r, 25);
  if (sv == null || pct == null) return null;
  const p = pct > 1 ? pct / 100 : pct;
  if (p <= 0) return null;
  return Math.max(0, Math.round(sv / p - sv));
}

/** 평점 — 스케이터·골리 공용. 출전 안 한 골리(TOI 0)나 실점 계산 불가면 null */
export function ratingOf(r: HockeyPlayerRow): number | null {
  if (isGoalie(r)) {
    if (!(statOf(r, 23) ?? 0)) return null;
    const ga = goalsAgainstOf(r);
    return ga == null ? null : goalieRating(statOf(r, 24) ?? 0, ga);
  }
  return skaterRating({
    g: statOf(r, 26) ?? 0, a: statOf(r, 27) ?? 0, sog: statOf(r, 28) ?? 0,
    blk: statOf(r, 30) ?? 0, pim: statOf(r, 22) ?? 0, pm: statOf(r, 56) ?? 0,
  });
}

export function toiLabel(sec?: number): string {
  if (!sec) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** 누적 초 → 피리어드(1~3, 4=OT)·피리어드 안 경과 "MM:SS" */
export function periodOf(second: number): { period: number; clock: string } {
  const P = 1200;
  const period = second <= 3 * P ? Math.min(3, Math.floor(second / P) + (second % P === 0 && second > 0 ? 0 : 1)) : 4;
  const inP = period <= 3 ? second - (period - 1) * P : second - 3 * P;
  return { period, clock: `${Math.floor(inP / 60)}:${String(inP % 60).padStart(2, "0")}` };
}

/** 팀 기록 비교 행 — 검증된 코드만. 값이 둘 다 0 인 행은 뺀다 */
export function teamStatRows(
  stats: HockeyTeamStats | undefined,
  home: HockeyPlayerRow[],
  away: HockeyPlayerRow[],
): Array<{ label: string; home: number; away: number; pct?: boolean; sub?: [string, string] }> {
  const total = new Map((stats?.find(([p]) => p === 0)?.[1] ?? []).map(([c, h, a]) => [c, [h, a] as [number, number]]));
  const sum = (rows: HockeyPlayerRow[], c: number) => rows.filter(isSkater).reduce((s, r) => s + (statOf(r, c) ?? 0), 0);
  const t = (c: number) => total.get(c);
  const out: Array<{ label: string; home: number; away: number; pct?: boolean; sub?: [string, string] }> = [];
  const sog = t(6) ?? [sum(home, 28), sum(away, 28)];
  out.push({ label: "유효슛", home: sog[0], away: sog[1] });
  const fo = t(16);
  const fow = t(15);
  if (fo && (fo[0] || fo[1])) {
    out.push({
      label: "페이스오프", home: fo[0] * 100, away: fo[1] * 100, pct: true,
      sub: fow ? [`${fow[0]}/${fow[0] + fow[1]}`, `${fow[1]}/${fow[0] + fow[1]}`] : undefined,
    });
  }
  const hits = t(14) ?? [sum(home, 29), sum(away, 29)];
  out.push({ label: "히트", home: hits[0], away: hits[1] });
  out.push({ label: "블록", home: sum(home, 30), away: sum(away, 30) });
  const pim = t(11) ?? [sum(home, 22), sum(away, 22)];
  out.push({ label: "페널티 시간(분)", home: pim[0], away: pim[1] });
  const gv = t(19);
  if (gv) out.push({ label: "턴오버", home: gv[0], away: gv[1] });
  const tk = t(18);
  if (tk) out.push({ label: "가로채기", home: tk[0], away: tk[1] });
  return out.filter((r) => r.home || r.away);
}
