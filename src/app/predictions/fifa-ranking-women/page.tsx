// /predictions/fifa-ranking-women — FIFA 여자 국가 랭킹 전체. 남자 페이지(fifa-ranking)의 자매 페이지.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Globe } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import {
  FIFA_RANKINGS_WOMEN,
  FIFA_RANKING_DATE_WOMEN,
  fifaCountryKo,
  fifaFlag,
} from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import { jsonLdScript } from "@/lib/seo/jsonld";

// 한국 순위(동적) + 상위국 — metadata·본문·FAQ·JSON-LD 공용. 하드코딩 금지.
const KOREA_RANK = FIFA_RANKINGS_WOMEN.find((r) => r.name === "Korea Republic")?.rank ?? null;
const PRK_RANK = FIFA_RANKINGS_WOMEN.find((r) => r.name === "Korea DPR")?.rank ?? null;
const TOP3 = FIFA_RANKINGS_WOMEN.slice(0, 3).map((r) => fifaCountryKo(r.name) ?? r.name);
const KO_SUFFIX = KOREA_RANK ? ` (대한민국 ${KOREA_RANK}위)` : "";

export const metadata: Metadata = {
  title: `FIFA 여자 국가 랭킹 ${FIFA_RANKINGS_WOMEN.length}개국 · 여자축구 국가대표 순위${KO_SUFFIX}`,
  description: `${FIFA_RANKING_DATE_WOMEN} 기준 FIFA 여자 국가대표 랭킹 ${FIFA_RANKINGS_WOMEN.length}개국 전체. ${TOP3.join("·")} 등 상위국과 ${KOREA_RANK ? `대한민국(${KOREA_RANK}위)` : "대한민국"} 순위를 국기와 함께 한눈에.`,
  keywords: [
    "FIFA 여자 랭킹", "여자축구 랭킹", "여자 축구 국가대표 순위", "여자 월드컵 랭킹",
    "대한민국 여자축구 순위", "한국 여자축구 랭킹", "북한 여자축구 랭킹",
    "FIFA 여자 랭킹 1위", "스코어베이스",
  ],
  alternates: { canonical: "/predictions/fifa-ranking-women" },
  openGraph: {
    title: `FIFA 여자 국가 랭킹 ${FIFA_RANKINGS_WOMEN.length}개국${KO_SUFFIX}`,
    description: `${FIFA_RANKING_DATE_WOMEN} 기준 FIFA 여자 국가대표 순위 전체 — ${TOP3.join("·")} 등.`,
    url: `${SITE_URL}/predictions/fifa-ranking-women`,
    type: "website",
  },
};

// FAQ — 가시 섹션 + JSON-LD 동시 노출.
const FAQ = [
  {
    q: "대한민국 여자축구 FIFA 랭킹은 몇 위인가요?",
    a: KOREA_RANK
      ? `${FIFA_RANKING_DATE_WOMEN} 발표 기준 대한민국은 FIFA 여자 랭킹 ${KOREA_RANK}위입니다.${PRK_RANK ? ` 북한은 ${PRK_RANK}위입니다.` : ""}`
      : "현재 집계 기준 대한민국 순위는 본 페이지의 순위표에서 확인할 수 있습니다.",
  },
  {
    q: "FIFA 여자 랭킹은 남자 랭킹과 계산법이 다른가요?",
    a: "여자 랭킹은 2003년 도입 때부터 엘로(Elo) 방식으로 산정돼 왔습니다. 경기 결과에 상대 전력·득점차·경기 중요도를 반영하며, 남자 랭킹도 2018년부터 유사한 엘로 기반으로 전환됐습니다.",
  },
  {
    q: "FIFA 여자 랭킹은 언제 갱신되나요?",
    a: "FIFA 는 연 4~6회 여자 랭킹을 발표합니다. 스코어베이스는 발표를 매일 자동 확인해 새 랭킹이 나오면 바로 반영합니다.",
  },
];

