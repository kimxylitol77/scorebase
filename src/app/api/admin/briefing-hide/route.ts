// 해외 브리핑 오보 원클릭 숨김 — 텔레그램 발행 알림의 링크로 호출 (GET + ADMIN_SECRET).
// Post 삭제(댓글 cascade) + NewsBriefing HIDDEN 마킹 (같은 URL 재발행 방지).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const s = url.searchParams.get("s");
  const secret = process.env.ADMIN_SECRET;
  if (!secret || s !== secret) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!id) {
    return new NextResponse("id 필요", { status: 400 });
  }
  const briefing = await prisma.newsBriefing.findUnique({
    where: { id },
    select: { id: true, postId: true, status: true, titleKo: true },
  });
  if (!briefing) {
    return new NextResponse("해당 브리핑 없음", { status: 404 });
  }
  if (briefing.postId) {
    await prisma.post.delete({ where: { id: briefing.postId } }).catch(() => {});
  }
  await prisma.newsBriefing.update({
    where: { id },
    data: { status: "HIDDEN", postId: null },
  });
  return new NextResponse(`숨김 완료: ${briefing.titleKo ?? briefing.id}`, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
