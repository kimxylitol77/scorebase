// UFC 체급별·파운드-포-파운드 랭킹 페이지 — MmaRanking(주간 UFC.com 스냅샷) 을 읽어 탭 뷰로 렌더.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import UfcRankingsView, { type RankCategory, type RankedFighter } from "./UfcRankingsView";

export const revalidate = 3600; // 랭킹은 주 1회 갱신 → 1시간 캐시로 충분

export const metadata: Metadata = {
  title: "UFC 랭킹 — 체급별 순위·파운드-포-파운드 (한글)",
  description:
    "UFC 공식 체급별 랭킹과 파운드-포-파운드(P4P) 순위. 헤비급·라이트급·웰터급 등 남녀 전 체급 챔피언과 컨텐더 1~15위를 한국어 이름·전적과 함께. 매주 자동 갱신, 데이터 UFC.com.",
  keywords: ["UFC 랭킹", "UFC 순위", "체급별 랭킹", "파운드 포 파운드", "P4P", "UFC 챔피언", "UFC 헤비급 랭킹", "MMA 랭킹"],
  alternates: { canonical: "https://www.scorebase.kr/rankings/ufc" },
};

export default async function UfcRankingsPage() {
  const rows = await prisma.mmaRanking.findMany({ orderBy: { sortOrder: "asc" } });

  const categories: RankCategory[] = rows.map((r) => ({
    slug: r.slug,
    displayName: r.displayName,
    gender: r.gender as "M" | "F",
    isP4p: r.isP4p,
    sortOrder: r.sortOrder,
    champion: r.champion ? (JSON.parse(r.champion) as RankedFighter) : null,
    ranks: JSON.parse(r.ranks) as RankedFighter[],
  }));

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-400">
          <Link href="/scores" className="hover:underline">라이브 스코어</Link>
          <span>›</span>
          <Link href="/scores?sport=mma" className="hover:underline">UFC</Link>
          <span>›</span>
          <span className="text-neutral-600 dark:text-neutral-300">랭킹</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> UFC 랭킹
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">UFC 랭킹</h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          체급별 챔피언·컨텐더 순위와 파운드-포-파운드(P4P) 랭킹. 매주 갱신 · 데이터 UFC.com.
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <div className="text-3xl">🥊</div>
          <h2 className="mt-2 text-base font-bold">UFC 랭킹 준비 중</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500">랭킹 데이터를 수집 중입니다. 곧 추가됩니다.</p>
        </div>
      ) : (
        <UfcRankingsView categories={categories} />
      )}
    </main>
  );
}
