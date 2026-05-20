// /live/[league]/[gameId] — NBA / NHL / 축구 (EPL·LALIGA·... 8개 리그) 라이브 상세.
// MLB/KBO/NPB/LOL 은 자체 라우트 (/live/{mlb,kbo,npb,lol}/[gameId]) 가 우선 매칭됨.
//
// gameId = Match.externalId (NBA/NHL = ESPN id, 축구 = api-football fixture id 등).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY, SPORTS } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import SportLiveDetail from "@/components/SportLiveDetail";
import SoccerGoalDistributionCard from "@/components/scores/soccer/SoccerGoalDistributionCard";
import SoccerH2HCard from "@/components/scores/soccer/SoccerH2HCard";
import SoccerLineupSvg from "@/components/scores/soccer/SoccerLineupSvg";
import SoccerLiveStatsCard from "@/components/scores/soccer/SoccerLiveStatsCard";
import SoccerTeamStatsCard from "@/components/scores/soccer/SoccerTeamStatsCard";
import teamIdMapping from "@/lib/sports/thesports/team-id-mapping.json";
import NhlGoalieInsight, { type GoalieInfo } from "@/components/NhlGoalieInsight";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";

// 축구 리그 — SPORTS.soccer.leagues 단일 출처에서 derive (신규 리그 추가 자동 동기화)
const SOCCER_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

function parseGoalie(json: string | null): GoalieInfo | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as GoalieInfo;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

// 지원 리그 — 모든 축구 + NBA/NHL (MLB/KBO/NPB/LOL 은 자체 라우트)
const SUPPORTED = new Set([
  "NBA",
  "NHL",
  ...(SPORTS.find((s) => s.code === "soccer")?.leagues ?? []),
]);

// 리그 라벨은 LEAGUE_DISPLAY (sport-leagues.ts) 단일 출처 사용 — 사이드바와 통일.

// 우리 Team.id → TheSports team_id 매핑 (server-side lookup)
const TEAM_ID_MAP: Map<number, string> = new Map(
  (teamIdMapping as Array<{ ourId: number; tsId: string }>).map((t) => [t.ourId, t.tsId]),
);
function tsTeamId(ourTeamId: number): string | null {
  return TEAM_ID_MAP.get(ourTeamId) ?? null;
}

interface Props {
  params: Promise<{ league: string; gameId: string }>;
}

