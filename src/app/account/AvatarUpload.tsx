"use client";

// 아바타 사진 업로드 — 브라우저에서 160px 정사각으로 줄여 data URL 로 DB 저장.
// 모바일 호환: accept=image/*(아이폰 HEIC 포함), webp 미지원 시 jpeg 폴백,
// requestSubmit 대신 서버액션 직접 호출(자동제출이 일부 모바일에서 불안정).
import { useState, useTransition } from "react";
import { uploadAvatarAction } from "./actions";

const MAX_SRC_BYTES = 12 * 1024 * 1024; // 원본 12MB 초과는 처리 전 차단(모바일 고화질 여유)
const SIZE = 160; // 저장 해상도(정사각)

// 파일 → 160px 정사각 center-crop data URL (webp, 미지원 시 jpeg).
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas unsupported"));
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
        let out = canvas.toDataURL("image/webp", 0.85);
        if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", 0.85);
        if (!out || out.length < 64) return reject(new Error("encode failed"));
        resolve(out);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
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
      .catch(() => setError("이미지를 처리하지 못했어요. 다른 사진을 시도해주세요."));
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
