// 사이트 소개 — 데이터로 보는 글로벌 스포츠. 브랜드·서비스 설명(SEO).
import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site-url";
import AmbientGlow from "@/components/AmbientGlow";
import { ArrowRight } from "lucide-react";

const SITE_NAME = process.env.SITE_NAME ?? "Scorebase";

export const metadata: Metadata = {
  title: "Scorebase 소개 — 데이터로 보는 글로벌 스포츠",
  description:
    "Scorebase는 EPL · 라리가 · 분데스리가 · 세리에 A · 리그 1 · MLS · 챔피언스리그 · K리그 · J리그 · KBO · NPB · MLB · NBA · NHL · LCK 등 19개 리그의 경기 결과·프리뷰·시즌 분석을 데이터 기반으로 정리하는 미디어입니다. TheSports·ESPN 등 공식 데이터를 사용하며, Elo 레이팅과 Monte Carlo 시뮬레이션으로 시즌 우승·강등 확률을 추정합니다.",
  alternates: { canonical: `${SITE_URL}/about` },
  openGraph: {
    title: "Scorebase 소개",
    description:
      "데이터로 보는 EPL · NBA · MLB · NHL · 라리가 · 분데스리가 등 글로벌 스포츠.",
    url: `${SITE_URL}/about`,
  },
};

export default function AboutPage() {
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    description:
      "EPL · NBA · MLB · NHL · 유럽 5대 리그 · 챔피언스리그 · MLS 의 경기 결과·프리뷰·시즌 시뮬레이션을 데이터 기반으로 매일 자동 정리하는 스포츠 미디어.",
    sameAs: [],
    foundingDate: "2026",
  };
  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 사이트 소개
      </span>
      <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep mb-3">
        Scorebase 소개
      </h1>
      <p className="text-neutral-500 dark:text-neutral-400 mb-6 break-keep">
        데이터로 보는 글로벌 스포츠 미디어
      </p>
      <div className="mb-10">
        <Link
          href="/blog/about-scorebase"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-800 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:text-neutral-200 dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
        >
          스코어베이스 기능·사용법 자세히 보기 <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      <section className="prose dark:prose-invert max-w-none">
        <h2>우리가 다루는 리그</h2>
        <p>
          Scorebase 는 다음 리그의 경기 결과·프리뷰·시즌 분석을 매일 자동으로
          정리합니다.
        </p>
        <ul>
          <li>
            <strong>축구</strong> ·{" "}
            <Link href="/leagues/EPL">프리미어리그(EPL)</Link>,{" "}
            <Link href="/leagues/LALIGA">라리가</Link>,{" "}
            <Link href="/leagues/BUNDESLIGA">분데스리가</Link>,{" "}
            <Link href="/leagues/SERIE_A">세리에 A</Link>,{" "}
            <Link href="/leagues/LIGUE_1">리그 1</Link>,{" "}
            <Link href="/leagues/MLS">MLS</Link>,{" "}
            <Link href="/leagues/UCL">UEFA 챔피언스리그</Link>, 유로파리그,
            컨퍼런스리그,{" "}
            <Link href="/leagues/K_LEAGUE_1">K리그</Link>,{" "}
            <Link href="/leagues/J1_LEAGUE">J리그</Link>
          </li>
          <li>
            <strong>야구</strong> · <Link href="/leagues/KBO">KBO</Link>,{" "}
            <Link href="/leagues/NPB">NPB</Link>,{" "}
            <Link href="/leagues/MLB">MLB</Link>
          </li>
          <li>
            <strong>농구</strong> · <Link href="/leagues/NBA">NBA</Link>
          </li>
          <li>
            <strong>아이스하키</strong> · <Link href="/leagues/NHL">NHL</Link>
          </li>
          <li>
            <strong>e스포츠</strong> · <Link href="/leagues/LOL">LCK</Link>
          </li>
        </ul>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          AI 프리뷰·리뷰 자동 발행 대상은 위 19개 주요 리그입니다.
        </p>

        <h2>데이터 출처</h2>
        <p>
          모든 경기 데이터는 공식 소스로부터 매시간 수집됩니다.
        </p>
        <ul>
          <li>
            <strong>EPL</strong> — football-data.org (공식 라이선스 API)
          </li>
          <li>
            <strong>TheSports</strong> — 축구·야구·농구·하키 라이브 스코어 +
            라인업·통계·H2H (1순위 소스)
          </li>
          <li>
            <strong>그 외 (NBA·NHL·MLB 등)</strong> — ESPN 공개 scoreboard API
          </li>
        </ul>

        <h2>분석 방법론</h2>
        <h3>Elo 레이팅</h3>
        <p>
          각 팀의 실력을 단일 숫자로 표현하는 Elo 레이팅을 시즌 시작 시 1500점
          기준으로 계산합니다. 매 경기 결과에 따라 레이팅이 갱신되며, 홈
          어드밴티지는 약 60-100점 보정됩니다.
        </p>
        <h3>Monte Carlo 시뮬레이션</h3>
        <p>
          남은 일정을 5,000회 시뮬레이션해 우승·강등·플레이오프 진출
          확률을 추정합니다. 각 시뮬레이션은 두 팀의 Elo 차이를 로지스틱 함수에
          통과시켜 승·무·패 확률을 산출하고, 전체 시즌을 가상으로 완주합니다.
        </p>
        <h3>승률 추정</h3>
        <p>
          개별 경기 승률은 Elo 차이 + 홈 어드밴티지 + 최근 5경기 폼 보정으로
          계산합니다.
        </p>

        <h2>AI 글 작성 정책</h2>
        <p>
          프리뷰·리캡 기사는 위 데이터(시즌 순위·Elo·H2H·최근 폼·홈/원정
          기록)를 컨텍스트로 받은 LLM 이 한국어로 자연스럽게 정리합니다. 자동
          생성된 모든 글은 실제 통계와 일치하는지 데이터 검증을 거쳐
          발행됩니다.
        </p>
        <p>
          시즌 종합 분석 글은 Monte Carlo 결과를 바탕으로 주 1회 자동 작성되며,
          숫자는 모두 시뮬레이션과 통계에서 직접 산출된 값입니다.
        </p>

        <h2>업데이트 주기</h2>
        <ul>
          <li>경기 결과 수집 — 매일 KST 07:00</li>
          <li>프리뷰 자동 생성 — 매일 KST 07:30</li>
          <li>리캡 자동 생성 — 매일 KST 23:00</li>
          <li>시즌 종합 분석 — 매주 월요일 KST 09:00</li>
        </ul>

        <h2>문의</h2>
        <p>
          데이터 오류·사실관계 정정·제휴 문의는 사이트 관리자에게 직접 전달
          부탁드립니다.
        </p>
      </section>
    </main>
  );
}
