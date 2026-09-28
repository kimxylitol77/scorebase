import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchBaseballStarters } from "@/jobs/fetch-baseball-starters";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const r = await withLlmTag("baseball-starters", () => runFetchBaseballStarters());
    await recordCronRun("baseball-starters", { count: r.updated });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("baseball-starters", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
