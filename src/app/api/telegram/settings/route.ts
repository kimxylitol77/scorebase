// 텔레그램 알림 설정 — 종류별 수신 ON/OFF (마이페이지 토글).
// GET → 현재 설정 / PUT → 변경. 로그인 회원 전용.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/** 회원이 켜고 끌 수 있는 알림 필드. 여기 없는 필드는 PUT 으로 바꿀 수 없다. */
const ALERT_FIELDS = [
  "alertKickoff",
  "alertLineup",
  "alertGoal",
  "alertFinal",
  "alertFollowPick",
  "alertOddsDrop",
  "alertOddsRise",
  "alertOddsAll",
] as const;

type AlertField = (typeof ALERT_FIELDS)[number];

const SELECT = Object.fromEntries(ALERT_FIELDS.map((f) => [f, true])) as Record<AlertField, true>;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: SELECT,
  });
  if (!u) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(u);
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  // 보낸 필드만 반영 — 한쪽 토글이 다른 쪽을 덮어쓰지 않게.
  const data: Partial<Record<AlertField, boolean>> = {};
  for (const f of ALERT_FIELDS) {
    const v = body[f];
    if (typeof v === "boolean") data[f] = v;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no field" }, { status: 400 });
  }

  const u = await prisma.user.update({
    where: { id: userId },
    data,
    select: SELECT,
  });
  return NextResponse.json({ ok: true, ...u });
}
