// GET /api/internal/data-sanity
// 라이브 데이터 의미적 일관성 검사. mac-mini data-sanity.js 가 3분마다 호출.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// 검출 항목 (2026-05-24~25 retrospective 기반):
//   1. score_drift           — SCHEDULED 야구 매치에 점수 있음 (status updater 죽음)
//   2. inning_missing        — LIVE 야구 매치인데 cache.detailLive.score 없거나 half=0
//   3. cache_db_mismatch     — cache.ft ([home, away]) vs DB.homeScore/awayScore 불일치
//   4. stale_live            — LIVE 야구/축구 매치 updatedAt 30분+ 정체
//   5. standings_stale       — TheSports standings cache 1.5h+ stale (poller 죽음)
//   6. standings_mismatch    — TheSports vs api-football 1위 팀 다름 (한쪽 stale)
//
// 응답: { ok, checkedAt, totals, issues: [{ kind, severity, ... }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);
// 30분 — football-poller 5분 주기 + ws-subscriber 푸시 빈도가 마이너 리그에서
// 낮을 수 있어 15분 → 30분 으로 완화 (false positive 감소, 2026-05-25).
const STALE_LIVE_MS = 30 * 60 * 1000;
// TheSports standings poller 1h 주기 → 1.5h+ stale 면 worker 죽음 의심.
const STANDINGS_TS_STALE_MS = 1.5 * 3600 * 1000;
// api-football standings cron 1일 1회 → 26h+ stale 면 cron 실패 의심.
const STANDINGS_AF_STALE_MS = 26 * 3600 * 1000;
// standings 검사 대상 메이저 리그
const STANDINGS_CHECK_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "UECL", "MLS",
  "K_LEAGUE_1", "J1_LEAGUE", "CHAMPIONSHIP",
];

type IssueKind =
  | "score_drift"
  | "inning_missing"
  | "cache_db_mismatch"
  | "stale_live"
  | "standings_stale"
  | "standings_mismatch";

