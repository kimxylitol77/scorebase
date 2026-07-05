"use client";
// 게시판 미디어 첨부 버튼 — 이미지(브라우저 압축)·짧은 동영상(4MB)을 /api/upload 로 올리고
// 본문 textarea 에 마크다운(![...](/api/file/...))을 삽입한다. 아바타 업로드의 디코드 패턴 재사용.

import { useState } from "react";
import { ImagePlus } from "lucide-react";

const MAX_SRC_BYTES = 20 * 1024 * 1024; // 압축 전 원본 상한
const VIDEO_MAX = 4 * 1024 * 1024; // 서버 상한과 동일 (Vercel 요청 본문 한계)
const GIF_MAX = 3 * 1024 * 1024; // gif 는 압축 불가(애니메이션) — 원본 그대로 상한
const MAX_EDGE = 1600; // 이미지 최대 변
const MAX_PER_POST = 4;

// 파일 → 디코드 (createImageBitmap 우선 — iOS·대형 사진 안정)
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // <img> 폴백
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 불러오지 못했어요"));
    };
    img.src = url;
  });
}

// 이미지 → 최대 1600px jpeg Blob (iOS webp 미지원 → jpeg 고정)
async function compressImage(file: File): Promise<Blob> {
  const src = await decode(file);
  const w = (src as ImageBitmap).width || (src as HTMLImageElement).naturalWidth;
  const h = (src as ImageBitmap).height || (src as HTMLImageElement).naturalHeight;
  if (!w || !h) throw new Error("이미지 크기를 읽지 못했어요");
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("브라우저가 이미지 처리를 지원하지 않아요");
  // jpeg 는 투명도 없음 — png 투명 배경이 검게 뭉개지지 않게 흰색 바닥 먼저
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src && typeof src.close === "function") src.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("이미지 변환에 실패했어요");
  return blob;
}

/** 본문 textarea(id=targetId) 커서 위치에 텍스트 삽입 — 폼은 비제어라 값 직접 조작 OK. */
function insertIntoTextarea(targetId: string, text: string) {
  const ta = document.getElementById(targetId) as HTMLTextAreaElement | null;
  if (!ta) return;
  const pos = ta.selectionEnd ?? ta.value.length;
  const before = ta.value.slice(0, pos);
  const after = ta.value.slice(pos);
  const sep = before && !before.endsWith("\n") ? "\n" : "";
  ta.value = `${before}${sep}${text}\n${after}`;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  ta.focus();
}

export default function MediaUpload({ targetId }: { targetId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  async function handleFile(f: File) {
    setError(null);
    if (count >= MAX_PER_POST) {
      setError(`첨부는 글당 ${MAX_PER_POST}개까지입니다.`);
      return;
    }
    if (f.size > MAX_SRC_BYTES) {
      setError("20MB 이하 파일만 올릴 수 있어요.");
      return;
    }
    const isVideo = f.type.startsWith("video/");
    const isGif = f.type === "image/gif";
    if (isVideo && f.size > VIDEO_MAX) {
      setError("동영상은 4MB 이하만 올릴 수 있어요. (약 10~20초 분량)");
      return;
    }
    if (isGif && f.size > GIF_MAX) {
      setError("GIF 는 3MB 이하만 올릴 수 있어요.");
      return;
    }

    setPending(true);
    try {
      // jpeg/png/webp/HEIC 등 정적 이미지는 압축, gif·동영상은 원본 그대로
      const payload: Blob = !isVideo && !isGif ? await compressImage(f) : f;
      const name = isVideo ? "video" : isGif ? "img.gif" : "img.jpg";
      const fd = new FormData();
      fd.set("file", new File([payload], name, { type: isVideo || isGif ? f.type : "image/jpeg" }));
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; url?: string; kind?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "업로드에 실패했어요");
      insertIntoTextarea(targetId, `![${json.kind === "video" ? "동영상" : "이미지"}](${json.url})`);
      setCount((c) => c + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드에 실패했어요");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <label
        className={`inline-flex items-center gap-1.5 rounded-xl border border-dashed border-neutral-300 px-3 py-2 text-xs font-medium transition dark:border-neutral-700 ${
          pending
            ? "cursor-wait opacity-60"
            : "cursor-pointer text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800/40"
        }`}
      >
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        {pending ? "업로드 중…" : "사진·동영상 첨부"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/webm,video/quicktime"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // 같은 파일 재선택 허용
            if (f) void handleFile(f);
          }}
        />
      </label>
      {error && <p className="mt-1.5 text-[11px] text-rose-500">{error}</p>}
      <p className="mt-1 text-[10px] text-neutral-400">
        이미지는 자동 압축 · 동영상은 mp4/webm 4MB(약 10~20초) 이하 · 글당 {MAX_PER_POST}개 — 본문에 마크다운으로 삽입됩니다
      </p>
    </div>
  );
}
