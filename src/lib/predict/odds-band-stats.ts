// 인기픽(최저 배당) 기준 성적 — 배당 구간별 모델·시장 적중률과 리그별 인기픽 적중률. /predictions/accuracy 전용.
// 해외 평균 배당(Match.oddsHome/Draw/Away, vig 미제거)이 있는 채점 경기만. 3-way 는 세 결과 중 최저 배당이 인기픽.
// 정배당의 "낮은 배당 쪽 적중률(NBA 67.5%~K리그1 44.2%)" 과 같은 정의라 숫자를 나란히 놓을 수 있다(2026-09-11).

import { prisma } from "@/lib/db";

export interface OddsBandRow {
  band: string;
  evaluated: number;
  modelCorrect: number;
  favCorrect: number;
}
export interface LeagueFavRow {
  league: string;
  evaluated: number;
  favCorrect: number;
  modelCorrect: number;
  /** 인기픽 평균 배당 */
  avgFavOdds: number;
}
export interface OddsBandStats {
  evaluated: number;
  bands: OddsBandRow[];
  leagues: LeagueFavRow[];
}

const BANDS: Array<{ label: string; max: number }> = [
  { label: "1.00~1.29", max: 1.3 },
  { label: "1.30~1.59", max: 1.6 },
  { label: "1.60~1.99", max: 2.0 },
  { label: "2.00~2.49", max: 2.5 },
  { label: "2.50 이상", max: Infinity },
];
export const LEAGUE_MIN_SAMPLE = 30;

export async function oddsBandStats(): Promise<OddsBandStats> {
  const rows = await prisma.match.findMany({
    where: { predCorrect: { not: null }, oddsHome: { gt: 1 }, oddsAway: { gt: 1 }, homeScore: { not: null }, awayScore: { not: null } },
    select: { league: true, oddsHome: true, oddsDraw: true, oddsAway: true, homeScore: true, awayScore: true, predCorrect: true },
  });
  const bands = BANDS.map((b) => ({ band: b.label, evaluated: 0, modelCorrect: 0, favCorrect: 0 }));
  const byLeague = new Map<string, LeagueFavRow & { oddsSum: number }>();
  for (const m of rows) {
    const cands: Array<[string, number]> = [["HOME", m.oddsHome!], ["AWAY", m.oddsAway!]];
    if (m.oddsDraw != null && m.oddsDraw > 1) cands.push(["DRAW", m.oddsDraw]);
    const [favSide, favOdds] = cands.reduce((a, b) => (b[1] < a[1] ? b : a));
    const result = m.homeScore! > m.awayScore! ? "HOME" : m.homeScore! < m.awayScore! ? "AWAY" : "DRAW";
    const favOk = favSide === result;
    const modelOk = m.predCorrect === true;
    const band = bands[BANDS.findIndex((b) => favOdds < b.max)];
    band.evaluated++;
    if (favOk) band.favCorrect++;
    if (modelOk) band.modelCorrect++;
    const l = byLeague.get(m.league) ?? { league: m.league, evaluated: 0, favCorrect: 0, modelCorrect: 0, avgFavOdds: 0, oddsSum: 0 };
    l.evaluated++;
    l.oddsSum += favOdds;
    if (favOk) l.favCorrect++;
    if (modelOk) l.modelCorrect++;
    byLeague.set(m.league, l);
  }
  const leagues = [...byLeague.values()]
    .filter((l) => l.evaluated >= LEAGUE_MIN_SAMPLE)
    .map(({ oddsSum, ...l }) => ({ ...l, avgFavOdds: oddsSum / l.evaluated }))
    .sort((a, b) => b.favCorrect / b.evaluated - a.favCorrect / a.evaluated);
  return { evaluated: rows.length, bands: bands.filter((b) => b.evaluated > 0), leagues };
}