interface Issue {
  kind: IssueKind;
  severity: "HIGH" | "WARN";
  matchId: number;
  externalId: string;
  league: string;
  home: string;
  away: string;
  detail: string;
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) return unauthorized();

  const now = Date.now();
  // 야구는 매치 시작 ±12시간, 축구는 진행 중인 매치만 (LIVE).
  // DB 부담 최소화: 단일 쿼리로 야구 매치 + 관련 cache + 팀명.
  const matches = await prisma.match.findMany({
    where: {
      OR: [
        { status: "LIVE" },
        {
          AND: [
            { league: { in: ["KBO", "NPB", "MLB"] } },
            { startTime: { gte: new Date(now - 12 * 3600 * 1000), lte: new Date(now + 6 * 3600 * 1000) } },
          ],
        },
      ],
    },
    select: {
      id: true,
      league: true,
      externalId: true,
      status: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      updatedAt: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const baseballIds = matches
    .filter((m) => BASEBALL_LEAGUES.has(m.league))
    .map((m) => m.id);
  const caches = baseballIds.length
    ? await prisma.theSportsMatchCache.findMany({
        where: { matchId: { in: baseballIds } },
        select: { matchId: true, detailLive: true, updatedAt: true },
      })
    : [];
  const cacheByMatchId = new Map(caches.map((c) => [c.matchId, c]));

  const issues: Issue[] = [];

  for (const m of matches) {
    const matchInfo = {
      matchId: m.id,
      externalId: m.externalId,
      league: m.league,
      home: m.homeTeam.name,
      away: m.awayTeam.name,
    };

    // 4. stale_live — 모든 sport
    if (m.status === "LIVE") {
      const ageMs = now - m.updatedAt.getTime();
      if (ageMs > STALE_LIVE_MS) {
        issues.push({
          ...matchInfo,
          kind: "stale_live",
          severity: "HIGH",
          detail: `LIVE 상태인데 ${Math.round(ageMs / 60000)}분 동안 update 없음`,
        });
      }
    }

    if (!BASEBALL_LEAGUES.has(m.league)) continue;

    // 1. score_drift — 야구 SCHEDULED 인데 점수 있음 + 시작 시각 지남
    if (
      m.status === "SCHEDULED" &&
      (m.homeScore != null || m.awayScore != null) &&
      m.startTime.getTime() < now
    ) {
      issues.push({
        ...matchInfo,
        kind: "score_drift",
        severity: "HIGH",
        detail: `status=SCHEDULED 인데 점수=${m.homeScore ?? "-"}:${m.awayScore ?? "-"} (status updater 죽음 의심)`,
      });
    }

    if (m.status !== "LIVE") continue;

    const cache = cacheByMatchId.get(m.id);
    const dl = cache?.detailLive as
      | {
          score?: [string, number, number, { ft?: [string, string] }];
        }
      | null;
    const scoreArr = dl?.score;

    // 2. inning_missing — LIVE 인데 cache.score 없거나 half=0
    if (!Array.isArray(scoreArr) || scoreArr.length < 4) {
      issues.push({
        ...matchInfo,
        kind: "inning_missing",
        severity: "WARN",
        detail: `LIVE 인데 TheSports cache score 없음 (frontend 가 "1회초" fallback 표시 위험)`,
      });
      continue;
    }
    const half = scoreArr[2];
    if (half === 0 || half == null) {
      issues.push({
        ...matchInfo,
        kind: "inning_missing",
        severity: "WARN",
        detail: `LIVE 인데 cache half=${half} (이닝 표시 불가)`,
      });
    }

    // 3. cache_db_mismatch — cache.ft = [home, away] (2026-05-24 commit 8ab6194 확정)
    const ft = scoreArr[3]?.ft;
    if (Array.isArray(ft) && ft.length === 2 && m.homeScore != null && m.awayScore != null) {
      const cacheHome = parseInt(ft[0], 10);
      const cacheAway = parseInt(ft[1], 10);
      if (
        Number.isFinite(cacheHome) &&
        Number.isFinite(cacheAway) &&
        (cacheHome !== m.homeScore || cacheAway !== m.awayScore)
      ) {
        issues.push({
          ...matchInfo,
          kind: "cache_db_mismatch",
          severity: "HIGH",
          detail: `cache ft=[${cacheHome},${cacheAway}] (home,away) vs DB home=${m.homeScore} away=${m.awayScore} 불일치`,
        });
      }
    }
  }

  // ───── 5/6. standings 검사 — 메이저 리그 source stale + 두 source 1위 팀 mismatch ─────
  const tsStandings = await prisma.theSportsStandingsCache.findMany({
    where: { league: { in: STANDINGS_CHECK_LEAGUES } },
    select: { league: true, payload: true, updatedAt: true },
  });
  const afStandings = await prisma.apiFootballStandingsCache.findMany({
    where: { league: { in: STANDINGS_CHECK_LEAGUES } },
    select: { league: true, rows: true, updatedAt: true },
  });
  const tsByLeague = new Map(tsStandings.map((s) => [s.league, s]));
  const afByLeague = new Map(afStandings.map((s) => [s.league, s]));

  const placeholderInfo = (league: string) => ({
    matchId: 0,
    externalId: "",
    league,
    home: "",
    away: "",
  });

  for (const league of STANDINGS_CHECK_LEAGUES) {
    const ts = tsByLeague.get(league);
    const af = afByLeague.get(league);

    // 5a. TheSports stale (1.5h+)
    if (ts) {
      const ageMs = now - ts.updatedAt.getTime();
      if (ageMs > STANDINGS_TS_STALE_MS) {
        issues.push({
          ...placeholderInfo(league),
          kind: "standings_stale",
          severity: ageMs > 6 * 3600 * 1000 ? "HIGH" : "WARN",
          detail: `TheSports standings cache ${Math.round(ageMs / 60000)}분 stale (poller 1h 주기인데 죽음 의심)`,
        });
      }
    }

    // 5b. api-football stale (26h+)
    if (af) {
      const ageMs = now - af.updatedAt.getTime();
      if (ageMs > STANDINGS_AF_STALE_MS) {
        issues.push({
          ...placeholderInfo(league),
          kind: "standings_stale",
          severity: ageMs > 48 * 3600 * 1000 ? "HIGH" : "WARN",
          detail: `api-football standings ${Math.round(ageMs / 3600000)}h stale (cron 1d/회인데 fail 의심)`,
        });
      }
    }

    // 6. 두 source 의 1위 팀 비교 — 한쪽 stale 면 다름
    if (ts && af) {
      const tsPayload = ts.payload as unknown as {
        tables?: Array<{ rows?: Array<{ position?: number; team_id?: string }> }>;
      };
      const afRows = af.rows as unknown as Array<{
        position: number;
        teamExternalId: string;
      }>;
      const tsTop = tsPayload?.tables?.[0]?.rows?.find((r) => r.position === 1);
      const afTop = afRows?.find?.((r) => r.position === 1);
      if (tsTop?.team_id && afTop?.teamExternalId) {
        // tsId 와 afId 는 다른 system 이라 직접 비교 불가 →
        // 양쪽 모두 우리 Team.id 로 매핑 후 비교.
        const tsMapping = await import("@/lib/sports/thesports/team-id-mapping.json")
          .then((m) => m.default as Array<{ ourId: number; tsId: string }>);
        const tsOurId = tsMapping.find((t) => t.tsId === tsTop.team_id)?.ourId;
        const afTeam = await prisma.team.findFirst({
          where: { league, externalId: afTop.teamExternalId },
          select: { id: true, name: true },
        });
        if (tsOurId != null && afTeam && tsOurId !== afTeam.id) {
          issues.push({
            ...placeholderInfo(league),
            kind: "standings_mismatch",
            severity: "HIGH",
            detail: `TheSports 1위(team.id ${tsOurId}) ≠ api-football 1위(${afTeam.name}, id ${afTeam.id}) — 한쪽 stale 확정`,
          });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    totals: {
      matchesChecked: matches.length,
      baseballMatches: baseballIds.length,
      standingsChecked: STANDINGS_CHECK_LEAGUES.length,
      issues: issues.length,
    },
    issues,
  });
}
