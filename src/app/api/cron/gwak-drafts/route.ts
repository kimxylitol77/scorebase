import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runGwakDrafts } from "@/lib/analysis/gwak-pickster";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 2, 1), 3);
    const result = await runGwakDrafts(limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
