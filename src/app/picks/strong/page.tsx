// /picks/strong — 모델이 자신 있어 하는 픽만 모아 보는 회원 전용 화면.
// 비회원은 기준·성적과 오늘 몇 건인지까지 보고, 실제 픽은 가입 후 (/lab 과 같은 방침).
// 지난 날짜의 픽과 그 채점 결과도 회원에게만 공개한다(2026-08-04 사용자 확정).
import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Target, TrendingUp } from "lucide-react";
import { getCurrentUserId } from "@/lib/current-user";
import AmbientGlow from "@/components/AmbientGlow";
import { MARKET_LABEL, STRONG_THRESHOLD, type StrongMarket } from "@/lib/predict/strong-picks";
import {
  loadStrongPicks,
  loadStrongAccuracy,
  loadUnanimousAccuracy,
  loadDailySummary,
  todayKst,
  type StrongAccuracy,
  type MarketAccuracy,
  type StrongPickMatch,
} from "./_data";
import { DailyNavChart, PickCard } from "./_components";

export const dynamic = "force-dynamic"; // 회원 여부에 따라 갈리는 화면

export const metadata: Metadata = {
  title: "고확신 픽 — AI가 자신 있어 하는 경기만",
  description:
    "전 경기를 다 찍지 않고, 우리 모델이 기준 이상으로 자신 있어 하는 픽만 골라 보여줍니다. 마켓별 임계는 과거 11,611경기 실측으로 정했습니다.",
  alternates: { canonical: "https://www.scorebase.kr/picks/strong" },
};

const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function StrongPicksPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const sp = await searchParams;
  const today = todayKst();
  // 미래 날짜를 넘겨 결과를 넘겨짚지 않도록 오늘까지만 받는다
  const date = isDate(sp.d) && sp.d <= today ? sp.d : null;

  // 날짜별 성적은 회원 화면에서만 쓰므로 비회원일 땐 쿼리를 아낀다
  const userId = await getCurrentUserId();
  const [matches, acc, unan, daily] = await Promise.all([
    loadStrongPicks(date ?? undefined),
    loadStrongAccuracy(),
    loadUnanimousAccuracy(),
    userId ? loadDailySummary() : Promise.resolve([]),
  ]);
  const pickCount = matches.reduce((s, m) => s + m.picks.length, 0);

  return (
    <main className="relative mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <Target className="h-3 w-3" aria-hidden /> 고확신 픽
        </span>
        <h1 className="text-3xl font-bold tracking-tight break-keep sm:text-4xl">
          AI가 자신 있어 하는 경기만
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-500 break-keep">
          모든 경기를 다 찍으면 적중률이 내려갑니다. 여기서는 우리 모델이 마켓별 기준 이상으로
          확신할 때만 픽을 냅니다. 기준은 과거 {acc.total.toLocaleString()}건 실측으로 정했고,
          그 성적은 아래에 그대로 공개합니다.
        </p>
      </header>

      <Standard acc={acc} unan={unan} />

      <div className="mt-6">
        {userId ? (
          <div className="space-y-4">
            <DailyNavChart days={daily} active={date} />
            <PickList matches={matches} acc={acc} date={date} />
          </div>
        ) : (
          <GuestGate matchCount={matches.length} pickCount={pickCount} />
        )}
      </div>

      <footer className="mt-10 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
          통계 모델 기반 참고용 정보이며 도박·베팅과 무관합니다. 리그별 전체 성적은{" "}
          <Link href="/predictions/accuracy" className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-white/70">
            적중률 보드
          </Link>
          에서 공개합니다.
        </p>
      </footer>
    </main>
  );
}

