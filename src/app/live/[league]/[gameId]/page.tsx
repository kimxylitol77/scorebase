// /live/[league]/[gameId] — NBA / NHL / 축구 + 9개 야구 리그 (CPBL/WBC/.../LMB) 라이브 상세.
// MLB/KBO/NPB/LOL 은 자체 라우트 (/live/{mlb,kbo,npb,lol}/[gameId]) 가 우선 매칭됨.
//
// gameId = Match.externalId
//   NBA/NHL = ESPN id, 축구 = api-football fixture id,
//   야구 9개 리그 = TheSports ts-{tsMatchId} (thesports-matches route 가 prefix 부여).

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY, SPORTS, BASEBALL_LEAGUES, BASKETBALL_LEAGUES } from "@/lib/sports/sport-leagues";
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
import basketballTeamIdMapping from "@/lib/sports/thesports/basketball-team-id-mapping.json";
import BasketballH2HCard from "@/components/scores/basketball/BasketballH2HCard";
import BasketballLiveOddsTab from "@/components/live/BasketballLiveOddsTab";
import BasketballBoxScoreTab from "@/components/live/BasketballBoxScoreTab";
import NhlGoalieInsight, { type GoalieInfo } from "@/components/NhlGoalieInsight";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchInsight from "@/components/MatchInsight";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import { parseTsFootballScore } from "@/lib/sports/live-scores";
import BaseballLiveDetail from "@/components/BaseballLiveDetail";
import BaseballBoxscoreTabs from "@/components/live/BaseballBoxscoreTabs";
import BaseballTeamStatsCard from "@/components/live/BaseballTeamStatsCard";
import BasketballTeamStatsCard from "@/components/live/BasketballTeamStatsCard";
import HockeyTeamStatsCard from "@/components/scores/hockey/HockeyTeamStatsCard";
import LiveOddsCard from "@/components/live/LiveOddsCard";
import { extractPlayerStats, playerStatColumns } from "@/lib/sports/thesports/baseball-stats";
import { computeBaseballWpa } from "@/lib/live/baseball-wpa";
import { loadBaseballOdds } from "@/lib/odds/baseball-ts-odds";
import { buildPlayerNameMap, buildPlayerPhotoMap } from "@/lib/sports/thesports/baseball-player-names";
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

// 지원 리그 — 모든 축구 + NBA/WNBA/NHL + 모든 야구 (KBO/NPB/MLB/LOL 은 자체 라우트 우선)
const SUPPORTED = new Set([
  ...(SPORTS.find((s) => s.code === "basketball")?.leagues ?? []), // NBA + WNBA + KBL + WKBL
  ...(SPORTS.find((s) => s.code === "hockey")?.leagues ?? []), // NHL + IIHF_WC
  ...(SPORTS.find((s) => s.code === "soccer")?.leagues ?? []),
  ...(SPORTS.find((s) => s.code === "baseball")?.leagues ?? []),
]);

// 리그 라벨은 LEAGUE_DISPLAY (sport-leagues.ts) 단일 출처 사용 — 사이드바와 통일.

// 우리 Team.id → TheSports team_id 매핑 (server-side lookup)
const TEAM_ID_MAP: Map<number, string> = new Map(
  (teamIdMapping as Array<{ ourId: number; tsId: string }>).map((t) => [t.ourId, t.tsId]),
);
function tsTeamId(ourTeamId: number): string | null {
  return TEAM_ID_MAP.get(ourTeamId) ?? null;
}

