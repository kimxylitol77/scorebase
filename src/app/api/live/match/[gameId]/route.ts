// /api/live/match/[gameId]?league=NBA|NHL|EPL|LALIGA|... — 단일 매치 라이브 detail.
// gameId = Match.externalId. NBA/NHL 은 ESPN scoreboard linescore, 축구는 ESPN scoringPlay.
// MLB/KBO/NPB/LOL 은 별도 전용 endpoint 사용 (이 endpoint 가 처리하지 않음).
// Edge runtime + ETag + 짧은 CDN 캐시.

import { NextResponse, type NextRequest } from "next/server";
import {
  fetchAllLiveScores,
  fetchEspnPeriodLinescores,
  fetchEspnSummary,
  type LiveMatch,
  type MatchSummary,
  type PeriodLinescore,
  type SoccerGoal,
} from "@/lib/sports/live-scores";
// Phase 1 (2026-05-25): 축구의 ESPN summary + api-football events/stats/goals/lineups
// 모두 제거. TheSports cache.detailLive 로 일원화 (page.tsx 가 직접 cache 조회).
// fetchEspnSummary 는 NBA/NHL/MLB 에서 여전히 사용 (keep).
import type { SoccerEvent } from "@/lib/live/soccer-events";
import { fetchLiveOdds, isLiveOddsSupported, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { saveOddsSnapshot } from "@/lib/odds/snapshot-store";
import { fetchNbaLiveStats } from "@/lib/sports/api-nba";
import { BASKETBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { extractBasketballFromCache } from "@/lib/sports/thesports/basketball-live";

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
// ESPN_SOCCER_PATH 제거 (2026-05-25 Phase 1) — 축구는 TheSports cache 만 사용.

// runtime 고정 — nodejs.
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
  // soccerLineups 제거 — TheSports cache 의 lineup 직접 사용.
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
  // soccerLineups 제거 — etag signature 도 제거
  const luSig = "";
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
        homePlayers: nbaStats.homePlayers,
        awayPlayers: nbaStats.awayPlayers,
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
          homePlayers: stats.homePlayers,
          awayPlayers: stats.awayPlayers,
        };
      }
    }
  } else if (SOCCER_LEAGUES.has(league)) {
    // 2026-05-25 Phase 1+2: ESPN summary + api-football events/stats/goals 호출 제거.
    // 데이터 source 를 TheSports cache.detailLive 로 일원화.
    // Phase 2: events 타임라인을 cache.detailLive.incidents 에서 직접 추출.
    out.soccerGoals = null;
    out.summary = null;
    out.soccerEvents = null;

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
        const dl = cache?.detailLive as { incidents?: unknown } | null;
        if (dl?.incidents) {
          const { tsIncidentsToEvents } = await import("@/lib/sports/live-scores");
          const events = tsIncidentsToEvents(dl.incidents);
          if (events.length > 0) out.soccerEvents = events;
        }
      }
    } catch (e) {
      console.warn("[live/match] ts events 추출 fail:", (e as Error).message);
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

  // 농구 (NBA/WNBA/KBL/WKBL) — TheSports cache 가 쿼터/상태 우선 소스.
  // ESPN/api-sports 가 빈 응답이어도 cache 에 쿼터별 점수 + 진행 라벨이 있음.
  if (BASKETBALL_LEAGUES.has(league)) {
    try {
      const { prisma } = await import("@/lib/db");
      const dbMatch = await prisma.match.findFirst({
        where: { externalId: gameId, league },
        select: { status: true, theSportsCache: { select: { detailLive: true } } },
      });
      const cacheLive = dbMatch?.theSportsCache?.detailLive
        ? extractBasketballFromCache(dbMatch.theSportsCache.detailLive)
        : null;
      if (cacheLive?.periodLinescore) {
        out.periodLinescore = cacheLive.periodLinescore;
      }
      // 라이브 폴링(allLive)에서 못 찾았어도 cache 상태로 보정.
      if (!live && cacheLive?.status) {
        if (cacheLive.status === "LIVE") out.status = "LIVE";
        else if (cacheLive.status === "FINISHED") out.status = "FINAL";
      }
      if (cacheLive?.statusLabel && (out.status === "LIVE" || !out.statusLabel)) {
        out.statusLabel = cacheLive.statusLabel;
      }
      // periodLinescore 합계로 점수 보정 (cache 가 가장 fresh).
      if (cacheLive?.periodLinescore) {
        const { homeScore, awayScore } = cacheLive.periodLinescore;
        if (out.homeScore == null || homeScore > out.homeScore) out.homeScore = homeScore;
        if (out.awayScore == null || awayScore > out.awayScore) out.awayScore = awayScore;
      }
    } catch {
      // cache 조회 실패는 ignore — 외부 source 결과만 응답
    }
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
