// /ai-sports-prediction — "AI 스포츠 분석·예측 사이트" 정체성 필러 페이지.
//  GSC에서 노출만 되고(56~99위) 클릭 0인 정체성 키워드 클러스터 정조준:
//  ai 승부예측 사이트 · 야구/MLB 분석 사이트 · 스포츠 예측 사이트 · 예측사이트.
//  고유자산(적중률 백테스트 · AI vs GPT 성적표 · 승리확률 계산기)을 근거로 인용성↑.
import type { Metadata } from "next";
import Link from "next/link";
import { Target, LineChart, Calculator, Trophy, CircleDot, Goal, Activity, Snowflake, type LucideIcon } from "lucide-react";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";
import { ogPageImage } from "@/lib/seo/og";

const PAGE_URL = `${SITE_URL}/ai-sports-prediction`;

export const metadata: Metadata = {
  title: "AI 스포츠 분석·예측 사이트 — 적중률 공개 | 스코어베이스",
  description:
    "스코어베이스는 축구·야구·농구·아이스하키 경기를 AI로 분석·승부예측하고, 실제 적중률을 그대로 공개하는 스포츠 분석·예측 사이트입니다. EPL·MLB·KBO·NBA·NHL 경기별 예측과 13개 리그 백테스트 적중률, GPT-5.6와의 정면 비교 성적표, 승리확률 계산기까지 한 곳에서.",
  keywords: [
    // 정체성 클러스터 (GSC 노출·0클릭 → 정조준)
    "AI 승부예측 사이트", "스포츠 예측 사이트", "스포츠 분석 사이트", "예측 사이트",
    "AI 스포츠 분석", "AI 스포츠 예측", "승부예측 사이트", "스포츠 분석 글",
    // 종목별 분석 사이트
    "야구 분석 사이트", "MLB 분석 사이트", "국내 야구 분석 사이트", "해외 야구 분석 사이트",
    "KBO 분석", "축구 분석 사이트", "농구 분석 사이트", "NBA 분석",
    // 적중률·정확도
    "AI 예측 적중률", "승부예측 적중률", "스포츠 예측 정확도",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: PAGE_URL,
    siteName: "스코어베이스",
    title: "AI 스포츠 분석·예측 사이트 — 적중률 공개 | 스코어베이스",
    description:
      "축구·야구·농구·하키 경기를 AI로 분석·예측하고 실제 적중률을 그대로 공개. 13개 리그 백테스트와 GPT-5.6 정면 비교 성적표.",
    images: ogPageImage({ title: "AI 스포츠 분석·예측 사이트", subtitle: "적중률을 그대로 공개하는 스포츠 예측", tag: "AI 예측" }),
  },
};

// 고유 데이터 자산 — "왜 이 예측 사이트인가"를 증명하는 인용 자석.
const PROOF: { href: string; Icon: LucideIcon; title: string; desc: string }[] = [
  {
    href: "/predictions/accuracy",
    Icon: Target,
    title: "적중률 투명 공개",
    desc: "13개 리그의 1X2·언더오버·핸디캡·양팀득점 예측 적중률을 표본 수와 함께 공개합니다. 종료된 모든 경기를 예측 시점 기준으로 백테스트해, 맞췄다고 사후에 고르지 않습니다.",
  },
  {
    href: "/predictions/scorecard",
    Icon: LineChart,
    title: "AI vs GPT-5.6 성적표",
    desc: "같은 경기를 두고 스코어베이스 통계모델과 GPT-5.6가 경기 전에 각각 예측하고, 결과로 채점합니다. 1X2·핸디캡·오버언더 시장별 적중을 누적으로 비교 공개합니다.",
  },
  {
    href: "/tools/kbo-win-probability",
    Icon: Calculator,
    title: "승리확률 계산기",
    desc: "이닝·점수차·주자 상황을 넣으면 그 순간의 승리 확률을 계산합니다. MLB·KBO·NPB 야구 상황별 승리확률을 마르코프 체인 + 몬테카를로로 산출하는 국내 도구입니다.",
  },
  {
    href: "/predictions",
    Icon: Trophy,
    title: "AI 시즌 예측",
    desc: "Elo 레이팅으로 팀 전력을 수치화하고 시즌을 5,000회 시뮬레이션해 우승·플레이오프·강등 확률을 산출합니다. FIFA 랭킹·세계 클럽 랭킹도 함께 제공합니다.",
  },
];

