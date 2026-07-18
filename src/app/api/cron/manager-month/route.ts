// EPL "이달의 감독" 월간 아티클 cron. 기본 OFF — env MANAGER_MONTH_ENABLED=1 일 때만 생성.
// 시즌 개막(2026-08) 후 가동. ?force=1 게이트 override, ?dry=1 DB 쓰기 없는 스모크, ?month=YYYY-MM 지정.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runManagerMonth } from "@/jobs/generate-manager-month";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // af 라인업 수집(2초 페이싱) + Claude 생성 여유

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const month = url.searchParams.get("month") ?? undefined;

  if (!dryRun && process.env.MANAGER_MONTH_ENABLED !== "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "MANAGER_MONTH_DISABLED" });
  }

  try {
    await runManagerMonth({ dryRun, month });
    return NextResponse.json({ ok: true, dryRun });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
