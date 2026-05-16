// /api/live/match/[gameId]?league=NBA|NHL|EPL|LALIGA|... — 단일 매치 라이브 detail.
// gameId = Match.externalId. NBA/NHL 은 ESPN scoreboard linescore, 축구는 ESPN scoringPlay.
// MLB/KBO/NPB/LOL 은 별도 전용 endpoint 사용 (이 endpoint 가 처리하지 않음).
// Edge runtime + ETag + 짧은 CDN 캐시.

import { NextResponse, type NextRequest } from "next/server";
import {
  fetchAllLiveScores,
  fetchEspnPeriodLinescores,
  fetchEspnSummary,
  fetchSoccerGoalsByDate,
  soccerGoalsPairKey,
  type LiveMatch,
  type MatchSummary,
  type PeriodLinescore,
  type SoccerGoal,
} from "@/lib/sports/live-scores";
import { fetchSoccerLiveStats } from "@/lib/live/soccer-live-stats";
import { fetchSoccerLineups, type MatchLineups } from "@/lib/live/soccer-lineups";
import { fetchLiveOdds, isLiveOddsSupported, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { fetchNbaLiveStats } from "@/lib/sports/api-nba";

// ESPN team-stat name → 한국어 라벨 (sportPath 별)
const NBA_STATS = [
  { name: "fieldGoalPct", label: "FG%" },
  { name: "threePointFieldGoalPct", label: "3P%" },
  { name: "freeThrowPct", label: "FT%" },
  { name: "totalRebounds", label: "리바" },
  { name: "assists", label: "어시" },
  { name: "steals", label: "스틸" },
  { name: "blocks", label: "블락" },
  { name: "turnovers", label: "턴오버" },
];
const NHL_STATS = [
  { name: "powerPlayPct", label: "PP%" },
  { name: "penaltyKillPct", label: "PK%" },
  { name: "avgGoals", label: "평균득점" },
  { name: "avgShots", label: "평균슛" },
];
const SOCCER_STATS = [
  { name: "possessionPct", label: "점유율" },
  { name: "totalShots", label: "슛" },
  { name: "shotsOnTarget", label: "유효슛" },
  { name: "totalCorners", label: "코너" },
  { name: "foulsCommitted", label: "파울" },
  { name: "wonCorners", label: "코너" },
];
const ESPN_SOCCER_PATH: Record<string, string> = {
  EPL: "soccer/eng.1",
  LALIGA: "soccer/esp.1",
  BUNDESLIGA: "soccer/ger.1",
  SERIE_A: "soccer/ita.1",
  LIGUE_1: "soccer/fra.1",
  MLS: "soccer/usa.1",
  UCL: "soccer/uefa.champions",
  WORLD_CUP: "soccer/fifa.world",
  J1_LEAGUE: "soccer/jpn.1",
  AFC_CL: "soccer/afc.champions",
};

// edge runtime 에선 fetchSoccerGoalsByDate (AbortController/setTimeout)
// 가 빈 응답 반환하던 케이스가 있어 nodejs runtime 으로 고정.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "J1_LEAGUE",
  "AFC_CL",
]);

interface MatchLive {
  /** "LIVE" | "FINAL" | "PRE" — fetchAllLiveScores 가 LIVE 반환 시만 라이브로 간주 */
  status: "LIVE" | "FINAL" | "PRE" | "UNKNOWN";
  statusLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  /** NBA/NHL — 쿼터/피리어드 별 점수 */
  periodLinescore?: PeriodLinescore | null;
  /** 축구 — 골 이벤트 list */
  soccerGoals?: SoccerGoal[] | null;
  /** NBA/NHL/축구 — 팀 stats + leaders + 라이브 승률 곡선 */
  summary?: MatchSummary | null;
  /** The Odds API — 1분 폴링 라이브 odds (h2h / O-U / 핸디캡) */
  liveOdds?: LiveOddsSnapshot | null;
  /** 축구 — startXI + formation + grid 좌표 */
  soccerLineups?: MatchLineups | null;
}

function kstDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function hashLive(live: MatchLive): Promise<string> {
  const o = live.liveOdds;
  const oddsSig = o
    ? `${o.h2h?.home ?? ""}/${o.h2h?.away ?? ""}/${o.totals?.line ?? ""}/${o.totals?.over ?? ""}/${o.spread?.line ?? ""}`
    : "";
  const lu = live.soccerLineups;
  const luSig = lu
    ? `${lu.home.formation ?? ""}|${lu.home.startXI.length}|${lu.away.formation ?? ""}|${lu.away.startXI.length}`
    : "";
  const sig = `${live.status}|${live.homeScore}|${live.awayScore}|${live.statusLabel}|${
    live.periodLinescore?.homePeriods.join(",") ?? ""
  }|${live.periodLinescore?.awayPeriods.join(",") ?? ""}|${
    (live.soccerGoals ?? []).map((g) => `${g.minute}-${g.side}`).join(";")
  }|${live.summary?.homeStats.map((s) => s.value).join(",") ?? ""}|${
    live.summary?.winProbabilityHome?.length ?? 0
  }|${oddsSig}|${luSig}`;
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sig),
  );
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") ?? "";
  if (!gameId || !league) {
    return NextResponse.json({ error: "gameId/league required" }, { status: 400 });
  }

  // 매치 라이브 — fetchAllLiveScores 결과에서 이 gameId 만 추출
  const allLive = await fetchAllLiveScores();
  const live = allLive.find((m: LiveMatch) => {
    const raw = m.id.replace(/^[a-z]+-/i, "");
    return raw === gameId;
  });

  const date = kstDate();
  const awayName = req.nextUrl.searchParams.get("away") ?? "";
  const homeName = req.nextUrl.searchParams.get("home") ?? "";
  const out: MatchLive = {
    status: live ? "LIVE" : "UNKNOWN",
    statusLabel: live?.statusLabel ?? "",
    homeScore: live?.homeScore ?? null,
    awayScore: live?.awayScore ?? null,
  };

  // 라이브 odds — The Odds API 가 지원하는 리그면 1분 캐시 호출
  // (라이브 매치 + 가까운 예정 매치 모두 응답 — odds 변동 흐름 표시)
  if (isLiveOddsSupported(league) && awayName && homeName) {
    out.liveOdds = await fetchLiveOdds(league, awayName, homeName);
  }

  if (league === "NBA" || league === "NHL") {
    const sportPath = league === "NBA" ? "basketball/nba" : "hockey/nhl";
    const statsList = league === "NBA" ? NBA_STATS : NHL_STATS;
    // NBA — api-nba 풀 boxscore (plusMinus, fastBreakPoints, pointsInPaint 등 ESPN 미제공)
    const [periods, summary, nbaStats] = await Promise.all([
      fetchEspnPeriodLinescores(sportPath, date),
      fetchEspnSummary(sportPath, gameId, statsList),
      league === "NBA"
        ? fetchNbaLiveStats(date, awayName, homeName)
        : Promise.resolve(null),
    ]);
    out.periodLinescore = periods[gameId] ?? null;
    // api-nba stats 가 있으면 ESPN stats 덮어쓰고, ESPN leaders/winProb 는 유지.
    if (nbaStats && (nbaStats.homeStats.length > 0 || nbaStats.awayStats.length > 0)) {
      out.summary = {
        homeStats: nbaStats.homeStats,
        awayStats: nbaStats.awayStats,
        homeLeaders: summary?.homeLeaders ?? [],
        awayLeaders: summary?.awayLeaders ?? [],
        winProbabilityHome: summary?.winProbabilityHome,
      };
    } else {
      out.summary = summary;
    }
    // ESPN 에 종료된 매치 점수도 포함 → live 가 없으면 FINAL 로 간주
    if (!live && out.periodLinescore) {
      out.status = "FINAL";
      out.homeScore = out.periodLinescore.homeScore;
      out.awayScore = out.periodLinescore.awayScore;
    }
  } else if (SOCCER_LEAGUES.has(league)) {
    const espnPath = ESPN_SOCCER_PATH[league];
    // 축구 stats — api-football 우선 (possession/슛/코너/xG/카드 등 풍부),
    // 없으면 ESPN summary fallback. leaders / winProb 는 항상 ESPN 에서.
    // lineups (포메이션) 도 같이 — 2분 캐시.
    const [goalsMap, espnSummary, afStats, lineups] = await Promise.all([
      fetchSoccerGoalsByDate(date, [league]),
      espnPath
        ? fetchEspnSummary(espnPath, gameId, SOCCER_STATS)
        : Promise.resolve(null),
      fetchSoccerLiveStats(league, date, awayName, homeName),
      fetchSoccerLineups(league, date, awayName, homeName),
    ]);
    out.soccerLineups = lineups;
    // 1차: ESPN event id 매칭
    let goals = goalsMap[gameId] ?? null;
    // 2차 fallback: team name pair (EPL 등 DB externalId ≠ ESPN id 보정)
    if (!goals && awayName && homeName) {
      goals = goalsMap[soccerGoalsPairKey(awayName, homeName)] ?? null;
    }
    out.soccerGoals = goals;
    // api-football stats 가 있으면 ESPN stats 덮어쓰고, ESPN summary 의 leaders/winProb 는 유지.
    if (afStats && (afStats.homeStats.length > 0 || afStats.awayStats.length > 0)) {
      out.summary = {
        homeStats: afStats.homeStats,
        awayStats: afStats.awayStats,
        homeLeaders: espnSummary?.homeLeaders ?? [],
        awayLeaders: espnSummary?.awayLeaders ?? [],
        winProbabilityHome: espnSummary?.winProbabilityHome,
      };
    } else {
      out.summary = espnSummary;
    }
  } else {
    return NextResponse.json(
      { error: "unsupported league (use /api/live/{lol,mlb,baseball})" },
      { status: 400 },
    );
  }

  const etag = `W/"${await hashLive(out)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, s-maxage=15, must-revalidate",
      },
    });
  }
  return NextResponse.json(
    { live: out, fetchedAt: new Date().toISOString() },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "public, s-maxage=15, must-revalidate",
      },
    },
  );
}
