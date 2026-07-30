// 메인 페이지 최상단 인트로 섹션. 글씨만 — 4개 진입 카드는 HomeFocusCards 분리.
// 포지셔닝: "적중률을 숨기지 않는 AI 예측" — 실측 채점 경기 수를 DB 에서 세어 근거로 노출.
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
          적중률을 숨기지 않는 AI 스포츠 분석
        </p>
        <h1
          id="hero-title"
          className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight"
        >
          <span className="hero-accent-soft">감</span>이 아니라,{" "}
          <span className="hero-accent">숫자</span>로 보는 경기.
        </h1>
        <p className="lede mt-5 max-w-2xl text-base sm:text-lg text-neutral-600 dark:text-neutral-400">
          EPL · 라리가 · 분데스 · <strong>KBO</strong> · <strong>NPB</strong> ·
          NBA · MLB · NHL · <strong>LCK</strong> —{" "}
          <strong>Elo 모델</strong>과 <strong>멀티 AI</strong>가 매일 분석하는
          글로벌 스포츠 데이터.
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
            {gradedLabel}+ 경기 실측 채점 — 리그·시장별 적중률 전부 공개
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </section>
  );
}
