// /predictions/starters/{matchId} — 선발 매치업 카드 1건 공유 페이지.
// 카톡·스레드 미리보기가 그 카드 이미지(/api/og/starter-card)로 뜨도록 카드별 og:image 를 준다.
// 오늘·내일 한정 임시 카드라 색인은 막고(noindex) 공유 착지 페이지로만 쓴다.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import StarterMatchupCard, { starterCardTitle, type StarterMatch } from "@/components/predictions/StarterMatchupCard";
import { parseStarter, type StarterJson } from "@/lib/predict/starter-card";
import { ChevronLeft, User } from "lucide-react";

export const revalidate = 600;

const SELECT = {
  id: true,
  externalId: true,
  league: true,
  startTime: true,
  status: true,
  predHome: true,
  predAway: true,
  homeScore: true,
  awayScore: true,
  homeStarter: true,
  awayStarter: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
} as const;

async function getMatch(param: string): Promise<StarterMatch | null> {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) return null;
  return prisma.match.findUnique({ where: { id }, select: SELECT }).catch(() => null);
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const m = await getMatch(matchId);
  if (!m) return { title: "선발 매치업 | Scorebase", robots: { index: false, follow: true } };

  const title = starterCardTitle(m);
  const description = `${title.split(" — ")[0]} 선발 맞대결 — ERA · WHIP · K/9 와 최근 3등판 폼, AI 승률까지 한 장으로.`;
  const image = `/api/og/starter-card?m=${m.id}`;
  return {
    title: `${title} | Scorebase`,
    description,
    robots: { index: false, follow: true },
    alternates: { canonical: `/predictions/starters/${m.id}` },
    openGraph: { title, description, images: [image], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function StarterCardPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const m = await getMatch(matchId);
  if (!m) notFound();

  return (
    <div className="relative max-w-lg mx-auto px-4 sm:px-6 py-8">
      <AmbientGlow />
      <nav className="text-xs text-neutral-500 mb-3">
        <Link href="/predictions/starters" className="hover:text-neutral-700 dark:hover:text-neutral-300">선발 매치업</Link>
        <span className="mx-1">›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{m.league}</span>
      </nav>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-keep mb-1">{starterCardTitle(m)}</h1>
      <p className="mb-5 text-sm text-neutral-600 break-keep dark:text-neutral-400">
        ERA · WHIP · K/9 와 최근 3등판 폼, AI 승률을 한 장으로. 아래 버튼으로 공유하거나 게시판에 올릴 수 있습니다.
      </p>

      <StarterMatchupCard m={m} />

      {/* 투수 개인 카드 — 한 명만 따로 공유하고 싶을 때 */}
      {(() => {
        const sides: Array<{ side: "home" | "away"; s: StarterJson | null }> = [
          { side: "home", s: parseStarter(m.homeStarter) },
          { side: "away", s: parseStarter(m.awayStarter) },
        ];
        const named = sides.filter((x) => x.s?.name);
        if (named.length === 0) return null;
        return (
          <div className="mt-4">
            <div className="mb-1.5 text-[11px] font-semibold text-neutral-400">투수 개인 카드</div>
            <div className="flex flex-wrap gap-2">
              {named.map(({ side, s }) => (
                <Link
                  key={side}
                  href={`/predictions/starters/${m.id}/${side}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-2 text-xs font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
                >
                  <User className="h-3.5 w-3.5 text-neutral-400" aria-hidden />
                  {s!.name}
                </Link>
              ))}
            </div>
          </div>
        );
      })()}

      <Link
        href="/predictions/starters"
        className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden /> 오늘의 선발 매치업 전체 보기
      </Link>

      <p className="mt-6 text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 선발 정보는 구단 발표 후 자동 수집됩니다. ERA·WHIP·K/9 는 시즌 누적, 최근 3등판 폼은 KBO·MLB 만 제공.
        AI 승률은 선발 능력치가 반영된 자체 모델 추정입니다.
      </p>
    </div>
  );
}
