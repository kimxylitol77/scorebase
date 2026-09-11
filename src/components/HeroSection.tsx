// 메인 페이지 최상단 인트로 섹션. 글씨만 — 바로 아래 오늘 주요 경기 6(HomeTodayMatches)이 붙어 높이를 절반으로 눌렀다(감사 §3).
// 포지셔닝: "적중률을 숨기지 않는 AI 예측" — H1 이 곧 검증 가능한 수치 주장(플랫 유닛 수익률).
// 수치는 /predictions/accuracy 「플랫 유닛 수익률」과 같은 소스(roiClaim)에서 읽고, 없으면 옛 문구로 fallback.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { roiClaim } from "@/lib/predict/model-vs-market";

// 링크 대상인 /predictions/accuracy 와 동일 기준 — 뱃지 숫자와 페이지 표본 수가 어긋나면
// 신뢰 뱃지가 역효과라, 목록을 복제하지 않고 적중률 집계의 단일 출처를 그대로 쓴다.
import { ACCURACY_LEAGUES } from "@/lib/predict/accuracy-stats";

export default async function HeroSection() {
  // 실측 채점 경기 수 (predCorrect 채움 기준) — 홈 revalidate 3600 로 매시 갱신, 백단위 내림 표기.
  // 수익률 주장(claim)은 실패·표본 부족이면 null — 그때 H1 은 숫자 없는 옛 문구로 내려간다.
  const [graded, claim] = await Promise.all([
    prisma.match
      .count({ where: { predCorrect: { not: null }, league: { in: [...ACCURACY_LEAGUES] } } })
      .catch(() => 0),
    roiClaim(),
  ]);
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
      {/* 높이 예산: 운영 395px(1280·390 공통) 의 절반 이하 — 여백·글자 축소, CTA 를 기준일 줄에 텍스트 링크로 합침 */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <p className="eyebrow text-[10px] font-semibold tracking-[0.2em] uppercase text-neutral-500 mb-1.5">
          적중률을 숨기지 않는 AI 스포츠 분석
        </p>
        {claim ? (
          <>
            <h1
              id="hero-title"
              className="text-2xl sm:text-3xl md:text-4xl font-black leading-[1.1] tracking-tight"
            >
              우리 픽의 수익률은{" "}
              <span className="hero-accent tabular-nums">{claim.modelPct}</span>입니다.
            </h1>
            <p className="lede mt-1.5 max-w-2xl text-sm sm:text-base text-neutral-600 dark:text-neutral-400 break-keep">
              시장 인기픽은 <strong className="tabular-nums">{claim.marketPct}</strong>.{" "}
              {claim.marketLeads ? (
                <>
                  지금은 시장이 <strong className="tabular-nums">{claim.edgePct.replace(/^[+−]/, "")}</strong>{" "}
                  앞서고, 이 숫자도 그대로 공개합니다.
                </>
              ) : (
                <>
                  그 차이 <strong className="tabular-nums">{claim.edgePct}</strong>가 우리 모델의 전부입니다.
                </>
              )}
            </p>
            <p className="mt-1.5 text-[11px] sm:text-xs text-neutral-500 tabular-nums">
              {claim.asOfDate} 기준 · {claim.sample}경기
              <span className="hidden sm:inline"> · 경기 전 마지막 배당에 1경기 1유닛</span>
              {gradedLabel && (
                <>
                  {" · "}
                  <Link href="/predictions/accuracy" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                    {gradedLabel}+ 경기 실측 채점 기록 보기 →
                  </Link>
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <h1
              id="hero-title"
              className="text-2xl sm:text-3xl md:text-4xl font-black leading-[1.1] tracking-tight"
            >
              <span className="hero-accent-soft">감</span>이 아니라,{" "}
              <span className="hero-accent">숫자</span>로 보는 경기.
            </h1>
            <p className="lede mt-1.5 max-w-2xl text-sm sm:text-base text-neutral-600 dark:text-neutral-400">
              EPL · 라리가 · 분데스 · <strong>KBO</strong> · <strong>NPB</strong> ·
              NBA · MLB · NHL · <strong>LCK</strong> —{" "}
              <strong>Elo 모델</strong>과 <strong>멀티 AI</strong>가 매일 분석하는
              글로벌 스포츠 데이터.
            </p>
            {gradedLabel && (
              <p className="mt-1.5 text-[11px] sm:text-xs text-neutral-500 tabular-nums">
                <Link href="/predictions/accuracy" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  {gradedLabel}+ 경기 실측 채점 기록 보기 →
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
