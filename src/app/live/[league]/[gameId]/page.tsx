// /live/[league]/[gameId] — NBA / NHL / 축구 (EPL·LALIGA·... 8개 리그) 라이브 상세.
// MLB/KBO/NPB/LOL 은 자체 라우트 (/live/{mlb,kbo,npb,lol}/[gameId]) 가 우선 매칭됨.
//
// gameId = Match.externalId (NBA/NHL = ESPN id, 축구 = api-football fixture id 등).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY, SPORTS } from "@/lib/sports/sport-leagues";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { getOddsHistory } from "@/lib/odds/snapshot-store";
import { toKoreanTeamName } from "@/lib/team-names";
import SportLiveDetail from "@/components/SportLiveDetail";
import SoccerGoalDistributionCard from "@/components/scores/soccer/SoccerGoalDistributionCard";
import SoccerH2HCard from "@/components/scores/soccer/SoccerH2HCard";
import SoccerLineupSvg from "@/components/scores/soccer/SoccerLineupSvg";
import SoccerHalfTimeStatsCard from "@/components/scores/soccer/SoccerHalfTimeStatsCard";
import SoccerLiveStatsCard from "@/components/scores/soccer/SoccerLiveStatsCard";
import SoccerTeamStatsCard from "@/components/scores/soccer/SoccerTeamStatsCard";
import SoccerVenueCard from "@/components/scores/soccer/SoccerVenueCard";
import MatchTrendChart from "@/components/live/MatchTrendChart";
import teamIdMapping from "@/lib/sports/thesports/team-id-mapping.json";
import NhlGoalieInsight, { type GoalieInfo } from "@/components/NhlGoalieInsight";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import { getVenueByOurTeamId } from "@/lib/sports/thesports/venues";
import { fetchMatchPrediction, fetchTeamSeasonStats, fetchFixtureRound } from "@/lib/sports/api-football-extras";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import MatchPredictionsCard from "@/components/live/MatchPredictionsCard";
import TeamSeasonStatsCard from "@/components/live/TeamSeasonStatsCard";
import UpcomingFixturesCard, { type UpcomingFixture } from "@/components/live/UpcomingFixturesCard";
import KickoffCountdown from "@/components/live/KickoffCountdown";

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

