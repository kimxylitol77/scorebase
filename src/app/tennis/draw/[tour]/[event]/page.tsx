// 테니스 대회 드로우(대진표) 페이지 — ESPN scoreboard 재구성, 표시 전용.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import TennisDraw from "@/components/scores/tennis/TennisDraw";
import { getTennisDraw, type Tour } from "@/lib/sports/tennis-draw";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 300;

function parseTour(t: string): Tour | null {
  return t === "atp" || t === "wta" ? t : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tour: string; event: string }>;
}): Promise<Metadata> {
  const { tour: tourRaw, event } = await params;
  const tour = parseTour(tourRaw);
  if (!tour) return { title: "테니스 대진표" };
  const draw = await getTennisDraw(tour, event);
  if (!draw) return { title: "테니스 대진표" };
  const label = tour === "atp" ? "ATP" : "WTA";
  return {
    title: `${draw.name} 대진표 — ${label} 토너먼트 브래킷`,
    description: `${draw.name} ${label} 단식 대진표. 라운드별 경기 결과와 세트 스코어를 한눈에 — 스코어베이스 테니스.`,
    alternates: { canonical: `${SITE_URL}/tennis/draw/${tour}/${event}` },
  };
}

export default async function TennisDrawPage({
  params,
}: {
  params: Promise<{ tour: string; event: string }>;
}) {
  const { tour: tourRaw, event } = await params;
  const tour = parseTour(tourRaw);
  if (!tour) notFound();
  const draw = await getTennisDraw(tour, event);
  if (!draw) notFound();
  const label = tour === "atp" ? "ATP 남자" : "WTA 여자";

  return (
    <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 테니스 · {draw.tour} 단식
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          {draw.name} 대진표
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {label} 단식 대진표입니다. 라운드별로 이른 경기부터 결승까지, 세트 스코어와 승자를 표시합니다.
          한국 선수는 빨간색으로 강조됩니다.
        </p>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white/60 p-3 sm:p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
        <TennisDraw draw={draw} />
      </section>

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/scores?sport=tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🎾 테니스 라이브 스코어
        </Link>
        <Link
          href="/rankings/tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          세계 랭킹
        </Link>
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        예선 라운드는 제외한 본선 단식 기준입니다. 데이터 출처 ESPN · 5분 갱신.
      </footer>
    </main>
  );
}
