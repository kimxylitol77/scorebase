// /en/rankings/ufc — UFC 체급별·P4P 랭킹 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import { koEnLanguages, enWeightClass } from "@/lib/i18n/en";
import UfcRankingsView, { type RankCategory, type RankedFighter } from "./UfcRankingsView";

export const revalidate = 3600; // 랭킹은 주 1회 갱신 → 1시간 캐시로 충분

export const metadata: Metadata = {
  title: "UFC Rankings — Divisional and Pound-for-Pound",
  description:
    "Official UFC divisional rankings and pound-for-pound (P4P) standings. Champions and the top 15 contenders in every men's and women's division, with records. Updated weekly from UFC.com.",
  keywords: ["UFC rankings", "UFC standings", "pound for pound", "P4P rankings", "UFC champions", "UFC heavyweight rankings", "MMA rankings"],
  alternates: {
    canonical: "https://www.scorebase.kr/en/rankings/ufc",
    languages: koEnLanguages("/rankings/ufc", "/en/rankings/ufc"),
  },
};

export default async function UfcRankingsPage() {
  const rows = await prisma.mmaRanking.findMany({ orderBy: { sortOrder: "asc" } });

  const parsed = rows.map((r) => ({
    slug: r.slug,
    displayName: enWeightClass(r.displayName),
    gender: r.gender as "M" | "F",
    isP4p: r.isP4p,
    sortOrder: r.sortOrder,
    champion: r.champion ? (JSON.parse(r.champion) as RankedFighter) : null,
    ranks: JSON.parse(r.ranks) as RankedFighter[],
  }));

  // 랭킹 JSON엔 espnId 필드가 없어 headshot URL(.../full/{espnId}.png)에서 추출 → teamId 매핑(파이터 상세 링크)
  const espnIdFromHeadshot = (url: string | null): string | null => url?.match(/\/full\/(\d+)\.png/)?.[1] ?? null;
  const espnIds = new Set<string>();
  for (const c of parsed) {
    const ce = espnIdFromHeadshot(c.champion?.headshot ?? null);
    if (ce) espnIds.add(ce);
    for (const f of c.ranks) {
      const e = espnIdFromHeadshot(f.headshot);
      if (e) espnIds.add(e);
    }
  }
  const fighters = espnIds.size
    ? await prisma.mmaFighter.findMany({ where: { espnId: { in: [...espnIds] } }, select: { espnId: true, teamId: true } })
    : [];
  const teamIdByEspn = new Map(fighters.map((f) => [f.espnId!, f.teamId]));
  const withHref = (f: RankedFighter): RankedFighter => {
    const e = espnIdFromHeadshot(f.headshot);
    const tid = e ? teamIdByEspn.get(e) : undefined;
    return tid != null ? { ...f, href: `/en/ufc/fighters/${tid}` } : f;
  };

  const categories: RankCategory[] = parsed.map((c) => ({
    ...c,
    champion: c.champion ? withHref(c.champion) : null,
    ranks: c.ranks.map(withHref),
  }));

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/en/scores" className="hover:underline">Live Scores</Link>
          <span>›</span>
          <Link href="/en/scores?sport=mma" className="hover:underline">UFC</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">Rankings</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> UFC Rankings
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">UFC Rankings</h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          Divisional champion and contender rankings plus pound-for-pound (P4P). Updated weekly · data from UFC.com.
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <div className="text-3xl">🥊</div>
          <h2 className="mt-2 text-base font-bold">UFC rankings coming soon</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">We are still collecting ranking data. It will appear shortly.</p>
        </div>
      ) : (
        <UfcRankingsView categories={categories} />
      )}
    </main>
  );
}