// 농구 우리 Team.id → TheSports team_id (별도 매핑 — 농구는 단일 id system)
const BASKETBALL_TEAM_ID_MAP: Map<number, string> = new Map(
  (basketballTeamIdMapping as Array<{ ourId: number; tsId: string }>).map((t) => [t.ourId, t.tsId]),
);
// 농구 TheSports team_id → 한국어 팀명 (H2H 상대팀 해석용)
const BASKETBALL_TS_ID_TO_NAME: Record<string, string> = Object.fromEntries(
  (basketballTeamIdMapping as Array<{ tsId: string; ourName: string; ourLeague: string }>).map(
    (t) => [t.tsId, toKoreanTeamName(t.ourName, t.ourLeague)],
  ),
);
function basketballTsTeamId(ourTeamId: number): string | null {
  return BASKETBALL_TEAM_ID_MAP.get(ourTeamId) ?? null;
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

  // ── 야구 9개 리그 (CPBL/WBC/.../LMB) — KBO 라우트 패턴 재사용. 축구/NBA fetch skip 위해 early branch.
  if (BASEBALL_LEAGUES.has(lg)) {
    return renderBaseballPage({ match, lg, gameId, homeKo, awayKo, homeShort, awayShort, label });
  }

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

  // ── 축구 매치 인사이트 탭 (야구처럼 정리) ─────────────────────────────
  // 기존 세로 카드 스택(라인업/팀통계/하프타임/트렌드/골분포/H2H/구장/예측/시즌/다음경기)을
  // MatchInsight 의 탭(라인업 · 팀 통계 · 맞대결 · 경기 정보)으로 묶어 주입. 모든 스포츠 동일 UI.
  const soccerTabs: Array<{ key: string; label: string; enabled: boolean; content: ReactNode }> = [];
  if (isSoccer) {
    let teamStatsNode: ReactNode = null;
    let halfTimeNode: ReactNode = null;
    let trendNode: ReactNode = null;
    let lineupNode: ReactNode = null;
    let goalDistNode: ReactNode = null;
    let h2hNode: ReactNode = null;
    if (match.theSportsCache) {
      const cache = match.theSportsCache;
      const analysis = cache.analysis as {
        goal_distribution?: { home: unknown; away: unknown };
        history?: { vs?: unknown[] };
      } | null;
      const lineup = cache.lineup as Parameters<typeof SoccerLineupSvg>[0]["data"] | null;
      const detailLive = cache.detailLive as { stats?: Array<{ type: number; home: number; away: number }> } | null;
      const teamStats = cache.teamStats as Parameters<typeof SoccerTeamStatsCard>[0]["teamStats"] | null;
      const halfTeamStats = cache.halfTeamStats as Parameters<typeof SoccerHalfTimeStatsCard>[0]["halfTeamStats"] | null;
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
      teamStatsNode =
        teamStats && Array.isArray(teamStats) && teamStats.length >= 2 ? (
          <SoccerTeamStatsCard
            teamStats={teamStats}
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            homeTsTeamId={homeTsId}
            awayTsTeamId={awayTsId}
          />
        ) : detailLive?.stats && detailLive.stats.length > 0 ? (
          <SoccerLiveStatsCard stats={detailLive.stats} homeNameKo={homeKo} awayNameKo={awayKo} />
        ) : null;
      halfTimeNode =
        halfTeamStats && (halfTeamStats.p1 || halfTeamStats.p2 || halfTeamStats.ft) ? (
          <SoccerHalfTimeStatsCard halfTeamStats={halfTeamStats} homeNameKo={homeKo} awayNameKo={awayKo} />
        ) : null;
      trendNode =
        trend && Array.isArray(trend.data) && trend.data.length > 0 ? (
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
                          typeof i.add_time === "number" ? `${i.time}+${i.add_time}'` : `${i.time}'`,
                        side: (i.position === 1 ? "home" : "away") as "home" | "away",
                        player: typeof i.player_name === "string" ? i.player_name : "",
                        ownGoal: false,
                        penaltyKick: i.type === 17,
                      }));
                  })()
                : null
            }
          />
        ) : null;
      lineupNode =
        lineup && lineup.lineup ? (
          <SoccerLineupSvg data={lineup} homeNameKo={homeKo} awayNameKo={awayKo} />
        ) : null;
      goalDistNode =
        gd && gd.home && gd.away ? (
          <SoccerGoalDistributionCard
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            data={gd as Parameters<typeof SoccerGoalDistributionCard>[0]["data"]}
          />
        ) : null;
      h2hNode =
        h2h.length > 0 ? (
          <SoccerH2HCard
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            homeTsTeamId={homeTsId}
            awayTsTeamId={awayTsId}
            history={h2h}
          />
        ) : null;
    }
    const venueNode = venue ? <SoccerVenueCard venue={venue} /> : null;
    const predictionNode = matchPrediction ? (
      <MatchPredictionsCard prediction={matchPrediction} homeNameKo={homeKo} awayNameKo={awayKo} />
    ) : null;
    const seasonNode =
      homeAfStats || awayAfStats ? (
        <TeamSeasonStatsCard home={homeAfStats} away={awayAfStats} homeNameKo={homeKo} awayNameKo={awayKo} />
      ) : null;
    const upcomingNode =
      homeUpcomingF.length > 0 || awayUpcomingF.length > 0 ? (
        <UpcomingFixturesCard
          homeNameKo={homeKo}
          awayNameKo={awayKo}
          homeUpcoming={homeUpcomingF}
          awayUpcoming={awayUpcomingF}
        />
      ) : null;

    const statsTab =
      teamStatsNode || halfTimeNode || trendNode ? (
        <div className="space-y-4">{teamStatsNode}{halfTimeNode}{trendNode}</div>
      ) : null;
    const h2hTab =
      h2hNode || goalDistNode ? (
        <div className="space-y-4">{h2hNode}{goalDistNode}</div>
      ) : null;
    const infoTab =
      predictionNode || seasonNode || venueNode || upcomingNode ? (
        <div className="space-y-4">{predictionNode}{seasonNode}{venueNode}{upcomingNode}</div>
      ) : null;

    soccerTabs.push(
      { key: "soccer-lineup", label: "라인업", enabled: !!lineupNode, content: lineupNode },
      { key: "soccer-stats", label: "팀 통계", enabled: !!statsTab, content: statsTab },
      { key: "soccer-h2h", label: "맞대결", enabled: !!h2hTab, content: h2hTab },
      { key: "soccer-info", label: "경기 정보", enabled: !!infoTab, content: infoTab },
    );
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
    sport: isSoccer ? "Soccer" : lg === "NBA" || lg === "WNBA" || lg === "KBL" || lg === "WKBL" ? "Basketball" : lg === "NHL" || lg === "IIHF_WC" ? "Ice Hockey" : "Sports",
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

  // 축구 — 승부차기/연장 분리. DB.homeScore 는 승부차기 합산 오염 가능(예 UCL 결승 4-3) →
  // SSR 초기값을 cache 의 정규/연장(mainHome) + 승부차기(penHome) 로 분리해 첫 화면부터 (4)1:1(3).
  const soccerScore = isSoccer
    ? parseTsFootballScore(match.theSportsCache?.detailLive)
    : null;

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
        initialHomeScore={soccerScore?.mainHome ?? match.homeScore}
        initialAwayScore={soccerScore?.mainAway ?? match.awayScore}
        initialPenHome={soccerScore?.penHome ?? null}
        initialPenAway={soccerScore?.penAway ?? null}
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

      {/* 축구 카드(라인업·팀통계·하프타임·트렌드·골분포·H2H·구장·예측·시즌·다음경기)는
          아래 MatchInsight 탭(라인업·팀 통계·맞대결·경기 정보)으로 이동 — soccerTabs 참고. */}

      {lg === "NHL" && (homeGoalie || awayGoalie) && (
        <NhlGoalieInsight
          homeGoalie={homeGoalie}
          awayGoalie={awayGoalie}
          homeTeamName={homeKo}
          awayTeamName={awayKo}
        />
      )}

      <MatchInsight
        match={match}
        extraTabs={soccerTabs}
        teamStatsContent={
          BASKETBALL_LEAGUES.has(lg) && match.theSportsCache?.detailLive ? (
            <BasketballTeamStatsCard
              detailLive={match.theSportsCache.detailLive}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
            />
          ) : (lg === "NHL" || lg === "IIHF_WC") &&
            match.theSportsCache?.detailLive ? (
            (() => {
              // 하키 cache.detailLive.stats = [[periodIdx, [[statId,home,away],...]], ...].
              // periodIdx 0=전체, 1~3=P1~P3, 4=OT, 5=SO. 탭은 HockeyTeamStatsCard 가 처리.
              const dl = match.theSportsCache.detailLive as {
                stats?: Array<[number, Array<[number, number, number]>]>;
              };
              if (!dl.stats || dl.stats.length === 0) return undefined;
              const periods = dl.stats.map(([idx, statRows]) => ({
                idx,
                rows: statRows.map(([statId, home, away]) => ({
                  statId,
                  home,
                  away,
                })),
              }));
              return (
                <HockeyTeamStatsCard
                  periods={periods}
                  homeNameKo={homeKo}
                  awayNameKo={awayKo}
                />
              );
            })()
          ) : undefined
        }
        h2hRichContent={
          BASKETBALL_LEAGUES.has(lg) &&
          (() => {
            const analysis = match.theSportsCache?.analysis as {
              history?: { vs?: unknown[]; home?: unknown[]; away?: unknown[] };
            } | null;
            const history = analysis?.history ?? null;
            if (!history) return undefined;
            return (
              <BasketballH2HCard
                homeNameKo={homeKo}
                awayNameKo={awayKo}
                homeTsTeamId={basketballTsTeamId(match.homeTeam.id)}
                awayTsTeamId={basketballTsTeamId(match.awayTeam.id)}
                history={history}
                tsIdToName={BASKETBALL_TS_ID_TO_NAME}
              />
            );
          })()
        }
        liveOddsContent={
          BASKETBALL_LEAGUES.has(lg) ? (
            <BasketballLiveOddsTab
              gameId={gameId}
              league={lg}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
              eloPrediction={
                match.predHome != null && match.predAway != null
                  ? { home: match.predHome, draw: match.predDraw ?? null, away: match.predAway }
                  : null
              }
              oddsHistory={oddsHistory}
            />
          ) : undefined
        }
        playerBoxContent={
          lg === "NBA" || lg === "WNBA" ? (
            <BasketballBoxScoreTab
              gameId={gameId}
              league={lg}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
              homeNameEn={match.homeTeam.name}
              awayNameEn={match.awayTeam.name}
            />
          ) : undefined
        }
      />
    </div>
    </>
  );
}

