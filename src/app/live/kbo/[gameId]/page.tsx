// /live/kbo/[gameId] — KBO 매치 라이브 상세 페이지.
// gameId = api-sports Baseball game id (= 우리 Match.externalId).
// SSR: DB Match 조회로 메타데이터 + 한글팀명 + 선발투수.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import BaseballLiveDetail from "@/components/BaseballLiveDetail";
import BaseballPreMatchInsight, {
  type StarterInfo,
} from "@/components/BaseballPreMatchInsight";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import BaseballTeamStatsCard from "@/components/live/BaseballTeamStatsCard";
import BaseballBoxscoreCard from "@/components/live/BaseballBoxscoreCard";
import LiveOddsCard from "@/components/live/LiveOddsCard";
import { loadBaseballOdds } from "@/lib/odds/baseball-ts-odds";

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

// prisma 호출 — DB 연결 실패 (P1001) 시 null 반환해 dev 환경 에러 오버레이 방지.
async function findKboMatch(gameId: string) {
  try {
    return await prisma.match.findFirst({
      where: { externalId: gameId, league: "KBO" },
      include: { homeTeam: true, awayTeam: true, liveCommentary: true, theSportsCache: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = await findKboMatch(gameId);
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

  const match = await findKboMatch(gameId);
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;

  const [extras, baseballOdds] = await Promise.all([
    fetchMatchExtras(match),
    loadBaseballOdds(match.id),
  ]);

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
          KBO · 라이브 스코어 · 라이브 푸시 (평균 2-3초)
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
      />
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
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
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
      {baseballOdds ? (
        <LiveOddsCard
          odds={baseballOdds.odds}
          homeNameKo={homeKo}
          awayNameKo={awayKo}
          hasDraw={false}
          oddsHistory={baseballOdds.history.map((p) => ({
            fetchedAt: p.fetchedAt,
            home: p.home,
            draw: null,
            away: p.away,
          }))}
        />
      ) : null}
      <BaseballPreMatchInsight
        league="KBO"
        homeStarter={parseStarterFull(match.homeStarter)}
        awayStarter={parseStarterFull(match.awayStarter)}
        homeTeamName={homeKo}
        awayTeamName={awayKo}
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

      {/* TheSports cache 기반 — 팀 스탯 + 박스스코어 (확정된 stat_id 만 표시) */}
      {match.theSportsCache?.detailLive ? (
        <>
          <BaseballTeamStatsCard
            stats={(match.theSportsCache.detailLive as { stats?: unknown }).stats}
            homeNameKo={homeKo}
            awayNameKo={awayKo}
          />
          <BaseballBoxscoreCard
            players={(match.theSportsCache.detailLive as { players?: unknown }).players}
            homeNameKo={homeKo}
            awayNameKo={awayKo}
          />
        </>
      ) : null}
    </div>
  );
}
