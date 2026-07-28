// /landing — 스코어베이스 브랜드 랜딩(소개) 페이지. 검색 노출용 키워드 풍부 가시 콘텐츠 + SEO.
//  스코어베이스.com 도메인 진입점. 키워드 우선순위 = 검색량 데이터 기반(라이브스코어·리그 순위 중심).
import type { Metadata } from "next";
import Link from "next/link";
import { Zap, ListOrdered, Target, BarChart3, Banknote, Bandage, type LucideIcon } from "lucide-react";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";

// 스코어베이스.com (브랜드 랜딩 전용 도메인) 자기참조 canonical/OG.
// 과거엔 canonical 이 scorebase.kr/landing 이라 구글이 .com 을 scorebase.kr 로 흡수 →
// .com 이 독립 색인·브랜드("스코어베이스") 검색 노출이 불가했다. .com 을 정식 home 으로
// 자기참조시켜 독립 색인 가능하게 한다. href 는 호환성 위해 punycode(ASCII) 사용
// (= https://www.스코어베이스.com). www 는 scorebase.kr 와 동일 컨벤션.
const SCOREBASE_COM_URL = "https://www.xn--9k3b13iba842abwcsvs.com";

export const metadata: Metadata = {
  // 한글 브랜드를 맨 앞에 — layout 의 default title 과 같은 원칙(GEO Brand 병목 대응).
  // absolute 를 쓰는 이유: template("%s | Scorebase")이 붙으면 브랜드가 뒤에 영문으로만
  // 남아 "스코어베이스" 검색 신호가 약해지고 "| Scorebase" 가 중복된다.
  // 이 도메인의 존재 이유가 브랜드 검색 노출이라 title 이 가장 중요한 신호다.
  title: { absolute: "스코어베이스 (Scorebase) — 라이브스코어·리그 순위·AI 스포츠 분석" },
  description:
    "EPL·라리가·분데스리가·K리그·KBO·NBA·MLB·NHL 라이브스코어와 리그 순위를 실시간으로. AI 스포츠 분석·승부예측과 적중률, FIFA 랭킹·부상자 명단·이적시장까지 한 곳에서 보는 스포츠 데이터 미디어, 스코어베이스(Scorebase).",
  keywords: [
    // 검색량 최상위 (라이브스코어 183만 · 리그 순위 45만급)
    "라이브스코어", "실시간 스코어", "축구 라이브스코어", "라이브스코어 사이트",
    "프리미어리그 순위", "EPL 순위", "라리가 순위", "분데스리가 순위", "세리에A 순위",
    "KBO 순위", "NBA 순위", "MLB 순위", "NHL 순위", "K리그 순위", "해외축구 순위",
    // 스포츠 분석 (20만급 · 사이트 정체성)
    "스포츠 분석", "축구 분석", "야구 분석", "승부예측", "AI 스포츠 분석",
    // 일정·랭킹·예측
    "KBO 일정", "해외축구 일정", "FIFA 랭킹", "월드컵 2026",
    // 이적시장 (보조 — 검색량 작아 비중↓)
    "이적시장", "선수 몸값",
    // 브랜드
    "스코어베이스", "Scorebase",
  ],
  alternates: { canonical: SCOREBASE_COM_URL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: SCOREBASE_COM_URL,
    siteName: "스코어베이스",
    title: "스코어베이스 (Scorebase) — 라이브스코어·리그 순위·AI 스포츠 분석",
    description:
      "EPL·라리가·KBO·NBA 라이브스코어와 리그 순위를 실시간으로. AI 스포츠 분석·승부예측·적중률까지 한 곳에서.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "스코어베이스 — 라이브스코어·리그 순위·스포츠 분석" }],
  },
};

