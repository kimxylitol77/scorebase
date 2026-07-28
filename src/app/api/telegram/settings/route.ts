// 텔레그램 알림 설정 — 현재는 배당 변동 알림 방향(하락·상승) 옵트인만.
// GET → 현재 설정 / PUT → 변경. 로그인 회원 전용.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { alertOddsDrop: true, alertOddsRise: true },
  });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(u);
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { alertOddsDrop?: unknown; alertOddsRise?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  // 보낸 필드만 반영 — 한쪽 토글이 다른 쪽을 덮어쓰지 않게.
  const data: { alertOddsDrop?: boolean; alertOddsRise?: boolean } = {};
  if (typeof body.alertOddsDrop === "boolean") data.alertOddsDrop = body.alertOddsDrop;
  if (typeof body.alertOddsRise === "boolean") data.alertOddsRise = body.alertOddsRise;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no field" }, { status: 400 });
  }

  const u = await prisma.user.update({
    where: { id: userId },
    data,
    select: { alertOddsDrop: true, alertOddsRise: true },
  });
  return NextResponse.json({ ok: true, ...u });
}
