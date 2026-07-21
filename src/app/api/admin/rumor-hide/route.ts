// 이적 루머 오보 원클릭 숨김 — GET + 항목별 HMAC 토큰 (briefing-hide 와 동일 패턴).
// hidden=true 마킹만 (행 유지 — 같은 딜 재수집 시 낮은 stage 강등 가드가 계속 작동).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyHideToken } from "@/lib/admin-hide-token";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("t");
  if (!id) {
    return new NextResponse("id 필요", { status: 400 });
  }
  const rumor = await prisma.transferRumor.findUnique({
    where: { id },
    select: { id: true, playerKo: true },
  });
  if (!rumor) {
    return new NextResponse("해당 루머 없음", { status: 404 });
  }
  if (!verifyHideToken("rumor", rumor.id, token)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await prisma.transferRumor.update({ where: { id }, data: { hidden: true } });
  return new NextResponse(`숨김 완료: ${rumor.playerKo}`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