const FEATURES: { href: string; Icon: LucideIcon; title: string; desc: string; live?: boolean }[] = [
  { href: "/scores", Icon: Zap, title: "라이브스코어", desc: "축구·야구·농구·아이스하키·e스포츠 실시간 스코어를 한 화면에서. 전반 점수·통계·배당까지 즉시 반영.", live: true },
  { href: "/standings", Icon: ListOrdered, title: "리그 순위 (실시간)", desc: "EPL·라리가·분데스리가·세리에 A·K리그·KBO·NBA·MLB 리그 순위와 득점왕·도움왕 리더보드를 실시간으로.", live: true },
  { href: "/analysis", Icon: Target, title: "AI 스포츠 분석·승부예측", desc: "축구·야구·농구 경기별 승부 예측과 누적 적중률을 투명하게 공개. 데이터 기반 스포츠 분석과 예측 전문가 리더보드까지." },
  { href: "/predictions", Icon: BarChart3, title: "AI 시즌 예측", desc: "Elo 레이팅 + Monte Carlo 5,000회로 우승·플레이오프·강등 확률을 계산. FIFA 랭킹·세계 클럽 랭킹도 함께." },
  { href: "/transfers", Icon: Banknote, title: "해외 이적시장", desc: "유럽 빅5 리그 선수 시장가치(몸값) 랭킹과 최신 이적을 빠르게 반영. 커리어·시즌 성적·몸값 변동 추이까지.", live: true },
  { href: "/injuries", Icon: Bandage, title: "부상자 명단", desc: "전 팀 부상·결장 선수를 매일 갱신. 사유·심각도·복귀 전망까지 한눈에." },
];

const SPORTS: { name: string; leagues: string }[] = [
  { name: "축구", leagues: "EPL · 라리가 · 분데스리가 · 세리에 A · 리그 1 · K리그 · J리그 · MLS · UCL · FIFA 월드컵 2026" },
  { name: "야구", leagues: "KBO · NPB · MLB" },
  { name: "농구", leagues: "NBA · WNBA" },
  { name: "아이스하키", leagues: "NHL" },
  { name: "e스포츠", leagues: "LCK (리그 오브 레전드)" },
];

