// /landing — 스코어베이스 브랜드 랜딩(소개) 페이지. 검색 노출용 키워드 풍부 가시 콘텐츠 + SEO.
//  스코어베이스.com 도메인 진입점. 앱 기능(/scores·/predictions 등)으로 유도.
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "스코어베이스 — AI 스포츠 분석·라이브스코어·승부예측 | Scorebase",
  description:
    "스코어베이스(Scorebase)는 EPL·라리가·분데스리가·K리그·KBO·NBA·MLB·NHL·FIFA 월드컵 2026 등 글로벌 스포츠를 Elo 모델과 멀티 AI로 매일 분석하는 데이터 미디어입니다. 라이브스코어, AI 승부예측, 부상자 명단, 이적시장·선수 몸값, 리그 순위·FIFA 랭킹을 한 곳에서.",
  keywords: [
    "스코어베이스", "Scorebase",
    "AI 스포츠 분석", "스포츠 데이터 분석", "AI 승부예측", "승부예측 사이트",
    "라이브스코어", "실시간 스코어", "스포츠 라이브스코어",
    "축구 예측", "야구 예측", "축구 승부예측", "프로야구 예측",
    "EPL 순위", "프리미어리그 순위", "라리가 순위", "분데스리가 순위",
    "KBO 순위", "NBA 순위", "MLB 순위", "NHL 순위",
    "부상자 명단", "이적시장", "선수 몸값", "시장가치",
    "FIFA 랭킹", "시즌 우승 확률", "매치 프리뷰", "경기 분석",
    "월드컵 2026",
  ],
  alternates: { canonical: `${SITE_URL}/landing` },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: `${SITE_URL}/landing`,
    siteName: "스코어베이스",
    title: "스코어베이스 — 감이 아니라, 숫자로 보는 스포츠",
    description:
      "EPL·KBO·NBA·MLB·NHL·FIFA 월드컵 2026 — Elo 모델과 멀티 AI가 매일 분석하는 글로벌 스포츠 데이터 미디어.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "스코어베이스 AI 스포츠 분석" }],
  },
};

const FEATURES: { href: string; emoji: string; title: string; desc: string }[] = [
  { href: "/scores", emoji: "⚡", title: "라이브스코어", desc: "축구·야구·농구·하키·e스포츠 실시간 스코어를 한 화면에서. 전반 점수·통계·배당까지." },
  { href: "/predictions", emoji: "📊", title: "AI 시즌 예측", desc: "Elo 레이팅 + Monte Carlo 5,000회로 리그별 우승·플레이오프·강등 확률을 계산." },
  { href: "/analysis", emoji: "🎯", title: "AI 승부예측·분석", desc: "경기별 승부 예측과 적중률을 투명하게 공개. 전문가 리더보드도 함께." },
  { href: "/injuries", emoji: "🩹", title: "부상자 명단", desc: "전 팀 부상·결장 선수를 매일 갱신. 사유·심각도·복귀 전망까지 한눈에." },
  { href: "/transfers", emoji: "💰", title: "이적시장·선수 몸값", desc: "유럽 빅5 리그 선수 시장가치(몸값) 랭킹과 변동 추이, 커리어·시즌 성적." },
  { href: "/predictions/fifa-ranking", emoji: "🌍", title: "리그 순위·FIFA 랭킹", desc: "리그별 순위표와 득점왕·도움왕 리더보드, FIFA 국가대표 랭킹, 세계 클럽 랭킹." },
];

