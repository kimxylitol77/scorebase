// GET /api/internal/data-sanity
// 라이브 데이터 의미적 일관성 검사. mac-mini data-sanity.js 가 3분마다 호출.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// 검출 항목 (2026-05-24 retrospective 기반):
//   1. score_drift           — SCHEDULED 야구 매치에 점수 있음 (status updater 죽음)
//   2. inning_missing        — LIVE 야구 매치인데 cache.detailLive.score 없거나 half=0
//   3. cache_db_mismatch     — cache.ft ([away, home]) vs DB.homeScore/awayScore 불일치
//   4. stale_live            — LIVE 야구/축구 매치 updatedAt 15분+ 정체
//
// 응답: { ok, checkedAt, totals, issues: [{ kind, severity, matchId, ... }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASEBALL_LEAGUES = new Set(["KBO", "NPB", "MLB"]);
const STALE_LIVE_MS = 15 * 60 * 1000;

type IssueKind =
  | "score_drift"
  | "inning_missing"
  | "cache_db_mismatch"
  | "stale_live";

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

    // 3. cache_db_mismatch — cache.ft (away, home) vs DB
    const ft = scoreArr[3]?.ft;
    if (Array.isArray(ft) && ft.length === 2 && m.homeScore != null && m.awayScore != null) {
      const cacheAway = parseInt(ft[0], 10);
      const cacheHome = parseInt(ft[1], 10);
      if (
        Number.isFinite(cacheAway) &&
        Number.isFinite(cacheHome) &&
        (cacheHome !== m.homeScore || cacheAway !== m.awayScore)
      ) {
        issues.push({
          ...matchInfo,
          kind: "cache_db_mismatch",
          severity: "HIGH",
          detail: `cache ft=[${cacheAway},${cacheHome}] (away,home) vs DB home=${m.homeScore} away=${m.awayScore} 불일치`,
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    totals: {
      matchesChecked: matches.length,
      baseballMatches: baseballIds.length,
      issues: issues.length,
    },
    issues,
  });
}