// 검색량 가장 높은 "OO 순위" 키워드 — 가시 칩 + 내부링크로 직접 노출(SEO 핵심).
const POPULAR: { label: string; href: string }[] = [
  { label: "프리미어리그 순위", href: "/standings/EPL" },
  { label: "라리가 순위", href: "/standings/LALIGA" },
  { label: "분데스리가 순위", href: "/standings/BUNDESLIGA" },
  { label: "세리에 A 순위", href: "/standings/SERIE_A" },
  { label: "KBO 순위", href: "/standings/KBO" },
  { label: "NBA 순위", href: "/standings/NBA" },
  { label: "MLB 순위", href: "/standings/MLB" },
  { label: "NHL 순위", href: "/standings/NHL" },
  { label: "FIFA 랭킹", href: "/predictions/fifa-ranking" },
  { label: "월드컵 2026", href: "/predictions/WORLD_CUP" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "스코어베이스는 무엇인가요?", a: "스코어베이스(Scorebase)는 EPL·KBO·NBA 등 글로벌 스포츠의 라이브스코어와 리그 순위를 실시간으로 제공하고, AI 스포츠 분석·승부예측과 적중률을 공개하는 스포츠 데이터 미디어입니다. 부상자 명단·이적시장도 함께 제공합니다." },
  { q: "라이브스코어와 리그 순위는 실시간인가요?", a: "네. 축구·야구·농구·하키 라이브스코어와 리그 순위를 실시간으로 반영합니다. 경기 중 점수·통계가 즉시 업데이트됩니다." },
  { q: "AI 스포츠 분석·승부예측도 제공하나요?", a: "네. Elo 레이팅과 통계 모델 기반으로 축구·야구·농구 경기 승부를 예측하고, 누적 적중률을 투명하게 공개합니다. 시즌 우승·플레이오프 확률 시뮬레이션도 함께 제공합니다." },
  { q: "무료로 이용할 수 있나요?", a: "네. 라이브스코어, 리그 순위, 스포츠 분석, 시즌 예측, 부상자 명단 등 모든 데이터를 무료로 제공합니다." },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebSite", name: "스코어베이스", alternateName: ["Scorebase", "스코어 베이스"], url: SCOREBASE_COM_URL, inLanguage: "ko-KR" },
    {
      "@type": "Organization",
      name: "스코어베이스",
      alternateName: ["Scorebase"],
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      description: "라이브스코어·리그 순위·해외 이적시장을 실시간으로 반영하는 글로벌 스포츠 데이터 미디어",
    },
    { "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ],
};

const btnGhost = "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-black/5 transition hover:bg-zinc-50 dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD) }} />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
          <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" /> 라이브스코어 · 리그 순위 실시간 반영
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.1] text-zinc-950 dark:text-white">
          감이 아니라,<br />숫자로 보는 스포츠
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/60">
          <strong className="font-semibold text-zinc-800 dark:text-white/80">스코어베이스(Scorebase)</strong>는
          EPL·라리가·KBO·NBA·MLB 등 글로벌 스포츠의 <strong className="font-semibold text-zinc-800 dark:text-white/80">라이브스코어와 리그 순위를 실시간</strong>으로,
          <strong className="font-semibold text-zinc-800 dark:text-white/80"> AI 스포츠 분석·승부예측과 적중률</strong>까지. FIFA 랭킹·부상자 명단·이적시장도 한 곳에서.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={`${SITE_URL}/scores`} className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-black/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90">라이브스코어 보기 →</Link>
          <Link href={`${SITE_URL}/standings`} className={btnGhost}>리그 순위</Link>
          <Link href={`${SITE_URL}/analysis`} className={btnGhost}>스포츠 분석</Link>
        </div>
      </section>

      {/* 인기 순위 바로가기 — 검색량 높은 "OO 순위" 키워드 직접 노출 + 내부링크 */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pb-12" aria-label="인기 리그 순위 바로가기">
        <h2 className="text-center text-sm font-bold text-zinc-500 dark:text-white/45">실시간 리그 순위 바로가기</h2>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {POPULAR.map((p) => (
            <Link
              key={p.label}
              href={`${SITE_URL}${p.href}`}
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:text-zinc-950 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10 dark:hover:bg-white/[0.1] dark:hover:text-white"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      {/* 핵심 기능 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label="핵심 기능">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">실시간 스코어부터 순위·이적시장까지</h2>
        <p className="mt-2 text-center text-sm text-zinc-500 dark:text-white/45">검색량 가장 많은 라이브스코어·리그 순위를 핵심으로, 해외 이적시장까지 한 곳에서.</p>
        <div className="mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.href} href={`${SITE_URL}${f.href}`} className="group relative block rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
              {f.live && (
                <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> LIVE
                </span>
              )}
              <f.Icon className="h-7 w-7 text-rose-500 dark:text-rose-400" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-3 text-lg font-bold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-white/55">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 다루는 종목·리그 (키워드) */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16" aria-label="다루는 종목과 리그">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">5개 종목 · 30개 이상 리그 순위·라이브스코어</h2>
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
              <div className="text-lg font-bold text-zinc-900 dark:text-white">실시간 반영</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">라이브스코어와 리그 순위를 경기 중 즉시 업데이트하고, 이적시장·몸값을 매일 갱신합니다.</p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">Elo + Monte Carlo</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">팀 전력을 Elo 레이팅으로 수치화하고 시즌을 5,000회 시뮬레이션해 확률을 산출합니다.</p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">적중률 투명 공개</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">예측이 맞았는지 틀렸는지 매 경기 그대로 표시하고 누적 적중률을 공개합니다.</p>
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">지금, 라이브스코어부터 확인하세요</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-white/70">회원가입 없이 무료로 라이브스코어·리그 순위·이적시장·예측·부상자 명단을 바로 볼 수 있습니다.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href={`${SITE_URL}/scores`} className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white/90">라이브스코어 보기 →</Link>
            <Link href={`${SITE_URL}/standings`} className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-7 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">리그 순위 보기</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
