// 리그별 예측 적중률 집계 — /predictions/accuracy 페이지 로직을 lib 로 추출(챗봇 등 재사용).

import { prisma } from "@/lib/db";
import { strongPickThreshold } from "@/lib/predict/strong-pick";

export interface MarketRate {
  evaluated: number;
  correct: number;
  rate: number;
}

export interface LeagueStat {
  league: string;
  isSoccer: boolean;
  oneXTwo: MarketRate;
  dc: MarketRate;
  over: MarketRate;
  hc: MarketRate;
  btts: MarketRate;
  /** 1X2 최고 확률이 리그별 Strong Pick 임계 이상인 매치만의 적중률 */
  strong: MarketRate;
  recent10: MarketRate;
}

const SOCCER = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
]);

export function rateOf(arr: Array<{ ok: boolean | null }>): MarketRate {
  const evaluated = arr.filter((x) => x.ok !== null).length;
  const correct = arr.filter((x) => x.ok === true).length;
  return {
    evaluated,
    correct,
    rate: evaluated > 0 ? correct / evaluated : 0,
  };
}

/** 한 리그의 시장별 적중률. Match.predCorrect 집계 (별도 저장 테이블 없음). */
export async function statForLeague(league: string): Promise<LeagueStat> {
  const all = await prisma.match.findMany({
    where: { league, predCorrect: { not: null } },
    select: {
      predCorrect: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      predDcCorrect: true,
      predOverCorrect: true,
      predHcCorrect: true,
      predBttsCorrect: true,
      startTime: true,
    },
    orderBy: { startTime: "desc" },
  });

  const oneXTwo = rateOf(all.map((m) => ({ ok: m.predCorrect })));
  const dc = rateOf(all.map((m) => ({ ok: m.predDcCorrect })));
  const over = rateOf(all.map((m) => ({ ok: m.predOverCorrect })));
  const hc = rateOf(all.map((m) => ({ ok: m.predHcCorrect })));
  const btts = rateOf(all.map((m) => ({ ok: m.predBttsCorrect })));

  // AI Strong Pick — 리그별 임계(strong-pick.ts) 이상
  const strong = all
    .filter((m) => {
      const top = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
      return top >= strongPickThreshold(league);
    })
    .map((m) => ({ ok: m.predCorrect }));
  const recent10 = all.slice(0, 10).map((m) => ({ ok: m.predCorrect }));

  return {
    league,
    isSoccer: SOCCER.has(league),
    oneXTwo,
    dc,
    over,
    hc,
    btts,
    strong: rateOf(strong),
    recent10: rateOf(recent10),
  };
}
