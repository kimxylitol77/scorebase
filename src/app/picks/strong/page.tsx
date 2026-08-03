// /picks/strong — 모델이 자신 있어 하는 픽만 모아 보는 회원 전용 화면.
// 비회원은 기준·성적과 오늘 몇 건인지까지 보고, 실제 픽은 가입 후 (/lab 과 같은 방침).
import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Target, TrendingUp } from "lucide-react";
import { getCurrentUserId } from "@/lib/current-user";
import AmbientGlow from "@/components/AmbientGlow";
import { MARKET_LABEL, STRONG_THRESHOLD, type StrongMarket } from "@/lib/predict/strong-picks";
import { loadStrongPicks, loadStrongAccuracy, type StrongPickMatch } from "./_data";

export const dynamic = "force-dynamic"; // 회원 여부에 따라 갈리는 화면

export const metadata: Metadata = {
  title: "고확신 픽 — AI가 자신 있어 하는 경기만",
  description:
    "전 경기를 다 찍지 않고, 우리 모델이 기준 이상으로 자신 있어 하는 픽만 골라 보여줍니다. 마켓별 임계는 과거 11,611경기 실측으로 정했습니다.",
  alternates: { canonical: "https://www.scorebase.kr/picks/strong" },
};

const kst = (d: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(d);

export default async function StrongPicksPage() {
  const [userId, matches, acc] = await Promise.all([
    getCurrentUserId(),
    loadStrongPicks(),
    loadStrongAccuracy(),
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

      {/* 기준과 성적 — 회원·비회원 모두 공개. 신뢰의 근거라 가리지 않는다. */}
      <section className="mt-6 rounded-2xl border border-black/5 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <TrendingUp className="h-4 w-4 text-emerald-500" aria-hidden />
          <span className="text-2xl font-bold tabular-nums">{acc.rate.toFixed(1)}%</span>
          <span className="text-xs text-neutral-500">
            이 기준으로 낸 {acc.total.toLocaleString()}픽의 실제 적중률
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {(Object.keys(STRONG_THRESHOLD) as StrongMarket[]).map((mk) => (
            <div key={mk} className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <dt className="text-neutral-500">{MARKET_LABEL[mk]}</dt>
              <dd className="font-semibold tabular-nums">
                {(STRONG_THRESHOLD[mk] * 100).toFixed(0)}% 이상일 때만
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 break-keep">
          양팀득점은 뺐습니다 — 실측에서 확신도를 올릴수록 오히려 적중률이 떨어져(65%+ 55.2% →
          80%+ 42.9%) 신뢰 신호로 쓸 수 없었습니다.
        </p>
      </section>

      <div className="mt-6">
        {userId ? (
          <PickList matches={matches} />
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

// ── 회원 — 실제 픽 목록 ──
function PickList({ matches }: { matches: StrongPickMatch[] }) {
  if (!matches.length) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 p-8 text-center dark:border-white/15">
        <p className="text-sm font-medium">지금은 기준을 넘는 픽이 없습니다.</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500 break-keep">
          없는 날은 없는 대로 둡니다 — 기준을 낮춰 억지로 채우면 적중률이 떨어지기 때문입니다.
          농구·아이스하키가 시즌에 들어가면 픽이 크게 늘어납니다.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {matches.map((m) => (
        <li
          key={m.matchId}
          className="rounded-2xl border border-black/5 bg-white/60 p-4 dark:border-white/10 dark:bg-white/[0.04]"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500">
            <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 font-medium dark:bg-white/10">
              {m.league}
            </span>
            <span className="tabular-nums">{kst(m.startTime)}</span>
          </div>
          <p className="mt-1.5 text-sm font-semibold break-keep">
            {m.home} <span className="text-neutral-400">vs</span> {m.away}
          </p>
          <ul className="mt-3 space-y-1.5">
            {m.picks.map((p) => (
              <li
                key={p.market}
                className="flex items-center justify-between gap-3 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
              >
                <span className="min-w-0 text-sm break-keep">
                  <span className="mr-2 text-[11px] font-medium text-neutral-500">
                    {MARKET_LABEL[p.market]}
                  </span>
                  <span className="font-medium">{p.pick}</span>
                  {p.detail ? (
                    <span className="ml-1.5 text-[11px] text-neutral-500">{p.detail}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {(p.prob * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
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
        어떤 경기의 어떤 픽인지는 회원에게만 공개합니다. 가입은 무료이고, 로그인하면 바로 보입니다.
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
