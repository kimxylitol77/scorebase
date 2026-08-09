// 야구 시즌 잔여 일정 백필 cron — collect 의 +7일 창 밖 일정을 주 1회 메운다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import {
  runBaseballSeasonBackfill,
  todayKST,
  addDays,
} from "@/jobs/backfill-baseball-season";

export const dynamic = "force-dynamic";
// 정상 상태에서는 변경분만 upsert 해 수초에 끝난다. 시즌 일정이 처음 발표된 주에는
// 수백 건이 한꺼번에 들어올 수 있어 여유를 둔다 (매치당 5회 왕복).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // ?from=YYYY-MM-DD&to=YYYY-MM-DD — 수동 구간 지정 (기본 오늘 ~ +90일)
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? todayKST();
  const to = url.searchParams.get("to") ?? addDays(from, 90);
  try {
    const r = await runBaseballSeasonBackfill({ from, to });
    await recordCronRun("baseball-season-backfill", { count: r.upserted });
    return NextResponse.json({ ok: true, from, to, ...r });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("baseball-season-backfill", { ok: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
