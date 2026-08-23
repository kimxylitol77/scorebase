// /en/predictions/accuracy — AI 예측 적중률 보드 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import CiteBox from "@/components/en/CiteBox";
import AccuracyLeagueBoard, {
  type AccuracyLeagueRow,
} from "@/components/en/predictions/AccuracyLeagueBoard";
import CumulativeAccuracyChart, {
  type AccSeriesPoint,
  type AccLeagueMeta,
} from "@/components/en/charts/CumulativeAccuracyChart";
import ReliabilityCurveChart, {
  type RelPoint,
} from "@/components/en/charts/ReliabilityCurveChart";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)
import { ogPageImage } from "@/lib/seo/og";
import {
  statForLeague,
  type MarketRate,
  type LeagueStat,
} from "@/lib/predict/accuracy-stats";
import {
  headToHeadStats,
  flatUnitRoiStats,
  type HeadToHeadStat,
  type FlatUnitRoiStat,
} from "@/lib/predict/model-vs-market";
import { koEnLanguages } from "@/lib/i18n/en";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 3600; // 1시간 ISR

const LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
  "NBA", "NHL", "MLB", "KBO", "NPB", "LOL",
] as const;

const LEAGUE_NAME: Record<string, string> = {
  EPL: "Premier League",
  LALIGA: "LaLiga",
  BUNDESLIGA: "Bundesliga",
  SERIE_A: "Serie A",
  LIGUE_1: "Ligue 1",
  MLS: "MLS",
  UCL: "Champions League",
  UEL: "Europa League",
  UECL: "Conference League",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
  KBO: "KBO",
  NPB: "NPB",
  LOL: "LCK",
};

export const metadata: Metadata = {
  title: "AI Sports Prediction Accuracy — Football, Baseball and Basketball",
  description:
    "The actual hit rate of our predictions, published openly. 1X2, over/under, handicap and BTTS accuracy by league — Premier League, LaLiga, Bundesliga, MLB, NBA, NHL and more — with sample sizes, verified by point-in-time backtest over every finished match.",
  keywords: [
    "AI prediction accuracy", "sports prediction accuracy", "football predictions", "AI win probability",
    "prediction accuracy", "Premier League prediction accuracy", "MLB predictions", "NBA prediction accuracy",
    "Elo-based prediction", "prediction accuracy", "sports AI analysis",
  ],
  alternates: {
    canonical: `${SITE_URL}/en/predictions/accuracy`,
    // 영어판 hreflang 상호 연결
    languages: koEnLanguages("/predictions/accuracy", "/en/predictions/accuracy"),
  },
  openGraph: {
    title: "AI Sports Prediction Accuracy — Scorebase",
    description: "Match prediction accuracy by league and market, published with sample sizes.",
    url: `${SITE_URL}/predictions/accuracy`,
    images: ogPageImage({ title: "AI sports prediction accuracy", subtitle: `${LEAGUES.length} leagues — accuracy by market, with sample sizes`, tag: "accuracy" }),
  },
};

// 집계 로직·타입은 lib/predict/accuracy-stats 로 이동 — /en/predictions/accuracy 와 숫자 단일 출처.

// 롤링 윈도 최소 표본 — 미만이면 수치 대신 "표본 부족" (소표본 왜곡 방지)
const ROLLING_MIN_SAMPLE = 10;

// 누적 적중률 곡선용 리그 색 (LEAGUES 순)
const LEAGUE_COLOR: Record<string, string> = {
  EPL: "#3b82f6", LALIGA: "#ef4444", BUNDESLIGA: "#f59e0b", SERIE_A: "#10b981",
  LIGUE_1: "#8b5cf6", MLS: "#ec4899", UCL: "#6366f1", NBA: "#f97316",
  NHL: "#06b6d4", MLB: "#14b8a6", KBO: "#eab308", NPB: "#a855f7", LOL: "#84cc16",
};

