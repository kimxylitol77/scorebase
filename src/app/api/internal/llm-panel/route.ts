// 로컬 Qwen 패널용 내부 API — 맥미니 워커 전용(Vercel 은 Ollama 못 닿음).
//  - GET  : qwen 미픽 예정 경기의 프롬프트+라인 반환(앵커 자체 저장). ?cap=N.
//  - POST : 워커가 Ollama 로 받은 raw JSON 을 파싱·저장. body {items:[{matchId,text}]}.
// 인증: Bearer INTERNAL_API_TOKEN / CRON_SECRET (다른 맥미니 봇과 동일).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { getQwenTasks, saveQwenPicks } from "@/lib/predict/qwen-panel";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const cap = Math.min(Number(new URL(req.url).searchParams.get("cap") ?? 40) || 40, 80);
  try {
    const tasks = await getQwenTasks(cap);
    return NextResponse.json({ ok: true, tasks });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  let body: { items?: { matchId: number; text: string }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ ok: false, error: "items required" }, { status: 400 });
  }
  try {
    const r = await saveQwenPicks(items);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
