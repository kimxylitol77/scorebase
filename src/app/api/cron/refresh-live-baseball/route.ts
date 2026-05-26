// GET /api/cron/refresh-live-baseball
// 모든 KBO/NPB/MLB LIVE 매치의 라이브 API endpoint 호출 → 자동 DB upsert.
// /api/live/baseball/[gameId] 가 응답 시 prisma.match.updateMany 로 점수 동기화.
// 매 2분 vercel cron — list 페이지의 SSR 도 stale 안 됨.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runFetchMlbStartersLive } from "@/jobs/fetch-mlb-starters";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

const SITE = process.env.SITE_URL ?? "https://www.scorebase.kr";

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const matches = await prisma.match.findMany({
    where: { league: { in: ["KBO", "NPB", "MLB"] }, status: "LIVE" },
    select: { id: true, externalId: true, league: true },
  });

  let ok = 0;
  let fail = 0;
  await Promise.all(
    matches.map(async (m) => {
      try {
        const res = await fetch(`${SITE}/api/live/baseball/${m.externalId}`, {
          cache: "no-store",
        });
        if (res.ok || res.status === 304) ok++;
        else fail++;
      } catch {
        fail++;
      }
    }),
  );

  // MLB 라이브 매치의 선발 투수 보강 — schedule probable 이 늦은 팀의 actual 채움.
  // homeStarter/awayStarter 한쪽이라도 null 인 LIVE 매치만 처리하므로 보통 0~2회 호출.
  let mlbStarters: Awaited<ReturnType<typeof runFetchMlbStartersLive>> | null = null;
  if (matches.some((m) => m.league === "MLB")) {
    try {
      mlbStarters = await runFetchMlbStartersLive();
    } catch (e) {
      console.warn("[refresh-live-baseball] MLB starters live 실패:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    total: matches.length,
    refreshed: ok,
    failed: fail,
    leagues: matches.reduce<Record<string, number>>((acc, m) => {
      acc[m.league] = (acc[m.league] ?? 0) + 1;
      return acc;
    }, {}),
    mlbStarters,
  });
}
