// 클럽 친선 매치 ↔ api-football fixture 연결 cron — Match.apiFixtureId + af 팀 매핑 적재.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runLinkClubFriendlyAf } from "@/jobs/link-club-friendly-af";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const tally = await runLinkClubFriendlyAf();
    await recordCronRun("link-friendly-af");
    return NextResponse.json({ ok: true, ...tally });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
