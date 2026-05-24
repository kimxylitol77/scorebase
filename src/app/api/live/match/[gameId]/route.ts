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
  findEspnSoccerEventIdByTeams,
  soccerGoalsPairKey,
  type LiveMatch,
  type MatchSummary,
  type PeriodLinescore,
  type SoccerGoal,
} from "@/lib/sports/live-scores";
import { fetchSoccerLiveStats } from "@/lib/live/soccer-live-stats";
import { fetchSoccerLineups, type MatchLineups } from "@/lib/live/soccer-lineups";
import { fetchSoccerEvents, type SoccerEvent } from "@/lib/live/soccer-events";
import { fetchLiveOdds, isLiveOddsSupported, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { saveOddsSnapshot } from "@/lib/odds/snapshot-store";
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
  // K1/K2 는 ESPN 미커버 — ESPN summary 대신 api-football 만 사용
  J1_LEAGUE: "soccer/jpn.1",
  AFC_CL: "soccer/afc.champions",
};

// edge runtime 에선 fetchSoccerGoalsByDate (AbortController/setTimeout)
// 가 빈 응답 반환하던 케이스가 있어 nodejs runtime 으로 고정.
//
// 2026-05-23: force-dynamic 제거. Next.js 가 force-dynamic 일 때 응답의
// s-maxage 를 strip → CDN 캐시 비활성화. 응답 cache-control 만으로 CDN 5초
// 캐시 활성화하여 클라이언트 polling 함수 호출 ~90% 감소.
export const runtime = "nodejs";

const SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "J2_LEAGUE",
  "AFC_CL",
  "AFC_CL_TWO",
  "AFC_U23",
  "SAUDI_PL",
  "UEL",
  "UECL",
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "GREEK_SL",
  "BRASILEIRAO",
  "LIGA_MX",
  "COPA_LIB",
  "COPA_SUD",
  "CSL",
  "A_LEAGUE",
  "CLUB_WORLD_CUP",
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
  /** 축구 — 골/카드/교체 이벤트 타임라인 (최신 우선) */
  soccerEvents?: SoccerEvent[] | null;
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
  const evSig = (live.soccerEvents ?? [])
    .map((e) => `${e.minute}-${e.extra}-${e.type}-${e.side}`)
    .join(";");
  const sig = `${live.status}|${live.homeScore}|${live.awayScore}|${live.statusLabel}|${
    live.periodLinescore?.homePeriods.join(",") ?? ""
  }|${live.periodLinescore?.awayPeriods.join(",") ?? ""}|${
    (live.soccerGoals ?? []).map((g) => `${g.minute}-${g.side}`).join(";")
  }|${live.summary?.homeStats.map((s) => s.value).join(",") ?? ""}|${
    live.summary?.winProbabilityHome?.length ?? 0
  }|${oddsSig}|${luSig}|${evSig}`;
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
    // 시계열 저장 (1분 dedup, fire-and-forget)
    if (out.liveOdds) void saveOddsSnapshot(gameId, league, out.liveOdds);
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
  } else if (league === "WNBA") {
    // WNBA — api-sports basketball v1 의 raw 응답에서 쿼터 점수 + stats 추출.
    // collector 가 externalId = api-sports game.id 로 저장하므로 ESPN id 와 매칭 안 됨.
    // /games 응답 scores.{home,away}.{quarter_1..4, over_time, total} 사용.
    // /games/statistics/teams + /players 로 박스스코어 + 리더 추가 (live + finished).
    const { prisma } = await import("@/lib/db");
    const { fetchWnbaGameStats } = await import("@/lib/sports/api-wnba-stats");
    const dbMatch = await prisma.match.findFirst({
      where: { externalId: gameId, league: "WNBA" },
      select: {
        raw: true,
        homeScore: true,
        awayScore: true,
        status: true,
        homeTeam: { select: { externalId: true } },
        awayTeam: { select: { externalId: true } },
      },
    });
    if (dbMatch?.raw) {
      try {
        const raw = JSON.parse(dbMatch.raw) as {
          scores?: {
            home?: { quarter_1?: number | null; quarter_2?: number | null; quarter_3?: number | null; quarter_4?: number | null; over_time?: number | null; total?: number | null };
            away?: { quarter_1?: number | null; quarter_2?: number | null; quarter_3?: number | null; quarter_4?: number | null; over_time?: number | null; total?: number | null };
          };
        };
        const hs = raw?.scores?.home;
        const as_ = raw?.scores?.away;
        if (hs && as_) {
          const homePeriods: (number | null)[] = [
            hs.quarter_1 ?? null,
            hs.quarter_2 ?? null,
            hs.quarter_3 ?? null,
            hs.quarter_4 ?? null,
          ];
          const awayPeriods: (number | null)[] = [
            as_.quarter_1 ?? null,
            as_.quarter_2 ?? null,
            as_.quarter_3 ?? null,
            as_.quarter_4 ?? null,
          ];
          // OT — 둘 중 하나라도 있으면 표시
          if (hs.over_time != null || as_.over_time != null) {
            homePeriods.push(hs.over_time ?? null);
            awayPeriods.push(as_.over_time ?? null);
          }
          out.periodLinescore = {
            homePeriods,
            awayPeriods,
            homeScore: hs.total ?? dbMatch.homeScore ?? 0,
            awayScore: as_.total ?? dbMatch.awayScore ?? 0,
          };
          // 우리 DB 가 FINISHED 면 FINAL 로 마크 (live 폴링 결과 없어도)
          if (!live && dbMatch.status === "FINISHED") {
            out.status = "FINAL";
            out.homeScore = out.periodLinescore.homeScore;
            out.awayScore = out.periodLinescore.awayScore;
          }
        }
      } catch (e) {
        console.warn("[live/match] WNBA raw parse failed:", (e as Error).message);
      }
    }

    // 박스스코어 + 리더 — api-sports basketball v1 /games/statistics 호출
    if (dbMatch?.homeTeam.externalId && dbMatch?.awayTeam.externalId) {
      const stats = await fetchWnbaGameStats(
        gameId,
        dbMatch.homeTeam.externalId,
        dbMatch.awayTeam.externalId,
      );
      if (stats) {
        out.summary = {
          homeStats: stats.homeStats,
          awayStats: stats.awayStats,
          homeLeaders: stats.homeLeaders,
          awayLeaders: stats.awayLeaders,
        };
      }
    }
  } else if (SOCCER_LEAGUES.has(league)) {
    const espnPath = ESPN_SOCCER_PATH[league];
    // EPL collector 가 football-data id 를 externalId 로 저장 → 그 id 가 ESPN 의
    // 다른 매치 (브라질 세리에A 등) id 와 충돌해서 fetchEspnSummary 가 잘못된 매치
    // 데이터 반환하던 버그. ESPN scoreboard 에서 팀명 매칭으로 진짜 ESPN id 찾고
    // 그걸로 summary 호출. 매칭 실패 시 summary skip (잘못된 데이터 노출보다 안전).
    const espnEventId = espnPath && awayName && homeName
      ? await findEspnSoccerEventIdByTeams(league, date, homeName, awayName)
      : null;
    // 축구 stats — api-football 우선 (possession/슛/코너/xG/카드 등 풍부),
    // 없으면 ESPN summary fallback. leaders / winProb 는 항상 ESPN 에서.
    // lineups (포메이션) 2분 캐시, events (골/카드/교체) 30초 캐시.
    const [goalsMap, espnSummary, afStats, lineups, events] = await Promise.all([
      fetchSoccerGoalsByDate(date, [league]),
      espnPath && espnEventId
        ? fetchEspnSummary(espnPath, espnEventId, SOCCER_STATS)
        : Promise.resolve(null),
      fetchSoccerLiveStats(league, date, awayName, homeName),
      fetchSoccerLineups(league, date, awayName, homeName),
      fetchSoccerEvents(league, date, awayName, homeName),
    ]);
    out.soccerLineups = lineups;
    out.soccerEvents = events;
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
    // TheSports football fast-poller cache 의 score 보강 — fast-poller 2초 cycle.
    // monotonic max(ESPN, cache.score[regular], cache.score[overtime], incidents.last) — 점수 증가만, 더 큰 값 안전.
    // cache.detailLive.score 형식 (docs):
    //   [match_id, status, home_arr[7], away_arr[7], kick_off_ts, '']
    //   home_arr[0]=regular time score, [5]=overtime (regular 포함)
    // incidents[].home_score / away_score = 골 시점 누적 score (가장 fresh).
    if (out.status === "LIVE") {
      try {
        const { prisma: db } = await import("@/lib/db");
        const ourMatch = await db.match.findFirst({
          where: { externalId: gameId, league },
          select: { id: true },
        });
        if (ourMatch) {
          const cache = await db.theSportsMatchCache.findUnique({
            where: { matchId: ourMatch.id },
            select: { detailLive: true },
          });
          const dl = cache?.detailLive as {
            score?: unknown[];
            incidents?: Array<{ home_score?: number; away_score?: number }>;
          } | null;
          let tsHome = -1;
          let tsAway = -1;
          // (1) score array [home_regular, away_regular, home_ot, away_ot]
          const arr = Array.isArray(dl?.score) ? dl.score : null;
          if (arr && arr.length >= 4 && Array.isArray(arr[2]) && Array.isArray(arr[3])) {
            const homeArr = arr[2] as unknown[];
            const awayArr = arr[3] as unknown[];
            const homeReg = Number(homeArr[0]);
            const homeOt = Number(homeArr[5]); // 연장전 (regular 포함)
            const awayReg = Number(awayArr[0]);
            const awayOt = Number(awayArr[5]);
            tsHome = Math.max(tsHome, Number.isFinite(homeReg) ? homeReg : -1, Number.isFinite(homeOt) ? homeOt : -1);
            tsAway = Math.max(tsAway, Number.isFinite(awayReg) ? awayReg : -1, Number.isFinite(awayOt) ? awayOt : -1);
          }
          // (2) incidents 마지막 entry score — 가장 fresh source
          if (Array.isArray(dl?.incidents)) {
            for (const inc of dl.incidents) {
              const h = typeof inc?.home_score === "number" ? inc.home_score : -1;
              const a = typeof inc?.away_score === "number" ? inc.away_score : -1;
              if (h > tsHome) tsHome = h;
              if (a > tsAway) tsAway = a;
            }
          }
          // monotonic max(ESPN, cache)
          if (tsHome >= 0 && (out.homeScore == null || tsHome > out.homeScore)) {
            out.homeScore = tsHome;
          }
          if (tsAway >= 0 && (out.awayScore == null || tsAway > out.awayScore)) {
            out.awayScore = tsAway;
          }
        }
      } catch {
        // cache 조회 실패는 ignore — ESPN 데이터만 응답
      }
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
        "Cache-Control": "public, s-maxage=5, must-revalidate",
        "Vercel-CDN-Cache-Control": "max-age=5",
      },
    });
  }
  return NextResponse.json(
    { live: out, fetchedAt: new Date().toISOString() },
    {
      headers: {
        ETag: etag,
        "Cache-Control": "public, s-maxage=5, must-revalidate",
        "Vercel-CDN-Cache-Control": "max-age=5",
      },
    },
  );
}