// 시즌 진행률(0~100%) 대비 1X2 누적 적중률 시리즈. 경기 시간순 누적 후 101점으로 리샘플.
// 표본 ≥50 리그만 (적은 표본은 곡선이 출렁여 신뢰 증거로 부적합).
async function cumulativeAccuracySeries(): Promise<{
  points: AccSeriesPoint[];
  leagues: AccLeagueMeta[];
}> {
  const RES = 100; // 0~100% → 101 포인트
  const per = await Promise.all(
    LEAGUES.map(async (lg) => {
      const ms = await prisma.match.findMany({
        where: { league: lg, predCorrect: { not: null } },
        select: { predCorrect: true },
        orderBy: { startTime: "asc" },
      });
      const n = ms.length;
      let correct = 0;
      const cumCorrect = ms.map((m) => {
        if (m.predCorrect) correct++;
        return correct;
      });
      // 초반 표본이 작을 땐 누적값이 0/100% 로 출렁이므로 최소 30경기 이후부터 곡선 시작.
      const minIdx = Math.min(29, Math.max(0, n - 1));
      const resampled = Array.from({ length: RES + 1 }, (_, k) => {
        if (n === 0) return null;
        const i = Math.max(minIdx, Math.round((k / RES) * (n - 1)));
        return (cumCorrect[i] / (i + 1)) * 100;
      });
      return {
        key: lg,
        name: LEAGUE_NAME[lg],
        color: LEAGUE_COLOR[lg] ?? "#737373",
        sample: n,
        finalRate: n > 0 ? (correct / n) * 100 : 0,
        resampled,
      };
    }),
  );
  const eligible = per.filter((l) => l.sample >= 50);
  const points: AccSeriesPoint[] = Array.from({ length: RES + 1 }, (_, k) => {
    const row: AccSeriesPoint = { pct: k };
    for (const l of eligible) {
      const v = l.resampled[k];
      if (v != null) row[l.name] = Number(v.toFixed(1));
    }
    return row;
  });
  return {
    points,
    leagues: eligible.map(({ key, name, color, sample, finalRate }) => ({
      key, name, color, sample, finalRate,
    })),
  };
}

// 캘리브레이션(reliability) — 1X2 예측확률을 10구간으로 묶어 (평균 예측확률 vs 실제 발생률) 산출.
// 모델/시장 둘 다. home/draw/away 결과별 (확률, 발생 0/1) 쌍을 한 풀에 모으는 표준 멀티클래스 방식.
// 무승부 없는 종목은 predDraw 가 비어 자동 제외됨. 구간 표본 5 미만은 노이즈라 버림.
async function reliabilitySeries(): Promise<{
  model: RelPoint[];
  market: RelPoint[];
  modelBrier: number;
  marketBrier: number;
}> {
  const ms = await prisma.match.findMany({
    where: {
      league: { in: [...LEAGUES] },
      predCorrect: { not: null },
      homeScore: { not: null },
      awayScore: { not: null },
      predHome: { not: null },
    },
    select: {
      predHome: true, predDraw: true, predAway: true,
      marketHome: true, marketDraw: true, marketAway: true,
      homeScore: true, awayScore: true,
    },
  });

  const N = 10;
  type Bin = { sumP: number; hits: number; n: number };
  const mk = (): Bin[] => Array.from({ length: N }, () => ({ sumP: 0, hits: 0, n: 0 }));
  const add = (bins: Bin[], p: number, hit: number) => {
    const i = Math.min(N - 1, Math.max(0, Math.floor(p * N)));
    bins[i].sumP += p;
    bins[i].hits += hit;
    bins[i].n++;
  };

  const modelBins = mk();
  const marketBins = mk();
  let brierM = 0, nM = 0, brierK = 0, nK = 0;

  for (const m of ms) {
    const h = m.homeScore!, a = m.awayScore!;
    const act = h > a ? [1, 0, 0] : h === a ? [0, 1, 0] : [0, 0, 1]; // home / draw / away

    const pp = [m.predHome, m.predDraw, m.predAway];
    let bs = 0, used = false;
    for (let k = 0; k < 3; k++) {
      const p = pp[k];
      if (p == null) continue;
      add(modelBins, p, act[k]);
      bs += (p - act[k]) ** 2;
      used = true;
    }
    if (used) { brierM += bs; nM++; }

    const mp = [m.marketHome, m.marketDraw, m.marketAway];
    if (mp.every((p) => p != null)) {
      let mbs = 0;
      for (let k = 0; k < 3; k++) {
        add(marketBins, mp[k]!, act[k]);
        mbs += (mp[k]! - act[k]) ** 2;
      }
      brierK += mbs; nK++;
    }
  }

  const toPts = (bins: Bin[]): RelPoint[] =>
    bins
      .filter((b) => b.n >= 5)
      .map((b) => ({
        x: +((b.sumP / b.n) * 100).toFixed(1),
        y: +((b.hits / b.n) * 100).toFixed(1),
        n: b.n,
        size: Math.sqrt(b.n),
      }));

  return {
    model: toPts(modelBins),
    market: toPts(marketBins),
    modelBrier: nM ? +(brierM / nM).toFixed(4) : 0,
    marketBrier: nK ? +(brierK / nK).toFixed(4) : 0,
  };
}