async function findMatch(league: string, gameId: string) {
  // DB 연결 실패 (P1001) 시 null 반환 — dev 환경 에러 오버레이 방지.
  try {
    return await prisma.match.findFirst({
      where: { externalId: gameId, league },
      include: { homeTeam: true, awayTeam: true, theSportsCache: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, gameId } = await params;
  const lg = league.toUpperCase();
  if (!SUPPORTED.has(lg)) return { title: "라이브 매치를 찾을 수 없습니다" };
  const match = await findMatch(lg, gameId);
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name, lg);
  const away = toKoreanTeamName(match.awayTeam.name, lg);
  const label = LEAGUE_DISPLAY[lg] ?? lg;
  return {
    title: `${home} vs ${away} 라이브 — ${label}`,
    description: `${home} vs ${away} ${label} 라이브 스코어 · 쿼터/피리어드 별 점수 또는 골 이벤트.`,
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

  const homeKo = toKoreanTeamName(match.homeTeam.name, lg);
  const awayKo = toKoreanTeamName(match.awayTeam.name, lg);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;
  const label = LEAGUE_DISPLAY[lg] ?? lg;

  const extras = await fetchMatchExtras(match);

  // NHL 골리 (다른 리그는 null)
  const homeGoalie = lg === "NHL" ? parseGoalie(match.homeGoalie) : null;
  const awayGoalie = lg === "NHL" ? parseGoalie(match.awayGoalie) : null;

  const isSoccer = SOCCER_LEAGUES.has(lg);
  const scoreLabel = isSoccer
    ? { for: "평균득점", against: "평균실점" }
    : lg === "NHL"
      ? { for: "평균득점", against: "평균실점" }
      : lg === "NBA"
        ? { for: "평균득점", against: "평균실점" }
        : { for: "평균득점", against: "평균실점" };

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
          {homeKo} vs {awayKo}
        </span>
      </nav>
      <header>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          <Link
            href={`/teams/${match.homeTeam.id}`}
            className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            {homeKo}
          </Link>{" "}
          <span className="text-neutral-400">vs</span>{" "}
          <Link
            href={`/teams/${match.awayTeam.id}`}
            className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            {awayKo}
          </Link>
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          {label} · 라이브 스코어 · 20초 자동 갱신
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        league={lg}
      />

      <SportLiveDetail
        gameId={gameId}
        league={lg}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeNameEn={match.homeTeam.name}
        awayNameEn={match.awayTeam.name}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeLogoUrl={match.homeTeam.logoUrl ?? null}
        awayLogoUrl={match.awayTeam.logoUrl ?? null}
        initialHomeScore={match.homeScore}
        initialAwayScore={match.awayScore}
        initialStatus={match.status as "FINISHED" | "SCHEDULED" | "LIVE" | "POSTPONED"}
      />

      {/* TheSports 카드 (축구만, cache 있을 때) */}
      {isSoccer && match.theSportsCache && (() => {
        const cache = match.theSportsCache;
        const analysis = cache.analysis as {
          goal_distribution?: { home: unknown; away: unknown };
          history?: { vs?: unknown[] };
        } | null;
        const lineup = cache.lineup as Parameters<typeof SoccerLineupSvg>[0]["data"] | null;
        const detailLive = cache.detailLive as { stats?: Array<{ type: number; home: number; away: number }> } | null;
        const teamStats = cache.teamStats as Parameters<typeof SoccerTeamStatsCard>[0]["teamStats"] | null;
        const gd = analysis?.goal_distribution;
        const h2h = analysis?.history?.vs ?? [];
        const homeTsId = tsTeamId(match.homeTeam.id);
        const awayTsId = tsTeamId(match.awayTeam.id);
        // teamStats (named fields v3) 우선, fallback 으로 detailLive.stats (type-coded)
        return (
          <>
            {teamStats && Array.isArray(teamStats) && teamStats.length >= 2 ? (
              <SoccerTeamStatsCard
                teamStats={teamStats}
                homeNameKo={homeKo}
                awayNameKo={awayKo}
                homeTsTeamId={homeTsId}
                awayTsTeamId={awayTsId}
              />
            ) : (
              detailLive?.stats && detailLive.stats.length > 0 && (
                <SoccerLiveStatsCard
                  stats={detailLive.stats}
                  homeNameKo={homeKo}
                  awayNameKo={awayKo}
                />
              )
            )}
            {lineup && lineup.lineup && (
              <SoccerLineupSvg
                data={lineup}
                homeNameKo={homeKo}
                awayNameKo={awayKo}
              />
            )}
            {gd && gd.home && gd.away && (
              <SoccerGoalDistributionCard
                homeNameKo={homeKo}
                awayNameKo={awayKo}
                data={gd as Parameters<typeof SoccerGoalDistributionCard>[0]["data"]}
              />
            )}
            {h2h.length > 0 && (
              <SoccerH2HCard
                homeNameKo={homeKo}
                awayNameKo={awayKo}
                homeTsTeamId={homeTsId}
                awayTsTeamId={awayTsId}
                history={h2h}
              />
            )}
          </>
        );
      })()}

      {lg === "NHL" && (homeGoalie || awayGoalie) && (
        <NhlGoalieInsight
          homeGoalie={homeGoalie}
          awayGoalie={awayGoalie}
          homeTeamName={homeKo}
          awayTeamName={awayKo}
        />
      )}

      <MatchHeadToHead
        homeShortName={homeShort}
        awayShortName={awayShort}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        h2hHome={extras.h2hHome}
        homeStanding={extras.homeStanding}
        awayStanding={extras.awayStanding}
        totalTeams={extras.totalTeams}
        hasDraw={isSoccer}
        scoreLabel={scoreLabel}
      />
    </div>
  );
}