const SPORTS: { name: string; leagues: string }[] = [
  { name: "⚽ 축구", leagues: "EPL · 라리가 · 분데스리가 · 세리에 A · 리그 1 · K리그 · J리그 · MLS · UCL · FIFA 월드컵 2026" },
  { name: "⚾ 야구", leagues: "KBO · NPB · MLB" },
  { name: "🏀 농구", leagues: "NBA · WNBA" },
  { name: "🏒 아이스하키", leagues: "NHL" },
  { name: "🎮 e스포츠", leagues: "LCK (리그 오브 레전드)" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "스코어베이스는 무엇인가요?", a: "스코어베이스(Scorebase)는 글로벌 스포츠를 Elo 모델과 멀티 AI로 매일 분석하는 데이터 미디어입니다. 라이브스코어, AI 승부예측, 부상자 명단, 이적시장, 리그 순위를 한 곳에서 제공합니다." },
  { q: "무료로 이용할 수 있나요?", a: "네. 라이브스코어, 시즌 예측, 부상자 명단, 이적시장, 순위 등 모든 데이터를 무료로 제공합니다." },
  { q: "AI 승부예측은 어떻게 만들어지나요?", a: "Elo 레이팅으로 팀 전력을 수치화하고, Monte Carlo 시뮬레이션 5,000회로 확률을 계산합니다. 예측 적중률은 투명하게 공개합니다." },
  { q: "어떤 종목과 리그를 다루나요?", a: "축구(EPL·라리가·K리그·UCL 등), 야구(KBO·NPB·MLB), 농구(NBA), 아이스하키(NHL), e스포츠(LCK)를 다룹니다." },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "스코어베이스",
      alternateName: ["Scorebase", "스코어 베이스"],
      url: SITE_URL,
      inLanguage: "ko-KR",
    },
    {
      "@type": "Organization",
      name: "스코어베이스",
      alternateName: ["Scorebase"],
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      description: "AI 데이터 분석 기반 글로벌 스포츠 미디어 — 라이브스코어·승부예측·부상자·이적시장·리그 순위",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-black/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90";
const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-black/5 transition hover:bg-zinc-50 dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
          ⚡ Elo + 멀티 AI · 매일 자동 분석
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.1] text-zinc-950 dark:text-white">
          감이 아니라,<br />숫자로 보는 스포츠
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/60">
          <strong className="font-semibold text-zinc-800 dark:text-white/80">스코어베이스(Scorebase)</strong>는 EPL·라리가·K리그·KBO·NBA·MLB·NHL·FIFA 월드컵 2026 등
          글로벌 스포츠를 데이터로 분석하는 미디어입니다. 라이브스코어부터 AI 승부예측,
          부상자 명단, 이적시장, 리그 순위까지 한 곳에서.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/scores" className={btnPrimary}>라이브스코어 보기 →</Link>
          <Link href="/predictions" className={btnGhost}>AI 시즌 예측</Link>
          <Link href="/transfers" className={btnGhost}>선수 몸값 랭킹</Link>
        </div>
      </section>

      {/* 핵심 기능 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label="핵심 기능">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">한 곳에서, 데이터로 보는 모든 경기</h2>
        <div className="mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="group block rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
              <div className="text-2xl">{f.emoji}</div>
              <h3 className="mt-3 text-lg font-bold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-white/55">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 다루는 종목·리그 (키워드) */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16" aria-label="다루는 종목과 리그">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">5개 종목 · 30개 이상 리그</h2>
        <div className="mt-8 space-y-2.5">
          {SPORTS.map((s) => (
            <div key={s.name} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              <div className="w-28 shrink-0 text-base font-bold text-zinc-900 dark:text-white">{s.name}</div>
              <div className="text-sm text-zinc-600 dark:text-white/60">{s.leagues}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 신뢰 */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16" aria-label="데이터와 모델">
        <div className="rounded-[2rem] bg-white p-6 sm:p-10 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">데이터로 증명하는 분석</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">Elo + Monte Carlo</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">팀 전력을 Elo 레이팅으로 수치화하고 시즌을 5,000회 시뮬레이션해 확률을 산출합니다.</p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">적중률 투명 공개</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">예측이 맞았는지 틀렸는지 매 경기 그대로 표시하고 누적 적중률을 공개합니다.</p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">매일 자동 갱신</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">스코어·순위·부상자·시장가치·리더보드를 매일 자동으로 업데이트합니다.</p>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-400 dark:text-white/35">ⓘ 모든 확률은 통계 모델 기반 추정치이며, 도박·베팅과 무관한 정보 제공 목적입니다.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 sm:px-6 pb-16" aria-label="자주 묻는 질문">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">자주 묻는 질문</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              <h3 className="text-base font-bold text-zinc-950 dark:text-white">Q. {f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-white/60">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-24 text-center">
        <div className="rounded-[2rem] bg-zinc-950 p-8 sm:p-12 dark:bg-white/[0.06] dark:ring-1 dark:ring-white/10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">지금, 숫자로 경기를 읽어보세요</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-white/70">회원가입 없이 무료로 라이브스코어·예측·순위·부상자·이적시장을 바로 확인할 수 있습니다.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/scores" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white/90">스코어베이스 시작하기 →</Link>
            <Link href="/predictions/accuracy" className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-7 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">모델 적중률 보기</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