export default async function AccuracyPage() {
  const [stats, valueBet, accSeries, reliability, headToHead, flatRoi] = await Promise.all([
    Promise.all(LEAGUES.map((lg) => statForLeague(lg))),
    valueBetStats(),
    cumulativeAccuracySeries(),
    reliabilitySeries(),
    headToHeadStats(),
    flatUnitRoiStats(),
  ]);
  const totalEvaluated = stats.reduce((s, x) => s + x.oneXTwo.evaluated, 0);
  const totalCorrect = stats.reduce((s, x) => s + x.oneXTwo.correct, 0);
  const overallRate = totalEvaluated > 0 ? totalCorrect / totalEvaluated : 0;

  // 평가 표본 기간 — 첫 평가 매치 날짜 (표본 투명성: "언제부터 N경기")
  const dateAgg = await prisma.match.aggregate({
    where: { predCorrect: { not: null } },
    _min: { startTime: true },
  });
  const sinceLabel = dateAgg._min.startTime
    ? dateAgg._min.startTime.toLocaleDateString("en-GB", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  // 축구 시장 전체 평균
  const soccerStats = stats.filter((s) => s.isSoccer);
  const dcTotal = soccerStats.reduce((s, x) => s + x.dc.evaluated, 0);
  const dcCorrect = soccerStats.reduce((s, x) => s + x.dc.correct, 0);
  const bttsTotal = soccerStats.reduce((s, x) => s + x.btts.evaluated, 0);
  const bttsCorrect = soccerStats.reduce((s, x) => s + x.btts.correct, 0);

  // OVER/UNDER + 핸디캡 — 모든 종목 합산
  const overTotal = stats.reduce((s, x) => s + x.over.evaluated, 0);
  const overCorrect = stats.reduce((s, x) => s + x.over.correct, 0);
  const hcTotal = stats.reduce((s, x) => s + x.hc.evaluated, 0);
  const hcCorrect = stats.reduce((s, x) => s + x.hc.correct, 0);

  // 롤링 윈도 — 전 리그 합산 1X2 (7/14/30일)
  const sumRolling = (k: "rolling7" | "rolling14" | "rolling30"): MarketRate => {
    const evaluated = stats.reduce((s, x) => s + x[k].evaluated, 0);
    const correct = stats.reduce((s, x) => s + x[k].correct, 0);
    return { evaluated, correct, rate: evaluated > 0 ? correct / evaluated : 0 };
  };
  const rolling7 = sumRolling("rolling7");
  const rolling14 = sumRolling("rolling14");
  const rolling30 = sumRolling("rolling30");

  // 리그별 보드 — 기간별 집계는 이미 statForLeague 가 다 만들어 뒀고, 정렬·필터는 클라이언트에서.
  const boardRows: AccuracyLeagueRow[] = stats.map((s) => ({
    league: s.league,
    name: LEAGUE_NAME[s.league] ?? s.league,
    isSoccer: s.isSoccer,
    windows: s.windows,
  }));

  // 인용 자석 — 블로거·기자가 출처 표기해 가져가기 쉽게 (백링크 유도)
  const citeUrl = `${SITE_URL}/predictions/accuracy`;
  const citeDate = new Date().toLocaleDateString("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const citation = `Scorebase AI Sports Prediction Accuracy — ${LEAGUES.length} leagues ${totalEvaluated.toLocaleString()} matches, 1X2 accuracy ${(overallRate * 100).toFixed(1)}% (source: Scorebase ${citeUrl}, ${citeDate})`;

  // 구조화 데이터 (Dataset) — Google 이 "검증된 고유 데이터셋"으로 인식하게.
  // 실제 적중률 수치를 schema 에 담아 E-E-A-T 신호 강화.
  const accuracyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Scorebase AI sports prediction accuracy",
    description: `Actual hit rate of Elo-based match predictions. ${LEAGUES.length} leagues ${totalEvaluated.toLocaleString()} matches backtested at their point in time — 1X2 accuracy ${(overallRate * 100).toFixed(1)}%, with accuracy by market and league.`,
    url: `${SITE_URL}/predictions/accuracy`,
    keywords: ["AI prediction accuracy", "sports prediction accuracy", "Elo-based prediction"],
    creator: { "@type": "Organization", name: "Scorebase", url: SITE_URL },
    isAccessibleForFree: true,
    measurementTechnique:
      "Point-in-time backtest — Elo, home advantage, MLB starters, NHL goalies and market odds blended",
    variableMeasured: [
      { "@type": "PropertyValue", name: "1X2 accuracy", value: `${(overallRate * 100).toFixed(1)}%` },
      { "@type": "PropertyValue", name: "Sample", value: `${totalEvaluated} matches` },
    ],
  };

  return (
    <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(accuracyJsonLd) }}
      />
      <header className="mb-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> AI prediction accuracy
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep mb-2">
          AI Sports Prediction Accuracy Board
        </h1>
        <p className="text-neutral-600 break-keep dark:text-neutral-400">
          The actual hit rate of match predictions from Elo ratings, home advantage, starters and goalies, blended with market odds.{" "}
          {sinceLabel ? `${sinceLabel}From ` : ""}finished{" "}
          {totalEvaluated.toLocaleString()} matches backtested at their point in time, published unadjusted alongside the sample size.
        </p>
      </header>

      {/* AI Strong Pick — 리그별 고신뢰 임계 초과 픽만의 적중률 (마케팅 강조) */}
      <StrongPickHero stats={stats} overallTotal={totalEvaluated} overallCorrect={totalCorrect} />

      {/* Value Bet — 시장 odds 데이터 있을 때만 */}
      {valueBet && <ValueBetCard data={valueBet} />}

      {/* 전체 시장별 요약 — 5개 카드 */}
      <section className="mb-10 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="Result (1X2)"
          subtitle="Home / Draw / Away"
          rate={overallRate}
          correct={totalCorrect}
          total={totalEvaluated}
          gradient="from-blue-500 to-purple-500"
        />
        <SummaryCard
          label="Double chance"
          subtitle="Football · absorbs the draw"
          rate={dcTotal > 0 ? dcCorrect / dcTotal : 0}
          correct={dcCorrect}
          total={dcTotal}
          gradient="from-emerald-500 to-cyan-500"
        />
        <SummaryCard
          label="OVER/UNDER"
          subtitle="All sports · total points"
          rate={overTotal > 0 ? overCorrect / overTotal : 0}
          correct={overCorrect}
          total={overTotal}
          gradient="from-orange-500 to-red-500"
        />
        <SummaryCard
          label="Handicap"
          subtitle="All sports · margin"
          rate={hcTotal > 0 ? hcCorrect / hcTotal : 0}
          correct={hcCorrect}
          total={hcTotal}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <SummaryCard
          label="BTTS"
          subtitle="Football · both teams to score"
          rate={bttsTotal > 0 ? bttsCorrect / bttsTotal : 0}
          correct={bttsCorrect}
          total={bttsTotal}
          gradient="from-pink-500 to-rose-500"
        />
      </section>

      <p className="mb-8 text-xs text-neutral-500 leading-relaxed">
        Random baselines: 1X2 ≈ 33%, DC/OVER/BTTS ≈ 50%. Figures above those suggest the model is picking up signal.
        This is not betting advice — every number is a retrospective check of a data model.
      </p>

      {/* 롤링 윈도 요약 — 전 리그 합산 최근 7/14/30일 1X2 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Recent accuracy — 7, 14 and 30-day rolling</h2>
        <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
          Separate from the season total — how well the model is reading current form. All leagues combined, 1X2, scored matches only.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RollingCard label="Last 7 days" rate={rolling7} />
          <RollingCard label="Last 14 days" rate={rolling14} />
          <RollingCard label="Last 30 days" rate={rolling30} />
        </div>
      </section>

      {/* 누적 적중률 추이 곡선 — 신뢰 증거 앵커 */}
      {accSeries.leagues.length > 0 && (
        <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
          <h2 className="text-lg font-semibold mb-1">Cumulative accuracy by league</h2>
          <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
            From the season's first match to now — where 1X2 accuracy converges as matches accumulate. A curve that settles as the sample grows indicates consistency.
          </p>
          <CumulativeAccuracyChart data={accSeries.points} leagues={accSeries.leagues} />
        </section>
      )}

      {/* 예측 확률 정직도 — 캘리브레이션 곡선 */}
      {reliability.model.length > 0 && (
        <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
          <h2 className="text-lg font-semibold mb-1">How honest are the probabilities?</h2>
          <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
            When the model says 65%, does it happen 65% of the time? The closer to the diagonal, the more honest the probability — shown next to the market curve for comparison. <strong>A lower Brier score is more accurate</strong>, and the closer the model's score is to the market's, the better calibrated it is (higher than the market means there is room to improve).
          </p>
          <ReliabilityCurveChart
            model={reliability.model}
            market={reliability.market}
            modelBrier={reliability.modelBrier}
            marketBrier={reliability.marketBrier}
          />
        </section>
      )}

      {/* 모델 vs 시장 정면 비교 — 같은 표본에서 나란히 채점 */}
      {headToHead && headToHead.evaluated >= 100 && (
        <HeadToHeadSection data={headToHead} />
      )}

      {/* 플랫 유닛 ROI — 실배당(vig 포함) 후행 시뮬레이션 */}
      {flatRoi && flatRoi.model.all.evaluated >= 100 && <FlatRoiSection data={flatRoi} />}

      {/* 리그별 카드 — 기간 × 시장 교차 필터 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">Accuracy by league and market</h2>
        <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
          Narrow the window to see accuracy per league and market. "How is this market in this league doing lately" tells you more about model health than a single total.
        </p>
        <AccuracyLeagueBoard leagues={boardRows} minSample={ROLLING_MIN_SAMPLE} />
      </section>

      {/* 방법론 박스 */}
      <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
        <h2 className="text-base font-semibold mb-3">How it works</h2>
        <ul className="text-sm text-neutral-600 break-keep dark:text-neutral-400 space-y-2 list-disc pl-5">
          <li>
            Each match uses only data available before it started — no lookahead. Each market draws on different signals, as below.
          </li>
          <li>
            <strong>1X2</strong>: Elo plus league home advantage, MLB starters and NHL goalies, blended with implied odds where available — home/draw/away probabilities, highest selected. Recent form, head-to-head and average goals are reference only, not inputs.
          </li>
          <li>
            <strong>DC (Double Chance)</strong>: the highest of "home or draw", "away or draw" and "home or away". Accuracy rises sharply in football, where the draw is the big variable.
          </li>
          <li>
            <strong>OVER/UNDER</strong>: expected total from both teams' scoring and conceding averages against the sport's line (football 2.5, NBA 220.5, NHL 5.5, MLB 8.5), converted to P(over) via a normal CDF.
          </li>
          <li>
            <strong>Handicap (Asian handicap / spread)</strong>: the chance the favourite wins by more than the sport's line (football -0.5, NBA -5.5, NHL -1.5, MLB -1.5), assuming a normal margin distribution.
          </li>
          <li>
            <strong>BTTS (Both Teams To Score)</strong>: football only. A Poisson model gives each side's chance of scoring at least once.
          </li>
          <li>
            <strong>Strong picks</strong>  = accuracy on matches where the top 1X2 probability met the league's high-confidence threshold (56–75%, recalculated by backtest).
          </li>
          <li>
            <strong>Model vs market</strong>  = on matches where both model and market implied probabilities are stored, each side's highest-probability outcome is treated as its pick and scored over the same sample. Market probabilities have the margin removed from average prices.
          </li>
          <li>
            <strong>Flat-unit return</strong>  = a retrospective simulation staking one unit per match on the model's pick at the last pre-match odds snapshot (average price, margin included). Outlier prices (below 1.01, above 30) are excluded, and backing the shortest price every match is calculated alongside as a baseline.
          </li>
          <li>
            <strong>7, 14 and 30-day rolling</strong>  = scored matches whose kick-off falls in the window (same-day matches may not be scored yet). The all-leagues card is 1X2, and samples below {ROLLING_MIN_SAMPLE} are flagged as thin.
          </li>
          <li>
            <strong>League and market period filter</strong>  = changing the period tab above the league cards recalculates 1X2, DC, over, handicap, BTTS and strong picks from that window alone. Narrower windows mean smaller samples and shakier numbers, so every cell shows hits alongside sample size, and leagues below {ROLLING_MIN_SAMPLE} carry a warning.
          </li>
        </ul>
      </section>

      <CiteBox citation={citation} url={citeUrl} />

      <p className="mt-6 text-xs text-neutral-500 text-center">
        <Link href="/about" className="underline hover:text-neutral-900 dark:hover:text-white">
          Full methodology
        </Link>
        {" · "}
        <Link href="/predictions" className="underline hover:text-neutral-900 dark:hover:text-white">
          Season prediction dashboard
        </Link>
      </p>
    </main>
  );
}

