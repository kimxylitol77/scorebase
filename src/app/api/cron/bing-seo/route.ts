// 주간 빙 SEO 점검 cron — 매주 월 08:00 KST (일 23:00 UTC). 기회 검색어·순위 변화 텔레그램.
// ?dry=1 → 텔레그램 발송·스냅샷 저장 없이 결과만 (배포 후 수동 점검용).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runBingSeoCheck } from "@/jobs/bing-seo-check";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const r = await runBingSeoCheck({ dryRun });
    if (!dryRun) await recordCronRun("bing-seo", { ok: r.ok, count: r.opportunities });
    return NextResponse.json({ dryRun, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