// 종목별 분석 — "OO 분석 사이트" 키워드 직접 노출 + 내부링크.
const SPORTS: { name: string; href: string; Icon: LucideIcon; leagues: string; desc: string }[] = [
  {
    name: "야구 분석",
    href: "/baseball",
    Icon: CircleDot,
    leagues: "MLB · KBO · NPB",
    desc: "국내·해외 야구를 선발 투수 성적(ERA·WHIP·K9)까지 반영해 승부예측합니다. MLB·KBO 경기별 예측과 적중률, 선수 페이지·승리확률 계산기를 갖춘 야구 분석 사이트입니다.",
  },
  {
    name: "축구 분석",
    href: "/soccer",
    Icon: Goal,
    leagues: "EPL · 라리가 · 분데스리가 · 세리에 A · K리그 · UCL · 월드컵 2026",
    desc: "Dixon-Coles + Elo + xG 모델로 유럽 빅5와 K리그 경기를 분석합니다. 라인업·맞대결·시장 배당까지 반영한 1X2·핸디캡·언더오버 예측을 제공합니다.",
  },
  {
    name: "농구 분석",
    href: "/leagues/NBA",
    Icon: Activity,
    leagues: "NBA · WNBA",
    desc: "NBA 경기를 Elo 기반으로 분석·예측하고 적중률을 공개합니다. 팀·선수 페이지와 시즌 플레이오프 확률 시뮬레이션을 함께 제공합니다.",
  },
  {
    name: "아이스하키 분석",
    href: "/leagues/NHL",
    Icon: Snowflake,
    leagues: "NHL",
    desc: "NHL 경기를 골리 성적(GAA·SV%)까지 반영해 분석합니다. 핸디캡·언더오버 시장에서 전 리그 최상위권 적중률을 기록한 예측을 공개합니다.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "스코어베이스는 어떤 스포츠 분석·예측 사이트인가요?",
    a: "스코어베이스(Scorebase)는 축구·야구·농구·아이스하키 경기를 AI 통계모델로 분석하고 승부를 예측하는 스포츠 분석·예측 사이트입니다. EPL·라리가·MLB·KBO·NBA·NHL 등 글로벌 리그의 경기별 예측과, 종료된 모든 경기를 백테스트한 실제 적중률을 함께 공개합니다.",
  },
  {
    q: "AI 예측 적중률은 어느 정도인가요?",
    a: "리그와 시장에 따라 다르며, 모두 적중률 페이지에 표본 수와 함께 그대로 공개합니다. KBO 1X2와 NHL 핸디캡처럼 일부 리그·시장은 60%를 웃돕니다. 모든 수치는 예측 시점을 기준으로 검증한 백테스트 결과이고, 결과가 좋은 경기만 골라 보여주지 않습니다.",
  },
  {
    q: "야구 분석 사이트로는 어떤 데이터를 제공하나요?",
    a: "MLB·KBO·NPB 경기를 선발 투수의 ERA·WHIP·K9까지 반영해 승부예측하고, 경기별 적중률을 공개합니다. 이닝·점수차·주자 상황을 넣어 그 순간의 승리 확률을 계산하는 승리확률 계산기와, 선수별 성적 페이지도 함께 제공합니다.",
  },
  {
    q: "다른 AI 예측과 무엇이 다른가요?",
    a: "스코어베이스 통계모델과 GPT-5.6가 같은 경기를 경기 전에 각각 예측하고 결과로 채점하는 성적표를 공개합니다. 예측이 맞았는지 틀렸는지 매 경기 그대로 표시해, 사후 보정 없이 검증 가능한 형태로 적중률을 드러냅니다.",
  },
  {
    q: "무료인가요? 베팅 사이트인가요?",
    a: "모든 분석·예측·적중률·계산기를 회원가입 없이 무료로 제공합니다. 모든 확률은 통계 모델 기반 추정치로 정보 제공 목적이며, 도박·베팅 서비스가 아닙니다.",
  },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "스코어베이스",
      alternateName: ["Scorebase"],
      url: SITE_URL,
      inLanguage: "ko-KR",
    },
    {
      "@type": "Organization",
      name: "스코어베이스",
      alternateName: ["Scorebase"],
      url: SITE_URL,
      logo: `${SITE_URL}/icon.png`,
      description:
        "축구·야구·농구·아이스하키 경기를 AI로 분석·예측하고 실제 적중률을 공개하는 스포츠 분석·예측 사이트.",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    breadcrumbLd([
      { name: "홈", path: "/" },
      { name: "AI 스포츠 분석·예측", path: "/ai-sports-prediction" },
    ]),
  ],
};

const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-black/5 transition hover:bg-zinc-50 dark:bg-white/[0.06] dark:text-white dark:ring-white/10 dark:hover:bg-white/[0.1]";

