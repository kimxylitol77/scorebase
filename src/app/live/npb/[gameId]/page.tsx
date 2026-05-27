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
import BaseballPreviewInsight from "@/components/BaseballPreviewInsight";
import { fetchNpbPhotoUrl } from "@/lib/sports/npb-official";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import BaseballBoxscoreTabs from "@/components/live/BaseballBoxscoreTabs";
import { extractPlayerStats, playerStatColumns } from "@/lib/sports/thesports/baseball-stats";
import { computeBaseballWpa } from "@/lib/live/baseball-wpa";
import { loadBaseballOdds } from "@/lib/odds/baseball-ts-odds";
import { buildPlayerNameMap, buildPlayerPhotoMap } from "@/lib/sports/thesports/baseball-player-names";

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
async function findNpbMatch(gameId: string) {
  try {
    return await prisma.match.findFirst({
      where: { externalId: gameId, league: "NPB" },
      include: { homeTeam: true, awayTeam: true, liveCommentary: true, theSportsCache: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { gameId } = await params;
  const match = await findNpbMatch(gameId);
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

  const match = await findNpbMatch(gameId);
  if (!match) notFound();

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;

  const homeStarterFull = parseStarterFull(match.homeStarter);
  const awayStarterFull = parseStarterFull(match.awayStarter);
  const detailLivePlayers =
    (match.theSportsCache?.detailLive as { players?: unknown } | null)?.players;
  // NPB 사진은 npb.jp scraping 필요 — pid 있으면 SSR 단에서 fetch
  const [homeStarterPhoto, awayStarterPhoto, extras, baseballOdds, playerNameById, playerPhotoById] =
    await Promise.all([
      homeStarterFull?.pid ? fetchNpbPhotoUrl(String(homeStarterFull.pid)) : Promise.resolve(undefined),
      awayStarterFull?.pid ? fetchNpbPhotoUrl(String(awayStarterFull.pid)) : Promise.resolve(undefined),
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
          NPB · 라이브 스코어 · 라이브 푸시 (평균 2-3초)
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
        league="NPB"
      />
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
      {match.status === "SCHEDULED" ? (
        <BaseballPreviewInsight
          match={match}
          league="NPB"
          baseballContext={null}
        />
      ) : (
        <BaseballPreMatchInsight
          league="NPB"
          homeStarter={homeStarterFull}
          awayStarter={awayStarterFull}
          homeTeamName={homeKo}
          awayTeamName={awayKo}
          homeStarterPhoto={homeStarterPhoto ?? null}
          awayStarterPhoto={awayStarterPhoto ?? null}
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
      />

      {/* 통합 5탭 카드 (타자/투수/팀스탯/배당/승률) — KBO/NPB 공통 */}
      <BaseballBoxscoreTabs
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        playerStats={playerStats}
        batterColumns={batterColumns}
        pitcherColumns={pitcherColumns}
        playerNameById={playerNameById}
        playerPhotoById={playerPhotoById}
        tsDetailStats={detailLive?.stats}
        initialOdds={baseballOdds}
        wpaSeries={wpaSeries}
      />
    </div>
  );
}

/** TheSports detailLive.score → linescore → computeBaseballWpa. NPB 평균 이닝 득점 ~0.45. */
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
