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
  parseTsFootballScore,
} from "@/lib/sports/live-scores";
// Phase 1 (2026-05-25): 축구의 ESPN summary + api-football events/stats/goals/lineups
// 모두 제거. TheSports cache.detailLive 로 일원화 (page.tsx 가 직접 cache 조회).
// fetchEspnSummary 는 NBA/NHL/MLB 에서 여전히 사용 (keep).
import type { SoccerEvent } from "@/lib/live/soccer-events";
import { fetchLiveOdds, isLiveOddsSupported, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { saveOddsSnapshot } from "@/lib/odds/snapshot-store";
import { fetchNbaLiveStats } from "@/lib/sports/api-nba";
import { BASKETBALL_LEAGUES, VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";
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
  /** 축구 승부차기 점수 — 정규/연장 동점 후 PK. 있으면 (4) 1 : 1 (3) 표시. */
  penHome?: number | null;
  penAway?: number | null;
  /** 주심 이름 (축구 — DB Match.referee. 정적이라 ETag hash 제외, 첫 200 응답에만 실림). */
  referee?: string | null;
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
        select: { id: true, referee: true },
      });
      if (ourMatch) {
        if (ourMatch.referee) out.referee = ourMatch.referee;
        const cache = await db.theSportsMatchCache.findUnique({
          where: { matchId: ourMatch.id },
          select: { detailLive: true },
        });
        const dl = cache?.detailLive as { incidents?: unknown } | null;
        if (dl?.incidents) {
          const { tsIncidentsToEvents } = await import("@/lib/sports/live-scores");
          // 이벤트(골·도움·교체) 선수명 한글화 — incident player id 들의 nameKo 조회
          const nameById: Record<string, string> = {};
          if (Array.isArray(dl.incidents)) {
            const pids = new Set<string>();
            for (const inc of dl.incidents) {
              const i = inc as Record<string, unknown>;
              for (const k of ["player_id", "assist1_id", "assist2_id", "in_player_id", "out_player_id"]) {
                const v = i[k];
                if (typeof v === "string" && v) pids.add(v);
              }
            }
            if (pids.size > 0) {
              const rows = await db.theSportsPlayer.findMany({
                where: { id: { in: Array.from(pids) }, nameKo: { not: null } },
                select: { id: true, nameKo: true },
              });
              for (const r of rows) if (r.nameKo) nameById[r.id] = r.nameKo;
            }
          }
          const events = tsIncidentsToEvents(dl.incidents, nameById);
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
    // 종료·라이브 모두 — cache.detailLive.score 에서 정규/연장/승부차기 보강.
    // (종료 경기도 승부차기 괄호 표시 위해 LIVE 가드 제거)
    {
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
          const fs = parseTsFootballScore(dl);
          if (fs?.penHome != null && fs?.penAway != null) {
            // 승부차기 종료(또는 진행 중) — 메인 점수는 정규/연장 (cache idx0/5) 이 권위.
            // incidents 의 PK 골 누적이 메인을 4 로 오염시키므로 incidents max 를 쓰지 않는다.
            out.homeScore = fs.mainHome;
            out.awayScore = fs.mainAway;
            out.penHome = fs.penHome;
            out.penAway = fs.penAway;
          } else {
            // 일반/연장 경기 — score array(정규+연장) + incidents 마지막 score 중 max (라이브 fresh).
            let tsHome = fs ? fs.mainHome : -1;
            let tsAway = fs ? fs.mainAway : -1;
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
        }
      } catch {
        // cache 조회 실패는 ignore — ESPN 데이터만 응답
      }
    }
  } else if (VOLLEYBALL_LEAGUES.has(league)) {
    // 배구 (VNL/AVC/유럽리그) — TheSports cache 단일 소스.
    // score[3] = {ft:[h세트,a세트], p1..p5:[h점,a점]} — ft 가 곧 매치 스코어(세트).
    try {
      const { prisma } = await import("@/lib/db");
      const dbMatch = await prisma.match.findFirst({
        where: { externalId: gameId, league },
        select: { status: true, homeScore: true, awayScore: true, theSportsCache: { select: { detailLive: true } } },
      });
      if (dbMatch) {
        out.status = dbMatch.status === "LIVE" ? "LIVE" : dbMatch.status === "FINISHED" ? "FINAL" : "PRE";
        out.homeScore = dbMatch.homeScore;
        out.awayScore = dbMatch.awayScore;
        const dl = dbMatch.theSportsCache?.detailLive as { score?: unknown[] } | null;
        const arr = dl?.score;
        if (Array.isArray(arr) && arr.length >= 4) {
          const sid = Number(arr[1]);
          const sObj = arr[3] as Record<string, unknown>;
          const homeSets: (number | null)[] = [];
          const awaySets: (number | null)[] = [];
          for (let i = 1; i <= 5; i++) {
            const pv = sObj?.["p" + i];
            if (!Array.isArray(pv) || pv.length < 2) continue;
            const hp = Number(pv[0]);
            const ap = Number(pv[1]);
            homeSets.push(Number.isFinite(hp) ? hp : null);
            awaySets.push(Number.isFinite(ap) ? ap : null);
          }
          const ft = sObj?.["ft"];
          const ftH = Array.isArray(ft) ? Number(ft[0]) : NaN;
          const ftA = Array.isArray(ft) ? Number(ft[1]) : NaN;
          if (homeSets.length > 0 && Number.isFinite(ftH) && Number.isFinite(ftA)) {
            out.periodLinescore = { homePeriods: homeSets, awayPeriods: awaySets, homeScore: ftH, awayScore: ftA };
            out.homeScore = ftH;
            out.awayScore = ftA;
          }
          // 진행 세트 라벨 — LIVE 일 때만 ("3세트 12-10")
          const SET_NO: Record<number, number> = { 432: 1, 434: 2, 436: 3, 438: 4, 440: 5 };
          const setNo = SET_NO[sid];
          if (out.status === "LIVE") {
            if (setNo) {
              const pv = sObj?.["p" + setNo];
              out.statusLabel =
                Array.isArray(pv) && pv.length >= 2
                  ? `${setNo}세트 ${Number(pv[0])}-${Number(pv[1])}`
                  : `${setNo}세트`;
            } else if (sid === 17) {
              out.statusLabel = "중단";
            }
          }
        }
      }
    } catch {
      // cache 조회 실패 ignore — UNKNOWN 응답 (클라이언트는 initial 값 유지)
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
