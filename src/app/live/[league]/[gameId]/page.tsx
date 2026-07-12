// /live/[league]/[gameId] — NBA / NHL / 축구 + 9개 야구 리그 (CPBL/WBC/.../LMB) 라이브 상세.
// MLB/KBO/NPB/LOL 은 자체 라우트 (/live/{mlb,kbo,npb,lol}/[gameId]) 가 우선 매칭됨.
//
// gameId = Match.externalId
//   NBA/NHL = ESPN id, 축구 = api-football fixture id,
//   야구 9개 리그 = TheSports ts-{tsMatchId} (thesports-matches route 가 prefix 부여).

import type { Metadata } from "next";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import { cache } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY, SPORTS, BASEBALL_LEAGUES, BASKETBALL_LEAGUES, VOLLEYBALL_LEAGUES, getLeagueFlag } from "@/lib/sports/sport-leagues";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { getFifaRank, NATIONAL_TEAM_LEAGUES } from "@/lib/sports/fifa-rankings";
import { getOddsHistory } from "@/lib/odds/snapshot-store";
import { toKoreanTeamName } from "@/lib/team-names";
import SportLiveDetail from "@/components/SportLiveDetail";
import AmbientGlow from "@/components/AmbientGlow";
import NextUpCard from "@/components/live/NextUpCard";
import SoccerGoalDistributionCard from "@/components/scores/soccer/SoccerGoalDistributionCard";
import SoccerH2HCard from "@/components/scores/soccer/SoccerH2HCard";
import SoccerLineupSvg from "@/components/scores/soccer/SoccerLineupSvg";
import MatchOddsTable from "@/components/MatchOddsTable";
import { fetchFixtureOdds } from "@/lib/odds/api-sports-odds";
import SoccerHalfTimeStatsCard from "@/components/scores/soccer/SoccerHalfTimeStatsCard";
import SoccerLiveStatsCard from "@/components/scores/soccer/SoccerLiveStatsCard";
import SoccerTeamStatsCard from "@/components/scores/soccer/SoccerTeamStatsCard";
import SoccerMatchSummaryCard from "@/components/scores/soccer/SoccerMatchSummaryCard";
import SoccerFinishedMatchReport from "@/components/scores/soccer/SoccerFinishedMatchReport";
import SoccerVenueCard from "@/components/scores/soccer/SoccerVenueCard";
import SoccerNowBlock, { type PredictedXiTeam, type InjuryLine } from "@/components/scores/soccer/SoccerNowBlock";
import { fetchSeasonInjuries, getTeamInjuries } from "@/lib/sports/api-football-pro";
import { translateReason, classifySeverity } from "@/lib/sports/injury-format";
import WcMatchAnalysisCard from "@/components/live/WcMatchAnalysisCard";
import { readFileSync } from "fs";
import path from "path";
import MatchTrendChart from "@/components/live/MatchTrendChart";
import teamIdMapping from "@/lib/sports/thesports/team-id-mapping.json";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";
import { getRecentForm } from "@/lib/predict/recent-form";
import RecentFormDots from "@/components/scores/RecentFormDots";
import basketballTeamIdMapping from "@/lib/sports/thesports/basketball-team-id-mapping.json";
import BasketballH2HCard from "@/components/scores/basketball/BasketballH2HCard";
import BasketballLiveOddsTab from "@/components/live/BasketballLiveOddsTab";
import BasketballBoxScoreTab from "@/components/live/BasketballBoxScoreTab";
import NhlGoalieInsight, { type GoalieInfo } from "@/components/NhlGoalieInsight";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchInsight from "@/components/MatchInsight";
import MatchVoteCard from "@/components/MatchVoteCard";
import AiRoundTableStrip from "@/components/AiRoundTableStrip";
import AiMatchupCard from "@/components/AiMatchupCard";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import { parseTsFootballScore, fetchSoccerLive, type LiveMatch } from "@/lib/sports/live-scores";
import BaseballLiveDetail from "@/components/BaseballLiveDetail";
import BaseballBoxscoreTabs from "@/components/live/BaseballBoxscoreTabs";
import BaseballTeamStatsCard from "@/components/live/BaseballTeamStatsCard";
import BasketballTeamStatsCard from "@/components/live/BasketballTeamStatsCard";
import HockeyTeamStatsCard from "@/components/scores/hockey/HockeyTeamStatsCard";
import HockeyGoalTimeline, { type HockeyIncident } from "@/components/scores/hockey/HockeyGoalTimeline";
import HockeyBoxScore, { type HockeyPlayerRow } from "@/components/scores/hockey/HockeyBoxScore";
import LiveOddsCard from "@/components/live/LiveOddsCard";
import ConclusionCards, {
  type ConclusionPred,
  type KeyFactor,
} from "@/components/live/BaseballConclusionCards";
import RecentGamesCard from "@/components/live/BaseballRecentGames";
import CollapsibleSection from "@/components/live/CollapsibleSection";
import { getBaseballRecentGames } from "@/lib/live/baseball-season-analysis";
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
import MatchHighlightCard from "@/components/live/MatchHighlightCard";

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
  ...(SPORTS.find((s) => s.code === "volleyball")?.leagues ?? []), // VNL + AVC + 유럽리그 (2026-06-12)
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
      include: {
        homeTeam: true,
        awayTeam: true,
        theSportsCache: true,
        aiPredictions: { where: { market: "1X2" } },
      },
    });
  } catch {
    return null;
  }
}

// DB 미적재 라이브(청소년 친선·군소 리그) — 라이브 API 에서 fixture 단건 조회.
// cache 로 generateMetadata + 본문의 중복 fetchSoccerLive 호출을 요청당 1회로 묶음.
const findOrphanLive = cache(async (gameId: string): Promise<LiveMatch | null> => {
  const list = await fetchSoccerLive();
  return list.find((m) => m.id === `af-${gameId}`) ?? null;
});

