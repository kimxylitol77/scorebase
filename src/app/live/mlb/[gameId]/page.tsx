// /live/mlb/[gameId] — MLB 매치 라이브 상세 페이지.
// gameId = ESPN game id (= 우리 Match.externalId, MLB collector 가 ESPN ID 사용).
// SSR: DB Match 조회로 메타데이터 + 한글팀명. 라이브 데이터는 클라이언트가 polling.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import MlbLiveDetail from "@/components/MlbLiveDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "MLB" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) {
    return { title: "라이브 매치를 찾을 수 없습니다" };
  }
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  return {
    title: `${away} vs ${home} 라이브 — MLB`,
    description: `${away} vs ${home} MLB 라이브 스코어 · 이닝별 점수 · 베이스 상황 · 볼/스트라이크/아웃 · 현재 투수/타자.`,
    alternates: { canonical: `https://www.scorebase.kr/live/mlb/${gameId}` },
  };
}

export default async function MlbLivePage({ params }: Props) {
  const { gameId } = await params;
  if (!/^\d+$/.test(gameId)) notFound();

  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "MLB" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href="/leagues/MLB" className="hover:underline">
          MLB
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
          MLB · 라이브 스코어 · 10초 자동 갱신
        </p>
      </header>

      <MlbLiveDetail
        gameId={gameId}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
      />
    </div>
  );
}
