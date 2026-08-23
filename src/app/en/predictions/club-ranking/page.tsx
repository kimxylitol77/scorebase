// /en/predictions/club-ranking — 세계 클럽 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, Trophy } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";
import { prisma } from "@/lib/db";
import rawClubs from "../../../../../data/club-rankings.json";
import clubMeta from "../../../../../data/club-rankings-meta.json";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { koEnLanguages } from "@/lib/i18n/en";

interface ClubRank { id: string; rank: number; name: string; logo: string | null; countryLogo: string | null; points: number; prev: number; change: number }
const CLUBS = rawClubs as ClubRank[];
// 상위 클럽 — JSON-LD ItemList + 본문 SEO 문구용 (한글명 부여)
const TOP = CLUBS.slice(0, 10).map((c) => ({ ...c, ko: c.name }));
const TOP_NAMES = TOP.slice(0, 5).map((c) => c.ko).join(", ");

export const metadata: Metadata = {
  title: `World Football Club Rankings — Top ${CLUBS.length} by Points`,
  description: `World club rankings down to ${CLUBS.length}th. Positions, points and movement for ${TOP_NAMES} and every other ranked club, refreshed regularly alongside league tables, title probabilities and market values.`,
  keywords: [
    "club rankings", "world club rankings", "football club rankings", "club power rankings",
    "European club rankings", "club rankings 2026",
    "Bayern Munich ranking", "Real Madrid ranking", "Man City ranking", "PSG ranking", "Barcelona ranking",
  ],
  alternates: {
    canonical: "/en/predictions/club-ranking",
    languages: koEnLanguages("/predictions/club-ranking", "/en/predictions/club-ranking"),
  },
  openGraph: {
    title: `World Football Club Rankings — Top ${CLUBS.length}`,
    description: `Positions, points and movement for ${TOP_NAMES} and the rest of the world's ranked clubs.`,
    url: `${SITE_URL}/predictions/club-ranking`,
    type: "website",
  },
};

// 구조화 데이터 — ItemList(상위 클럽) + BreadcrumbList. 구글 리치 결과/색인 강화.
const JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/en` },
        { "@type": "ListItem", position: 2, name: "Predictions", item: `${SITE_URL}/en/predictions` },
        { "@type": "ListItem", position: 3, name: "World club rankings", item: `${SITE_URL}/en/predictions/club-ranking` },
      ],
    },
    {
      "@type": "ItemList",
      name: "World Football Club Rankings",
      description: `World football club rankings and points, top ${CLUBS.length}.`,
      numberOfItems: CLUBS.length,
      itemListElement: TOP.map((c) => ({ "@type": "ListItem", position: c.rank, name: c.ko })),
    },
  ],
};

export default async function ClubRankingPage() {
  // ts team id → 우리 Team.id (클럽 페이지 /teams/[id] 링크). 매핑 있는 클럽만 클릭 가능(404 방지).
  const srcRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: CLUBS.map((c) => c.id) } },
    select: { externalId: true, teamId: true },
  });
  const teamByTs = new Map<string, number>();
  for (const r of srcRows) if (!teamByTs.has(r.externalId)) teamByTs.set(r.externalId, r.teamId);
  return (
    <div className="relative min-h-screen">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(JSONLD) }} />
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-900 dark:text-white/45 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" /> Predictions
        </Link>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Club Rankings
        </span>
        <div className="mt-4 flex items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-2 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep text-zinc-950 dark:text-white">
            <Trophy className="h-7 w-7 sm:h-8 sm:w-8 text-zinc-500 dark:text-white/50" />
            World Club Rankings
          </h1>
          <span className="shrink-0 text-xs sm:text-sm tabular-nums text-zinc-400 dark:text-white/40">
            TOP {CLUBS.length} · {(clubMeta as { updatedDate: string }).updatedDate} · updated daily
          </span>
        </div>
        <p className="mt-3 text-sm text-zinc-500 break-keep dark:text-white/50">
          World football club rankings — points from recent results, with movement since the last update.
        </p>
        <div className="mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-white p-3 sm:p-5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <ol className="grid grid-cols-1 lg:grid-cols-2 gap-x-5 gap-y-0.5">
            {CLUBS.map((c) => {
              const ko = c.name;
              const up = c.change > 0, down = c.change < 0;
              const teamId = teamByTs.get(c.id);
              const cardCls = "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-black/[0.03] dark:hover:bg-white/[0.06]";
              const inner = (
                <>
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
                  {c.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo} alt="" className="w-5 h-5 shrink-0 object-contain" />
                  ) : (
                    <span className="w-5 shrink-0" aria-hidden />
                  )}
                  <span className="flex-1 truncate text-sm text-zinc-800 dark:text-white/85">{ko}</span>
                  {(up || down) && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
                      {up ? "▲" : "▼"}{Math.abs(c.change)}
                    </span>
                  )}
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs text-zinc-500 dark:text-white/50">{c.points}</span>
                </>
              );
              return (
                <li key={c.rank}>
                  {teamId ? (
                    <Link href={`/en/teams/${teamId}`} className={cardCls}>{inner}</Link>
                  ) : (
                    <div className={cardCls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <p className="mt-4 text-center text-xs text-zinc-400 dark:text-white/35">Club ranking data by Scorebase</p>

        {/* SEO 본문 — 키워드 자연 배치 + 내부 링크 */}
        <div className="mt-10 border-t border-black/5 dark:border-white/10 pt-8 space-y-3">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white">
            What are the world club rankings?
          </h2>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
            The world club rankings convert clubs' recent results into points. Top of the list right now is{" "}
            <strong className="font-medium text-zinc-700 dark:text-white/70">{TOP[0]?.ko}</strong>({TOP[0]?.points} pts), ahead of {TOP[1]?.ko} and {TOP[2]?.ko} . The top {CLUBS.length} clubs are refreshed regularly. The ▲▼ marker beside each club shows movement since the previous update.
          </p>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-white/55">
            League tables and title or relegation probabilities are on{" "}
            <Link href="/en/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Predictions</Link>, player market values on{" "}
            <Link href="/en/transfers" className="font-medium text-blue-600 hover:underline dark:text-blue-400">Transfers</Link>, and national team rankings on{" "}
            <Link href="/en/predictions/fifa-ranking" className="font-medium text-blue-600 hover:underline dark:text-blue-400">FIFA rankings</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
