// GET /api/file/[id] — 게시판 업로드 파일(Attachment) 서빙. 내용 불변이라 immutable 캐시.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || id.length > 64) return new NextResponse("Not Found", { status: 404 });

  const row = await prisma.attachment.findUnique({
    where: { id },
    select: { mime: true, data: true },
  });
  if (!row) return new NextResponse("Not Found", { status: 404 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
