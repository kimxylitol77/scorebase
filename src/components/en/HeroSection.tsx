// HeroSection (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import { prisma } from "@/lib/db";

// 링크 대상인 /predictions/accuracy 와 동일 기준 — 뱃지 숫자와 페이지 표본 수가 어긋나면
// 신뢰 뱃지가 역효과라, 목록을 복제하지 않고 적중률 집계의 단일 출처를 그대로 쓴다.
import { ACCURACY_LEAGUES } from "@/lib/predict/accuracy-stats";

export default async function HeroSection() {
  // 실측 채점 경기 수 (predCorrect 채움 기준) — 홈 revalidate 3600 로 매시 갱신, 백단위 내림 표기.
  let graded = 0;
  try {
    graded = await prisma.match.count({
      where: { predCorrect: { not: null }, league: { in: [...ACCURACY_LEAGUES] } },
    });
  } catch {}
  const gradedLabel =
    graded >= 1000 ? `${(Math.floor(graded / 100) * 100).toLocaleString()}` : null;

  return (
    <section
      className="hero relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800"
      aria-labelledby="hero-title"
    >
      {/* 그라디언트 백드롭 */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 dark:opacity-30"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 0%, rgba(120,119,198,0.18), transparent 60%), radial-gradient(40% 60% at 90% 30%, rgba(0,212,255,0.18), transparent 60%), radial-gradient(50% 70% at 50% 100%, rgba(59,130,246,0.18), transparent 60%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p className="eyebrow text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-500 mb-4">
          AI sports analysis that publishes its hit rate
        </p>
        <h1
          id="hero-title"
          className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight"
        >
          <span className="hero-accent-soft">Not a hunch</span> —{" "}
          <span className="hero-accent">numbers</span> you can read.
        </h1>
        <p className="lede mt-5 max-w-2xl text-base sm:text-lg text-neutral-600 dark:text-neutral-400">
          Premier League · LaLiga · Bundesliga · <strong>KBO</strong> · <strong>NPB</strong> ·
          NBA · MLB · NHL · <strong>LCK</strong> —{" "}
          <strong>An Elo model</strong>and <strong>multiple AI models</strong> working through global sports data every day.
        </p>
        {gradedLabel && (
          <Link
            href="/predictions/accuracy"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-neutral-800 ring-1 ring-black/10 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.06] dark:text-white dark:ring-white/15"
          >
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            {gradedLabel}+ matches scored on actual results — accuracy published by league and market
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </section>
  );
}