// DB 미적재 라이브 축구(청소년 친선·군소 리그) 경량 상세 — 스코어보드 + AI 예측만.
// 정식 상세(라인업/통계/H2H)는 match 객체(DB Team relation) 의존이라 orphan 엔 제공 불가.
async function renderOrphanSoccerLive(live: LiveMatch, lg: string, gameId: string) {
  const homeKo = toKoreanTeamName(live.homeName, lg);
  const awayKo = toKoreanTeamName(live.awayName, lg);
  const label = LEAGUE_DISPLAY[lg] ?? lg;
  const flag = getLeagueFlag(lg);
  const prediction = await fetchMatchPrediction(gameId).catch(() => null);
  const teamCol = (name: string, logo?: string | null) => (
    <div className="flex flex-col items-center gap-2 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-16 h-16 object-contain" loading="lazy" />
      ) : (
        <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xl font-bold text-neutral-400">
          {name.slice(0, 1)}
        </div>
      )}
      <span className="text-sm font-bold text-center truncate w-full">{name}</span>
    </div>
  );
  return (
    <main className="relative max-w-3xl mx-auto px-4 py-6 space-y-5">
      <AmbientGlow />
      <Link
        href="/scores?sport=soccer"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        ← 라이브 스코어
      </Link>
      <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="text-center text-xs font-semibold text-neutral-500 mb-4">
          {flag && (
            <span className="mr-1" aria-hidden>
              {flag}
            </span>
          )}
          {label}
          <span className="ml-2 text-rose-600 dark:text-rose-400">● LIVE {live.statusLabel}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {teamCol(homeKo, live.homeLogo)}
          <div className="text-4xl font-black tabular-nums text-rose-600 dark:text-rose-400 text-center whitespace-nowrap">
            {live.homeScore} : {live.awayScore}
          </div>
          {teamCol(awayKo, live.awayLogo)}
        </div>
      </div>
      {prediction && (
        <MatchPredictionsCard prediction={prediction} homeNameKo={homeKo} awayNameKo={awayKo} />
      )}
      <p className="text-xs text-neutral-400 dark:text-neutral-500 text-center leading-relaxed">
        실시간 수집된 라이브 경기입니다. 라인업·통계·H2H 등 상세 데이터는 경기 종료 후 제공됩니다.
      </p>
    </main>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, gameId } = await params;
  const lg = league.toUpperCase();
  if (!SUPPORTED.has(lg)) return { title: "라이브 매치를 찾을 수 없습니다" };
  const match = await findMatch(lg, gameId);
  if (!match) {
    // orphan 라이브(DB 미적재 축구) — 라이브 API 폴백으로 제목 생성 (없으면 404 제목).
    if (SOCCER_LEAGUES.has(lg)) {
      const live = await findOrphanLive(gameId);
      if (live) {
        const h = toKoreanTeamName(live.homeName, lg);
        const a = toKoreanTeamName(live.awayName, lg);
        const lb = LEAGUE_DISPLAY[lg] ?? lg;
        return {
          title: `${h} vs ${a} 중계·라이브 스코어 — ${lb}`,
          description: `${h} vs ${a} ${lb} 실시간 중계 · 라이브 스코어.`,
          alternates: { canonical: `https://www.scorebase.kr/live/${lg}/${gameId}` },
          robots: GOOGLE_NOINDEX,
        };
      }
    }
    return { title: "라이브 매치를 찾을 수 없습니다" };
  }
  const home = toKoreanTeamName(match.homeTeam.name, lg);
  const away = toKoreanTeamName(match.awayTeam.name, lg);
  const label = LEAGUE_DISPLAY[lg] ?? lg;
  // 검색어가 경기 국면 따라 바뀜(전·중 "중계", 후 "결과") — 빙은 title 정확 매칭 가중치가 높아
  // 상태별 title 분기 (2026-07-05 Bing 검색어 실측: "A vs B" 4~6위 노출·"결과" 클러스터 8~9위).
  const finished = match.status === "FINISHED";
  return {
    title: finished
      ? `${home} vs ${away} 결과·스코어 — ${label}`
      : `${home} vs ${away} 중계·라이브 스코어 — ${label}`,
    description: finished
      ? `${home} vs ${away} ${label} 경기 결과 — 최종 스코어와 쿼터/피리어드 별 점수, 골 이벤트.`
      : `${home} vs ${away} ${label} 실시간 중계 · 라이브 스코어 · 쿼터/피리어드 별 점수 또는 골 이벤트.`,
    alternates: { canonical: `https://www.scorebase.kr/live/${lg}/${gameId}` },
    robots: GOOGLE_NOINDEX,
  };
}