export default function AiSportsPredictionPage() {
  return (
    <main className="relative min-h-screen bg-[#f5f5f7] dark:bg-transparent">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(JSONLD) }} />

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-1.5 text-xs sm:text-sm text-zinc-700 shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
          <Target className="h-3.5 w-3.5 text-rose-500" strokeWidth={2.2} aria-hidden /> 적중률을 그대로 공개하는 AI 예측
        </div>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-[-0.03em] leading-[1.1] text-zinc-950 dark:text-white">
          AI 스포츠 분석·예측 사이트
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-7 text-zinc-600 dark:text-white/60">
          <strong className="font-semibold text-zinc-800 dark:text-white/80">스코어베이스(Scorebase)</strong>는
          축구·야구·농구·아이스하키 경기를 <strong className="font-semibold text-zinc-800 dark:text-white/80">AI 통계모델로 분석·승부예측</strong>하고,
          종료된 경기를 백테스트한 <strong className="font-semibold text-zinc-800 dark:text-white/80">실제 적중률을 그대로 공개</strong>하는
          스포츠 분석·예측 사이트입니다. EPL·MLB·KBO·NBA·NHL을 한 곳에서.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/predictions/accuracy"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white shadow-xl shadow-black/10 transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-white/90"
          >
            적중률 보기 →
          </Link>
          <Link href="/predictions/scorecard" className={btnGhost}>AI vs GPT 성적표</Link>
          <Link href="/analysis" className={btnGhost}>경기 분석</Link>
        </div>
      </section>

      {/* 고유 데이터 자산 — 인용 자석 */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16" aria-label="데이터로 증명하는 예측">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">
          감이 아니라 데이터로 증명합니다
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-500 dark:text-white/45">
          예측이 맞았는지 틀렸는지 매 경기 그대로 기록하고, 누구나 검증할 수 있게 공개합니다.
        </p>
        <div className="mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {PROOF.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group relative block rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
            >
              <p.Icon className="h-7 w-7 text-rose-500 dark:text-rose-400" strokeWidth={1.75} aria-hidden />
              <h3 className="mt-3 text-lg font-bold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">
                {p.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-white/55">{p.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 종목별 분석 — "OO 분석 사이트" 키워드 */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16" aria-label="종목별 분석">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white text-center">
          축구·야구·농구·하키, 종목별 분석
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-500 dark:text-white/45">
          종목마다 핵심 변수를 모델에 반영합니다 — 야구는 선발 투수, 하키는 골리, 축구는 라인업과 xG.
        </p>
        <div className="mt-8 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
          {SPORTS.map((s) => (
            <Link
              key={s.name}
              href={s.href}
              className="group block rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 sm:p-6 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none"
            >
              <div className="flex items-center gap-2.5">
                <s.Icon className="h-6 w-6 text-rose-500 dark:text-rose-400" strokeWidth={1.75} aria-hidden />
                <h3 className="text-lg font-bold tracking-tight text-zinc-950 group-hover:underline underline-offset-4 decoration-2 dark:text-white">
                  {s.name}
                </h3>
              </div>
              <div className="mt-2 text-xs font-medium text-rose-600/90 dark:text-rose-400/80">{s.leagues}</div>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-white/55">{s.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 방법론 */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-16" aria-label="예측 방법론">
        <div className="rounded-[2rem] bg-white p-6 sm:p-10 shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">예측은 이렇게 만듭니다</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">Elo + 통계모델</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">
                팀 전력을 Elo 레이팅으로 수치화하고, 축구는 Dixon-Coles와 xG, 야구는 선발 투수, 하키는 골리 성적을 더해 승부 확률을 계산합니다.
              </p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">시장 배당 블렌드</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">
                베팅 시장의 평균 배당에서 마진을 제거한 확률과 모델 확률을 앙상블해, 한쪽으로 치우치지 않은 예측을 만듭니다.
              </p>
            </div>
            <div>
              <div className="text-lg font-bold text-zinc-900 dark:text-white">시점 기반 백테스트</div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-white/55">
                적중률은 경기 전에 산출한 예측을 결과로 채점한 값입니다. 끝난 뒤 보정하거나 맞은 경기만 고르지 않습니다.
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs text-zinc-400 dark:text-white/35">
            ⓘ 모든 확률은 통계 모델 기반 추정치이며, 베팅을 권유하지 않는 스포츠 분석 참고용 정보입니다. 경기 결과를 보장하지 않습니다.
          </p>
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
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">예측 적중률부터 확인하세요</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm sm:text-base text-white/70">
            회원가입 없이 무료로 경기별 AI 분석·승부예측과 13개 리그 적중률, GPT-5.6 정면 비교 성적표를 바로 볼 수 있습니다.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/predictions/accuracy" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-white/90">
              적중률 보기 →
            </Link>
            <Link href="/analysis" className="inline-flex items-center justify-center gap-2 rounded-full bg-white/10 px-7 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/20">
              오늘 경기 분석
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
