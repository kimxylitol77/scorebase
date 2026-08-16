// 모델 vs 베팅시장 정면 비교 + 플랫 유닛 ROI 집계 — /predictions/accuracy 전용 단일 출처.
// 같은 표본에서 모델 픽과 시장 favorite 을 나란히 채점하고, 프리매치 평균 배당(vig 포함)에
// 1유닛씩 걸었다는 가정의 후행 수익 시뮬레이션을 계산한다.
import { prisma } from "@/lib/db";
import { ACCURACY_LEAGUES } from "@/lib/predict/accuracy-stats";

export interface HeadToHeadLeagueRow {
  league: string;
  evaluated: number;
  modelCorrect: number;
  marketCorrect: number;
}

export interface HeadToHeadStat {
  /** 모델·시장 확률이 둘 다 있는 채점 완료 경기 — 동일 표본 정면 비교 */
  evaluated: number;
  modelCorrect: number;
  marketCorrect: number;
  /** 모델 픽 ≠ 시장 favorite 인 경기 — 모델이 시장과 다른 편에 선 케이스 */
  disagree: number;
  disagreeModelCorrect: number;
  disagreeMarketCorrect: number;
  leagues: HeadToHeadLeagueRow[];
}

/** 모델 1X2 픽과 시장 implied favorite 을 같은 경기에서 나란히 채점. */
export async function headToHeadStats(): Promise<HeadToHeadStat | null> {
  const ms = await prisma.match.findMany({
    where: {
      league: { in: [...ACCURACY_LEAGUES] },
      predCorrect: { not: null },
      predHome: { not: null },
      marketHome: { not: null },
      marketAway: { not: null },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      league: true,
      predHome: true, predDraw: true, predAway: true,
      marketHome: true, marketDraw: true, marketAway: true,
      homeScore: true, awayScore: true,
    },
  });
  if (ms.length === 0) return null;

  // argmax 인덱스 (0=홈 1=무 2=원정). 무승부 확률이 없는 종목은 null 이 자동 탈락.
  const argmax = (h: number | null, d: number | null, a: number | null) => {
    const arr = [h ?? -1, d ?? -1, a ?? -1];
    return arr.indexOf(Math.max(...arr));
  };

  const byLeague = new Map<string, HeadToHeadLeagueRow>();
  const stat: HeadToHeadStat = {
    evaluated: 0, modelCorrect: 0, marketCorrect: 0,
    disagree: 0, disagreeModelCorrect: 0, disagreeMarketCorrect: 0,
    leagues: [],
  };
  for (const m of ms) {
    const actual = m.homeScore! > m.awayScore! ? 0 : m.homeScore! === m.awayScore! ? 1 : 2;
    const modelPick = argmax(m.predHome, m.predDraw, m.predAway);
    const marketPick = argmax(m.marketHome, m.marketDraw, m.marketAway);
    const modelHit = modelPick === actual;
    const marketHit = marketPick === actual;

    stat.evaluated++;
    if (modelHit) stat.modelCorrect++;
    if (marketHit) stat.marketCorrect++;
    if (modelPick !== marketPick) {
      stat.disagree++;
      if (modelHit) stat.disagreeModelCorrect++;
      if (marketHit) stat.disagreeMarketCorrect++;
    }

    let row = byLeague.get(m.league);
    if (!row) {
      row = { league: m.league, evaluated: 0, modelCorrect: 0, marketCorrect: 0 };
      byLeague.set(m.league, row);
    }
    row.evaluated++;
    if (modelHit) row.modelCorrect++;
    if (marketHit) row.marketCorrect++;
  }
  stat.leagues = [...byLeague.values()].sort((a, b) => b.evaluated - a.evaluated);
  return stat;
}

export interface RoiWindow {
  evaluated: number;
  wins: number;
  /** 1경기 1유닛 기준 누적 손익 (배당 수익 − 원금) */
  units: number;
  /** units / evaluated — 건당 수익률 */
  roi: number;
}

export interface FlatUnitRoiStat {
  model: { all: RoiWindow; d30: RoiWindow };
  /** 기준선 — 매 경기 시장 최저 배당(favorite)에 걸었을 때 */
  marketFav: { all: RoiWindow; d30: RoiWindow };
  /** 표본이 되는 리그 구성 (n 내림차순) — "야구 중심 표본" 투명 표기용 */
  leagues: Array<{ league: string; evaluated: number; units: number; roi: number }>;
}

