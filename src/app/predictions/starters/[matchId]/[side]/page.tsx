// /predictions/starters/{matchId}/{home|away} — 선발 투수 1명 개인 카드 공유 페이지.
// 매치업 카드(../)의 투수 단위 버전. 카드별 og:image 로 카톡·스레드 미리보기가 그 투수 카드로 뜬다.
// 오늘·내일 한정 임시 카드라 색인은 막고(noindex) 공유 착지 페이지로만 쓴다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import PitcherSoloCard, { pitcherOf, type PitcherMatch, type StarterSide } from "@/components/predictions/PitcherSoloCard";
import { ChevronLeft } from "lucide-react";

export const revalidate = 600;

const SELECT = {
  id: true,
  league: true,
  startTime: true,
  homeStarter: true,
  awayStarter: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
} as const;

async function load(matchId: string, side: string) {
  const id = Number(matchId);
  if (!Number.isInteger(id) || id <= 0) return null;
  if (side !== "home" && side !== "away") return null;
  const m: PitcherMatch | null = await prisma.match
    .findUnique({ where: { id }, select: SELECT })
    .catch(() => null);
  if (!m) return null;
  const p = pitcherOf(m, side as StarterSide);
  return p ? { m, side: side as StarterSide, ...p } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchId: string; side: string }>;
}): Promise<Metadata> {
  const { matchId, side } = await params;
  const d = await load(matchId, side);
  if (!d) return { title: "선발 투수 카드 | Scorebase", robots: { index: false, follow: true } };

  const title = `${d.s.name} — ${d.m.league} 선발 카드`;
  const description = `${d.s.name} (${d.team}) 선발 기록 — ERA · WHIP · K/9 와 최근 3등판 폼을 한 장으로.`;
  const image = `/api/og/pitcher-card?m=${d.m.id}&s=${d.side}`;
  return {
    title: `${title} | Scorebase`,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `/predictions/starters/${d.m.id}/${d.side}` },
    openGraph: { title, description, images: [image], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function PitcherCardPage({
  params,
}: {
  params: Promise<{ matchId: string; side: string }>;
}) {
  const { matchId, side } = await params;
  const d = await load(matchId, side);
  if (!d) notFound();

  return (
    <div className="relative mx-auto max-w-lg px-4 py-8 sm:px-6">
      <AmbientGlow />
      <nav className="mb-3 text-xs text-neutral-500">
        <Link href="/predictions/starters" className="hover:text-neutral-700 dark:hover:text-neutral-300">선발 매치업</Link>
        <span className="mx-1">›</span>
        <Link href={`/predictions/starters/${d.m.id}`} className="hover:text-neutral-700 dark:hover:text-neutral-300">
          {d.team} vs {d.opponent}
        </Link>
      </nav>
      <h1 className="mb-1 text-2xl font-bold tracking-tight break-keep sm:text-3xl">{d.s.name} 선발 카드</h1>
      <p className="mb-5 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        {d.team} 선발 {d.s.name} — 시즌 기록과 최근 3등판 폼. 아래 버튼으로 공유하거나 게시판에 올릴 수 있습니다.
      </p>

      <PitcherSoloCard m={d.m} side={d.side} s={d.s} team={d.team} opponent={d.opponent} />

      <Link
        href={`/predictions/starters/${d.m.id}`}
        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> 맞대결 카드 보기
      </Link>

      <p className="mt-6 text-[11px] leading-relaxed text-neutral-500">
        ⓘ ERA·WHIP·K/9 는 시즌 누적, 최근 3등판 폼은 KBO·MLB 만 제공합니다. 선발 정보는 구단 발표 후 자동 수집됩니다.
      </p>
    </div>
  );
}
