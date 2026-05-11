// 메인 페이지 최상단 인트로 섹션.

export default function HeroSection() {
  return (
    <section className="hero relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
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
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight">
          <span className="hero-accent-soft">감</span>이 아니라,{" "}
          <span className="hero-accent">숫자</span>로 보는 경기.
        </h1>
        <p className="lede mt-5 max-w-2xl text-base sm:text-lg text-neutral-600 dark:text-neutral-400">
          EPL · 라리가 · 분데스 · NBA · MLB · NHL — <strong>Elo 모델</strong>과{" "}
          <strong>멀티 AI</strong>가 매일 분석하는 글로벌 스포츠 데이터.
        </p>
      </div>
    </section>
  );
}
