// 야구 승리확률 계산기 페이지 본체 — KBO/MLB/NPB 공유. 라우트는 리그별 metadata + 이 컴포넌트만.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import WinProbabilityTool from "@/components/WinProbabilityTool";
import type { WeTable } from "@/lib/predict/win-expectancy";

import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)

interface LeagueCfg {
  label: string; // "KBO" | "MLB" | "NPB"
  slug: string; // "kbo" | "mlb" | "npb"
  ko: string; // "KBO" | "메이저리그" | "일본프로야구"
}

export const WP_LEAGUES: Record<string, LeagueCfg> = {
  kbo: { label: "KBO", slug: "kbo", ko: "KBO" },
  mlb: { label: "MLB", slug: "mlb", ko: "메이저리그" },
  npb: { label: "NPB", slug: "npb", ko: "일본프로야구" },
};

export function buildWpMetadata(slug: string): Metadata {
  const c = WP_LEAGUES[slug];
  const title = `${c.label} 승리확률 계산기 — 상황별 승률·전술 손익 | 스코어베이스`;
  const description = `이닝·점수차·아웃·주자만 입력하면 ${c.ko} 경기 상황별 승리확률(Win Expectancy)을 즉시 계산합니다. 번트·도루·고의4구 등 전술이 승률을 얼마나 바꾸는지까지 보여주는 ${c.label} 전용 전략 계산기.`;
  return {
    title,
    description,
    keywords: [
      `${c.label} 승리확률`, `${c.label} 승률 계산기`, "야구 승리확률", "야구 상황별 승률",
      "Win Expectancy", "야구 전술 계산기", "번트 승률", `${c.label} 전략`,
    ],
    alternates: { canonical: `${SITE_URL}/tools/${c.slug}-win-probability` },
    openGraph: {
      title: `${c.label} 승리확률 계산기 — 상황별 승률·전술 손익`,
      description: `이닝·점수차·아웃·주자로 ${c.label} 승리확률을 즉시 계산. 번트·도루의 승률 손익까지.`,
      url: `${SITE_URL}/tools/${c.slug}-win-probability`,
      type: "website",
    },
  };
}

function faqFor(c: LeagueCfg) {
  return [
    {
      q: "승리확률(Win Expectancy)이 무엇인가요?",
      a: "현재 경기 상황(이닝·점수차·아웃·주자)에서 그 팀이 최종적으로 이길 확률입니다. 점수차만이 아니라 몇 회인지, 주자와 아웃이 어떤지까지 반영해 '지금 누가 유리한가'를 하나의 숫자로 보여줍니다.",
    },
    {
      q: "번트가 정말 손해인가요?",
      a: "대부분의 상황에서 보내기 번트는 승리확률을 약간 깎습니다. 아웃 하나를 내주는 대가가 주자 진루의 이득보다 크기 때문입니다. 다만 점수차가 적은 종반·동점 상황에서는 1점의 가치가 커져 손익이 달라지므로, 계산기로 상황별로 확인하는 것이 좋습니다.",
    },
    {
      q: "숫자는 어떻게 계산되나요?",
      a: `${c.label} 리그 평균 타격 환경으로 마르코프 모델과 몬테카를로 시뮬레이션을 돌려 모든 상황의 승리확률을 미리 계산했습니다. 리그 평균 기준이라 특정 투수·타자·구장은 반영하지 않으며, 방향성과 상대적 크기를 읽는 용도로 적합합니다.`,
    },
    {
      q: "다른 야구 리그도 되나요?",
      a: "KBO·MLB·NPB 세 리그를 모두 같은 엔진으로 제공하며, 각 리그의 득점 환경(KBO 고타선, NPB 투고타저 등)으로 보정해 리그별로 다른 승률이 나옵니다.",
    },
  ];
}

export default function BaseballWinProbabilityPage({ slug, table }: { slug: string; table: WeTable }) {
  const c = WP_LEAGUES[slug];
  const FAQ = faqFor(c);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: `${c.label} 승리확률 계산기`,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/tools/${c.slug}-win-probability`,
      description: `${c.ko} 경기 상황별 승리확률과 번트·도루·고의4구 등 전술의 승률 손익을 계산하는 인터랙티브 도구.`,
      offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
      provider: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <main className="relative mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="mb-3 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-white/40">
        <Link href="/baseball" className="hover:underline" prefetch={false}>야구</Link>
        <span>›</span>
        <span>도구</span>
        <span>›</span>
        <span className="text-rose-600 dark:text-rose-400">{c.label} 승리확률 계산기</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white break-keep">
          {c.label} 승리확률 계산기
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-white/60 break-keep">
          이닝·점수차·아웃·주자를 입력하면 {c.ko} 경기의 <strong>상황별 승리확률</strong>을 즉시 계산합니다.
          번트·도루·고의4구가 승률을 얼마나 바꾸는지까지 보여주는 {c.label} 전용 전략 계산기입니다.
        </p>
      </header>

      <WinProbabilityTool table={table} leagueLabel={c.label} />

      <section className="mt-12 space-y-8 text-[15px] leading-relaxed text-zinc-700 dark:text-white/70">
        <div>
          <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">승리확률(WE)이란</h2>
          <p className="break-keep">
            승리확률(Win Expectancy)은 현재 경기 상황에서 그 팀이 최종적으로 이길 확률입니다. 같은
            1점 차라도 3회의 1점과 9회의 1점은 무게가 다르고, 무사 만루와 2사 주자 없음도 전혀 다릅니다.
            이 계산기는 이닝·점수차·아웃·주자를 모두 반영해 &lsquo;지금 누가 유리한가&rsquo;를 하나의 숫자로 보여줍니다.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">전술 손익 읽는 법</h2>
          <p className="break-keep">
            &lsquo;전술별 승리확률 변화&rsquo;는 강공(그대로 치기) 대비 각 작전의 승률 변화입니다. 보내기 번트는
            대부분 승률을 깎고(아웃 헌납), 도루는 성공률과 상황에 따라 이득이 갈리며, 고의4구는 수비 입장에서
            공격팀 승률을 낮추는 선택입니다. 작전 야구의 통념을 숫자로 검증해 볼 수 있습니다.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">자주 묻는 질문</h2>
          <div className="space-y-4">
            {FAQ.map((f) => (
              <div key={f.q}>
                <p className="font-semibold text-zinc-900 dark:text-white">Q. {f.q}</p>
                <p className="mt-1 break-keep">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[13px] text-zinc-500 dark:text-white/40 break-keep">
          {c.label} 순위·일정은{" "}
          <Link href={`/standings/${c.label}`} className="text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">{c.label} 순위</Link>
          , 야구 전체는{" "}
          <Link href="/baseball" className="text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">야구 허브</Link>
          , 우리 AI의 승부예측 적중률은{" "}
          <Link href="/predictions/scorecard" className="text-rose-600 underline-offset-2 hover:underline dark:text-rose-400">AI 예측 성적표</Link>
          에서 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
