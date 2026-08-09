// 외국 LoL 팀(LPL/LEC/LCS/LCK_CL) 로고 자동 충전 — 주간 cron.
// 로고 없는 팀만 처리(보통 0건)라 가벼움. 신규 시즌 팀 등장 시 자동 채움.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { fillForeignLolLogos } from "@/lib/sports/lol-esports-logos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await fillForeignLolLogos();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
