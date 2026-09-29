import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchNhlGoalies } from "@/jobs/fetch-nhl-goalies";
import { runFetchKhlGoalies } from "@/jobs/fetch-khl-goalies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const tally = await runFetchNhlGoalies();
    // KHL 예상 골리 — 같은 시간대(경기 전날·당일 낮)에 돌면 되어 크론을 따로 두지 않는다.
    const khl = await runFetchKhlGoalies().catch((e) => ({ error: (e as Error).message }));
    await recordCronRun("nhl-goalies");
    return NextResponse.json({ ok: true, ...tally, khl });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
