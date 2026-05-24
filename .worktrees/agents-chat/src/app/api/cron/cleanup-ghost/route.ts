// /api/cron/cleanup-ghost — 자정 KST 04:30 매일.
// ESPN summary 404 응답을 받는 SCHEDULED/LIVE 매치를 POSTPONED 마킹.
// 대상: ESPN 기반 종목 (NBA, NHL, MLB, MLS + 축구 ESPN 리그).
// 범위: 어제 ~ 향후 7일. FINISHED 매치는 건드리지 않음.
//
// EPL 은 externalId 가 football-data id 라 ESPN 검증 불가 — 제외 (별도 잡 가능).
// KBO/NPB 는 api-sports Baseball — 별도 잡.
// LOL 은 BALLDONTLIE — 별도 잡.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// League → ESPN sport-path
const ESPN_PATH: Record<string, string> = {
  NBA: "basketball/nba",
  NHL: "hockey/nhl",
  MLB: "baseball/mlb",
  MLS: "soccer/usa.1",
  LALIGA: "soccer/esp.1",
  BUNDESLIGA: "soccer/ger.1",
  SERIE_A: "soccer/ita.1",
  LIGUE_1: "soccer/fra.1",
  UCL: "soccer/uefa.champions",
  WORLD_CUP: "soccer/fifa.world",
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const TIMEOUT = 8000;

interface MatchSlim {
  id: number;
  league: string;
  externalId: string;
  status: string;
  startTime: Date;
  homeTeamName: string;
  awayTeamName: string;
}

async function isGhost(league: string, externalId: string): Promise<boolean> {
  const path = ESPN_PATH[league];
  if (!path) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(
      `${ESPN_BASE}/${path}/summary?event=${externalId}`,
      { signal: ctrl.signal, cache: "no-store" },
    );
    // 404 = ghost 확실. 다른 4xx/5xx 는 일시 장애 가능성 → skip
    if (res.status === 404) return true;
    if (!res.ok) return false;
    // 200 인데 응답에 competition 정보가 없으면 ghost 로 간주
    const data = (await res.json()) as { header?: { competitions?: unknown[] } };
    const comps = data?.header?.competitions;
    if (!comps || !Array.isArray(comps) || comps.length === 0) return true;
    return false;
  } catch {
    return false; // network error 는 ghost 가 아닐 수 있음
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  // Vercel cron 보안 — Authorization 헤더 검증
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const rangeStart = new Date(now.getTime() - 24 * 3600 * 1000);
  const rangeEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: Object.keys(ESPN_PATH) },
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: rangeStart, lt: rangeEnd },
    },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });

  const slim: MatchSlim[] = matches.map((m) => ({
    id: m.id,
    league: m.league,
    externalId: m.externalId,
    status: m.status,
    startTime: m.startTime,
    homeTeamName: m.homeTeam.name,
    awayTeamName: m.awayTeam.name,
  }));

  const cleaned: typeof slim = [];
  const errors: { id: number; error: string }[] = [];

  // 동시 fetch 5개로 제한 (ESPN rate limit 회피)
  const CONCURRENCY = 5;
  for (let i = 0; i < slim.length; i += CONCURRENCY) {
    const batch = slim.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (m) => {
        try {
          const ghost = await isGhost(m.league, m.externalId);
          if (ghost) {
            await prisma.match.update({
              where: { id: m.id },
              data: { status: "POSTPONED" },
            });
            cleaned.push(m);
            console.log(
              `[cleanup-ghost] POSTPONED id=${m.id} ${m.league} ` +
                `${m.awayTeamName}@${m.homeTeamName} externalId=${m.externalId}`,
            );
          }
        } catch (e) {
          errors.push({ id: m.id, error: (e as Error).message });
        }
      }),
    );
  }

  return NextResponse.json({
    checked: slim.length,
    cleaned: cleaned.length,
    cleanedMatches: cleaned.map((m) => ({
      id: m.id,
      league: m.league,
      externalId: m.externalId,
      teams: `${m.awayTeamName} @ ${m.homeTeamName}`,
      startTime: m.startTime.toISOString(),
    })),
    errors,
    range: {
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    },
  });
}
