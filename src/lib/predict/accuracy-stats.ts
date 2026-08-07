// 리그별 예측 적중률 집계 — /predictions/accuracy(ko)와 /en/predictions/accuracy 가 공유.
// 방법론: predCorrect 채점 완료된 전체 매치(시점 기반 백테스트) 기준. 두 페이지 숫자 단일 출처.
import { prisma } from "@/lib/db";
import { strongPickThreshold } from "@/lib/predict/strong-pick";

export const ACCURACY_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
  "NBA", "NHL", "MLB", "KBO", "NPB", "LOL",
] as const;

export const ACCURACY_SOCCER = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
]);

export interface MarketRate {
  evaluated: number;
  correct: number;
  rate: number;
}

/** 한 기간 창 안의 시장별 적중률 묶음 */
export interface WindowStat {
  oneXTwo: MarketRate;
  dc: MarketRate;
  over: MarketRate;
  hc: MarketRate;
  btts: MarketRate;
  /** 1X2 최고 확률이 리그별 Strong Pick 임계 이상인 매치만의 적중률 */
  strong: MarketRate;
}

/** 기간 필터 키 — all(누적) / 최근 30·14·7일 */
export type WindowKey = "all" | "d30" | "d14" | "d7";

export const WINDOW_DAYS: Record<Exclude<WindowKey, "all">, number> = {
  d30: 30,
  d14: 14,
  d7: 7,
};

export interface LeagueStat {
  league: string;
  isSoccer: boolean;
  /** 기간 × 시장 교차 — "EPL 최근 30일 OU" 같은 세분 수치의 단일 출처 */
  windows: Record<WindowKey, WindowStat>;
  oneXTwo: MarketRate;
  dc: MarketRate;
  over: MarketRate;
  hc: MarketRate;
  btts: MarketRate;
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

  const threshold = strongPickThreshold(league);
  // 한 기간 창의 시장별 적중률 — 기간 필터가 1X2 뿐 아니라 모든 시장에 걸리게 하는 지점
  const windowStat = (rows: typeof all): WindowStat => ({
    oneXTwo: rateOf(rows.map((m) => ({ ok: m.predCorrect }))),
    dc: rateOf(rows.map((m) => ({ ok: m.predDcCorrect }))),
    over: rateOf(rows.map((m) => ({ ok: m.predOverCorrect }))),
    hc: rateOf(rows.map((m) => ({ ok: m.predHcCorrect }))),
    btts: rateOf(rows.map((m) => ({ ok: m.predBttsCorrect }))),
    // AI Strong Pick — 리그별 임계(strong-pick.ts) 이상
    strong: rateOf(
      rows
        .filter(
          (m) =>
            Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0) >= threshold,
        )
        .map((m) => ({ ok: m.predCorrect })),
    ),
  });

  // 롤링 윈도 — 경기 시작 시간 기준 최근 N일, 이미 로드한 배열 인메모리 필터 (신규 쿼리 없음)
  const within = (days: number) => {
    const cutoff = new Date(Date.now() - days * 86400000);
    return all.filter((m) => m.startTime >= cutoff);
  };

  const windows: Record<WindowKey, WindowStat> = {
    all: windowStat(all),
    d30: windowStat(within(WINDOW_DAYS.d30)),
    d14: windowStat(within(WINDOW_DAYS.d14)),
    d7: windowStat(within(WINDOW_DAYS.d7)),
  };

  const recent10 = all.slice(0, 10).map((m) => ({ ok: m.predCorrect }));

  return {
    league,
    isSoccer: ACCURACY_SOCCER.has(league),
    windows,
    oneXTwo: windows.all.oneXTwo,
    dc: windows.all.dc,
    over: windows.all.over,
    hc: windows.all.hc,
    btts: windows.all.btts,
    strong: windows.all.strong,
    recent10: rateOf(recent10),
    rolling7: windows.d7.oneXTwo,
    rolling14: windows.d14.oneXTwo,
    rolling30: windows.d30.oneXTwo,
  };
}
