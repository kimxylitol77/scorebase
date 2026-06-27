// AI 이적 브리핑 생성 cron — 주목 확정 이적에 haiku 한 줄 분석 채움.
import { NextResponse } from "next/server";
import { recordCronRun } from "@/lib/cron-registry";
import { runGenerateTransferBriefs } from "@/jobs/generate-transfer-briefs";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const result = await runGenerateTransferBriefs();
    await recordCronRun("transfer-briefs", { count: result.generated });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("transfer-briefs", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