// ── 야구 9개 리그 (CPBL/WBC/WBSC_PREMIER_12/ASIAN_GAMES_BB/OLYMPICS_BB/
//    KBO_FUTURES/NPB_MINOR/CARIBBEAN_SERIES/LMB) — KBO 라우트와 동일한 컴포넌트 사용.
//    KBO/NPB/MLB 는 자체 라우트가 우선 매칭되므로 여기 도달하지 않음.
async function renderBaseballPage(args: {
  match: NonNullable<Awaited<ReturnType<typeof findMatch>>>;
  lg: string;
  gameId: string;
  homeKo: string;
  awayKo: string;
  homeShort: string;
  awayShort: string;
  label: string;
}) {
  const { match, lg, gameId, homeKo, awayKo, homeShort, awayShort, label } = args;
  const detailLivePlayers =
    (match.theSportsCache?.detailLive as { players?: unknown } | null)?.players;
  const [extras, baseballOdds, playerNameById, playerPhotoById] = await Promise.all([
    fetchMatchExtras(match),
    loadBaseballOdds(match.id),
    buildPlayerNameMap(detailLivePlayers),
    buildPlayerPhotoMap(detailLivePlayers),
  ]);
  const detailLive = match.theSportsCache?.detailLive as
    | { players?: unknown; stats?: unknown; score?: unknown[] }
    | null;
  const playerStats = detailLive?.players
    ? extractPlayerStats(detailLive.players)
    : { home: [], away: [] };
  const batterColumns = playerStatColumns("batter");
  const pitcherColumns = playerStatColumns("pitcher");
  const wpaSeries = computeWpaFromDetailLive(detailLive);

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
          {label} · 라이브 스코어 · 라이브 푸시 (평균 2-3초)
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        league={lg}
      />
      <BaseballLiveDetail
        gameId={gameId}
        league={lg}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeAbbr={match.homeTeam.shortName ?? null}
        awayAbbr={match.awayTeam.shortName ?? null}
        homeLogo={match.homeTeam.logoUrl ?? null}
        awayLogo={match.awayTeam.logoUrl ?? null}
        homeStarter={null}
        awayStarter={null}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        liveCommentary={null}
      />
      <MatchHeadToHead
        homeShortName={homeShort}
        awayShortName={awayShort}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        h2hHome={extras.h2hHome}
        homeStanding={extras.homeStanding}
        awayStanding={extras.awayStanding}
        totalTeams={extras.totalTeams}
      />
      <BaseballBoxscoreTabs
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        playerStats={playerStats}
        batterColumns={batterColumns}
        pitcherColumns={pitcherColumns}
        playerNameById={playerNameById}
        playerPhotoById={playerPhotoById}
        initialOdds={baseballOdds}
        wpaSeries={wpaSeries}
      />
      <MatchInsight
        match={match}
        teamStatsContent={
          detailLive?.stats ? (
            <BaseballTeamStatsCard
              stats={detailLive.stats}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
            />
          ) : null
        }
        liveOddsContent={
          baseballOdds?.odds ? (
            <LiveOddsCard
              odds={baseballOdds.odds}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
              hasDraw={false}
              oddsHistory={baseballOdds.history}
            />
          ) : null
        }
      />
    </div>
  );
}

/** TheSports detailLive.score → linescore → computeBaseballWpa. 평균 이닝 득점 ~0.45. */
function computeWpaFromDetailLive(
  detailLive: { score?: unknown[] } | null,
): Array<{ inning: number; homeWP: number; homeScore: number; awayScore: number }> | null {
  if (!detailLive?.score || !Array.isArray(detailLive.score) || detailLive.score.length < 4) {
    return null;
  }
  const sObj = detailLive.score[3] as Record<string, [string, string] | undefined>;
  if (!sObj || typeof sObj !== "object") return null;
  const homeInn: (number | null)[] = [];
  const awayInn: (number | null)[] = [];
  for (let i = 1; i <= 12; i++) {
    const p = sObj[`p${i}`];
    if (!Array.isArray(p) || p.length !== 2) break;
    homeInn.push(parseInt(p[0], 10) || 0);
    awayInn.push(parseInt(p[1], 10) || 0);
  }
  if (homeInn.length < 2) return null;
  return computeBaseballWpa(awayInn, homeInn, { lambdaPerInning: 0.45 });
}
