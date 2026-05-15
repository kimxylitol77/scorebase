// /live/[league]/[gameId] — NBA / NHL / 축구 (EPL·LALIGA·... 8개 리그) 라이브 상세.
// MLB/KBO/NPB/LOL 은 자체 라우트 (/live/{mlb,kbo,npb,lol}/[gameId]) 가 우선 매칭됨.
//
// gameId = Match.externalId (NBA/NHL = ESPN id, 축구 = api-football fixture id 등).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import SportLiveDetail from "@/components/SportLiveDetail";
import NhlGoalieInsight, { type GoalieInfo } from "@/components/NhlGoalieInsight";
import TeamFormInsight from "@/components/TeamFormInsight";
import { calcForm } from "@/lib/predict/form";
import type { PredictMatch } from "@/lib/predict/types";

const SOCCER_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
]);

function parseGoalie(json: string | null): GoalieInfo | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as GoalieInfo;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

const SUPPORTED = new Set([
  "NBA",
  "NHL",
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
]);

const LEAGUE_LABEL: Record<string, string> = {
  NBA: "NBA",
  NHL: "NHL",
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵",
};

interface Props {
  params: Promise<{ league: string; gameId: string }>;
}

async function findMatch(league: string, gameId: string) {
  return prisma.match.findFirst({
    where: { externalId: gameId, league },
    include: { homeTeam: true, awayTeam: true },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, gameId } = await params;
  const lg = league.toUpperCase();
  if (!SUPPORTED.has(lg)) return { title: "라이브 매치를 찾을 수 없습니다" };
  const match = await findMatch(lg, gameId);
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  const label = LEAGUE_LABEL[lg] ?? lg;
  return {
    title: `${away} vs ${home} 라이브 — ${label}`,
    description: `${away} vs ${home} ${label} 라이브 스코어 · 쿼터/피리어드 별 점수 또는 골 이벤트.`,
    alternates: { canonical: `https://www.scorebase.kr/live/${lg}/${gameId}` },
  };
}

export default async function GenericLivePage({ params }: Props) {
  const { league, gameId } = await params;
  const lg = league.toUpperCase();
  if (!SUPPORTED.has(lg)) notFound();
  if (!gameId) notFound();

  const match = await findMatch(lg, gameId);
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const label = LEAGUE_LABEL[lg] ?? lg;

  // 최근 5경기 폼 — 같은 리그의 FINISHED 매치만 조회 (지난 60일)
  const since = new Date(match.startTime.getTime() - 60 * 24 * 3600 * 1000);
  const recentMatches = await prisma.match.findMany({
    where: {
      league: lg,
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

  // NHL 골리 (다른 리그는 null)
  const homeGoalie = lg === "NHL" ? parseGoalie(match.homeGoalie) : null;
  const awayGoalie = lg === "NHL" ? parseGoalie(match.awayGoalie) : null;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/leagues/${lg}`} className="hover:underline">
          {label}
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
          {label} · 라이브 스코어 · 20초 자동 갱신
        </p>
      </header>

      <SportLiveDetail
        gameId={gameId}
        league={lg}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeLogoUrl={match.homeTeam.logoUrl ?? null}
        awayLogoUrl={match.awayTeam.logoUrl ?? null}
        initialHomeScore={match.homeScore}
        initialAwayScore={match.awayScore}
        initialStatus={match.status as "FINISHED" | "SCHEDULED" | "LIVE" | "POSTPONED"}
      />

      {lg === "NHL" && (homeGoalie || awayGoalie) && (
        <NhlGoalieInsight
          homeGoalie={homeGoalie}
          awayGoalie={awayGoalie}
          homeTeamName={homeKo}
          awayTeamName={awayKo}
        />
      )}

      <TeamFormInsight
        homeForm={homeForm}
        awayForm={awayForm}
        homeTeamName={homeKo}
        awayTeamName={awayKo}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        hasDraw={SOCCER_LEAGUES.has(lg)}
      />
    </div>
  );
}
