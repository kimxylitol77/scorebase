import { NextResponse } from "next/server";
import { runCollectMma } from "@/jobs/collect-mma";
import { runEnrichMma } from "@/jobs/enrich-mma-fighters";
import { runEnrichMmaEspn } from "@/jobs/enrich-mma-espn";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    await runCollectMma();
    // 파이터 프로필(체급·신체·별명·소속짐) 점진 백필 — api-sports rate limit 시 다음 실행에 이어서.
    const enrich = await runEnrichMma();
    // ESPN scoreboard 1콜로 임박 이벤트 파이트카드 전적/국기/헤드샷 보강
    const espn = await runEnrichMmaEspn();
    return NextResponse.json({ ok: true, enriched: enrich.enriched, rateLimited: enrich.rateLimited, espnMatched: espn.matched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
