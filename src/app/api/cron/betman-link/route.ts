// 베트맨 발매 경기 ↔ Match 연결 cron — 워커 적재(00·12 UTC) 1시간 뒤. 결과는 CronRun 에 기록(dead-man's switch).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runLinkBetmanMatches } from "@/jobs/link-betman-matches";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const r = await runLinkBetmanMatches();
    await recordCronRun("betman-link", { ok: true, count: r.linked });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("betman-link", { ok: false, error });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