export default async function GenericLivePage({ params }: Props) {
  const { league, gameId } = await params;
  const lg = league.toUpperCase();
  if (!SUPPORTED.has(lg)) notFound();
  if (!gameId) notFound();

  const match = await findMatch(lg, gameId);
  if (!match) {
    // DB 미적재 라이브(청소년 친선·군소 리그 등) — 라이브 API 폴백 경량 상세.
    if (SOCCER_LEAGUES.has(lg)) {
      const live = await findOrphanLive(gameId);
      if (live) return await renderOrphanSoccerLive(live, lg, gameId);
    }
    notFound();
  }

  const homeKo = toKoreanTeamName(match.homeTeam.name, lg);
  const awayKo = toKoreanTeamName(match.awayTeam.name, lg);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;
  const label = LEAGUE_DISPLAY[lg] ?? lg;

  // ── 야구 9개 리그 (CPBL/WBC/.../LMB) — KBO 라우트 패턴 재사용. 축구/NBA fetch skip 위해 early branch.
  if (BASEBALL_LEAGUES.has(lg)) {
    return renderBaseballPage({ match, lg, gameId, homeKo, awayKo, homeShort, awayShort, label });
  }

  // ── 배구 (VNL/AVC/유럽리그) — 세트 스코어보드 + 세트별 점수 + 기술통계 + 배당. 축구/농구 fetch skip.
  if (VOLLEYBALL_LEAGUES.has(lg)) {
    return await renderVolleyballPage({ match, lg, gameId, homeKo, awayKo, label });
  }

  const extras = await fetchMatchExtras(match);

  // 양 팀 리그 순위 — TheSports standings cache 기반. fetch 실패/매핑 누락 시 null.
  // 국가대항(친선/예선/대륙컵) 매치는 리그 standings 개념이 없으므로 순위 자리에 FIFA 국가
  // 랭킹을 표시. 클럽 리그는 기존 standings 순위 그대로(아래 getFullStandings).
  const isNationalTeam = NATIONAL_TEAM_LEAGUES.has(lg);
  const standingsRows = isNationalTeam
    ? []
    : await getFullStandings(lg).catch(() => []);
  const positionByTeamId = new Map(standingsRows.map((r) => [r.teamId, r.position]));
  const homePosition = positionByTeamId.get(match.homeTeam.id) ?? null;
  const awayPosition = positionByTeamId.get(match.awayTeam.id) ?? null;
  const homeFifaRank = isNationalTeam
    ? getFifaRank(match.homeTeam.name, homeKo)
    : null;
  const awayFifaRank = isNationalTeam
    ? getFifaRank(match.awayTeam.name, awayKo)
    : null;

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
  // 라인업 선수 한글 이름 — TheSportsPlayer.nameKo (build-football-player-names-haiku 가 적재).
  // DB miss 시 영문 fallback (SoccerLineupSvg 내부 lastName).
  const lineupNameById: Record<string, string> = {};
  if (isSoccer && match.theSportsCache) {
    const lu = (match.theSportsCache.lineup as { lineup?: { home?: Record<string, { id?: string; logo?: string }>; away?: Record<string, { id?: string; logo?: string }> } } | null)?.lineup;
    const ids = new Set<string>();
    for (const side of [lu?.home, lu?.away]) {
      if (!side) continue;
      for (const p of Object.values(side)) {
        if (p?.id && p?.logo) playerLogoById[p.id] = p.logo;
        if (p?.id) ids.add(p.id);
      }
    }
    // 골·카드·도움·교체 인시던트 선수도 한글화 (incident player_id 등) — 라인업과 같은 nameKo 맵에 합침
    const incs = (match.theSportsCache.detailLive as { incidents?: unknown } | null)?.incidents;
    if (Array.isArray(incs)) {
      for (const inc of incs) {
        const i = inc as Record<string, unknown>;
        for (const k of ["player_id", "assist1_id", "assist2_id", "in_player_id", "out_player_id"]) {
          const v = i[k];
          if (typeof v === "string" && v) ids.add(v);
        }
      }
    }
    const goalLine = match.theSportsCache.goalLine as Array<{
      pass?: Array<{ player_id?: string }>;
    }> | null;
    if (Array.isArray(goalLine)) {
      for (const goal of goalLine) {
        for (const pass of goal.pass ?? []) {
          if (pass.player_id) ids.add(pass.player_id);
        }
      }
    }
    if (ids.size > 0) {
      const rows = await prisma.theSportsPlayer.findMany({
        where: { id: { in: Array.from(ids) }, nameKo: { not: null } },
        select: { id: true, nameKo: true },
      });
      for (const r of rows) if (r.nameKo) lineupNameById[r.id] = r.nameKo;
    }
  }

  // 축구는 DB 점수가 정규시간 점수일 수 있다. 리포트·스코어보드는 TheSports 의
  // 연장 포함 main 점수를 사용하고 승부차기만 별도로 분리한다.
  const soccerScore = isSoccer
    ? parseTsFootballScore(match.theSportsCache?.detailLive)
    : null;

  // ── 축구 매치 인사이트 탭 (야구처럼 정리) ─────────────────────────────
  // 기존 세로 카드 스택(라인업/팀통계/하프타임/트렌드/골분포/H2H/구장/예측/시즌/다음경기)을
  // MatchInsight 의 탭(라인업 · 팀 통계 · 맞대결 · 경기 정보)으로 묶어 주입. 모든 스포츠 동일 UI.
  const soccerTabs: Array<{ key: string; label: string; enabled: boolean; content: ReactNode }> = [];
  // "지금" 블록 — 스코어보드 바로 아래 (2026-06-10 목업 확정: status 별 상단 답변).
  let soccerNowNode: ReactNode = null;
  // 매치 "한눈에" 요약 — 결론 카드 아래, 탭 위 (핵심 지표만 크게)
  let soccerSummaryNode: ReactNode = null;
  // 종료 경기 리포트 — 라이브에서 수집한 흐름·구간 통계·선수 평점을 본문에 보존.
  let soccerFinishedReportNode: ReactNode = null;
  let nowLineup: { home: unknown[]; away: unknown[] } | null = null;
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
      const trendGoals = detailLive
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
                player:
                  (typeof i.player_id === "string" && lineupNameById[i.player_id]) ||
                  (typeof i.player_name === "string" ? i.player_name : ""),
                ownGoal: false,
                penaltyKick: i.type === 17,
              }));
          })()
        : null;
      let xgH: number | null = null;
      let xgA: number | null = null;
      if (match.fixtureStats) {
        try {
          const fs = JSON.parse(match.fixtureStats) as { expectedGoals?: number | string }[];
          const nh = Number(fs[0]?.expectedGoals);
          const na = Number(fs[1]?.expectedGoals);
          xgH = Number.isFinite(nh) ? nh : null;
          xgA = Number.isFinite(na) ? na : null;
        } catch {
          // fixtureStats 파싱 실패 — xG 생략
        }
      }
      // 라이브 글랜스는 유지. 종료 경기는 아래 경기 리포트가 대신해 같은 지표의 중복을 막는다.
      if (match.status === "LIVE") {
        soccerSummaryNode = (
          <SoccerMatchSummaryCard
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            teamStats={teamStats}
            homeTsTeamId={homeTsId}
            awayTsTeamId={awayTsId}
            xgHome={xgH}
            xgAway={xgA}
          />
        );
      }
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
            homeScore={soccerScore?.mainHome ?? match.homeScore}
            awayScore={soccerScore?.mainAway ?? match.awayScore}
            goals={trendGoals}
          />
        ) : null;
      if (match.status === "FINISHED") {
        soccerFinishedReportNode = (
          <SoccerFinishedMatchReport
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            homeScore={soccerScore?.mainHome ?? match.homeScore}
            awayScore={soccerScore?.mainAway ?? match.awayScore}
            regulationHomeScore={soccerScore?.regHome}
            regulationAwayScore={soccerScore?.regAway}
            xgHome={xgH}
            xgAway={xgA}
            halfTeamStats={halfTeamStats}
            trend={trend}
            goals={trendGoals}
            goalLine={
              lg === "WORLD_CUP"
                ? (cache.goalLine as Parameters<typeof SoccerFinishedMatchReport>[0]["goalLine"])
                : null
            }
            lineup={lineup}
            nameById={lineupNameById}
          />
        );
      }
      // 라인업 확정(confirmed=1) 시에만 탭 표시. 미발표(confirmed=-)는 탭 자동 숨김.
      // 부분 도착·좌표 미도착(x/y 0,0)은 SoccerLineupSvg 내부에서 "확정 대기" 안내로 처리.
      lineupNode =
        lineup && lineup.confirmed === 1 && lineup.lineup ? (
          <SoccerLineupSvg data={lineup} homeNameKo={homeKo} awayNameKo={awayKo} nameById={lineupNameById} />
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
      // "지금" 블록 — 예정 매치 확정 라인업(키 플레이어 칩) 재료.
      // 라인업은 confirmed=1 이어도 선발(first=1) 미지정 사전 스쿼드 명단인 케이스가 있어
      // (2026-06-10 멕시코-남아공: 킥오프 19h 전 squad-only) 양팀 선발 7명+ 일 때만 "확정" 취급.
      if (lineup && lineup.confirmed === 1 && lineup.lineup) {
        const home = Object.values(lineup.lineup.home ?? {});
        const away = Object.values(lineup.lineup.away ?? {});
        const starters = (arr: unknown[]) =>
          arr.filter((p) => (p as { first?: number }).first === 1).length;
        nowLineup = starters(home) >= 7 && starters(away) >= 7 ? { home, away } : null;
      }
    }

    // 월드컵 예상 라인업 — build-wc-predicted-xi (cron-wc-xi.sh 매일 갱신) 산출물.
    // cache 유무와 무관하게 로드 (예정 매치는 cache 가 아예 없는 경우가 핵심 케이스).
    // 확정 라인업(nowLineup) 도착 시 SoccerNowBlock 이 자동으로 예상 대신 확정 표시.
    let predictedHome: PredictedXiTeam | null = null;
    let predictedAway: PredictedXiTeam | null = null;
    if (lg === "WORLD_CUP" && match.status === "SCHEDULED" && !nowLineup) {
      try {
        const raw = JSON.parse(
          readFileSync(path.join(process.cwd(), "data/wc-predicted-xi.json"), "utf-8"),
        ) as Record<string, PredictedXiTeam>;
        const normName = (s: string) =>
          s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");
        const byNorm = new Map(Object.entries(raw).map(([k, v]) => [normName(k), v]));
        predictedHome = byNorm.get(normName(match.homeTeam.name)) ?? null;
        predictedAway = byNorm.get(normName(match.awayTeam.name)) ?? null;
      } catch {
        // 파일 없음 (빌드 전) — 미표시
      }
    }

    // 예상 라인업 표시 시 — 양 팀 현재 부상·결장 명단(api-football WORLD_CUP injuries).
    // TheSports WC 매치 캐시엔 injury 필드가 없어 af 를 소스로 사용. 예상 XI 의 afId 로 정확 매칭 →
    // 예상 XI 에 든 부상 선수는 피치에 OUT 배지, 나머지 이탈 선수는 아래 명단에 표시.
    let injuredXiIds: string[] | undefined;
    let injuriesHome: InjuryLine[] | undefined;
    let injuriesAway: InjuryLine[] | undefined;
    if (predictedHome || predictedAway) {
      try {
        const all = await fetchSeasonInjuries("WORLD_CUP", 2026);
        // 예상 XI afId → { tsId, nameKo } (부상 매칭 + 한글명 + 피치 배지)
        const afToXi = new Map<number, { tsId?: string; nameKo?: string }>();
        for (const t of [predictedHome, predictedAway]) {
          if (!t) continue;
          for (const p of t.xi) if (p.afId != null) afToXi.set(p.afId, { tsId: p.id, nameKo: p.nameKo });
        }
        const beforeIso = match.startTime.toISOString();
        const injuredIds: string[] = [];
        const toLines = (teamName: string): InjuryLine[] =>
          getTeamInjuries(all, teamName, beforeIso, 12)
            .map((e) => {
              const xi = afToXi.get(e.playerId);
              if (xi?.tsId) injuredIds.push(xi.tsId);
              return {
                name: xi?.nameKo || e.playerName,
                reason: translateReason(e.reason),
                sev: classifySeverity(e.reason),
                inXi: !!xi,
              };
            })
            .sort((a, b) => {
              if (a.inXi !== b.inXi) return a.inXi ? -1 : 1;
              const rank = { long: 0, short: 1, returning: 2, non_injury: 3, unknown: 4 } as const;
              return rank[a.sev] - rank[b.sev];
            });
        injuriesHome = toLines(match.homeTeam.name);
        injuriesAway = toLines(match.awayTeam.name);
        injuredXiIds = injuredIds;
      } catch {
        // 부상 조회 실패 — 명단 없이 예상 라인업만 표시
      }
    }

    soccerNowNode = (
      <SoccerNowBlock
        status={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        lineup={nowLineup as Parameters<typeof SoccerNowBlock>[0]["lineup"]}
        nameById={lineupNameById}
        predictedHome={predictedHome}
        predictedAway={predictedAway}
        injuredXiIds={injuredXiIds}
        injuriesHome={injuriesHome}
        injuriesAway={injuriesAway}
      />
    );

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
      match.status === "FINISHED"
        ? teamStatsNode
        : teamStatsNode || halfTimeNode || trendNode
          ? <div className="space-y-4">{teamStatsNode}{halfTimeNode}{trendNode}</div>
          : null;
    const h2hTab =
      h2hNode || goalDistNode ? (
        <div className="space-y-4">{h2hNode}{goalDistNode}</div>
      ) : null;
    const infoTab =
      predictionNode || seasonNode || venueNode || upcomingNode ? (
        <div className="space-y-4">{predictionNode}{seasonNode}{venueNode}{upcomingNode}</div>
      ) : null;

    // 배당 — 라이브 배당(The Odds API 폴링, 농구 패턴과 동일 일원화 2026-06-10)
    // + API-Sports 북메이커별 상세. 본문 중복 카드는 SportLiveDetail 에서 제거됨.
    const fixtureOdds = /^\d+$/.test(match.externalId)
      ? await fetchFixtureOdds(match.externalId)
      : null;
    const liveOddsNode = (
      <BasketballLiveOddsTab
        gameId={gameId}
        league={lg}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeNameEn={match.homeTeam.name}
        awayNameEn={match.awayTeam.name}
        eloPrediction={
          match.predHome != null && match.predAway != null
            ? { home: match.predHome, draw: match.predDraw ?? null, away: match.predAway }
            : null
        }
        oddsHistory={oddsHistory}
      />
    );
    const oddsTab = (
      <div className="space-y-4">
        {liveOddsNode}
        {fixtureOdds && <MatchOddsTable odds={fixtureOdds} />}
      </div>
    );
    // 라이브 배당은 The Odds API 커버 매치만 데이터가 옴 — 확장 리그처럼 둘 다
    // 없을 수 있는 경우 oddsHistory·fixtureOdds 로 enabled 판정 (빈 탭 방지).
    const oddsTabEnabled = !!fixtureOdds || oddsHistory.length > 0;

    soccerTabs.push(
      { key: "soccer-lineup", label: "라인업", enabled: !!lineupNode, content: lineupNode },
      { key: "soccer-stats", label: "팀 통계", enabled: !!statsTab, content: statsTab },
      { key: "soccer-h2h", label: "맞대결", enabled: !!h2hTab, content: h2hTab },
      { key: "soccer-info", label: "경기 정보", enabled: !!infoTab, content: infoTab },
      { key: "soccer-odds", label: "배당", enabled: oddsTabEnabled, content: oddsTab },
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

  // 최근 5경기 + 상대전적 (전 종목 공통, Match 기반)
  const recentGames = await getBaseballRecentGames(match);

  // ── 결론 3카드 데이터 (전 종목 공통) — 승률은 Match.pred* 스냅샷(단일소스) ──
  const predDrawV = isSoccer ? match.predDraw ?? null : null;
  let conclFavored: "home" | "draw" | "away" | null = null;
  let conclMax = -1;
  if (match.predHome != null && match.predAway != null) {
    conclMax = Math.max(match.predHome, match.predAway, predDrawV ?? -1);
    conclFavored =
      conclMax === match.predHome
        ? "home"
        : predDrawV != null && conclMax === predDrawV
          ? "draw"
          : "away";
  }
  let conclCorrect: boolean | null = match.predCorrect ?? null;
  if (
    match.status === "FINISHED" &&
    match.homeScore != null &&
    match.awayScore != null &&
    conclFavored != null
  ) {
    const actual =
      match.homeScore > match.awayScore
        ? "home"
        : match.homeScore < match.awayScore
          ? "away"
          : "draw";
    conclCorrect = actual === conclFavored;
  }
  const conclPred: ConclusionPred | null =
    conclFavored != null
      ? { favored: conclFavored, pct: Math.min(99, Math.round(conclMax * 100)), correct: conclCorrect }
      : null;
  const cHS = extras.homeStanding;
  const cAS = extras.awayStanding;
  const conclFactors: KeyFactor[] = [];
  if (cHS && cAS) {
    if (cHS.position && cAS.position) {
      conclFactors.push({
        label: "리그순위",
        home: `${cHS.position}위`,
        away: `${cAS.position}위`,
        edge: cHS.position < cAS.position ? "home" : cHS.position > cAS.position ? "away" : "even",
      });
    }
    if (cHS.played > 0 && cAS.played > 0) {
      const hw = cHS.wins / cHS.played;
      const aw = cAS.wins / cAS.played;
      conclFactors.push({
        label: "시즌 승률",
        home: hw.toFixed(3),
        away: aw.toFixed(3),
        edge: hw > aw ? "home" : hw < aw ? "away" : "even",
      });
      const hgf = cHS.goalsFor / cHS.played;
      const agf = cAS.goalsFor / cAS.played;
      conclFactors.push({
        label: scoreLabel.for,
        home: hgf.toFixed(1),
        away: agf.toFixed(1),
        edge: hgf > agf ? "home" : hgf < agf ? "away" : "even",
      });
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sportsEventLd) }}
      />
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-keep">
          <Link
            href={`/teams/${match.homeTeam.id}`}
            className="hover:underline hover:text-rose-600 dark:hover:text-rose-400 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            {homeKo}
          </Link>{" "}
          <span className="text-neutral-400">vs</span>{" "}
          <Link
            href={`/teams/${match.awayTeam.id}`}
            className="hover:underline hover:text-rose-600 dark:hover:text-rose-400 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
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

      {/* 결론 3카드 — 결론 먼저 (명세 v2 §6, 전 종목 공통) */}
      {(conclPred || conclFactors.length > 0) && (
        <ConclusionCards
          homeNameKo={homeKo}
          awayNameKo={awayKo}
          status={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
          pred={conclPred}
          factors={conclFactors}
        />
      )}

      {/* 매치 한눈에 — 핵심 지표(xG·점유율·슈팅) 글랜스. 탭 진입 전. (축구 LIVE/종료) */}
      {soccerSummaryNode}

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
        homeFifaRank={homeFifaRank}
        awayFifaRank={awayFifaRank}
        eloPrediction={
          match.predHome != null && match.predAway != null
            ? { home: match.predHome, draw: match.predDraw ?? null, away: match.predAway }
            : null
        }
        oddsHistory={oddsHistory}
        playerLogoById={playerLogoById}
      />

      {/* 종료 경기에서는 라이브 기록을 기본 본문에 보존. 매치 한눈에와 팀 통계 탭 중복은 제외. */}
      {soccerFinishedReportNode}

      {/* 월드컵 국가 분석 + 축구 "지금" 블록 — 예정 매치는 국가 비교(분석)가 먼저,
          예상 라인업이 뒤 (2026-06-10 사용자 순서 확정). LIVE/종료는 골 타임라인이
          항상 먼저 ("지금" 원칙). 데이터 없으면 각 블록 자동 미렌더. */}
      {(() => {
        const wcAnalysisNode =
          lg === "WORLD_CUP" ? (
            <WcMatchAnalysisCard
              homeTeamId={match.homeTeam.id}
              awayTeamId={match.awayTeam.id}
              homeName={match.homeTeam.name}
              awayName={match.awayTeam.name}
              homeNameKo={homeKo}
              awayNameKo={awayKo}
              homeFifaRank={homeFifaRank}
              awayFifaRank={awayFifaRank}
              startTime={match.startTime}
            />
          ) : null;
        return match.status === "SCHEDULED" ? (
          <>
            {wcAnalysisNode}
            {soccerNowNode}
          </>
        ) : (
          <>
            {soccerNowNode}
            {wcAnalysisNode}
          </>
        );
      })()}

      {/* 공식 유튜브 하이라이트 — 종료 경기에 매칭된 영상이 있을 때만 (K리그·NBA). */}
      {match.highlightYoutubeId && (
        <MatchHighlightCard
          videoId={match.highlightYoutubeId}
          homeNameKo={homeKo}
          awayNameKo={awayKo}
        />
      )}

      {/* 팀명 + 최근경기 (상대전적) — 예정 매치는 분석 본문이라 펼침 (사용자 우선순위
          2026-05-24), LIVE/종료 축구는 "지금" 블록이 답을 주므로 접힘 (2026-06-10 목업).
          접힘 라벨에 순위 미리보기 — 안 펼쳐도 핵심이 보이게. */}
      {isSoccer && match.status !== "SCHEDULED" ? (
        <CollapsibleSection
          title="시즌 성적 · 상대전적"
          hint={
            homePosition && awayPosition
              ? `${homeKo} ${homePosition}위 vs ${awayKo} ${awayPosition}위`
              : homeFifaRank && awayFifaRank
                ? `FIFA ${homeFifaRank}위 vs ${awayFifaRank}위`
                : "순위 · 시즌 성적 · 맞대결"
          }
        >
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
        </CollapsibleSection>
      ) : (
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
      )}

      {recentGames?.hasData && (
        <CollapsibleSection
          title="최근 5경기 · 상대전적"
          hint="양 팀 최근 경기 + 맞대결"
          defaultOpen={isSoccer && match.status === "SCHEDULED"}
        >
          <RecentGamesCard
            homeNameKo={homeKo}
            awayNameKo={awayKo}
            data={recentGames}
          />
        </CollapsibleSection>
      )}

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

      {/* NHL/하키 골 타임라인 + 선수 박스스코어 — cache detailLive.incidents/players (player_id→한글) */}
      {(lg === "NHL" || lg === "IIHF_WC") &&
        match.theSportsCache?.detailLive &&
        (() => {
          const dl = match.theSportsCache.detailLive as {
            incidents?: HockeyIncident[];
            players?: { home?: HockeyPlayerRow[]; away?: HockeyPlayerRow[] };
          };
          return (
            <>
              {dl.incidents && dl.incidents.length > 0 && (
                <HockeyGoalTimeline
                  incidents={dl.incidents}
                  homeNameKo={homeKo}
                  awayNameKo={awayKo}
                />
              )}
              {dl.players && (
                <HockeyBoxScore players={dl.players} homeNameKo={homeKo} awayNameKo={awayKo} />
              )}
            </>
          );
        })()}

      {match.aiPredictions && match.aiPredictions.length >= 2 && (
        <AiMatchupCard
          homeKo={homeKo}
          awayKo={awayKo}
          predictions={match.aiPredictions}
          marketHome={match.marketHome}
          marketDraw={match.marketDraw}
          marketAway={match.marketAway}
        />
      )}

      <MatchVoteCard matchId={match.id} />
      <AiRoundTableStrip matchId={match.id} />

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
      <NextUpCard
        matchId={match.id}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeKo={homeKo}
        awayKo={awayKo}
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
    <div className="relative max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <AmbientGlow />
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
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-keep">
          <Link
            href={`/teams/${match.awayTeam.id}`}
            className="hover:underline hover:text-rose-600 dark:hover:text-rose-400 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            {awayKo}
          </Link>{" "}
          <span className="text-neutral-400">vs</span>{" "}
          <Link
            href={`/teams/${match.homeTeam.id}`}
            className="hover:underline hover:text-rose-600 dark:hover:text-rose-400 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
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
      {match.aiPredictions && match.aiPredictions.length >= 2 && (
        <AiMatchupCard
          homeKo={homeKo}
          awayKo={awayKo}
          predictions={match.aiPredictions}
          marketHome={match.marketHome}
          marketDraw={match.marketDraw}
          marketAway={match.marketAway}
        />
      )}
      <MatchVoteCard matchId={match.id} />
      <AiRoundTableStrip matchId={match.id} />

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
      <NextUpCard
        matchId={match.id}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeKo={homeKo}
        awayKo={awayKo}
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


// ── 배구 매치 페이지 — TheSports cache 단일 소스 (세트 스코어보드는 SportLiveDetail 5초 폴링) ──
interface VolleyballPageArgs {
  match: NonNullable<Awaited<ReturnType<typeof findMatch>>>;
  lg: string;
  gameId: string;
  homeKo: string;
  awayKo: string;
  label: string;
}

async function renderVolleyballPage({ match, lg, gameId, homeKo, awayKo, label }: VolleyballPageArgs) {
  const dl = match.theSportsCache?.detailLive as { stats?: unknown[] } | null;
  // 순위 ([N] 칩 — AVC/유럽리그는 조내 순위) + 최근 5경기 (같은 대회 FINISHED)
  let homePosition: number | null = null;
  let awayPosition: number | null = null;
  try {
    const groups = await fetchVolleyballTable(lg);
    for (const g of groups)
      for (const r of g.rows) {
        if (r.ourTeamId === match.homeTeam.id) homePosition = r.position;
        if (r.ourTeamId === match.awayTeam.id) awayPosition = r.position;
      }
  } catch { /* cache miss — 순위 없이 렌더 */ }
  const recentMatches = await prisma.match.findMany({
    where: {
      league: lg,
      status: "FINISHED",
      OR: [
        { homeTeamId: { in: [match.homeTeam.id, match.awayTeam.id] } },
        { awayTeamId: { in: [match.homeTeam.id, match.awayTeam.id] } },
      ],
    },
    orderBy: { startTime: "desc" },
    take: 40,
    select: {
      status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
    },
  });
  // bet365(companyId "2") 우선 최신 승패(eu) 배당 — volleyball-odds-poller 가 야구 odds 테이블 재사용해 적재
  const oddsRow =
    (await prisma.tsBaseballOddsHistory.findFirst({
      where: { matchId: match.id, kind: "eu", companyId: "2" },
      orderBy: { ts: "desc" },
    })) ??
    (await prisma.tsBaseballOddsHistory.findFirst({
      where: { matchId: match.id, kind: "eu" },
      orderBy: { ts: "desc" },
    }));
  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=volleyball" className="hover:underline">
          배구 라이브 스코어
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
      </nav>

      <header>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-keep">
          {homeKo} vs {awayKo}
        </h1>
        <p className="text-sm text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
          <span>
            {getLeagueFlag(lg) && <span className="mr-1">{getLeagueFlag(lg)}</span>}
            {label} · 라이브 스코어 · 세트별 점수 · 5초 자동 갱신
          </span>
          <Link href={`/standings/${lg}`} className="font-bold text-amber-600 dark:text-amber-400 hover:underline">
            순위표 →
          </Link>
        </p>
      </header>

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
        initialPenHome={null}
        initialPenAway={null}
        initialStatus={match.status as "FINISHED" | "SCHEDULED" | "LIVE" | "POSTPONED"}
        homePosition={homePosition}
        awayPosition={awayPosition}
        homeFifaRank={null}
        awayFifaRank={null}
        eloPrediction={null}
        oddsHistory={[]}
        playerLogoById={{}}
      />

      <VolleyballRecentForm
        matches={recentMatches}
        homeId={match.homeTeam.id}
        awayId={match.awayTeam.id}
        homeKo={homeKo}
        awayKo={awayKo}
        league={lg}
      />

      <VolleyballOddsCard
        odds={oddsRow}
        homeKo={homeKo}
        awayKo={awayKo}
        status={match.status}
        predHome={match.predHome}
        marketHome={match.marketHome}
      />

      <VolleyballStatsCard stats={dl?.stats} homeKo={homeKo} awayKo={awayKo} />
    </div>
  );
}

// 배구 최근 5경기 — 같은 대회 FINISHED, 도트(좌=과거) + 미니 리스트(위=최근).
interface VbRecentMatch {
  status: string; homeTeamId: number; awayTeamId: number;
  homeScore: number | null; awayScore: number | null; startTime: Date;
  homeTeam: { name: string }; awayTeam: { name: string };
}

function VolleyballRecentForm({
  matches, homeId, awayId, homeKo, awayKo, league,
}: {
  matches: VbRecentMatch[]; homeId: number; awayId: number; homeKo: string; awayKo: string; league: string;
}) {
  const teamCol = (teamId: number, nameKo: string) => {
    const form = getRecentForm(matches, teamId, 5);
    const recent = matches
      .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && m.homeScore != null && m.awayScore != null)
      .slice(0, 5);
    if (recent.length === 0) return null;
    return (
      <div className="space-y-2 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold truncate">{nameKo}</span>
          <RecentFormDots form={form} size="sm" />
        </div>
        <ul className="space-y-1">
          {recent.map((m, i) => {
            const isHome = m.homeTeamId === teamId;
            const my = isHome ? m.homeScore! : m.awayScore!;
            const opp = isHome ? m.awayScore! : m.homeScore!;
            const oppName = toKoreanTeamName(isHome ? m.awayTeam.name : m.homeTeam.name, league);
            const win = my > opp;
            const d = new Date(m.startTime.getTime() + 9 * 3600 * 1000);
            return (
              <li key={i} className="flex items-center gap-1.5 text-xs text-neutral-500 tabular-nums">
                <span className={`shrink-0 w-4 h-4 rounded inline-flex items-center justify-center text-[9px] font-black text-white ${win ? "bg-emerald-500" : "bg-rose-500"}`}>
                  {win ? "승" : "패"}
                </span>
                <span className="shrink-0">{d.getUTCMonth() + 1}/{d.getUTCDate()}</span>
                <span className="truncate">vs {oppName}</span>
                <span className="ml-auto shrink-0 font-semibold text-neutral-600 dark:text-neutral-300">{my}:{opp}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };
  const homeNode = teamCol(homeId, homeKo);
  const awayNode = teamCol(awayId, awayKo);
  if (!homeNode && !awayNode) return null;
  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-3">
        최근 5경기 (세트 스코어)
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        {homeNode}
        {awayNode}
      </div>
    </div>
  );
}

// 배구 AI 예측 — Elo(자체) + bet365 시장 블렌드 (cron volleyball-predict 가 predHome 저장).
// predHome 없는 매치(예측 가동 전 종료분)는 배당 임플라이드 폴백 — 라벨로 구분.
function VolleyballOddsCard({
  odds,
  homeKo,
  awayKo,
  status,
  predHome,
  marketHome,
}: {
  odds: { v1: number; v2: number; ts: number; companyId: string } | null;
  homeKo: string;
  awayKo: string;
  status: string;
  predHome?: number | null;
  marketHome?: number | null;
}) {
  const hasPred = predHome != null;
  if (!hasPred && (!odds || odds.v1 <= 1 || odds.v2 <= 1)) return null;
  let ph: number;
  let modelPct: number | null = null;
  let marketPct: number | null = null;
  if (hasPred) {
    ph = Math.round(predHome! * 100);
    marketPct = marketHome != null ? Math.round(marketHome * 100) : null;
    // 블렌드 역산 (pred = 0.6*market + 0.4*elo) — 시장 없으면 pred 자체가 Elo
    const elo = marketHome != null ? (predHome! - 0.6 * marketHome) / 0.4 : predHome!;
    modelPct = Math.round(Math.min(0.99, Math.max(0.01, elo)) * 100);
  } else {
    const ih = 1 / odds!.v1;
    const ia = 1 / odds!.v2;
    ph = Math.round((ih / (ih + ia)) * 100);
  }
  const pa = 100 - ph;
  const updated = odds
    ? new Date(odds.ts * 1000).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "";
  const company = odds ? (odds.companyId === "2" ? "bet365" : `북메이커 #${odds.companyId}`) : "";
  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          {hasPred ? "AI 예측 (Elo + 시장)" : "승률 (배당 기반)"}
        </div>
        {odds && (
          <div className="text-[10px] text-neutral-500">
            {company} · {status === "FINISHED" ? "마감 배당" : "갱신"} {updated}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-sm font-bold">
        <span className="truncate max-w-[40%]">{homeKo} {ph}%</span>
        <span className="truncate max-w-[40%] text-right">{awayKo} {pa}%</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
        <div className="h-full" style={{ width: `${ph}%`, background: "#22c55e" }} />
        <div className="h-full" style={{ width: `${pa}%`, background: "#3b82f6" }} />
      </div>
      {odds && (
        <div className="flex items-center justify-between text-xs text-neutral-500 tabular-nums">
          <span>배당 {odds.v1.toFixed(2)}</span>
          <span>배당 {odds.v2.toFixed(2)}</span>
        </div>
      )}
      {hasPred && (
        <div className="text-[10px] text-neutral-400">
          Elo 모델 {modelPct}%{marketPct != null ? ` · 시장 ${marketPct}%` : ""} — 시장 0.6 + 모델 0.4 블렌드
          {marketPct == null ? " (배당 미수집 — 모델 단독)" : ""}
        </div>
      )}
    </div>
  );
}

// 배구 기술통계 — detail_live.stats = [[type(0=풀코트, n=세트), [[statId, home, away], ...]], ...]
// statId 코드표 (TheSports docs, 2026-06-12 사용자 제공)
const VB_STAT_KO: Record<number, string> = {
  1: "에이스",
  2: "연속 최다 득점",
  3: "득점",
  4: "서브 에러",
  5: "타임아웃",
  6: "서브 득점 성공",
  7: "서브 시도",
  8: "서브 성공률 (%)",
  9: "리시브 성공",
  10: "리시브 시도",
  11: "리시브 성공률 (%)",
};

function VolleyballStatsCard({
  stats,
  homeKo,
  awayKo,
}: {
  stats?: unknown[] | null;
  homeKo: string;
  awayKo: string;
}) {
  if (!Array.isArray(stats)) return null;
  // 풀코트(type 0) 항목만 — 세트별은 표가 길어져 v1 생략
  const full = stats.find((s) => Array.isArray(s) && Number(s[0]) === 0) as
    | [number, unknown[]]
    | undefined;
  if (!full || !Array.isArray(full[1]) || full[1].length === 0) return null;
  const rows = full[1]
    .filter((r): r is [number, number, number] => Array.isArray(r) && r.length >= 3)
    .map(([id, h, a]) => ({ id, label: VB_STAT_KO[id] ?? `#${id}`, h, a }))
    .filter((r) => VB_STAT_KO[r.id]);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-2">
        기술 통계 (풀코트)
      </div>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-[11px] text-neutral-500">
            <th className="text-left font-medium pb-2 truncate max-w-[100px]">{homeKo}</th>
            <th className="text-center font-medium pb-2">항목</th>
            <th className="text-right font-medium pb-2 truncate max-w-[100px]">{awayKo}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-black/5 dark:border-white/5">
              <td className={`py-1.5 text-left font-bold ${r.h > r.a ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{r.h}</td>
              <td className="py-1.5 text-center text-neutral-500 text-xs">{r.label}</td>
              <td className={`py-1.5 text-right font-bold ${r.a > r.h ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{r.a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
