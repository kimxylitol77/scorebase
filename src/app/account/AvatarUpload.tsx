"use client";

// 아바타 사진 업로드 — 브라우저에서 160px 정사각으로 줄여 data URL 로 DB 저장.
// iOS 호환: createImageBitmap 우선 디코드(메모리 안정·HEIC), jpeg 인코딩(iOS webp 미지원),
// requestSubmit 대신 서버액션 직접 호출, 실패 단계별 구체 에러 노출.
import { useState, useTransition } from "react";
import { uploadAvatarAction } from "./actions";

const MAX_SRC_BYTES = 12 * 1024 * 1024; // 원본 12MB 초과는 처리 전 차단
const SIZE = 160; // 저장 해상도(정사각)

// 파일 → 디코드. createImageBitmap(큰 사진·iOS 메모리에 안정) 우선, 실패 시 <img> 폴백.
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // <img> 폴백으로 진행
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
      reject(new Error("사진을 불러오지 못했어요"));
    };
    img.src = url;
  });
}

// 디코드 → 160 정사각 center-crop → jpeg data URL.
async function resizeToDataUrl(file: File): Promise<string> {
  const src = await decode(file);
  const w = (src as ImageBitmap).width || (src as HTMLImageElement).naturalWidth;
  const h = (src as ImageBitmap).height || (src as HTMLImageElement).naturalHeight;
  if (!w || !h) throw new Error("사진 크기를 읽지 못했어요");
  const min = Math.min(w, h);
  const sx = (w - min) / 2;
  const sy = (h - min) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("브라우저가 이미지 처리를 지원하지 않아요");
  ctx.drawImage(src, sx, sy, min, min, 0, 0, SIZE, SIZE);
  if ("close" in src && typeof src.close === "function") src.close();
  const out = canvas.toDataURL("image/jpeg", 0.85);
  if (!out || out.length < 64) throw new Error("이미지 변환에 실패했어요");
  return out;
}

export default function AvatarUpload() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!f) return;
    if (f.size > MAX_SRC_BYTES) {
      setError("12MB 이하 이미지만 올릴 수 있어요.");
      return;
    }
    setError(null);
    resizeToDataUrl(f)
      .then((dataUrl) => {
        startTransition(async () => {
          const fd = new FormData();
          fd.set("avatarData", dataUrl);
          const res = await uploadAvatarAction(null, fd);
          if (res?.error) setError(res.error);
        });
      })
      .catch((err) =>
        setError(`${err?.message || "이미지를 처리하지 못했어요"} — 다른 사진을 시도해주세요.`),
      );
  }

  return (
    <div className="mt-2">
      <label
        className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 text-xs font-medium transition ${
          pending
            ? "opacity-60 cursor-wait"
            : "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 text-neutral-600 dark:text-neutral-300"
        }`}
      >
        {pending ? "업로드 중…" : "사진 업로드"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onChange}
          disabled={pending}
        />
      </label>
      {error && <p className="mt-1.5 text-[11px] text-rose-500 text-center">{error}</p>}
      <p className="mt-1.5 text-[10px] text-neutral-400 text-center">정사각형 권장 · 휴대폰 사진도 OK · 자동으로 잘려 저장됩니다</p>
    </div>
  );
}
