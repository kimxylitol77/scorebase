// /live/mlb/[gameId] — MLB 매치 라이브 상세 페이지.
// gameId = ESPN game id (= 우리 Match.externalId, MLB collector 가 ESPN ID 사용).
// SSR: DB Match 조회로 메타데이터 + 한글팀명. 라이브 데이터는 클라이언트가 polling.
//
// Fallback: 헤더 라이브바 등에서 api-sports baseball id (5자리) 로 접속하는 케이스 지원.
// → api-sports 에서 game info fetch → home/away/date 매칭 → 진짜 ESPN id 로 redirect.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import MlbLiveDetail from "@/components/MlbLiveDetail";
import type { StarterInfo } from "@/components/BaseballPreMatchInsight";
import MatchInsight from "@/components/MatchInsight";
import LiveOddsCard from "@/components/live/LiveOddsCard";
import { toKoreanPlayerName } from "@/lib/player-names";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import MlbBoxscoreTabs from "@/components/live/MlbBoxscoreTabs";
import MlbTeamStatsLive from "@/components/live/MlbTeamStatsLive";
import { loadBaseballOdds } from "@/lib/odds/baseball-ts-odds";
import {
  fetchMlbFullBoxscore,
  findMlbGamePk,
  type MlbFullBoxscore,
} from "@/lib/sports/mlb-stats-api";

function parseStarterFull(json: string | null): StarterInfo | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as StarterInfo;
    if (obj.name) {
      const ko = toKoreanPlayerName(obj.name);
      if (ko) obj.name = ko;
    }
    return obj;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ gameId: string }>;
}

type FoundMatch = Awaited<ReturnType<typeof findEspnMatch>>;

async function findEspnMatch(gameId: string) {
  // DB 연결 실패 (P1001) 시 null 반환 — dev 환경 에러 오버레이 방지.
  try {
    return await prisma.match.findFirst({
      where: { externalId: gameId, league: "MLB" },
      include: { homeTeam: true, awayTeam: true, liveCommentary: true, theSportsCache: true },
    });
  } catch {
    return null;
  }
}

/** api-sports baseball id 로 받은 gameId 를 우리 DB MLB Match 로 변환. */
async function findByApiSportsId(gameId: string): Promise<FoundMatch | null> {
  const key = process.env.API_BASEBALL_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://v1.baseball.api-sports.io/games?id=${encodeURIComponent(gameId)}`,
      {
        headers: { "x-apisports-key": key },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      response?: Array<{
        date: string;
        league: { id: number };
        teams: { home: { name: string }; away: { name: string } };
      }>;
    };
    const g = data.response?.[0];
    if (!g || g.league.id !== 1) return null;
    const gameDate = new Date(g.date);
    if (Number.isNaN(gameDate.getTime())) return null;
    const winStart = new Date(gameDate.getTime() - 12 * 3600 * 1000);
    const winEnd = new Date(gameDate.getTime() + 12 * 3600 * 1000);
    // 1) 영문 풀네임 정확 매칭 (대다수)
    let m = await prisma.match.findFirst({
      where: {
        league: "MLB",
        startTime: { gte: winStart, lte: winEnd },
        homeTeam: { name: g.teams.home.name },
        awayTeam: { name: g.teams.away.name },
      },
      include: { homeTeam: true, awayTeam: true, liveCommentary: true, theSportsCache: true },
    });
    if (m) return m;
    // 2) 마지막 토큰 (= 팀명) contains fallback
    const homeTok = g.teams.home.name.split(/\s+/).slice(-1)[0];
    const awayTok = g.teams.away.name.split(/\s+/).slice(-1)[0];
    if (!homeTok || !awayTok) return null;
    m = await prisma.match.findFirst({
      where: {
        league: "MLB",
        startTime: { gte: winStart, lte: winEnd },
        homeTeam: { name: { contains: homeTok } },
        awayTeam: { name: { contains: awayTok } },
      },
      include: { homeTeam: true, awayTeam: true, liveCommentary: true, theSportsCache: true },
    });
    return m;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = (await findEspnMatch(gameId)) ?? (await findByApiSportsId(gameId));
  if (!match) {
    return { title: "라이브 매치를 찾을 수 없습니다" };
  }
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  return {
    title: `${away} vs ${home} 라이브 — MLB`,
    description: `${away} vs ${home} MLB 라이브 스코어 · 이닝별 점수 · 베이스 상황 · 볼/스트라이크/아웃 · 현재 투수/타자.`,
    alternates: { canonical: `https://www.scorebase.kr/live/mlb/${match.externalId}` },
  };
}

