import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runCollectMma } from "@/jobs/collect-mma";
import { runEnrichMma } from "@/jobs/enrich-mma-fighters";
import { runEnrichMmaEspn } from "@/jobs/enrich-mma-espn";
import { runEnrichMmaAthlete } from "@/jobs/enrich-mma-athlete";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    await runCollectMma();
    // ESPN 먼저(빠르고 무제한) — 느린 api-sports(아래)가 maxDuration 을 먼저 소진해도
    // 핵심 데이터(전적·헤드샷·신체·통계)는 항상 보장. (순서 역전이 신규 경기 미보강 원인이었음)
    // ESPN scoreboard 1콜로 임박 이벤트 파이트카드 전적/국기/헤드샷 보강
    const espn = await runEnrichMmaEspn();
    // ESPN athlete API 로 신체·나이·국적·전적통계(KO/SUB) 풀보강 (espnId 있는 파이터)
    const athlete = await runEnrichMmaAthlete();
    // 파이터 프로필(사진·별명·소속짐) api-sports 점진 백필 — 6s/명, rate limit·시간 초과 시 다음 실행에 이어서.
    const enrich = await runEnrichMma();
    return NextResponse.json({ ok: true, enriched: enrich.enriched, espnMatched: espn.matched, athleteEnriched: athlete.enriched });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
