// 리그별 예측 적중률 집계 — /predictions/accuracy(ko)와 /en/predictions/accuracy 가 공유.
// 방법론: predCorrect 채점 완료된 전체 매치(시점 기반 백테스트) 기준. 두 페이지 숫자 단일 출처.
import { prisma } from "@/lib/db";
import { strongPickThreshold } from "@/lib/predict/strong-pick";

export const ACCURACY_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
  "NBA", "NHL", "MLB", "KBO", "NPB", "LOL",
] as const;

export const ACCURACY_SOCCER = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
]);

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
  /** 경기 시작 시간 기준 최근 7/14/30일 롤링 1X2 (채점 완료 경기만) */
  rolling7: MarketRate;
  rolling14: MarketRate;
  rolling30: MarketRate;
}

export function rateOf(arr: Array<{ ok: boolean | null }>): MarketRate {
  const evaluated = arr.filter((x) => x.ok !== null).length;
  const correct = arr.filter((x) => x.ok === true).length;
  return {
    evaluated,
    correct,
    rate: evaluated > 0 ? correct / evaluated : 0,
  };
}

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

  // 롤링 윈도 — 경기 시작 시간 기준 최근 N일, 이미 로드한 배열 인메모리 필터 (신규 쿼리 없음)
  const rollingOf = (days: number) => {
    const cutoff = new Date(Date.now() - days * 86400000);
    return rateOf(
      all.filter((m) => m.startTime >= cutoff).map((m) => ({ ok: m.predCorrect })),
    );
  };

  return {
    league,
    isSoccer: ACCURACY_SOCCER.has(league),
    oneXTwo,
    dc,
    over,
    hc,
    btts,
    strong: rateOf(strong),
    recent10: rateOf(recent10),
    rolling7: rollingOf(7),
    rolling14: rollingOf(14),
    rolling30: rollingOf(30),
  };
}
