// 웹 푸시 구독 등록·동기화·해제 — 비회원 포함(브라우저 단위, 인증 없음).
// POST: 구독 upsert + 별표 경기 알림 대상 전체 교체 (fav-server-sync 와 같은 PUT 패턴).
//       matchIds 는 클라이언트 신뢰 없이 서버에서 SCHEDULED·미래 7일 내로 필터.
// DELETE: 구독 삭제 (알림 row 는 onDelete: Cascade).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_MATCHES = 100; // 구독당 알림 대기 상한 — 남용 방지
const WINDOW_DAYS = 7;

interface Body {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  matchIds?: unknown[];
  kinds?: unknown[];
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = body.keys?.p256dh ?? "";
  const auth = body.keys?.auth ?? "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: "invalid subscription" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.matchIds) ? body.matchIds : [];
  const ids = [...new Set(rawIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_MATCHES * 3);
  // 알림 종류 — 화이트리스트 밖은 버림, 비어 있으면 KICKOFF 만 (구버전 클라이언트 호환)
  const KINDS = ["KICKOFF", "LINEUP", "FINAL"];
  const kindsRaw = Array.isArray(body.kinds) ? body.kinds.filter((k): k is string => typeof k === "string" && KINDS.includes(k)) : [];
  const kinds = kindsRaw.length > 0 ? [...new Set(kindsRaw)] : ["KICKOFF"];

  // 서버 필터 — 예정 + 미래 7일 내 경기만 알림 대상
  const now = new Date();
  const valid = ids.length
    ? await prisma.match.findMany({
        where: {
          id: { in: ids },
          status: "SCHEDULED",
          startTime: { gte: now, lte: new Date(now.getTime() + WINDOW_DAYS * 86400_000) },
        },
        select: { id: true },
        take: MAX_MATCHES,
      })
    : [];

  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh, auth },
    update: { p256dh, auth, lastSeenAt: now, failCount: 0 },
    select: { id: true },
  });

  // 전체 교체 — 미발송 row 만 지우고(발송 이력 보존) 현재 별표 집합으로 재구성
  await prisma.$transaction([
    prisma.pushMatchAlert.deleteMany({ where: { subscriptionId: sub.id, sentAt: null } }),
    ...(valid.length
      ? [
          prisma.pushMatchAlert.createMany({
            data: valid.flatMap((m) => kinds.map((kind) => ({ subscriptionId: sub.id, matchId: m.id, kind }))),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, registered: valid.length });
}

export async function DELETE(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
