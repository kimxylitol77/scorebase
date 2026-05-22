// 메인 페이지 최상단 인트로 섹션.

import Link from "next/link";

export default function HeroSection() {
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
          통계 기반 AI 스포츠 분석
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
          NBA · MLB · NHL · <strong>FIFA 월드컵 2026</strong> ·{" "}
          <strong>LCK</strong> —{" "}
          <strong>Elo 모델</strong>과 <strong>멀티 AI</strong>가 매일 분석하는
          글로벌 스포츠 데이터.
        </p>
        <div className="hero-cta mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <Link
            href="/predictions"
            className="btn-primary w-full sm:w-auto justify-center"
          >
            시즌 예측 대시보드
          </Link>
          <Link
            href="/scores"
            className="btn-secondary w-full sm:w-auto justify-center inline-flex items-center gap-2"
          >
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
            스코어베이스 라이브스코어
          </Link>
          <Link
            href="/previews"
            className="btn-secondary w-full sm:w-auto justify-center"
          >
            프리뷰 모음
          </Link>
          <Link
            href="/injuries"
            className="btn-secondary w-full sm:w-auto justify-center"
          >
            부상자 명단
          </Link>
        </div>
      </div>
    </section>
  );
}
