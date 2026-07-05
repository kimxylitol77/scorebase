// POST /api/upload — 게시판 이미지·짧은 동영상 업로드 (로그인 회원 전용).
// 이미지는 클라이언트에서 압축된 것을 받고, 동영상은 Vercel 요청 본문 한계(4.5MB) 안에서만.
// 저장은 Attachment(bytea) — 서빙은 /api/file/[id].

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// mime 허용목록 — SVG 는 XSS 벡터라 제외. 확장 시 여기만.
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/webm", "video/quicktime"]);

const IMAGE_MAX = 3 * 1024 * 1024; // 클라 압축 후 기준 여유치
const VIDEO_MAX = 4 * 1024 * 1024; // Vercel 요청 본문 4.5MB 한계 아래

export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const rl = rateLimit(`upload:${userId}`, { max: 30, windowMs: 3600_000, lockMs: 600_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "업로드가 너무 잦습니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (f instanceof File) file = f;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });

  const mime = file.type;
  const isImage = IMAGE_MIMES.has(mime);
  const isVideo = VIDEO_MIMES.has(mime);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "지원하지 않는 형식입니다. (jpg·png·webp·gif·mp4·webm)" }, { status: 415 });
  }
  const cap = isVideo ? VIDEO_MAX : IMAGE_MAX;
  if (file.size > cap) {
    return NextResponse.json(
      { error: `${isVideo ? "동영상은 4MB" : "이미지는 3MB"} 이하만 올릴 수 있습니다.` },
      { status: 413 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const row = await prisma.attachment.create({
    data: { ownerId: userId, mime, size: bytes.length, data: bytes },
    select: { id: true },
  });

  // ?v=1 — Markdown 렌더러가 <video> 로 그리는 마커
  const url = `/api/file/${row.id}${isVideo ? "?v=1" : ""}`;
  return NextResponse.json({ ok: true, url, kind: isVideo ? "video" : "image" });
}