// 지원 리그 — 모든 축구 + NBA/WNBA/NHL (MLB/KBO/NPB/LOL 은 자체 라우트)
const SUPPORTED = new Set([
  "NBA",
  "WNBA", // 2026-05-21 추가 — DB 데이터 기반 정적 표시. 라이브 폴링은 follow-up (api-sports↔ESPN id 매핑 필요)
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

  // 양 팀 리그 순위 — TheSports standings cache 기반. fetch 실패/매핑 누락 시 null.
  const standingsRows = await getFullStandings(lg).catch(() => []);
  const positionByTeamId = new Map(standingsRows.map((r) => [r.teamId, r.position]));
  const homePosition = positionByTeamId.get(match.homeTeam.id) ?? null;
  const awayPosition = positionByTeamId.get(match.awayTeam.id) ?? null;

  // 라이브 배당 시계열 — 최근 30 snapshot (sparkline). 매치 없으면 빈 배열.
  const oddsHistory = await getOddsHistory(match.id).catch(() => []);

  // NHL 골리 (다른 리그는 null)
  const homeGoalie = lg === "NHL" ? parseGoalie(match.homeGoalie) : null;
  const awayGoalie = lg === "NHL" ? parseGoalie(match.awayGoalie) : null;

  const isSoccer = SOCCER_LEAGUES.has(lg);

  // api-football /predictions + /teams/statistics — 친선·예선처럼 리그 standings
  // 없는 매치의 정보 빈약 보완. fetch native cache 로 호출 부담 최소화.
  const afLeagueId = isSoccer ? API_FOOTBALL_LEAGUE_ID[lg] : undefined;
  const afSeason = match.startTime.getUTCFullYear();
  const homeAfExtId = isSoccer ? match.homeTeam.externalId : null;
  const awayAfExtId = isSoccer ? match.awayTeam.externalId : null;
  const [matchPrediction, homeAfStats, awayAfStats, fixtureRound] = isSoccer
    ? await Promise.all([
        fetchMatchPrediction(gameId).catch(() => null),
        afLeagueId && homeAfExtId
          ? fetchTeamSeasonStats(parseInt(homeAfExtId, 10), afLeagueId, afSeason).catch(() => null)
          : Promise.resolve(null),
        afLeagueId && awayAfExtId
          ? fetchTeamSeasonStats(parseInt(awayAfExtId, 10), afLeagueId, afSeason).catch(() => null)
          : Promise.resolve(null),
        fetchFixtureRound(gameId).catch(() => null),
      ])
    : [null, null, null, null];

  // 양 팀 다음 경기 — 우리 DB 의 SCHEDULED 매치 가까운 2개씩.
  // 같은 리그 외 컵·국가대표 매치도 cover 위해 league filter 없이 query.
  const upcomingNow = match.startTime;
  const [homeUpcoming, awayUpcoming] = isSoccer
    ? await Promise.all([
        prisma.match.findMany({
          where: {
            OR: [{ homeTeamId: match.homeTeam.id }, { awayTeamId: match.homeTeam.id }],
            status: "SCHEDULED",
            startTime: { gt: upcomingNow },
            NOT: { id: match.id },
          },
          select: {
            id: true, league: true, externalId: true, startTime: true,
            homeTeamId: true, awayTeamId: true,
            homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
          },
          orderBy: { startTime: "asc" },
          take: 2,
        }),
        prisma.match.findMany({
          where: {
            OR: [{ homeTeamId: match.awayTeam.id }, { awayTeamId: match.awayTeam.id }],
            status: "SCHEDULED",
            startTime: { gt: upcomingNow },
            NOT: { id: match.id },
          },
          select: {
            id: true, league: true, externalId: true, startTime: true,
            homeTeamId: true, awayTeamId: true,
            homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
          },
          orderBy: { startTime: "asc" },
          take: 2,
        }),
      ])
    : [[], []];
  const homeUpcomingF: UpcomingFixture[] = homeUpcoming.map((m) => ({
    matchId: m.id, league: m.league, externalId: m.externalId, startTime: m.startTime,
    homeName: m.homeTeam.name, awayName: m.awayTeam.name,
    perspective: m.homeTeamId === match.homeTeam.id ? "home" : "away",
  }));
  const awayUpcomingF: UpcomingFixture[] = awayUpcoming.map((m) => ({
    matchId: m.id, league: m.league, externalId: m.externalId, startTime: m.startTime,
    homeName: m.homeTeam.name, awayName: m.awayTeam.name,
    perspective: m.homeTeamId === match.awayTeam.id ? "home" : "away",
  }));
  // 홈팀 구장 — TheSports venue mapping. 매핑 없으면 null (카드 hide).
  const venue = isSoccer ? getVenueByOurTeamId(match.homeTeam.id) : null;
  const scoreLabel = isSoccer
    ? { for: "평균득점", against: "평균실점" }
    : lg === "NHL"
      ? { for: "평균득점", against: "평균실점" }
      : lg === "NBA"
        ? { for: "평균득점", against: "평균실점" }
        : { for: "평균득점", against: "평균실점" };

  // 이벤트 타임라인 아바타용 player photo map — TheSports lineup cache 의 home/away
  // 객체 (index 키 0..N) 의 each player.logo (md5 hash URL) 추출.
  const playerLogoById: Record<string, string> = {};
  if (isSoccer && match.theSportsCache?.lineup) {
    const lu = (match.theSportsCache.lineup as { lineup?: { home?: Record<string, { id?: string; logo?: string }>; away?: Record<string, { id?: string; logo?: string }> } }).lineup;
    for (const side of [lu?.home, lu?.away]) {
      if (!side) continue;
      for (const p of Object.values(side)) {
        if (p?.id && p?.logo) playerLogoById[p.id] = p.logo;
      }
    }
  }

  // SportsEvent JSON-LD — 검색 rich snippet + AI 인용 source.
  // 라이브/종료 매치 모두 발행 — eventStatus 분기로 의미 명확.
  const eventStatusByMatch =
    match.status === "FINISHED"
      ? "https://schema.org/EventCompleted"
      : match.status === "LIVE"
        ? "https://schema.org/EventInProgress"
        : match.status === "POSTPONED"
          ? "https://schema.org/EventPostponed"
          : "https://schema.org/EventScheduled";
  const sportsEventLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${homeKo} vs ${awayKo}`,
    description: `${homeKo} 대 ${awayKo} ${label} ${fixtureRound ? `· ${fixtureRound} ` : ""}라이브 스코어 + 골 이벤트 + 라인업.`,
    startDate: match.startTime.toISOString(),
    eventStatus: eventStatusByMatch,
    sport: isSoccer ? "Soccer" : lg === "NBA" || lg === "WNBA" ? "Basketball" : lg === "NHL" ? "Ice Hockey" : "Sports",
    homeTeam: {
      "@type": "SportsTeam",
      name: homeKo,
      ...(match.homeTeam.logoUrl ? { logo: match.homeTeam.logoUrl } : {}),
    },
    awayTeam: {
      "@type": "SportsTeam",
      name: awayKo,
      ...(match.awayTeam.logoUrl ? { logo: match.awayTeam.logoUrl } : {}),
    },
    ...(venue
      ? {
          location: {
            "@type": "Place",
            name: venue.name,
            ...(venue.city ? { address: venue.city } : {}),
          },
        }
      : {}),
    organizer: { "@type": "SportsOrganization", name: label },
    url: `https://www.scorebase.kr/live/${lg}/${gameId}`,
    isAccessibleForFree: true,
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventLd) }}
      />
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
        <p className="text-sm text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
          <span>{label}</span>
          {fixtureRound && (
            <span className="text-neutral-400">· {fixtureRound}</span>
          )}
          <span className="text-neutral-400">· 라이브 스코어 · 5초 자동 갱신</span>
          {match.status === "SCHEDULED" && (
            <KickoffCountdown kickoffIso={match.startTime.toISOString()} />
          )}
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
        homePosition={homePosition}
        awayPosition={awayPosition}
        eloPrediction={
          match.predHome != null && match.predAway != null
            ? { home: match.predHome, draw: match.predDraw ?? null, away: match.predAway }
            : null
        }
        oddsHistory={oddsHistory}
        playerLogoById={playerLogoById}
      />

      {/* 팀명 + 최근경기 (상대전적) — 점수 카드 바로 아래로 (사용자 우선순위 2026-05-24) */}
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

      {/* 경기 정보 — 홈팀 구장 (축구만, mapping 있을 때) */}
      {isSoccer && venue && <SoccerVenueCard venue={venue} />}

      {/* 매치 예측 (api-football) — 친선·예선 매치에서 특히 의미 큼 */}
      {isSoccer && matchPrediction && (
        <MatchPredictionsCard
          prediction={matchPrediction}
          homeNameKo={homeKo}
          awayNameKo={awayKo}
        />
      )}

      {/* 시즌 통계 — 한쪽이라도 있으면 표시 */}
      {isSoccer && (homeAfStats || awayAfStats) && (
        <TeamSeasonStatsCard
          home={homeAfStats}
          away={awayAfStats}
          homeNameKo={homeKo}
          awayNameKo={awayKo}
        />
      )}

      {/* 양 팀 다음 경기 — DB SCHEDULED 매치 가까운 2개씩 */}
      {isSoccer && (homeUpcomingF.length > 0 || awayUpcomingF.length > 0) && (
        <UpcomingFixturesCard
          homeNameKo={homeKo}
          awayNameKo={awayKo}
          homeUpcoming={homeUpcomingF}
          awayUpcoming={awayUpcomingF}
        />
      )}

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
        const halfTeamStats = cache.halfTeamStats as Parameters<typeof SoccerHalfTimeStatsCard>[0]["halfTeamStats"] | null;
        // LIVE 매치인데 cache 가 10분 이상 stale 이면 trend 도 옛 데이터일 가능성 큼 →
        // 90분 분량 momentum 이 미리 그려져 진행 분과 불일치. stale 가드 후 hide.
        // (FINISHED 매치는 어차피 더이상 갱신 X 라 stale 무관.)
        const trendStale =
          match.status === "LIVE" &&
          cache.fetchedAt.getTime() < Date.now() - 10 * 60 * 1000;
        const trend = trendStale
          ? null
          : (cache.trend as Parameters<typeof MatchTrendChart>[0]["trend"] | null);
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
            {halfTeamStats && (halfTeamStats.p1 || halfTeamStats.p2 || halfTeamStats.ft) && (
              <SoccerHalfTimeStatsCard
                halfTeamStats={halfTeamStats}
                homeNameKo={homeKo}
                awayNameKo={awayKo}
              />
            )}
            {trend && Array.isArray(trend.data) && trend.data.length > 0 && (
              <MatchTrendChart
                trend={trend}
                homeNameKo={homeKo}
                awayNameKo={awayKo}
                homeScore={match.homeScore}
                awayScore={match.awayScore}
                goals={
                  detailLive
                    ? (() => {
                        const incs = (detailLive as { incidents?: unknown }).incidents;
                        if (!Array.isArray(incs)) return null;
                        return incs
                          .filter((i: Record<string, unknown>) =>
                            typeof i.home_score === "number" || typeof i.away_score === "number",
                          )
                          .map((i: Record<string, unknown>) => ({
                            minute:
                              typeof i.add_time === "number"
                                ? `${i.time}+${i.add_time}'`
                                : `${i.time}'`,
                            side: (i.position === 1 ? "home" : "away") as "home" | "away",
                            player: typeof i.player_name === "string" ? i.player_name : "",
                            ownGoal: false,
                            penaltyKick: i.type === 17,
                          }));
                      })()
                    : null
                }
              />
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

    </div>
    </>
  );
}
