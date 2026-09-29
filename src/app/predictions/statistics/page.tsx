// 인용용 스포츠 예측 통계 — 적중률·시장 비교·수익률·CLV 를 출처 표기 인용용 한 문장씩 매시간 DB 실측으로 다시 쓴다.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import CiteBox from "@/components/CiteBox";
import { SITE_URL } from "@/lib/site-url";
import { ogPageImage } from "@/lib/seo/og";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { citableLines, loadPublicFacts } from "@/lib/predict/public-facts";

export const revalidate = 3600;

const PAGE_URL = `${SITE_URL}/predictions/statistics`;

export const metadata: Metadata = {
  title: "스포츠 예측 통계 — AI 승부예측 적중률·시장 비교·수익률 1차 데이터",
  description:
    "스코어베이스가 직접 채점한 AI 스포츠 예측 1차 통계. 리그별 적중률, 베팅시장과의 정면 비교, 실배당 수익률, 발행 픽의 마감 배당 비교를 출처 표기 시 인용할 수 있는 한 문장으로 매일 갱신합니다.",
  keywords: ["스포츠 예측 통계", "승부예측 적중률", "AI 예측 정확도", "베팅시장 비교", "CLV", "마감 배당"],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "스포츠 예측 통계 — Scorebase",
    description: "직접 채점한 AI 예측 1차 통계를 인용 가능한 문장으로 공개합니다.",
    url: PAGE_URL,
    images: ogPageImage({ title: "스포츠 예측 통계", subtitle: "적중률·시장 비교·수익률·마감 배당, 인용 가능한 1차 데이터", tag: "통계" }),
  },
};

const LINKS = [
  { href: "/predictions/accuracy", title: "적중률 보드", desc: "리그별·시장별 적중률, 누적 추이, 확률 보정 곡선" },
  { href: "/predictions/accuracy#clv", title: "수익률·마감 배당", desc: "실배당 1유닛 시뮬레이션과 발행 픽의 마감 배당 비교" },
  { href: "/predictions/scorecard", title: "AI 성적표", desc: "통계 모델과 범용 AI 가 같은 경기를 예측한 정면 비교" },
  { href: "/value-bets", title: "밸류 베트", desc: "모델 확률이 배당 내재 확률보다 높은 경기" },
];

export default async function PredictionStatisticsPage() {
  const facts = await loadPublicFacts();
  const lines = citableLines(facts);
  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" });
  const counters = [
    { label: "채점 완료 경기", value: facts.oneXTwo.evaluated },
    { label: "시장과 정면 비교", value: facts.headToHead?.evaluated ?? 0 },
    { label: "실배당 수익률 표본", value: facts.flatRoi?.model.all.evaluated ?? 0 },
    { label: "마감 배당 비교 픽", value: facts.clv?.n ?? 0 },
  ].filter((c) => c.value > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "스코어베이스 스포츠 예측 통계",
    description: lines.slice(0, 3).join(" "),
    url: PAGE_URL,
    dateModified: new Date().toISOString(),
    creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    isAccessibleForFree: true,
    license: `${SITE_URL}/terms`,
    variableMeasured: counters.map((c) => ({ "@type": "PropertyValue", name: c.label, value: c.value })),
  };

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <nav className="mb-4 text-xs text-neutral-500">
        <Link href="/predictions" className="hover:underline">예측</Link> / 통계
      </nav>
      <header className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep mb-3">스포츠 예측 통계</h1>
        <p className="text-neutral-600 break-keep dark:text-neutral-400">
          인터넷의 베팅·예측 통계는 대개 같은 설문 몇 개를 돌려 쓴 것입니다. 이 페이지의 숫자는 전부 스코어베이스가
          경기 전에 낸 예측을 경기 후 직접 채점한 1차 데이터이며, {today} 기준으로 매시간 다시 계산합니다.
          잘 맞힌 숫자와 못 맞힌 숫자를 같은 규칙으로 싣습니다.
        </p>
      </header>

      {counters.length > 0 && (
        <section className="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {counters.map((c) => (
            <div key={c.label} className="rounded-xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
              <div className="text-2xl font-bold tabular-nums">{c.value.toLocaleString("ko-KR")}</div>
              <div className="mt-1 text-[11px] text-neutral-500 break-keep">{c.label}</div>
            </div>
          ))}
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-1">핵심 통계 (인용 가능)</h2>
        <p className="mb-4 text-sm text-neutral-600 break-keep dark:text-neutral-400">
          한 줄씩 떼어 인용해도 뜻이 통하도록 문장마다 표본을 넣었습니다. 기사·블로그·AI 답변에 인용할 때는
          &ldquo;스코어베이스&rdquo;와 이 페이지 링크를 출처로 밝혀 주세요.
        </p>
        <ol className="space-y-3">
          {lines.map((l, i) => (
            <li key={i} className="flex gap-3 rounded-xl bg-white px-4 py-3 text-sm leading-relaxed ring-1 ring-black/5 break-keep dark:bg-white/[0.04] dark:ring-white/10">
              <span className="shrink-0 font-bold tabular-nums text-neutral-400">{i + 1}</span>
              <span>{l}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold mb-3">세부 데이터</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-xl bg-white p-4 ring-1 ring-black/5 transition hover:ring-black/15 dark:bg-white/[0.04] dark:ring-white/10 dark:hover:ring-white/25">
              <div className="font-semibold">{l.title} →</div>
              <div className="mt-1 text-xs text-neutral-500 break-keep">{l.desc}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-white p-5 text-sm text-neutral-600 ring-1 ring-black/5 break-keep dark:bg-white/[0.04] dark:text-neutral-400 dark:ring-white/10">
        <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-white">이 숫자는 어떻게 나오나</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>적중률은 경기 시작 전에 저장한 예측만 채점합니다. 경기 후 예측을 고쳐 쓰지 않습니다.</li>
          <li>시장 비교는 북메이커 평균 배당에서 마진을 뺀 확률의 1순위를 &ldquo;시장 픽&rdquo;으로 봅니다.</li>
          <li>수익률은 경기 전 마지막 평균 배당(마진 포함)에 1유닛씩 걸었다는 후행 계산이라, 장기적으로 마이너스가 정상입니다.</li>
          <li>마감 배당 비교는 프리뷰 글 발행 순간의 배당과 경기 직전 배당을 픽 쪽에서 비교합니다. 발행 전 배당 기록이 없는 글은 뺍니다.</li>
          <li>베팅 권유가 아니며, 걸 금액을 추천하지 않습니다.</li>
        </ul>
      </section>

      {lines.length > 0 && (
        <CiteBox citation={`${lines[0].replace(/\.$/, "")} (출처: 스코어베이스 ${PAGE_URL}, ${today} 기준)`} url={PAGE_URL} />
      )}
    </main>
  );
}
