// GET /api/cron/refresh-live-baseball
// 모든 KBO/NPB/MLB LIVE 매치의 라이브 API endpoint 호출 → 자동 DB upsert.
// /api/live/baseball/[gameId] 가 응답 시 prisma.match.updateMany 로 점수 동기화.
// 매 5분 vercel cron — list 페이지의 SSR 도 stale 안 됨. NHL ESPN id 매치 동기화도 여기서(nhl-espn-live-sync).

import { selfUserAgent } from "@/lib/self-fetch";
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { runFetchMlbStartersLive } from "@/jobs/fetch-mlb-starters";
import { syncNhlEspnLive } from "@/lib/sports/nhl-espn-live-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
          // Bearer 는 화면 전용 API 보호(api-same-origin)의 내부 워커 통과용 — 2026-09-17 보호를 넣은 뒤
          // 이 호출이 전부 403 으로 막혔는데 응답은 ok:true 라 11일간 아무도 몰랐다 (2026-09-28 실측 3건 중 0건 갱신).
          // user-agent 는 Vercel 방화벽 봇 검문 통과용 — src/lib/self-fetch.ts
          headers: {
            "user-agent": selfUserAgent("refresh-live-baseball"),
            ...(process.env.INTERNAL_API_TOKEN ? { authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}` } : {}),
          },
        });
        if (res.ok || res.status === 304) ok++;
        else {
          fail++;
          console.warn(`[refresh-live-baseball] ${m.league} ${m.externalId} → ${res.status}`);
        }
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

  // NHL ESPN id 매치(프리시즌 등 ts 캐시 없는 행) 라이브 동기화 — 같은 5분 주기에 얹는다(2026-09-21 LIVE 고착 사고).
  let nhl: Awaited<ReturnType<typeof syncNhlEspnLive>> | null = null;
  try {
    nhl = await syncNhlEspnLive();
  } catch (e) {
    console.warn("[refresh-live-baseball] NHL ESPN 동기화 실패:", (e as Error).message);
  }
  return NextResponse.json({
    // 라이브 경기가 있는데 하나도 못 갱신했으면 실패다 — 늘 ok:true 면 막혀도 드러나지 않는다
    ok: matches.length === 0 || ok > 0,
    total: matches.length,
    refreshed: ok,
    failed: fail,
    nhl,
    leagues: matches.reduce<Record<string, number>>((acc, m) => {
      acc[m.league] = (acc[m.league] ?? 0) + 1;
      return acc;
    }, {}),
    mlbStarters,
  });
}
