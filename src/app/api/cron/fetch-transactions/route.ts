// GET /api/cron/fetch-transactions — ESPN 트랜잭션(NBA) 수집 → SportsTransaction upsert.
// 일 1회 cron (FA 개장 7/1·드래프트 6월 말 시즌엔 빈도 상향 검토).
// 수동: ?leagues=NBA,MLB 로 종목 지정.

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchTransactions } from "@/jobs/fetch-transactions";
import { withLlmTag } from "@/lib/ai/usage-track";
import type { TxLeague } from "@/lib/sports/espn-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60 → 300 (2026-09-28). NHL 프리시즌 로스터 이동이 몰려 번역 대상이 하루 49건 → NHL 만 56초가 걸렸고,
// 세 종목 합이 60초를 넘겨 함수가 강제 종료됐다. 종료되면 catch 도 못 타 기록이 안 남고, 번역분도 저장 전에
// 날아가 다음 날 같은 번역을 또 한다(60시간 동안 반복). 제한은 넉넉히 두고 평소엔 20~30초에 끝난다.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const param = new URL(req.url).searchParams.get("leagues");
  // 기본 NBA + MLB + NHL — 셋 다 /news 의 해당 종목 탭을 채우는 재료다(브리핑 소스가 제목만 준다).
  const leagues = (param ? param.split(",").filter(Boolean) : ["NBA", "MLB", "NHL"]) as TxLeague[];

  try {
    const summary = await withLlmTag("fetch-transactions", () => runFetchTransactions(leagues));
    await recordCronRun("fetch-transactions", { count: summary.reduce((a, s) => a + s.upserted, 0) });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    // 실패도 실행 기록으로 남긴다 — 안 남기면 cron-freshness 가 "30h째 미실행"으로
    // 오보한다(2026-08-07 실측: ESPN 일시 오류 → 500 → 기록 없음 → 미실행 알림).
    await recordCronRun("fetch-transactions", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