// 정면 비교 리그 행 최소 표본 — 미만은 노이즈라 표에서 제외
const H2H_LEAGUE_MIN = 30;
// ROI 리그 행 최소 표본
const ROI_LEAGUE_MIN = 100;

function HeadToHeadSection({ data }: { data: HeadToHeadStat }) {
  const modelRate = data.modelCorrect / data.evaluated;
  const marketRate = data.marketCorrect / data.evaluated;
  const diff = modelRate - marketRate;
  const rows = data.leagues.filter((l) => l.evaluated >= H2H_LEAGUE_MIN);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const DiffBadge = ({ d }: { d: number }) => (
    <span
      className={`font-bold tabular-nums ${
        d > 0.001
          ? "text-emerald-600 dark:text-emerald-400"
          : d < -0.001
            ? "text-rose-600 dark:text-rose-400"
            : "text-neutral-500"
      }`}
    >
      {d > 0 ? "+" : ""}
      {(d * 100).toFixed(1)}%p
    </span>
  );
  return (
    <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">Model vs market — head to head on the same fixtures</h2>
      <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        The betting market is the most accurate forecaster there is. Across the{" "}
        {data.evaluated.toLocaleString()} matches where both model and market probabilities exist, each pick is scored side by side — including the leagues where the market wins.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500 mb-1">Scorebase model</p>
          <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            {pct(modelRate)}
          </div>
          <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
            {data.modelCorrect.toLocaleString()} / {data.evaluated.toLocaleString()} correct
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500 mb-1">Market (implied favourite)</p>
          <div className="text-3xl font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
            {pct(marketRate)}
          </div>
          <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
            {data.marketCorrect.toLocaleString()} / {data.evaluated.toLocaleString()} correct ·
            model gap <DiffBadge d={diff} />
          </p>
        </div>
      </div>
      {data.disagree >= H2H_LEAGUE_MIN && (
        <p className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200/60 dark:ring-amber-800/40 px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300 break-keep">
          Where the model <strong>disagreed with the market — {data.disagree.toLocaleString()} matches</strong> the model was {(data.disagreeModelCorrect / data.disagree * 100).toFixed(1)}% vs the market's{" "}
          {(data.disagreeMarketCorrect / data.disagree * 100).toFixed(1)}%.
          When they part ways the market is still right more often — the leagues where that flips are where the model has real edge.
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 pr-3 font-semibold">League</th>
                <th className="py-2 pr-3 font-semibold text-right">Sample</th>
                <th className="py-2 pr-3 font-semibold text-right">Model</th>
                <th className="py-2 pr-3 font-semibold text-right">Market</th>
                <th className="py-2 font-semibold text-right">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
              {rows.map((l) => (
                <tr key={l.league}>
                  <td className="py-2 pr-3 font-medium">{LEAGUE_NAME[l.league] ?? l.league}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">
                    {l.evaluated.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {pct(l.modelCorrect / l.evaluated)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-neutral-500">
                    {pct(l.marketCorrect / l.evaluated)}
                  </td>
                  <td className="py-2 text-right">
                    <DiffBadge d={l.modelCorrect / l.evaluated - l.marketCorrect / l.evaluated} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FlatRoiSection({ data }: { data: FlatUnitRoiStat }) {
  const rows = data.leagues.filter((l) => l.evaluated >= ROI_LEAGUE_MIN);
  const edge = data.model.all.roi - data.marketFav.all.roi;
  const roiPct = (r: number) => `${r > 0 ? "+" : ""}${(r * 100).toFixed(1)}%`;
  const unitsFmt = (u: number) => `${u > 0 ? "+" : ""}${u.toFixed(1)}u`;
  const RoiCard = ({ label, sub, w }: { label: string; sub: string; w: { evaluated: number; wins: number; units: number; roi: number } }) => (
    <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5 mb-2">{sub}</p>
      <div
        className={`text-2xl font-bold tabular-nums ${
          w.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"
        }`}
      >
        {roiPct(w.roi)}
      </div>
      <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
        {unitsFmt(w.units)} · {w.wins.toLocaleString()}W / {w.evaluated.toLocaleString()} matches
      </p>
    </div>
  );
  return (
    <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">Flat-unit return — real-odds simulation</h2>
      <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        A retrospective calculation of staking one unit per match on the model's 1X2 pick at the last average bookmaker price before kick-off. Real prices carry a bookmaker margin (about 5%), so <strong>a negative long-run return is the normal expectation</strong>. How much less it loses than the baseline (backing the market favourite every match) is the size of the signal.
        Use that baseline when checking any service claiming profit from AI picks.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <RoiCard label="Model picks · all" sub="1 unit per match" w={data.model.all} />
        <RoiCard label="Model picks · last 30 days" sub="1 unit per match" w={data.model.d30} />
        <RoiCard label="Market favourite · all" sub="Baseline (backing shortest price)" w={data.marketFav.all} />
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500">Model − baseline</p>
          <p className="text-[10px] text-neutral-400 mt-0.5 mb-2">How much less it loses = signal size</p>
          <div
            className={`text-2xl font-bold tabular-nums ${
              edge > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {edge > 0 ? "+" : ""}
            {(edge * 100).toFixed(1)}%p
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">Same sample · same prices</p>
        </div>
      </div>
      {rows.length > 0 && (
        <p className="text-[11px] text-neutral-500 break-keep">
          League mix (sample {ROI_LEAGUE_MIN}+ matches):{" "}
          {rows
            .map(
              (l) =>
                `${LEAGUE_NAME[l.league] ?? l.league} ${l.evaluated.toLocaleString()} matches ${roiPct(l.roi)}`,
            )
            .join(" · ")}
          . Odds collection skews to baseball, so the sample does too; football and basketball are published as they accumulate.
        </p>
      )}
    </section>
  );
}

async function valueBetStats() {
  const all = await prisma.match.findMany({
    where: { isValueBet: true, predCorrect: { not: null } },
    select: { predCorrect: true, valueGap: true, league: true },
  });
  if (all.length === 0) return null;
  const correct = all.filter((m) => m.predCorrect).length;
  const avgGap =
    all.reduce((s, m) => s + (m.valueGap ?? 0), 0) / all.length;
  return {
    total: all.length,
    correct,
    rate: correct / all.length,
    avgGap,
  };
}

function ValueBetCard({
  data,
}: {
  data: { total: number; correct: number; rate: number; avgGap: number };
}) {
  return (
    <section className="mb-8 rounded-2xl border border-emerald-300 dark:border-emerald-700/40 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/30 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>Value bets — more confident than the market</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Accuracy where the model was 5pp+ more confident than the market
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            Only the picks where the model was more confident than the average bookmaker price — did it catch a signal the market missed?
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
            {Math.round(data.rate * 100)}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {data.correct}/{data.total} · average gap{" "}
            <span className="font-bold text-emerald-700 dark:text-emerald-300">
              +{Math.round(data.avgGap * 100)}%p
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function StrongPickHero({
  stats,
  overallTotal,
  overallCorrect,
}: {
  stats: LeagueStat[];
  overallTotal: number;
  overallCorrect: number;
}) {
  const sTotal = stats.reduce((s, x) => s + x.strong.evaluated, 0);
  const sCorrect = stats.reduce((s, x) => s + x.strong.correct, 0);
  const sRate = sTotal > 0 ? sCorrect / sTotal : 0;
  const overallRate = overallTotal > 0 ? overallCorrect / overallTotal : 0;
  const lift = sRate - overallRate;
  if (sTotal < 30) return null;

  // 리그별 Strong 적중률 top 3
  const topLeagues = [...stats]
    .filter((s) => s.strong.evaluated >= 5)
    .sort((a, b) => b.strong.rate - a.strong.rate)
    .slice(0, 3);

  return (
    <section className="mb-8 rounded-2xl border border-amber-300 dark:border-amber-700/40 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/40 dark:via-orange-950/30 dark:to-yellow-950/30 p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">
            <Star className="h-3.5 w-3.5" aria-hidden />
            <span>AI Strong Pick</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Accuracy on high-confidence picks
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            Only matches where the top 1X2 probability cleared the league's high-confidence threshold (56–75%) — where the model saw a clear signal
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            {Math.round(sRate * 100)}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {sCorrect.toLocaleString()} / {sTotal.toLocaleString()} · vs overall average{" "}
            <span className={lift > 0 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold"}>
              {lift > 0 ? "+" : ""}
              {Math.round(lift * 100)}%p
            </span>
          </div>
        </div>
      </div>

      {topLeagues.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-3">
          {topLeagues.map((lg) => (
            <div
              key={lg.league}
              className="rounded-xl bg-white/60 dark:bg-white/[0.06] backdrop-blur px-3 py-2"
            >
              <div className="text-[10px] text-neutral-500 mb-0.5">
                {LEAGUE_NAME[lg.league] ?? lg.league}
              </div>
              <div className="text-lg font-bold tabular-nums">
                {Math.round(lg.strong.rate * 100)}%
              </div>
              <div className="text-[10px] text-neutral-500 tabular-nums">
                {lg.strong.correct}/{lg.strong.evaluated}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryCard({
  label,
  subtitle,
  rate,
  correct,
  total,
  gradient,
}: {
  label: string;
  subtitle: string;
  rate: number;
  correct: number;
  total: number;
  gradient: string;
}) {
  if (total === 0) return null;
  const pct = Math.round(rate * 100);
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06] p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5 mb-3">{subtitle}</p>
      <div className="flex items-baseline gap-2 mb-3">
        <span
          className={`text-4xl font-bold tracking-tight tabular-nums bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full bg-gradient-to-r ${gradient} rounded-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-neutral-500 tabular-nums">
        {correct.toLocaleString()} / {total.toLocaleString()} correct
      </p>
    </div>
  );
}

// 롤링 윈도 카드 — 표본 ROLLING_MIN_SAMPLE 미만이면 수치 대신 "표본 부족" (소표본 왜곡 방지)
function RollingCard({ label, rate }: { label: string; rate: MarketRate }) {
  const pct = Math.round(rate.rate * 100);
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5 mb-3">All leagues · 1X2</p>
      {rate.evaluated < ROLLING_MIN_SAMPLE ? (
        <>
          <div className="text-2xl font-bold text-neutral-400 mb-3">Thin sample</div>
          <p className="text-[11px] text-neutral-500 tabular-nums">
            evaluated {rate.evaluated} ·  {ROLLING_MIN_SAMPLE}+ to display
          </p>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-4xl font-bold tracking-tight tabular-nums bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              {pct}%
            </span>
          </div>
          <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-neutral-500 tabular-nums">
            {rate.correct.toLocaleString()} / {rate.evaluated.toLocaleString()} correct
          </p>
        </>
      )}
    </div>
  );
}

