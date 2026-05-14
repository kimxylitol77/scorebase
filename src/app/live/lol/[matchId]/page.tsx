// /live/lol/[matchId] — LCK 매치 라이브 상세 페이지.
// matchId = BALLDONTLIE match id (= 우리 Match.externalId).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import LolLiveDetail from "@/components/LolLiveDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ matchId: string }>;
}

function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const match = await prisma.match.findFirst({
    where: { externalId: matchId, league: "LOL" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  return {
    title: `${away} vs ${home} 라이브 — LCK`,
    description: `${away} vs ${home} LCK 매치 라이브 시리즈 점수. BO3/BO5 진행 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/live/lol/${matchId}` },
  };
}

export default async function LolLivePage({ params }: Props) {
  const { matchId } = await params;
  if (!/^\d+$/.test(matchId)) notFound();

  const match = await prisma.match.findFirst({
    where: { externalId: matchId, league: "LOL" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const date = kstDate(match.startTime);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href="/leagues/LOL" className="hover:underline">
          LCK
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300 truncate">
          {awayKo} vs {homeKo}
        </span>
      </nav>
      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          {awayKo} <span className="text-neutral-400">vs</span> {homeKo}
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          LCK · 시리즈 점수 자동 갱신
        </p>
      </header>
      <LolLiveDetail
        matchId={Number(matchId)}
        date={date}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeLogo={match.homeTeam.logoUrl ?? null}
        awayLogo={match.awayTeam.logoUrl ?? null}
      />
    </div>
  );
}