type RoiRow = {
  league: string;
  starttime: Date;
  predhome: number | null;
  preddraw: number | null;
  predaway: number | null;
  homescore: number;
  awayscore: number;
  homeodds: number;
  drawodds: number | null;
  awayodds: number;
};

/**
 * 플랫 유닛 ROI — 각 경기 시작 전 마지막 OddsSnapshot(북메이커 평균 배당, vig 포함)에
 * 모델의 1X2 픽으로 1유닛을 걸었다는 후행 시뮬레이션. 시장 favorite 베팅이 기준선.
 */
export async function flatUnitRoiStats(): Promise<FlatUnitRoiStat | null> {
  const leagueList = ACCURACY_LEAGUES.map((l) => `'${l}'`).join(",");
  const rows = await prisma.$queryRawUnsafe<RoiRow[]>(`
    SELECT m.league,
           m."startTime" AS starttime,
           m."predHome"  AS predhome,
           m."predDraw"  AS preddraw,
           m."predAway"  AS predaway,
           m."homeScore" AS homescore,
           m."awayScore" AS awayscore,
           o."homeOdds"  AS homeodds,
           o."drawOdds"  AS drawodds,
           o."awayOdds"  AS awayodds
    FROM "Match" m
    JOIN LATERAL (
      SELECT s."homeOdds", s."drawOdds", s."awayOdds"
      FROM "OddsSnapshot" s
      WHERE s."matchId" = m.id AND s."fetchedAt" <= m."startTime"
      ORDER BY s."fetchedAt" DESC
      LIMIT 1
    ) o ON true
    WHERE m."predCorrect" IS NOT NULL
      AND m."predHome" IS NOT NULL
      AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
      AND m.league IN (${leagueList})
  `);
  if (rows.length === 0) return null;

  const mkWindow = (): RoiWindow => ({ evaluated: 0, wins: 0, units: 0, roi: 0 });
  const model = { all: mkWindow(), d30: mkWindow() };
  const marketFav = { all: mkWindow(), d30: mkWindow() };
  const byLeague = new Map<string, { league: string; evaluated: number; units: number; roi: number }>();
  const d30Cut = Date.now() - 30 * 86400_000;

  const settle = (w: RoiWindow, odds: number, won: boolean) => {
    w.evaluated++;
    if (won) { w.wins++; w.units += odds - 1; } else { w.units -= 1; }
  };

  for (const r of rows) {
    // 배당 이상치(수집 오류·서스펜드 라인) 방어 — 표본에서 제외
    const sane = (o: number | null) => o != null && o >= 1.01 && o <= 30;
    if (!sane(r.homeodds) || !sane(r.awayodds)) continue;

    const actual = r.homescore > r.awayscore ? 0 : r.homescore === r.awayscore ? 1 : 2;
    const odds = [r.homeodds, r.drawodds, r.awayodds];

    const pp = [r.predhome ?? -1, r.preddraw ?? -1, r.predaway ?? -1];
    const modelPick = pp.indexOf(Math.max(...pp));
    const modelOdds = odds[modelPick];
    if (!sane(modelOdds)) continue;

    // 시장 favorite = 최저 배당 쪽 (무배당 없으면 홈/원정만)
    const cands = [0, 1, 2].filter((i) => sane(odds[i]));
    const favPick = cands.reduce((best, i) => (odds[i]! < odds[best]! ? i : best), cands[0]);

    const recent = r.starttime.getTime() >= d30Cut;
    settle(model.all, modelOdds!, modelPick === actual);
    settle(marketFav.all, odds[favPick]!, favPick === actual);
    if (recent) {
      settle(model.d30, modelOdds!, modelPick === actual);
      settle(marketFav.d30, odds[favPick]!, favPick === actual);
    }

    let lg = byLeague.get(r.league);
    if (!lg) {
      lg = { league: r.league, evaluated: 0, units: 0, roi: 0 };
      byLeague.set(r.league, lg);
    }
    lg.evaluated++;
    lg.units += modelPick === actual ? modelOdds! - 1 : -1;
  }

  for (const w of [model.all, model.d30, marketFav.all, marketFav.d30]) {
    w.roi = w.evaluated > 0 ? w.units / w.evaluated : 0;
    w.units = +w.units.toFixed(2);
  }
  const leagues = [...byLeague.values()]
    .map((l) => ({ ...l, units: +l.units.toFixed(2), roi: l.evaluated > 0 ? l.units / l.evaluated : 0 }))
    .sort((a, b) => b.evaluated - a.evaluated);

  return model.all.evaluated > 0 ? { model, marketFav, leagues } : null;
}
