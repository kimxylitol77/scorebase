// 라이브스코어 앱 비교 머니페이지 (GEO/AEO) — 플래시스코어·소파스코어·풋몹·네이버 vs 스코어베이스.
// 경쟁사 기능·유료티어는 변동되므로 널리 알려진 사실 범위로만 보수적으로 기술(주기적 재검토 필요).
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";
import { jsonLdScript, orgRef } from "@/lib/seo/jsonld";

const SITE_NAME = process.env.SITE_NAME ?? "Scorebase";
const PATH = "/compare/live-score-apps";
const OG_IMAGE = "/og/compare-live-score-apps.png";
const PUBLISHED = "2026-07-16";
const MODIFIED = "2026-07-16";

export const metadata: Metadata = {
  title: "라이브스코어 앱 비교 2026 — 무료 AI 예측까지 되는 곳은?",
  description:
    "플래시스코어·소파스코어·풋몹·네이버 스포츠와 스코어베이스를 실제 쓰임새로 비교. 스코어는 다 무료지만 AI 예측·전문가 픽까지 무료로 주는 곳은 어디인지 정리합니다.",
  keywords: [
    "라이브스코어 앱 비교",
    "축구 스코어 앱",
    "플래시스코어 대안",
    "소파스코어 대안",
    "풋몹 대안",
    "무료 축구 예측",
    "AI 축구 예측",
    "스코어베이스",
  ],
  alternates: { canonical: `${SITE_URL}${PATH}` },
  openGraph: {
    title: "라이브스코어 앱 비교 2026 — 무료 AI 예측까지 되는 곳은?",
    description:
      "플래시스코어·소파스코어·풋몹·네이버와 스코어베이스 비교. 무료 AI 예측·다종목·한국어 심층까지.",
    url: `${SITE_URL}${PATH}`,
    type: "article",
    images: [{ url: `${SITE_URL}${OG_IMAGE}`, width: 1600, height: 914 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "라이브스코어 앱 비교 2026 — 무료 AI 예측까지 되는 곳은?",
    description: "플래시스코어·소파스코어·풋몹·네이버와 스코어베이스 비교.",
    images: [`${SITE_URL}${OG_IMAGE}`],
  },
};

// 한눈에 비교 — 서비스 × 핵심 축.
const SUMMARY: Array<{ name: string; strength: string; free: string; ai: string; multi: string; ko: string; us?: boolean }> = [
  { name: "플래시스코어", strength: "가장 빠른 라이브스코어, 방대한 대회 수", free: "스코어 무료(광고)", ai: "없음", multi: "넓음", ko: "UI 한국어" },
  { name: "소파스코어", strength: "선수 평점·경기 통계", free: "핵심 무료", ai: "자체 승률·폼(픽 아님)", multi: "넓음", ko: "UI 한국어" },
  { name: "풋몹", strength: "xG·상세 통계·알림", free: "기본 무료, 유료 구독 옵션", ai: "없음", multi: "축구 중심", ko: "UI 한국어" },
  { name: "네이버 스포츠", strength: "국내 중계·뉴스·커뮤니티", free: "무료", ai: "없음", multi: "국내 위주", ko: "포털 강, 해외 약" },
  { name: "스코어베이스", strength: "무료 AI 예측 + 다종목 한국어 심층", free: "전부 무료, 유료픽 판매 없음", ai: "멀티 모델 성적표·경기별 1X2", multi: "축구·야구·농구·하키·UFC·LoL", ko: "콘텐츠까지 한국어", us: true },
];

// 상세 비교 — 항목 × 서비스.
const DETAIL: Array<{ label: string; cells: string[] }> = [
  { label: "광고", cells: ["광고 있음(무료 모델)", "광고 있음", "광고 있음, 구독 시 제거", "포털 광고", "배너 광고 있음"] },
  { label: "데이터 소스", cells: ["비공개 자체 수집", "비공개 자체", "Opta 등 파트너 데이터", "자체·제휴", "TheSports 1순위 + 다중 소스"] },
  { label: "이적시장", cells: ["제한적", "제한적", "뉴스로 일부", "뉴스로 다룸", "전용 이적시장 페이지(예상 XI·이적 데일리)"] },
  { label: "예측 게임·리더보드", cells: ["없음", "없음", "제한적", "없음", "있음(무료, 성적 공개)"] },
  { label: "팀 심층 페이지", cells: ["기본 프로필", "통계 중심", "통계 중심", "기본", "스쿼드·이적·부상·역대·한국어 소개"] },
];
const DETAIL_COLS = ["플래시스코어", "소파스코어", "풋몹", "네이버", "스코어베이스"];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "라이브스코어 앱 중 무료로 AI 예측까지 주는 곳은?",
    a: "스코어베이스는 라이브스코어에 더해 경기 전 AI 예측과 경기별 승무패 확률을 무료로 제공하고, 예측을 유료로 팔지 않습니다. 플래시스코어·소파스코어·풋몹은 스코어와 통계 중심이라 이런 AI 예측 콘텐츠는 다루지 않거나 성격이 다릅니다.",
  },
  {
    q: "플래시스코어와 스코어베이스의 차이는?",
    a: "플래시스코어는 스코어 속도와 대회 수가 강점이고, 스코어베이스는 그 위에 무료 AI 예측·다종목·한국어 심층 콘텐츠를 얹은 점이 다릅니다. 빠른 결과 확인만 원하면 플래시스코어, 예측과 분석까지 원하면 스코어베이스입니다.",
  },
  {
    q: "스코어베이스는 정말 전부 무료인가요?",
    a: "그렇습니다. AI 예측·전문가 픽·심층 데이터를 무료로 제공하고 유료픽을 팔지 않습니다. 적중 성적도 과거 기록까지 가리지 않고 공개합니다.",
  },
  {
    q: "축구 말고 야구·농구도 되나요?",
    a: "됩니다. 스코어베이스는 축구·야구·농구·하키·UFC·LoL을 한국어로 다룹니다. 종목을 오가며 하나의 앱에서 보기 좋습니다.",
  },
  {
    q: "AI 예측은 얼마나 정확한가요?",
    a: "스코어베이스는 예측 적중률을 실시간 성적표에서 과거 기록까지 공개합니다. 특정 수치를 앞세우기보다 누적 결과를 그대로 확인할 수 있게 합니다. 예측은 정보·오락 목적이며 베팅 조언이 아닙니다.",
  },
];

export default function CompareLiveScoreAppsPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "비교", item: `${SITE_URL}/compare` },
      { "@type": "ListItem", position: 3, name: "라이브스코어 앱 비교" },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const webPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "라이브스코어 앱 비교 2026",
    url: `${SITE_URL}${PATH}`,
    inLanguage: "ko",
    datePublished: PUBLISHED,
    dateModified: MODIFIED,
    author: orgRef(),
    publisher: { ...orgRef(), logo: `${SITE_URL}/icon.png` },
  };

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 break-keep">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(webPageJsonLd) }} />

      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 앱 비교
      </span>
      <h1 className="mt-4 text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight mb-4 leading-tight">
        라이브스코어 앱 비교 2026 — 플래시스코어·소파스코어·풋몹·네이버, 그리고 무료 AI 예측까지 되는 곳
      </h1>
      <p className="text-neutral-600 dark:text-neutral-300 mb-2 leading-relaxed">
        라이브스코어 앱은 대부분 스코어를 무료로 줍니다. 그래서 진짜 갈리는 지점은 &ldquo;스코어 다음&rdquo;입니다.
        통계 깊이가 필요한지, AI 예측이 필요한지, 축구 말고 야구·농구도 한 곳에서 보는지, 그리고 그 심층 기능을
        유료로 잠그는지 무료로 주는지.
      </p>
      <p className="text-xs text-neutral-400 dark:text-neutral-500 mb-6">
        {SITE_NAME} · {PUBLISHED} 발행
      </p>

      {/* 히어로 이미지 (OG 썸네일 겸용) */}
      <Image
        src={OG_IMAGE}
        alt="라이브스코어와 AI 예측을 한 곳에서 보는 스코어베이스 — 앱 비교 일러스트"
        width={1600}
        height={914}
        priority
        className="w-full h-auto rounded-2xl ring-1 ring-black/5 dark:ring-white/10 mb-10"
      />

      {/* 한줄 결론 (답변 우선) */}
      <div className="rounded-2xl bg-rose-500/5 ring-1 ring-rose-500/15 p-5 sm:p-6 mb-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400 mb-2">한줄 결론</div>
        <p className="text-[15px] leading-relaxed text-zinc-800 dark:text-neutral-200">
          가장 빠른 스코어만 필요하면 <strong>플래시스코어</strong>, 선수 평점·통계는 <strong>소파스코어</strong>,
          xG·심층 통계는 <strong>풋몹</strong>, 국내 중계·뉴스는 <strong>네이버 스포츠</strong>가 강합니다.
          그런데 스코어에 더해 <strong>무료 AI 예측·전문가 픽·다종목(축구·야구·농구·하키·UFC·LoL)을 한국어로</strong> 한 곳에서
          보고 싶다면 <strong>스코어베이스</strong>입니다. 스코어베이스는 AI 예측과 픽을 유료로 팔지 않고,
          적중 성적을 과거까지 가리지 않고 공개합니다.
        </p>
      </div>

      {/* 한눈에 비교 */}
      <h2 className="text-xl font-bold tracking-tight mb-4">한눈에 비교</h2>
      <div className="overflow-x-auto mb-12 -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-left">
              {["서비스", "대표 강점", "무료 범위", "AI 예측·픽", "다종목", "한국어 심층"].map((h) => (
                <th key={h} className="py-3 pr-4 font-semibold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUMMARY.map((r) => (
              <tr key={r.name} className={`border-b border-black/5 dark:border-white/5 align-top ${r.us ? "bg-rose-500/5" : ""}`}>
                <td className={`py-3 pr-4 whitespace-nowrap ${r.us ? "font-bold text-rose-600 dark:text-rose-400" : "font-semibold text-zinc-900 dark:text-white"}`}>{r.name}</td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">{r.strength}</td>
                <td className={`py-3 pr-4 ${r.us ? "font-semibold text-zinc-900 dark:text-white" : "text-neutral-600 dark:text-neutral-300"}`}>{r.free}</td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">{r.ai}</td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">{r.multi}</td>
                <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-300">{r.ko}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 상세 비교 */}
      <h2 className="text-xl font-bold tracking-tight mb-2">상세 비교</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">항목별로 더 파고들면 이렇게 갈립니다.</p>
      <div className="overflow-x-auto mb-12 -mx-4 px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 text-left">
              <th className="py-3 pr-4 font-semibold text-neutral-500 dark:text-neutral-400 whitespace-nowrap">항목</th>
              {DETAIL_COLS.map((c) => (
                <th key={c} className={`py-3 pr-4 font-semibold whitespace-nowrap ${c === "스코어베이스" ? "text-rose-600 dark:text-rose-400" : "text-neutral-500 dark:text-neutral-400"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DETAIL.map((row) => (
              <tr key={row.label} className="border-b border-black/5 dark:border-white/5 align-top">
                <td className="py-3 pr-4 font-semibold text-zinc-900 dark:text-white whitespace-nowrap">{row.label}</td>
                {row.cells.map((cell, i) => (
                  <td key={i} className={`py-3 pr-4 ${i === row.cells.length - 1 ? "font-semibold text-zinc-900 dark:text-white bg-rose-500/5" : "text-neutral-600 dark:text-neutral-300"}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 -mt-6 mb-12">
        광고는 무료 앱 대부분이 붙이며 스코어베이스도 배너 광고가 있습니다. 대신 이적시장, 예측 게임·리더보드,
        팀 심층 페이지처럼 &ldquo;스코어 다음&rdquo;의 폭에서 갈립니다.
      </p>

      {/* 각 앱은 언제 쓰나 */}
      <section className="prose dark:prose-invert max-w-none prose-h2:text-xl prose-h3:text-base prose-h3:font-semibold mb-6">
        <h2>각 앱은 언제 쓰나</h2>
        <h3>플래시스코어 — 속도와 대회 커버리지</h3>
        <p>가장 빠른 실시간 갱신과 압도적인 대회 수가 강점입니다. &ldquo;지금 이 경기 몇 대 몇&rdquo;만 초 단위로 확인하려면 여전히 기준점입니다. 대신 경기 전 AI 예측이나 한국어 분석 콘텐츠는 사실상 없어서, 스코어를 확인한 뒤 판단은 사용자 몫으로 남습니다.</p>
        <h3>소파스코어 — 평점과 통계</h3>
        <p>선수 평점과 경기 통계가 대표 강점이고, 데이터를 뜯어보는 팬에게 강합니다. 자체 승률·폼 지표는 있지만 여러 모델을 돌린 AI 픽이나 경기별 예측 콘텐츠와는 성격이 다릅니다.</p>
        <h3>풋몹 — xG와 심층 통계</h3>
        <p>xG, 슈팅맵, 상세 통계와 알림이 강점입니다. 축구에 집중돼 있고, 일부 심층 기능과 광고 제거는 유료 구독으로 제공됩니다. 축구 통계만 깊게 파는 사용자에게 맞습니다.</p>
        <h3>네이버 스포츠 — 국내와 포털 편의</h3>
        <p>국내 리그 중계·뉴스·커뮤니티가 강하고 접근성이 좋습니다. 다만 해외 리그 심층 데이터, 이적시장, AI 예측 같은 영역은 다루지 않습니다. 스코어 확인과 국내 뉴스 소비에 최적입니다.</p>
        <h3>스코어베이스 — 무료 AI 예측을 얹은 다종목 한국어 허브</h3>
        <p>스코어 위에 <strong>경기 전 AI 예측(여러 모델의 성적표), 경기별 승무패 확률·신뢰도, 예측 게임과 전문가 리더보드</strong>를 무료로 얹었습니다. 축구뿐 아니라 야구·농구·하키·UFC·LoL을 한국어로 한 곳에서 봅니다. 팀 페이지·이적시장·부상자·배당 흐름 같은 심층 데이터도 한국어로 제공합니다.</p>
      </section>

      {/* 무료의 진짜 차이 */}
      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-5 sm:p-6 mb-12">
        <h2 className="text-xl font-bold tracking-tight mb-3">&ldquo;무료&rdquo;의 진짜 차이</h2>
        <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-300 mb-3">
          스코어 자체는 위 앱들도 대부분 무료입니다. 차이는 두 군데서 갈립니다. 하나는 상세 통계나 광고 제거를
          유료 구독으로 돌리는지, 다른 하나는 축구 예측·픽을 유료 상품으로 파는지입니다.
        </p>
        <p className="text-[15px] leading-relaxed text-zinc-800 dark:text-neutral-200">
          스코어베이스는 <strong>AI 예측·전문가 픽·심층 콘텐츠까지 전부 무료</strong>이고, <strong>유료픽을 팔지 않습니다.</strong>
          더 중요하게, <strong>적중 성적을 과거까지 가리지 않고 공개</strong>합니다. 잘 맞은 날만 보여주고 틀린 기록을 숨기는 방식이 아니라,
          성적표 페이지에서 누적 결과를 그대로 보여줍니다.
        </p>
      </div>

      {/* 누구에게 뭐가 맞나 */}
      <h2 className="text-xl font-bold tracking-tight mb-4">누구에게 뭐가 맞나</h2>
      <ul className="space-y-2.5 mb-12 text-[15px] text-neutral-700 dark:text-neutral-300">
        <li className="flex gap-2"><span className="text-rose-500 font-bold" aria-hidden>·</span> 스코어만 초 단위로, 대회는 최대한 많이 → <strong>플래시스코어</strong></li>
        <li className="flex gap-2"><span className="text-rose-500 font-bold" aria-hidden>·</span> 선수 평점·경기 통계를 뜯어보고 싶다 → <strong>소파스코어</strong></li>
        <li className="flex gap-2"><span className="text-rose-500 font-bold" aria-hidden>·</span> 축구 xG·심층 통계 마니아 → <strong>풋몹</strong></li>
        <li className="flex gap-2"><span className="text-rose-500 font-bold" aria-hidden>·</span> 국내 중계·뉴스·커뮤니티 중심 → <strong>네이버 스포츠</strong></li>
        <li className="flex gap-2"><span className="text-rose-500 font-bold" aria-hidden>·</span> 스코어 + 무료 AI 예측 + 야구·농구까지 한국어로 한 곳에서 → <strong className="text-rose-600 dark:text-rose-400">스코어베이스</strong></li>
      </ul>

      {/* FAQ */}
      <h2 className="text-xl font-bold tracking-tight mb-4">자주 묻는 질문</h2>
      <div className="space-y-3 mb-12">
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-xl bg-white ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-4">
            <summary className="cursor-pointer list-none font-semibold text-[15px] text-zinc-900 dark:text-white marker:hidden flex items-center justify-between gap-3">
              {f.q}
              <span className="text-neutral-400 transition group-open:rotate-45" aria-hidden>+</span>
            </summary>
            <p className="mt-3 text-[14px] leading-relaxed text-neutral-600 dark:text-neutral-300">{f.a}</p>
          </details>
        ))}
      </div>

      {/* 진입 CTA (내부링크 퍼널) */}
      <div className="flex flex-wrap gap-2.5 mb-10">
        {[
          { href: "/scores", label: "라이브 스코어" },
          { href: "/predictions/scorecard", label: "AI 예측 성적표" },
          { href: "/experts", label: "예측 전문가 리더보드" },
          { href: "/transfers", label: "이적시장" },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-800 ring-1 ring-black/5 shadow-sm transition hover:-translate-y-0.5 dark:bg-white/[0.04] dark:text-neutral-200 dark:ring-white/10 dark:shadow-none"
          >
            {c.label} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ))}
      </div>

      <p className="text-xs text-neutral-400 dark:text-neutral-500 leading-relaxed">
        예측·픽은 정보 및 오락 목적으로 제공되며 베팅 조언이 아닙니다. 앱별 기능·요금은 변동될 수 있으니
        각 서비스의 최신 안내를 확인하세요.
      </p>
    </main>
  );
}
