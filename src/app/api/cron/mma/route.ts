import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runCollectMma } from "@/jobs/collect-mma";
import { runEnrichMma } from "@/jobs/enrich-mma-fighters";
import { runEnrichMmaEspn } from "@/jobs/enrich-mma-espn";
import { runEnrichMmaAthlete } from "@/jobs/enrich-mma-athlete";
import { runSnapshotUfcRankings } from "@/jobs/snapshot-ufc-rankings";
import { runBackfillMmaRankedFighters } from "@/jobs/backfill-mma-ranked-fighters";
import { prisma } from "@/lib/db";

// 랭킹은 주 1회 갱신 → 마지막 스냅샷이 3일 이상 지났을 때만 재수집(실패 시 다음 날 재시도).
async function shouldSnapshotRankings(): Promise<boolean> {
  const last = await prisma.mmaRanking.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
  if (!last) return true;
  return Date.now() - last.updatedAt.getTime() > 3 * 24 * 60 * 60 * 1000;
}

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
    // UFC 체급별·P4P 랭킹 주간 스냅샷 — espn 보강 직후(파이터 espnId·헤드샷 최신) 실행, 주 1회 게이트.
    // 랭킹 실패가 본 수집을 막지 않도록 격리.
    let rankings: { categories: number; fighters: number } | null = null;
    try {
      if (await shouldSnapshotRankings()) {
        // 랭킹에 올랐지만 프로필 없던 파이터를 ESPN 검색으로 채운 뒤(신규만) 스냅샷 → 순위표 링크 커버 확대.
        await runBackfillMmaRankedFighters();
        rankings = await runSnapshotUfcRankings();
      }
    } catch (e) {
      console.error("UFC 랭킹 스냅샷 실패:", (e as Error).message);
    }
    // ESPN athlete API 로 신체·나이·국적·전적통계(KO/SUB) 풀보강 (espnId 있는 파이터)
    const athlete = await runEnrichMmaAthlete();
    // 파이터 프로필(사진·별명·소속짐) api-sports 점진 백필 — 6s/명, rate limit·시간 초과 시 다음 실행에 이어서.
    const enrich = await runEnrichMma();
    return NextResponse.json({ ok: true, enriched: enrich.enriched, espnMatched: espn.matched, athleteEnriched: athlete.enriched, rankings });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
