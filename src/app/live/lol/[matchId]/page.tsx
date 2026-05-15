// /live/lol/[matchId] — LCK 매치 라이브 상세 페이지.
// matchId = BALLDONTLIE match id (= 우리 Match.externalId).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import LolLiveDetail from "@/components/LolLiveDetail";
import TeamFormInsight from "@/components/TeamFormInsight";
import { calcForm } from "@/lib/predict/form";
import type { PredictMatch } from "@/lib/predict/types";

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

  // 최근 5경기 폼 (LCK 시즌 매치 — 60일)
  const since = new Date(match.startTime.getTime() - 60 * 24 * 3600 * 1000);
  const recentMatches = await prisma.match.findMany({
    where: {
      league: "LOL",
      status: "FINISHED",
      startTime: { gte: since, lt: match.startTime },
      OR: [
        { homeTeamId: match.homeTeam.id },
        { awayTeamId: match.homeTeam.id },
        { homeTeamId: match.awayTeam.id },
        { awayTeamId: match.awayTeam.id },
      ],
    },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      status: true,
    },
    orderBy: { startTime: "desc" },
    take: 60,
  });
  const formMatches: PredictMatch[] = recentMatches.map((m) => ({
    id: m.id,
    league: m.league,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    startTime: m.startTime,
    status: m.status as PredictMatch["status"],
  }));
  const homeForm = calcForm(formMatches, match.homeTeam.id, match.startTime, 5);
  const awayForm = calcForm(formMatches, match.awayTeam.id, match.startTime, 5);

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
          <Link
            href={`/teams/${match.awayTeam.id}`}
            className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            {awayKo}
          </Link>{" "}
          <span className="text-neutral-400">vs</span>{" "}
          <Link
            href={`/teams/${match.homeTeam.id}`}
            className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            {homeKo}
          </Link>
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
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
      />
      <TeamFormInsight
        homeForm={homeForm}
        awayForm={awayForm}
        homeTeamName={homeKo}
        awayTeamName={awayKo}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
      />
    </div>
  );
}
