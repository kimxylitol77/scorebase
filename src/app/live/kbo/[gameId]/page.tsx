// /live/kbo/[gameId] — KBO 매치 라이브 상세 페이지.
// gameId = api-sports Baseball game id (= 우리 Match.externalId).
// SSR: DB Match 조회로 메타데이터 + 한글팀명 + 선발투수.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import BaseballLiveDetail from "@/components/BaseballLiveDetail";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ gameId: string }>;
}

function parseStarter(json: string | null): string | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { name?: string };
    return obj.name?.trim() || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "KBO" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  return {
    title: `${away} vs ${home} 라이브 — KBO`,
    description: `${away} vs ${home} KBO 라이브 스코어 · 이닝별 점수 · 안타·실책 · 양팀 선발투수.`,
    alternates: { canonical: `https://www.scorebase.kr/live/kbo/${gameId}` },
  };
}

export default async function KboLivePage({ params }: Props) {
  const { gameId } = await params;
  if (!/^\d+$/.test(gameId)) notFound();

  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "KBO" },
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
        <Link href="/leagues/KBO" className="hover:underline">
          KBO
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
          KBO · 라이브 스코어 · 15초 자동 갱신
        </p>
      </header>
      <BaseballLiveDetail
        gameId={gameId}
        league="KBO"
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeAbbr={match.homeTeam.shortName ?? null}
        awayAbbr={match.awayTeam.shortName ?? null}
        homeLogo={match.homeTeam.logoUrl ?? null}
        awayLogo={match.awayTeam.logoUrl ?? null}
        homeStarter={parseStarter(match.homeStarter)}
        awayStarter={parseStarter(match.awayStarter)}
      />
    </div>
  );
}
