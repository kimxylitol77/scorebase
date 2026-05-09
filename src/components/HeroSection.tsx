// 메인 페이지 최상단 인트로 섹션.

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800">
      {/* 그라디언트 백드롭 */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60 dark:opacity-30"
        style={{
          background:
            "radial-gradient(60% 80% at 20% 0%, rgba(120,119,198,0.18), transparent 60%), radial-gradient(40% 60% at 90% 30%, rgba(255,154,0,0.18), transparent 60%), radial-gradient(50% 70% at 50% 100%, rgba(0,118,255,0.18), transparent 60%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-500 mb-4">
          AI Sports Daily
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.05] tracking-tight">
          매일 정리되는<br />
          <span className="bg-gradient-to-r from-purple-600 via-orange-500 to-blue-600 bg-clip-text text-transparent">
            글로벌 스포츠
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
          EPL · NBA · NHL · MLB 의 경기 결과·프리뷰·분석을
          <br className="hidden sm:inline" />
          AI 가 매일 정리해 한 곳에 모아 둡니다.
        </p>
      </div>
    </section>
  );
}