// ── 기준과 성적 — 회원·비회원 모두 공개. 신뢰의 근거라 가리지 않는다 ──
function Standard({ acc, unan }: { acc: StrongAccuracy; unan: MarketAccuracy }) {
  return (
    <section className="mt-6 rounded-2xl border border-black/5 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden />
        <span className="text-2xl font-bold tabular-nums">{acc.rate.toFixed(1)}%</span>
        <span className="text-xs text-neutral-500">
          이 기준으로 낸 {acc.total.toLocaleString()}픽의 실제 적중률
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {(Object.keys(STRONG_THRESHOLD) as StrongMarket[]).map((mk) => {
          const m = acc.byMarket[mk];
          return (
            <div key={mk} className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <dt className="text-neutral-500">{MARKET_LABEL[mk]}</dt>
              <dd className="font-semibold tabular-nums">
                {(STRONG_THRESHOLD[mk] * 100).toFixed(0)}% 이상일 때만
              </dd>
              {/* 임계 옆에 그 임계의 실제 성적을 붙인다 — 기준의 근거가 곧 성적이라서 */}
              <dd className="mt-1.5">
                <div className="h-1 w-full overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/10">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.rate}%` }} />
                </div>
                <span className="mt-1 block text-[10px] tabular-nums text-neutral-500">
                  실측 {m.rate.toFixed(1)}% · {m.total.toLocaleString()}픽
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      {unan.total > 0 && (
        <p className="mt-3 rounded-xl bg-violet-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-neutral-600 break-keep dark:text-neutral-300">
          <span className="font-semibold text-violet-600 dark:text-violet-300">AI 전원 동의</span> 배지는
          예측 AI 3개 이상이 우리 모델과 같은 쪽을 골랐다는 뜻입니다. 이 조건을 함께 만족한 픽의 실측
          적중률은 <span className="font-bold tabular-nums">{unan.rate.toFixed(1)}%</span>({unan.total.toLocaleString()}픽)
          입니다 — 고확신 기준만 적용했을 때보다 조금 높습니다. 다만 고확신 픽 대부분이 이미 만장일치라
          차이는 크지 않고, 배지가 없다고 나쁜 픽인 것도 아닙니다.
        </p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 break-keep">
        양팀득점은 뺐습니다 — 실측에서 확신도를 올릴수록 오히려 적중률이 떨어져(65%+ 55.2% →
        80%+ 42.9%) 신뢰 신호로 쓸 수 없었습니다.
      </p>
    </section>
  );
}

// ── 회원 — 실제 픽 목록 ──
function PickList({
  matches,
  acc,
  date,
}: {
  matches: StrongPickMatch[];
  acc: StrongAccuracy;
  date: string | null;
}) {
  if (!matches.length) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center dark:border-white/15">
        <p className="text-sm font-medium">
          {date ? `${date} 에는 기준을 넘는 픽이 없었습니다.` : "지금은 기준을 넘는 픽이 없습니다."}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500 break-keep">
          없는 날은 없는 대로 둡니다 — 기준을 낮춰 억지로 채우면 적중률이 떨어지기 때문입니다.
          농구·아이스하키가 시즌에 들어가면 픽이 크게 늘어납니다.
        </p>
      </div>
    );
  }

  const hits = matches.flatMap((m) => m.picks).filter((p) => p.correct === true).length;
  const graded = matches.flatMap((m) => m.picks).filter((p) => p.correct != null).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {date ? `${date} 픽` : "앞으로 72시간"}
          <span className="ml-2 text-xs font-normal text-neutral-500">
            {matches.length}경기 {matches.reduce((s, m) => s + m.picks.length, 0)}건
          </span>
        </h2>
        {graded > 0 ? (
          <span className="text-xs tabular-nums text-neutral-500">
            이날 적중 <strong className="text-emerald-600 dark:text-emerald-400">{hits}</strong>/{graded}
            {" · "}
            {((hits / graded) * 100).toFixed(0)}%
          </span>
        ) : null}
      </div>
      <ul className="space-y-3">
        {matches.map((m) => (
          <PickCard key={m.matchId} m={m} byMarket={acc.byMarket} />
        ))}
      </ul>
    </div>
  );
}

// ── 비회원 — 몇 건인지까지만 알리고 내용은 가입 후 ──
function GuestGate({ matchCount, pickCount }: { matchCount: number; pickCount: number }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/60 p-6 text-center dark:border-white/10 dark:bg-white/[0.04]">
      <Lock className="mx-auto h-5 w-5 text-neutral-400" aria-hidden />
      <p className="mt-3 text-sm font-semibold break-keep">
        {pickCount > 0
          ? `지금 기준을 넘는 픽이 ${matchCount}경기 ${pickCount}건 있습니다`
          : "지금은 기준을 넘는 픽이 없습니다"}
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-neutral-500 break-keep">
        어떤 경기의 어떤 픽인지, 그리고 지난 픽이 실제로 맞았는지는 회원에게만 공개합니다.
        가입은 무료이고, 로그인하면 바로 보입니다.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/signup?from=/picks/strong"
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          무료로 가입하기
        </Link>
        <Link
          href="/login?from=/picks/strong"
          className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-black/[0.04] dark:border-white/15 dark:hover:bg-white/10"
        >
          로그인
        </Link>
      </div>
    </div>
  );
}