export default async function MlbLivePage({ params }: Props) {
  const { gameId } = await params;
  if (!/^\d+$/.test(gameId)) notFound();

  let match = await findEspnMatch(gameId);
  if (!match) {
    // api-sports id 로 들어온 케이스 — DB 매칭 후 진짜 ESPN id 로 redirect
    match = await findByApiSportsId(gameId);
    if (!match) notFound();
    if (match.externalId !== gameId) {
      redirect(`/live/mlb/${match.externalId}`);
    }
  }

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;

  const [extras, baseballOdds, mlbBoxscore] = await Promise.all([
    fetchMatchExtras(match),
    loadBaseballOdds(match.id),
    fetchInitialMlbBoxscore(match),
  ]);
  const playerNameKoBy = mlbBoxscore ? buildMlbPlayerNameKoMap(mlbBoxscore) : undefined;

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
          MLB · 라이브 스코어 · 라이브 푸시 (평균 2-3초)
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        league="MLB"
      />
      <MlbLiveDetail
        gameId={gameId}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        homeLogoUrl={match.homeTeam.logoUrl ?? null}
        awayLogoUrl={match.awayTeam.logoUrl ?? null}
        liveCommentary={
          match.liveCommentary
            ? {
                matchSummary: match.liveCommentary.matchSummary,
                summaryAt: match.liveCommentary.summaryAt,
                scoreSnapshot: match.liveCommentary.scoreSnapshot,
              }
            : null
        }
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

      {/* 네이버 스타일 7탭 통합 카드 — 라인업/타자/투수/팀통계(ESPN)/팀스탯(TS)/배당/승률 */}
      <MlbBoxscoreTabs
        gameId={gameId}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        initialBoxscore={mlbBoxscore}
        initialStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        playerNameKoBy={playerNameKoBy}
        tsDetailStats={
          (match.theSportsCache?.detailLive as { stats?: unknown } | null)?.stats
        }
        initialOdds={baseballOdds}
      />
      <MatchInsight
        match={match}
        teamStatsContent={
          <MlbTeamStatsLive
            gameId={gameId}
            homeNameKo={homeKo}
            awayNameKo={awayKo}
          />
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

/** SSR: ESPN game id → schedule gamePk lookup → full boxscore.
 *  실패는 null — 클라이언트가 API 라우트로 재시도. */
async function fetchInitialMlbBoxscore(
  match: NonNullable<FoundMatch>,
): Promise<MlbFullBoxscore | null> {
  try {
    const gamePk = await findMlbGamePk(
      match.startTime.toISOString(),
      match.homeTeam.name,
      match.awayTeam.name,
    );
    if (!gamePk) return null;
    return await fetchMlbFullBoxscore(gamePk);
  } catch {
    return null;
  }
}

/** boxscore 안의 모든 선수에 대해 영문 → 한글 매핑 (있는 경우만). */
function buildMlbPlayerNameKoMap(box: MlbFullBoxscore): Record<number, string> {
  const out: Record<number, string> = {};
  for (const side of [box.home, box.away]) {
    for (const b of side.batters) {
      const ko = toKoreanPlayerName(b.name);
      if (ko && ko !== b.name) out[b.pid] = ko;
    }
    for (const p of side.pitchers) {
      const ko = toKoreanPlayerName(p.name);
      if (ko && ko !== p.name) out[p.pid] = ko;
    }
  }
  return out;
}