const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ItemList",
      name: "FIFA 여자 국가 랭킹",
      description: `${FIFA_RANKING_DATE_WOMEN} 기준 FIFA 여자 국가대표 랭킹 ${FIFA_RANKINGS_WOMEN.length}개국.`,
      numberOfItems: FIFA_RANKINGS_WOMEN.length,
      itemListElement: FIFA_RANKINGS_WOMEN.slice(0, 20).map((r) => ({
        "@type": "ListItem",
        position: r.rank,
        name: fifaCountryKo(r.name) ?? r.name,
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

function buildRanking(): { rank: number; name: string; flag: string }[] {
  return FIFA_RANKINGS_WOMEN.map((r) => ({
    rank: r.rank,
    name: fifaCountryKo(r.name) ?? toKoreanTeamName(r.name, "INTL_FRIENDLY"),
    flag: fifaFlag(r.name),
  }));
}

export default function FifaRankingWomenPage() {
  const ranking = buildRanking();
  // 남자 페이지와 달리 행 링크 없음 — DB 국가대표 Team 은 남자 대표팀이라 잘못 연결된다.
  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(JSONLD) }} />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-14">
        <Link
          href="/predictions/fifa-ranking"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-900 dark:text-white/45 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> 남자 FIFA 랭킹
        </Link>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
            </span>
            <h1 className="mt-4 flex items-center gap-2.5 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep text-zinc-950 dark:text-white">
              <Globe className="h-7 w-7 sm:h-9 sm:w-9 text-zinc-400 dark:text-white/50" />
              FIFA 여자 국가 랭킹
            </h1>
          </div>
          <span className="shrink-0 text-xs sm:text-sm tabular-nums text-zinc-400 dark:text-white/40">
            {FIFA_RANKING_DATE_WOMEN} FIFA 발표 기준 · {ranking.length}개국 · 매일 자동 갱신
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-500 break-keep dark:text-white/50">
          국제축구연맹(FIFA) 공식 여자 국가대표 랭킹.{" "}
          <Link href="/predictions/fifa-ranking" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            남자 랭킹 보기 →
          </Link>
        </p>

        {/* 대한민국 순위 강조 — "대한민국 여자축구 순위" 검색 의도 직답 */}
        {KOREA_RANK && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 break-keep dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">
            🇰🇷 대한민국은 {FIFA_RANKING_DATE_WOMEN} 기준 <strong className="font-bold">FIFA 여자 {KOREA_RANK}위</strong>입니다.
            {PRK_RANK ? <span className="text-blue-700/70 dark:text-blue-300/70">북한 {PRK_RANK}위</span> : null}
          </div>
        )}

        <div className="mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-3 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-0.5">
            {ranking.map((c) => (
              <li key={c.rank}>
                <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-black/[0.03] dark:hover:bg-white/[0.05]">
                  <span
                    className={`w-6 shrink-0 text-right tabular-nums text-sm font-bold ${
                      c.rank === 1
                        ? "text-amber-500"
                        : c.rank <= 3
                          ? "text-amber-600/80 dark:text-amber-400/80"
                          : c.rank <= 10
                            ? "text-zinc-600 dark:text-white/60"
                            : "text-zinc-400 dark:text-white/35"
                    }`}
                  >
                    {c.rank}
                  </span>
                  <span className="w-5 shrink-0 text-center text-base leading-none" aria-hidden>
                    {c.flag}
                  </span>
                  <span className="truncate text-sm text-zinc-800 dark:text-white/85">{c.name}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* SEO 본문 */}
        <div className="mt-10 border-t border-black/5 dark:border-white/10 pt-8 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            FIFA 여자 국가 랭킹이란?
          </h2>
          <p className="text-sm leading-relaxed text-zinc-600 break-keep dark:text-white/55">
            FIFA 여자 국가 랭킹은 국제축구연맹(FIFA)이 발표하는 여자 국가대표팀 순위로, 2003년 도입 때부터
            엘로(Elo) 방식으로 산정돼 왔습니다. {FIFA_RANKING_DATE_WOMEN} 기준 1위는 {TOP3[0]},
            2위 {TOP3[1]}, 3위 {TOP3[2]} 순이며, {KOREA_RANK ? `대한민국은 ${KOREA_RANK}위입니다.` : "전체 순위는 위 표에서 확인할 수 있습니다."}
          </p>
          <p className="text-sm leading-relaxed text-zinc-600 break-keep dark:text-white/55">
            남자 국가대표 순위는{" "}
            <Link href="/predictions/fifa-ranking" className="font-medium text-blue-600 hover:underline dark:text-blue-400">FIFA 국가 랭킹</Link>,
            리그별 시즌 우승 확률은{" "}
            <Link href="/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">예측 대시보드</Link>에서
            확인할 수 있습니다.
          </p>
        </div>

        {/* FAQ — 가시 섹션 (JSON-LD FAQPage 와 동일 내용) */}
        <div className="mt-8 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            자주 묻는 질문
          </h2>
          {FAQ.map((f) => (
            <div key={f.q} className="rounded-xl bg-white p-4 ring-1 ring-black/5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:hover:bg-white/[0.06]">
              <p className="text-sm font-semibold text-zinc-900 break-keep dark:text-white">Q. {f.q}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 break-keep dark:text-white/60">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
