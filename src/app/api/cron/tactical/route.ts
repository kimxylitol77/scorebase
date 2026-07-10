// 경기 후 전술 분석 아티클 생성 cron. 기본 OFF — env TACTICAL_ENABLED=1 일 때만 실제 생성.
// (프로덕션 DRAFT INSERT 를 명시적으로 켜기 전까지 무해하게 배선만 해둔다.)
// ?force=1 로 게이트 override, ?dry=1 로 DB 쓰기 없이 스모크 테스트.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runTactical } from "@/jobs/generate-tactical";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 다중 아티클 Claude 생성 여유 (recap/preview 와 동일)

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";

  // opt-in 게이트 — 기본 OFF. 새 시즌 가동 시 env TACTICAL_ENABLED=1 로 켠다.
  // dry-run 은 DB 쓰기가 없으므로 게이트와 무관하게 허용.
  if (!dryRun && process.env.TACTICAL_ENABLED !== "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "TACTICAL_DISABLED" });
  }

  try {
    await runTactical({ dryRun });
    return NextResponse.json({ ok: true, dryRun });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  } finally {
    await prisma.$disconnect();
  }
}
