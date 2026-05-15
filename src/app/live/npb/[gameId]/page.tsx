// /live/npb/[gameId] — NPB 매치 라이브 상세 페이지.
// gameId = api-sports Baseball game id (= 우리 Match.externalId).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import BaseballLiveDetail from "@/components/BaseballLiveDetail";
import BaseballPreMatchInsight, {
  type StarterInfo,
} from "@/components/BaseballPreMatchInsight";
import { fetchNpbPhotoUrl } from "@/lib/sports/npb-official";
import TeamFormInsight from "@/components/TeamFormInsight";
import { calcForm } from "@/lib/predict/form";
import type { PredictMatch } from "@/lib/predict/types";

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

function parseStarterFull(json: string | null): StarterInfo | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as StarterInfo;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "NPB" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  return {
    title: `${away} vs ${home} 라이브 — NPB`,
    description: `${away} vs ${home} NPB 일본프로야구 라이브 스코어 · 이닝별 점수 · 안타·실책 · 양팀 선발투수.`,
    alternates: { canonical: `https://www.scorebase.kr/live/npb/${gameId}` },
  };
}

export default async function NpbLivePage({ params }: Props) {
  const { gameId } = await params;
  if (!/^\d+$/.test(gameId)) notFound();

  const match = await prisma.match.findFirst({
    where: { externalId: gameId, league: "NPB" },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);

  const homeStarterFull = parseStarterFull(match.homeStarter);
  const awayStarterFull = parseStarterFull(match.awayStarter);
  // NPB 사진은 npb.jp scraping 필요 — pid 있으면 SSR 단에서 fetch
  const [homeStarterPhoto, awayStarterPhoto] = await Promise.all([
    homeStarterFull?.pid ? fetchNpbPhotoUrl(String(homeStarterFull.pid)) : Promise.resolve(undefined),
    awayStarterFull?.pid ? fetchNpbPhotoUrl(String(awayStarterFull.pid)) : Promise.resolve(undefined),
  ]);

  // 최근 5경기 폼
  const since = new Date(match.startTime.getTime() - 60 * 24 * 3600 * 1000);
  const recentMatches = await prisma.match.findMany({
    where: {
      league: "NPB",
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
        <Link href="/leagues/NPB" className="hover:underline">
          NPB
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
          NPB · 라이브 스코어 · 15초 자동 갱신
        </p>
      </header>
      <BaseballLiveDetail
        gameId={gameId}
        league="NPB"
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeAbbr={match.homeTeam.shortName ?? null}
        awayAbbr={match.awayTeam.shortName ?? null}
        homeLogo={match.homeTeam.logoUrl ?? null}
        awayLogo={match.awayTeam.logoUrl ?? null}
        homeStarter={parseStarter(match.homeStarter)}
        awayStarter={parseStarter(match.awayStarter)}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
      />
      <BaseballPreMatchInsight
        league="NPB"
        homeStarter={homeStarterFull}
        awayStarter={awayStarterFull}
        homeTeamName={homeKo}
        awayTeamName={awayKo}
        homeStarterPhoto={homeStarterPhoto ?? null}
        awayStarterPhoto={awayStarterPhoto ?? null}
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
