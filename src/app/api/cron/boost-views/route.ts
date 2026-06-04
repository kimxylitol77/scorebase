import { NextResponse } from "next/server";
import { runBoostViews } from "@/jobs/boost-views";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

// 분석 게시판 조회수 — 매시 호출되어 글마다 소량씩 자연 증가(점프 없음).
export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const r = await runBoostViews();
  return NextResponse.json({ ok: true, ...r });
}
