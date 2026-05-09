import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import LeagueBadge from "@/components/LeagueBadge";

export const revalidate = 3600; // 1시간 ISR

const LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
  "NBA", "NHL", "MLB",
] as const;

const LEAGUE_NAME: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
};

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "AI 적중률 — 리그별 예측 정확도",
  description:
    "스코어베이스 AI 가 Elo 레이팅 기반으로 추정한 매치 결과의 적중률. EPL · 라리가 · 분데스리가 · NBA · MLB · NHL 등 리그별 예측 정확도와 표본 수를 데이터로 공개합니다.",
  alternates: { canonical: `${SITE_URL}/predictions/accuracy` },
  openGraph: {
    title: "AI 적중률 보드 — Scorebase",
    description: "리그별 AI 매치 예측 적중률을 데이터로 공개",
    url: `${SITE_URL}/predictions/accuracy`,
  },
};

interface LeagueStat {
  league: string;
  evaluated: number;
  correct: number;
  rate: number;
  highConfidence: { evaluated: number; correct: number; rate: number };
  recent10: { evaluated: number; correct: number; rate: number };
}

async function statForLeague(league: string): Promise<LeagueStat> {
  const all = await prisma.match.findMany({
    where: { league, predCorrect: { not: null } },
    select: { predCorrect: true, predHome: true, predDraw: true, predAway: true, startTime: true },
    orderBy: { startTime: "desc" },
  });
  const evaluated = all.length;
  const correct = all.filter((m) => m.predCorrect).length;

  // 신뢰도 가중 — 가장 높은 확률이 60% 이상인 예측만
  const highConf = all.filter((m) => {
    const top = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
    return top >= 0.6;
  });
  const hcCorrect = highConf.filter((m) => m.predCorrect).length;

  // 최근 10경기
  const recent = all.slice(0, 10);
  const rCorrect = recent.filter((m) => m.predCorrect).length;

  return {
    league,
    evaluated,
    correct,
    rate: evaluated > 0 ? correct / evaluated : 0,
    highConfidence: {
      evaluated: highConf.length,
      correct: hcCorrect,
      rate: highConf.length > 0 ? hcCorrect / highConf.length : 0,
    },
    recent10: {
      evaluated: recent.length,
      correct: rCorrect,
      rate: recent.length > 0 ? rCorrect / recent.length : 0,
    },
  };
}

export default async function AccuracyPage() {
  const stats = await Promise.all(LEAGUES.map((lg) => statForLeague(lg)));
  const totalEvaluated = stats.reduce((s, x) => s + x.evaluated, 0);
  const totalCorrect = stats.reduce((s, x) => s + x.correct, 0);
  const overallRate = totalEvaluated > 0 ? totalCorrect / totalEvaluated : 0;

  // 정렬 — 적중률 높은 순
  const sorted = [...stats]
    .filter((s) => s.evaluated > 0)
    .sort((a, b) => b.rate - a.rate);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
      <header className="mb-10">
        <p className="text-sm text-neutral-500 mb-2">데이터 분석</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          AI 적중률 보드
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Elo 레이팅 + 홈 어드밴티지 + 최근 폼 기반 매치 결과 예측의 실제
          적중률입니다. 종료된 모든 매치를 시점 기준으로 백테스트하여 산출.
        </p>
      </header>

      {/* 전체 요약 */}
      <section className="mb-10 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-neutral-900 dark:to-neutral-950 p-6 sm:p-8">
        <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
          전체 평균
        </p>
        <div className="flex items-baseline gap-4">
          <span className="text-5xl sm:text-6xl font-bold tracking-tight tabular-nums bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
            {Math.round(overallRate * 100)}%
          </span>
          <span className="text-sm text-neutral-500">
            {totalCorrect.toLocaleString()} / {totalEvaluated.toLocaleString()} 경기 적중
          </span>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          무작위 선택 시 기대 적중률 약 33% (3-way) ~ 50% (2-way). 위 수치가
          그보다 높을수록 모델이 신호를 잡고 있다고 해석할 수 있습니다.
        </p>
      </section>

      {/* 리그별 카드 */}
      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-4">리그별 적중률</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((s) => (
            <LeagueCard key={s.league} stat={s} />
          ))}
        </div>
        {stats.some((s) => s.evaluated === 0) && (
          <p className="mt-4 text-xs text-neutral-500">
            데이터 부족 리그는 표시 생략됨 (백테스트 평가 매치 0건).
          </p>
        )}
      </section>

      {/* 방법론 박스 */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6">
        <h2 className="text-base font-semibold mb-3">계산 방법</h2>
        <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-2 list-disc pl-5">
          <li>
            각 매치 시점 기준으로 그 이전까지의 데이터(Elo, 폼, 홈/원정 split,
            상대 전적)만 사용해 승·무·패 확률을 추정합니다.
          </li>
          <li>
            가장 높은 확률의 결과(홈 승 / 무 / 원정 승)를 예측값으로 잡고
            실제 결과와 비교합니다.
          </li>
          <li>
            <strong>강한 예측</strong> = 가장 높은 확률이 60% 이상인 매치만.
            모델이 자신 있게 찍은 경기의 적중률입니다.
          </li>
          <li>
            <strong>최근 10경기</strong> = 가장 최근에 끝난 10경기 기준 적중률.
            모델이 현재 시즌 흐름을 잘 따라가고 있는지 가늠.
          </li>
        </ul>
      </section>

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

function LeagueCard({ stat }: { stat: LeagueStat }) {
  const pct = Math.round(stat.rate * 100);
  return (
    <Link
      href={`/leagues/${stat.league}`}
      className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LeagueBadge league={stat.league} />
          <span className="text-sm font-semibold">
            {LEAGUE_NAME[stat.league] ?? stat.league}
          </span>
        </div>
        <span className="text-2xl font-bold tabular-nums">
          {pct}
          <span className="text-sm text-neutral-500">%</span>
        </span>
      </div>

      {/* 막대 */}
      <div className="h-1.5 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 보조 지표 */}
      <div className="grid grid-cols-3 gap-2 text-[11px] text-neutral-500">
        <div>
          <div className="text-neutral-400">표본</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {stat.correct}/{stat.evaluated}
          </div>
        </div>
        <div>
          <div className="text-neutral-400">강한 예측</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {stat.highConfidence.evaluated > 0
              ? `${Math.round(stat.highConfidence.rate * 100)}%`
              : "—"}
          </div>
        </div>
        <div>
          <div className="text-neutral-400">최근 10</div>
          <div className="font-mono text-neutral-700 dark:text-neutral-300">
            {stat.recent10.evaluated > 0
              ? `${Math.round(stat.recent10.rate * 100)}%`
              : "—"}
          </div>
        </div>
      </div>
    </Link>
  );
}
