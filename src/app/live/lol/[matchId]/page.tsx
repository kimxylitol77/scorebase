// /live/lol/[matchId] — LCK 매치 라이브 상세 페이지.
// matchId = BALLDONTLIE match id (= 우리 Match.externalId).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import LolLiveDetail from "@/components/LolLiveDetail";
import type { LolGamesData } from "@/lib/sports/lol-ingame";
import type { LolLive } from "@/components/LolLiveDetail";
import MatchHeadToHead from "@/components/MatchHeadToHead";
import MatchInsight from "@/components/MatchInsight";
import MatchArticleLinks from "@/components/MatchArticleLinks";
import { fetchMatchExtras } from "@/lib/live/match-extras";
import { LOL_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import ConclusionCards, {
  type ConclusionPred,
  type KeyFactor,
} from "@/components/live/BaseballConclusionCards";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ matchId: string }>;
}

function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// prisma 호출 — DB 연결 실패 (P1001) 시 null 반환해 dev 환경 에러 오버레이 방지.
async function findLolMatch(matchId: string) {
  try {
    return await prisma.match.findFirst({
      where: { externalId: matchId, league: { in: [...LOL_LEAGUES] } },
      include: { homeTeam: true, awayTeam: true },
    });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { matchId } = await params;
  const match = await findLolMatch(matchId);
  if (!match) return { title: "라이브 매치를 찾을 수 없습니다" };
  const home = toKoreanTeamName(match.homeTeam.name);
  const away = toKoreanTeamName(match.awayTeam.name);
  const lbl = LEAGUE_DISPLAY[match.league] ?? match.league;
  return {
    title: `${away} vs ${home} 라이브 — ${lbl}`,
    description: `${away} vs ${home} ${lbl} 매치 라이브 시리즈 점수. BO3/BO5 진행 자동 갱신.`,
    alternates: { canonical: `https://www.scorebase.kr/live/lol/${matchId}` },
  };
}

export default async function LolLivePage({ params }: Props) {
  const { matchId } = await params;
  // externalId 는 BDL(숫자) 또는 TheSports(영숫자) — 둘 다 허용. 실제 존재 여부는 DB 조회로 판정.
  if (!/^[a-zA-Z0-9]+$/.test(matchId)) notFound();

  const match = await findLolMatch(matchId);
  if (!match) notFound();

  const leagueLabel = LEAGUE_DISPLAY[match.league] ?? match.league;

  const homeKo = toKoreanTeamName(match.homeTeam.name);
  const awayKo = toKoreanTeamName(match.awayTeam.name);
  const homeShort = match.homeTeam.shortName || homeKo;
  const awayShort = match.awayTeam.shortName || awayKo;
  const date = kstDate(match.startTime);

  const extras = await fetchMatchExtras(match);
  const lolGames = match.lolGames
    ? (JSON.parse(match.lolGames) as LolGamesData)
    : null;
  // DB 기반 초기 시리즈 — BDL(e스포츠 401) 죽어도 점수·세트 dot 표시. bestOf 는 승자 점수로 추정(3승=BO5).
  const lolBestOf: 3 | 5 =
    Math.max(match.homeScore ?? 0, match.awayScore ?? 0) >= 3 ? 5 : 3;
  const lolPlayed = (match.homeScore ?? 0) + (match.awayScore ?? 0);
  const initialLive: LolLive = {
    matchId: Number(matchId),
    status: match.status === "FINISHED" ? "FINAL" : match.status === "LIVE" ? "LIVE" : "PRE",
    bestOf: lolBestOf,
    homeScore: match.homeScore ?? 0,
    awayScore: match.awayScore ?? 0,
    homeTeam: { id: match.homeTeam.id, name: homeKo },
    awayTeam: { id: match.awayTeam.id, name: awayKo },
    tournament: { id: 0, name: leagueLabel },
    startDate: date,
    currentGame: match.status === "FINISHED" ? lolPlayed : lolPlayed + 1,
    needToWin: Math.ceil(lolBestOf / 2),
  };

  // 결론 3카드 데이터 (LoL — 무승부 없음)
  let lolFavored: "home" | "away" | null = null;
  if (match.predHome != null && match.predAway != null) {
    lolFavored = match.predHome >= match.predAway ? "home" : "away";
  }
  let lolCorrect: boolean | null = match.predCorrect ?? null;
  if (
    match.status === "FINISHED" &&
    match.homeScore != null &&
    match.awayScore != null &&
    match.homeScore !== match.awayScore &&
    lolFavored != null
  ) {
    lolCorrect = (match.homeScore > match.awayScore ? "home" : "away") === lolFavored;
  }
  const lolPred: ConclusionPred | null =
    lolFavored != null && match.predHome != null && match.predAway != null
      ? {
          favored: lolFavored,
          pct: Math.min(99, Math.round(Math.max(match.predHome, match.predAway) * 100)),
          correct: lolCorrect,
        }
      : null;
  const lHS = extras.homeStanding;
  const lAS = extras.awayStanding;
  const lolFactors: KeyFactor[] = [];
  if (lHS && lAS) {
    if (lHS.position && lAS.position) {
      lolFactors.push({
        label: "리그순위",
        home: `${lHS.position}위`,
        away: `${lAS.position}위`,
        edge: lHS.position < lAS.position ? "home" : lHS.position > lAS.position ? "away" : "even",
      });
    }
    if (lHS.played > 0 && lAS.played > 0) {
      const hw = lHS.wins / lHS.played;
      const aw = lAS.wins / lAS.played;
      lolFactors.push({
        label: "시즌 승률",
        home: hw.toFixed(3),
        away: aw.toFixed(3),
        edge: hw > aw ? "home" : hw < aw ? "away" : "even",
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores" className="hover:underline">
          라이브 스코어
        </Link>
        <span>›</span>
        <Link href={`/leagues/${match.league}`} className="hover:underline">
          {leagueLabel}
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
          {leagueLabel} · 시리즈 점수 자동 갱신
        </p>
      </header>
      <MatchArticleLinks
        previewSlug={extras.previewSlug}
        recapSlug={extras.recapSlug}
        matchStatus={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
      />

      {/* 결론 3카드 — 결론 먼저 (명세 v2 §6) */}
      {(lolPred || lolFactors.length > 0) && (
        <ConclusionCards
          homeNameKo={homeKo}
          awayNameKo={awayKo}
          status={match.status as "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED"}
          pred={lolPred}
          factors={lolFactors}
        />
      )}

      <LolLiveDetail
        matchId={Number(matchId)}
        date={date}
        homeNameKo={homeKo}
        awayNameKo={awayKo}
        homeLogo={match.homeTeam.logoUrl ?? null}
        awayLogo={match.awayTeam.logoUrl ?? null}
        homeTeamId={match.homeTeam.id}
        awayTeamId={match.awayTeam.id}
        games={lolGames}
        initial={initialLive}
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
        scoreLabel={{ for: "평균 게임 승", against: "평균 게임 패" }}
      />
      <MatchInsight match={match} />
    </div>
  );
}
