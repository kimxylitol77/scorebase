// AI 예측 적중률 보드 — 15개 리그 1X2/OU/핸디 실측 + 누적 추이(인용 자석).
import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, Star } from "lucide-react";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import CiteBox from "@/components/CiteBox";
import AccuracyLeagueBoard, {
  type AccuracyLeagueRow,
} from "@/components/predictions/AccuracyLeagueBoard";
import CumulativeAccuracyChart, {
  type AccSeriesPoint,
  type AccLeagueMeta,
} from "@/components/charts/CumulativeAccuracyChart";
import ReliabilityCurveChart, {
  type RelPoint,
} from "@/components/charts/ReliabilityCurveChart";
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
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  UEL: "유로파리그",
  UECL: "유로파 컨퍼런스리그",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
  KBO: "KBO",
  NPB: "NPB",
  LOL: "LCK",
};

export const metadata: Metadata = {
  title: "AI 스포츠 예측 적중률 — 축구·야구·농구 승부예측 정확도 공개",
  description:
    "스코어베이스 AI의 실제 예측 적중률을 투명하게 공개합니다. EPL·라리가·분데스리가·MLB·NBA·NHL 등 리그별 1X2·언더오버·핸디캡·BTTS 적중률과 표본 수를, 종료된 모든 매치의 시점 기반 백테스트로 검증해 보여줍니다.",
  keywords: [
    "AI 예측 적중률", "스포츠 예측 정확도", "축구 승부예측", "AI 승률 예측",
    "예측 적중률", "EPL 예측 적중률", "MLB 예측", "NBA 예측 정확도",
    "Elo 레이팅 예측", "승부예측 정확도", "스포츠 AI 분석",
  ],
  alternates: {
    canonical: `${SITE_URL}/predictions/accuracy`,
    // 영어판 hreflang 상호 연결
    languages: koEnLanguages("/predictions/accuracy", "/en/predictions/accuracy"),
  },
  openGraph: {
    title: "AI 스포츠 예측 적중률 — Scorebase",
    description: "리그별·시장별 AI 매치 예측 적중률을 표본 수와 함께 데이터로 투명 공개.",
    url: `${SITE_URL}/predictions/accuracy`,
    images: ogPageImage({ title: "AI 스포츠 예측 적중률", subtitle: `${LEAGUES.length}개 리그·시장별 적중률을 표본 수와 함께 공개`, tag: "적중률" }),
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
  modelLogLoss: number;
  marketLogLoss: number;
  /** 결과별(홈승/무/원정승) — 모델 최고확률 픽 기준 적중률 */
  outcome: Array<{ label: string; picks: number; hits: number; actual: number }>;
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
  // Log Loss — 실제 결과에 부여한 확률의 -log 평균. 0 확률 가드로 1e-6 클램프.
  let llM = 0, llMn = 0, llK = 0, llKn = 0;
  // 홈/무/원정별 — 모델이 그 결과를 픽했을 때의 적중률 + 실제 발생 수
  const oc = [
    { label: "홈 승", picks: 0, hits: 0, actual: 0 },
    { label: "무승부", picks: 0, hits: 0, actual: 0 },
    { label: "원정 승", picks: 0, hits: 0, actual: 0 },
  ];

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
    const actIdx = act.indexOf(1);
    oc[actIdx].actual++;
    // 모델 픽 = 최고 확률 결과 (null 은 -1 로 제외)
    let best = -1, bestP = -1;
    for (let k = 0; k < 3; k++) { const p = pp[k]; if (p != null && p > bestP) { bestP = p; best = k; } }
    if (best >= 0) { oc[best].picks++; if (best === actIdx) oc[best].hits++; }
    const pAct = pp[actIdx];
    if (pAct != null) { llM += -Math.log(Math.max(1e-6, pAct)); llMn++; }

    const mp = [m.marketHome, m.marketDraw, m.marketAway];
    if (mp.every((p) => p != null)) {
      let mbs = 0;
      for (let k = 0; k < 3; k++) {
        add(marketBins, mp[k]!, act[k]);
        mbs += (mp[k]! - act[k]) ** 2;
      }
      brierK += mbs; nK++;
      const mAct = mp[act.indexOf(1)];
      if (mAct != null) { llK += -Math.log(Math.max(1e-6, mAct)); llKn++; }
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
    modelLogLoss: llMn ? +(llM / llMn).toFixed(4) : 0,
    marketLogLoss: llKn ? +(llK / llKn).toFixed(4) : 0,
    outcome: oc,
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
    ? dateAgg._min.startTime.toLocaleDateString("ko-KR", {
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
  const citeDate = new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const citation = `Scorebase AI 스포츠 예측 적중률 — ${LEAGUES.length}개 리그 ${totalEvaluated.toLocaleString()}경기 1X2 적중률 ${(overallRate * 100).toFixed(1)}% (출처: Scorebase ${citeUrl}, ${citeDate} 기준)`;

  // 구조화 데이터 (Dataset) — Google 이 "검증된 고유 데이터셋"으로 인식하게.
  // 실제 적중률 수치를 schema 에 담아 E-E-A-T 신호 강화.
  const accuracyJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "스코어베이스 AI 스포츠 예측 적중률",
    description: `Elo 레이팅 기반 AI 매치 예측의 실제 적중률. ${LEAGUES.length}개 리그 ${totalEvaluated.toLocaleString()}경기를 종료 후 시점 기준으로 백테스트하여 1X2 적중률 ${(overallRate * 100).toFixed(1)}% 등 시장별·리그별 정확도를 공개합니다.`,
    url: `${SITE_URL}/predictions/accuracy`,
    keywords: ["AI 예측 적중률", "스포츠 승부예측 정확도", "Elo 레이팅 예측"],
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
    measurementTechnique:
      "Elo 레이팅 + 홈 어드밴티지 + 선발(MLB)/골리(NHL) + 시장 배당 블렌드 시점 백테스트",
    variableMeasured: [
      { "@type": "PropertyValue", name: "1X2 적중률", value: `${(overallRate * 100).toFixed(1)}%` },
      { "@type": "PropertyValue", name: "평가 표본", value: `${totalEvaluated}경기` },
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
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> AI 예측 적중률
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep mb-2">
          AI 스포츠 예측 적중률 보드
        </h1>
        <p className="text-neutral-600 break-keep dark:text-neutral-400">
          Elo 레이팅 + 홈 어드밴티지 + 선발/골리 + 시장 배당 블렌드 기반 매치 결과
          예측의 실제 적중률입니다.{" "}
          {sinceLabel ? `${sinceLabel}부터 ` : ""}종료된{" "}
          {totalEvaluated.toLocaleString()}경기를 시점 기준으로 백테스트하여
          산출하며, 수치를 보정 없이 표본 수와 함께 그대로 공개합니다.
        </p>
      </header>

      {/* AI Strong Pick — 리그별 고신뢰 임계 초과 픽만의 적중률 (마케팅 강조) */}
      <StrongPickHero stats={stats} overallTotal={totalEvaluated} overallCorrect={totalCorrect} />

      {/* Value Bet — 시장 odds 데이터 있을 때만 */}
      {valueBet && <ValueBetCard data={valueBet} />}

      {/* 전체 시장별 요약 — 5개 카드 */}
      <section className="mb-10 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <SummaryCard
          label="결과 (1X2)"
          subtitle="홈 / 무 / 원정"
          rate={overallRate}
          correct={totalCorrect}
          total={totalEvaluated}
          gradient="from-blue-500 to-purple-500"
        />
        <SummaryCard
          label="더블 찬스"
          subtitle="축구 · 무 흡수"
          rate={dcTotal > 0 ? dcCorrect / dcTotal : 0}
          correct={dcCorrect}
          total={dcTotal}
          gradient="from-emerald-500 to-cyan-500"
        />
        <SummaryCard
          label="OVER/UNDER"
          subtitle="모든 종목 · 총득점"
          rate={overTotal > 0 ? overCorrect / overTotal : 0}
          correct={overCorrect}
          total={overTotal}
          gradient="from-orange-500 to-red-500"
        />
        <SummaryCard
          label="핸디캡"
          subtitle="모든 종목 · 마진"
          rate={hcTotal > 0 ? hcCorrect / hcTotal : 0}
          correct={hcCorrect}
          total={hcTotal}
          gradient="from-violet-500 to-fuchsia-500"
        />
        <SummaryCard
          label="BTTS"
          subtitle="축구 · 양 팀 득점"
          rate={bttsTotal > 0 ? bttsCorrect / bttsTotal : 0}
          correct={bttsCorrect}
          total={bttsTotal}
          gradient="from-pink-500 to-rose-500"
        />
      </section>

      <p className="mb-8 text-xs text-neutral-500 leading-relaxed">
        무작위 baseline: 1X2 ≈ 33%, DC/OVER/BTTS ≈ 50%. 위 수치가 그보다 높을수록
        모델이 통계적 신호를 잡고 있다고 해석할 수 있습니다. 도박·베팅 권유는 아니며,
        모든 수치는 데이터 모델의 후행 검증 결과입니다.
      </p>

      {/* 롤링 윈도 요약 — 전 리그 합산 최근 7/14/30일 1X2 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">최근 적중률 — 7·14·30일 롤링</h2>
        <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
          시즌 누적과 별도로, 최근 기간 창에서 모델이 지금 흐름을 얼마나 맞히고
          있는지 봅니다. 전 리그 합산 1X2 · 채점 완료 경기 기준.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RollingCard label="최근 7일" rate={rolling7} />
          <RollingCard label="최근 14일" rate={rolling14} />
          <RollingCard label="최근 30일" rate={rolling30} />
        </div>
      </section>

      {/* 누적 적중률 추이 곡선 — 신뢰 증거 앵커 */}
      {accSeries.leagues.length > 0 && (
        <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
          <h2 className="text-lg font-semibold mb-1">리그별 누적 적중률 추이</h2>
          <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
            시즌 첫 경기부터 현재까지, 경기가 쌓일수록 1X2 적중률이 어디로 수렴하는지
            보여줍니다. 표본이 커질수록 안정되는 곡선이 모델의 일관성을 뜻합니다.
          </p>
          <CumulativeAccuracyChart data={accSeries.points} leagues={accSeries.leagues} />
        </section>
      )}

      {/* 예측 확률 정직도 — 캘리브레이션 곡선 */}
      {reliability.model.length > 0 && (
        <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
          <h2 className="text-lg font-semibold mb-1">예측 확률은 얼마나 정직한가</h2>
          <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
            모델이 &ldquo;65% 승리&rdquo;라고 말한 경기가 실제로 그만큼 일어났는지를 봅니다. 점이
            대각선에 가까울수록 확률이 정직하다는 뜻이며, 베팅시장 곡선과 나란히 둬 시장만큼
            잘 보정됐는지 비교합니다. <strong>Brier 점수는 낮을수록 정확</strong>하며, 모델 값이
            시장 값에 가까울수록 시장 수준으로 잘 보정된 것입니다(모델이 시장보다 높으면 보정 여지가 있다는 뜻).
          </p>
          <ReliabilityCurveChart
            model={reliability.model}
            market={reliability.market}
            modelBrier={reliability.modelBrier}
            marketBrier={reliability.marketBrier}
          />

          {/* Log Loss + 홈/무/원정별 적중률 (2026-08-27, 리뷰 §8) */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">
                Log Loss <span className="normal-case font-normal">(낮을수록 정확 — 자신 있게 틀리면 크게 벌점)</span>
              </div>
              <div className="flex items-baseline gap-4 tabular-nums">
                <span className="text-xl font-bold">{reliability.modelLogLoss.toFixed(3)}<span className="ml-1 text-xs font-medium text-neutral-500">모델</span></span>
                <span className="text-xl font-bold text-neutral-500">{reliability.marketLogLoss.toFixed(3)}<span className="ml-1 text-xs font-medium text-neutral-500">시장</span></span>
              </div>
            </div>
            <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                홈/무/원정별 — 모델이 그쪽을 픽했을 때 적중률
              </div>
              <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                {reliability.outcome.map((o) => (
                  <div key={o.label}>
                    <div className="text-[11px] text-neutral-500">{o.label}</div>
                    <div className="text-lg font-bold">{o.picks > 0 ? `${Math.round((o.hits / o.picks) * 100)}%` : "—"}</div>
                    <div className="text-[10px] text-neutral-400">{o.hits}/{o.picks}픽 · 실제 {o.actual}회</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
        <h2 className="text-lg font-semibold mb-1">리그별 · 시장별 적중률</h2>
        <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
          기간을 좁혀 리그별 시장 적중률을 볼 수 있습니다. 총합 하나보다 &ldquo;이
          리그의 이 시장이 최근에 어떤가&rdquo;가 모델 상태를 더 정확히 보여줍니다.
        </p>
        <AccuracyLeagueBoard leagues={boardRows} minSample={ROLLING_MIN_SAMPLE} />
      </section>

      {/* 방법론 박스 */}
      <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6">
        <h2 className="text-base font-semibold mb-3">계산 방법</h2>
        <ul className="text-sm text-neutral-600 break-keep dark:text-neutral-400 space-y-2 list-disc pl-5">
          <li>
            각 매치 시점 기준으로 그 이전까지의 데이터만 사용합니다 — 미래 데이터
            오염 없음. 마켓마다 쓰는 신호가 다릅니다 (아래 참고).
          </li>
          <li>
            <strong>1X2</strong>: Elo 레이팅 + 리그별 홈 어드밴티지 + 선발
            투수(MLB)·골리(NHL) + 시장 배당이 있을 때 implied 확률과 블렌드 —
            홈/무/원정 확률을 산출해 가장 높은 쪽 선택. 최근 폼·상대 전적(H2H)·평균
            득실점은 1X2 확률 계산에 직접 들어가지 않는 참고 지표입니다.
          </li>
          <li>
            <strong>DC (Double Chance)</strong>: &quot;홈 승 또는 무&quot; /
            &quot;원정 승 또는 무&quot; / &quot;홈 승 또는 원정 승&quot; 중 가장
            높은 합 선택. 무승부 변수가 큰
            축구에서 정확도가 크게 올라갑니다.
          </li>
          <li>
            <strong>OVER/UNDER</strong>: 종목별 기준선 (축구 2.5골 · NBA 220.5점
            · NHL 5.5골 · MLB 8.5점) 기준으로 양 팀 평균 득/실점에서 기대
            총득점을 추정 → Normal CDF 로 P(OVER) 산출.
          </li>
          <li>
            <strong>핸디캡 (Asian Handicap / Spread)</strong>: 종목별 line (축구
            -0.5 · NBA -5.5 · NHL -1.5 · MLB -1.5) 으로 강팀이 그 차이 이상으로
            이길 확률. 마진의 Normal 분포 가정.
          </li>
          <li>
            <strong>BTTS (Both Teams To Score)</strong>: 축구 전용. Poisson 으로
            양 팀이 각각 한 골 이상 기록할 확률 산출 (P(0골) 보수).
          </li>
          <li>
            <strong>강한 예측</strong> = 1X2 가장 높은 확률이 리그별 고신뢰 임계(56~75%, 백테스트 재산정) 이상인 매치만의
            적중률.
          </li>
          <li>
            <strong>모델 vs 시장 정면 비교</strong> = 모델 확률과 시장 implied
            확률이 둘 다 저장된 경기에서, 각각 가장 높은 확률 쪽을 픽으로 보고
            동일 표본을 나란히 채점. 시장 확률은 베팅사이트 평균 배당에서 마진을
            제거한 값입니다.
          </li>
          <li>
            <strong>플랫 유닛 수익률</strong> = 경기 시작 전 마지막 배당
            스냅샷(북메이커 평균, 마진 포함)에 모델 픽으로 1유닛씩 건 후행
            시뮬레이션. 이상 배당(1.01 미만·30 초과)은 표본에서 제외하며, 매 경기
            최저 배당에 거는 시장 favorite 전략을 기준선으로 함께 계산합니다.
          </li>
          <li>
            <strong>최근 7·14·30일 롤링</strong> = 경기 시작 시간이 해당 기간에
            드는 채점 완료 경기 기준 (당일 경기는 채점 전이라 제외될 수 있음).
            전 리그 합산 카드는 1X2 기준이며, 표본 {ROLLING_MIN_SAMPLE}건 미만은
            표본 부족으로 표시합니다.
          </li>
          <li>
            <strong>리그별·시장별 기간 필터</strong> = 리그 카드 위 기간 탭을
            바꾸면 1X2뿐 아니라 DC·OVER·핸디·BTTS·Strong 이 모두 그 기간 경기만으로
            다시 계산됩니다. 기간을 좁힐수록 표본이 줄어 수치가 흔들리므로,
            모든 칸에 적중/표본을 함께 적고 {ROLLING_MIN_SAMPLE}건 미만 리그에는
            경고를 답니다.
          </li>
        </ul>
      </section>

      <CiteBox citation={citation} url={citeUrl} />

      <p className="mt-6 text-xs text-neutral-500 text-center">
        <Link href="/about" className="underline hover:text-neutral-900 dark:hover:text-white">
          전체 방법론
        </Link>
        {" · "}
        <Link href="/predictions" className="underline hover:text-neutral-900 dark:hover:text-white">
          시즌 예측 대시보드
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
      <h2 className="text-lg font-semibold mb-1">모델 vs 베팅시장 — 같은 경기 정면 비교</h2>
      <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        베팅시장은 세계에서 가장 정확한 예측기입니다. 모델과 시장 확률이 둘 다 있는{" "}
        {data.evaluated.toLocaleString()}경기에서 각각의 픽을 나란히 채점했습니다 —
        시장이 이기는 리그도 숨기지 않고 그대로 공개합니다.
      </p>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500 mb-1">스코어베이스 모델</p>
          <div className="text-3xl font-bold tabular-nums bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
            {pct(modelRate)}
          </div>
          <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
            {data.modelCorrect.toLocaleString()} / {data.evaluated.toLocaleString()} 적중
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500 mb-1">베팅시장 (implied favorite)</p>
          <div className="text-3xl font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
            {pct(marketRate)}
          </div>
          <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
            {data.marketCorrect.toLocaleString()} / {data.evaluated.toLocaleString()} 적중 ·
            모델 격차 <DiffBadge d={diff} />
          </p>
        </div>
      </div>
      {data.disagree >= H2H_LEAGUE_MIN && (
        <p className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200/60 dark:ring-amber-800/40 px-4 py-3 text-xs text-neutral-700 dark:text-neutral-300 break-keep">
          모델이 시장과 <strong>다른 편에 선 {data.disagree.toLocaleString()}경기</strong>에선
          모델 {(data.disagreeModelCorrect / data.disagree * 100).toFixed(1)}% vs 시장{" "}
          {(data.disagreeMarketCorrect / data.disagree * 100).toFixed(1)}% 였습니다.
          시장과 갈라설 때는 아직 시장이 더 자주 옳습니다 — 이 수치가 역전되는 리그부터
          모델의 진짜 엣지입니다.
        </p>
      )}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 pr-3 font-semibold">리그</th>
                <th className="py-2 pr-3 font-semibold text-right">표본</th>
                <th className="py-2 pr-3 font-semibold text-right">모델</th>
                <th className="py-2 pr-3 font-semibold text-right">시장</th>
                <th className="py-2 font-semibold text-right">격차</th>
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
        {unitsFmt(w.units)} · {w.wins.toLocaleString()}승 / {w.evaluated.toLocaleString()}경기
      </p>
    </div>
  );
  return (
    <section className="mb-10 rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6">
      <h2 className="text-lg font-semibold mb-1">플랫 유닛 수익률 — 실배당 시뮬레이션</h2>
      <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        경기 시작 전 마지막 북메이커 평균 배당에 모델의 1X2 픽으로 매 경기 1유닛을
        걸었다면 어땠을지를 후행 계산한 값입니다. 실제 배당에는 북메이커 마진(약 5%)이
        포함되므로 <strong>장기 수익률은 마이너스가 정상 기대치</strong>이며, 비교
        기준선(매 경기 시장 favorite 베팅) 대비 얼마나 덜 잃는지가 모델 신호의 크기입니다.
        &ldquo;AI 픽으로 수익&rdquo;을 주장하는 서비스를 검증할 때 이 기준선을 쓰세요.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <RoiCard label="모델 픽 · 전체" sub="1경기 1유닛" w={data.model.all} />
        <RoiCard label="모델 픽 · 최근 30일" sub="1경기 1유닛" w={data.model.d30} />
        <RoiCard label="시장 favorite · 전체" sub="기준선 (최저 배당 베팅)" w={data.marketFav.all} />
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-500">모델 − 기준선</p>
          <p className="text-[10px] text-neutral-400 mt-0.5 mb-2">덜 잃는 정도 = 신호 크기</p>
          <div
            className={`text-2xl font-bold tabular-nums ${
              edge > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {edge > 0 ? "+" : ""}
            {(edge * 100).toFixed(1)}%p
          </div>
          <p className="text-[11px] text-neutral-500 mt-1">동일 표본 · 동일 배당 기준</p>
        </div>
      </div>
      {rows.length > 0 && (
        <p className="text-[11px] text-neutral-500 break-keep">
          리그 구성 (표본 {ROI_LEAGUE_MIN}경기 이상):{" "}
          {rows
            .map(
              (l) =>
                `${LEAGUE_NAME[l.league] ?? l.league} ${l.evaluated.toLocaleString()}경기 ${roiPct(l.roi)}`,
            )
            .join(" · ")}
          . 배당 수집이 야구 중심이라 표본이 야구에 치우쳐 있으며, 축구·농구 표본은
          쌓이는 대로 함께 공개합니다.
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
            <span>Value Bet · 시장보다 자신 있는 픽</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            AI 모델이 시장보다 5%p+ 자신 있던 매치 적중률
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            베팅사이트 평균 odds 대비 우리 모델이 더 자신 있게 찍은 결과만
            추려본 통계 — 시장이 놓친 신호를 모델이 잡았는가
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
            {Math.round(data.rate * 100)}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {data.correct}/{data.total} · 평균 차이{" "}
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
            모델이 자신 있게 찍은 경기 적중률
          </h2>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            1X2 가장 높은 확률이 리그별 고신뢰 임계(56~75%)를 넘긴 매치만 — 모델이 명확한 신호를 잡은
            경기들
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl sm:text-6xl font-black tracking-tight tabular-nums bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
            {Math.round(sRate * 100)}%
          </div>
          <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
            {sCorrect.toLocaleString()} / {sTotal.toLocaleString()} · 전체 평균 대비{" "}
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
        {correct.toLocaleString()} / {total.toLocaleString()} 적중
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
      <p className="text-[10px] text-neutral-400 mt-0.5 mb-3">전 리그 합산 · 1X2</p>
      {rate.evaluated < ROLLING_MIN_SAMPLE ? (
        <>
          <div className="text-2xl font-bold text-neutral-400 mb-3">표본 부족</div>
          <p className="text-[11px] text-neutral-500 tabular-nums">
            평가 {rate.evaluated}건 · {ROLLING_MIN_SAMPLE}건부터 표시
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
            {rate.correct.toLocaleString()} / {rate.evaluated.toLocaleString()} 적중
          </p>
        </>
      )}
    </div>
  );
}

