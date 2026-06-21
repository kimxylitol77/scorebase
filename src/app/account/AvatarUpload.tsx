"use client";

// 아바타 사진 업로드 버튼 — 브라우저에서 160px 정사각 webp 로 줄여 data URL 로 제출.
// 외부 저장소 없이 DB(User.avatarUrl)에 바로 저장하므로 작게 변환하는 게 핵심.
import { useActionState, useRef } from "react";
import { uploadAvatarAction, type UploadAvatarState } from "./actions";

const MAX_SRC_BYTES = 10 * 1024 * 1024; // 원본 10MB 초과는 canvas 처리 전 차단
const SIZE = 160; // 저장 해상도(정사각)

// 파일 → 160px 정사각 center-crop webp data URL.
function resizeToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unsupported"));
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    img.src = url;
  });
}

export default function AvatarUpload() {
  const formRef = useRef<HTMLFormElement>(null);
  const dataRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState<UploadAvatarState, FormData>(
    uploadAvatarAction,
    null,
  );

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_SRC_BYTES) {
      alert("10MB 이하 이미지만 올릴 수 있어요.");
      e.target.value = "";
      return;
    }
    try {
      const dataUrl = await resizeToDataUrl(f);
      if (dataRef.current) dataRef.current.value = dataUrl;
      formRef.current?.requestSubmit();
    } catch {
      alert("이미지를 처리하지 못했어요. 다른 사진을 시도해주세요.");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <form ref={formRef} action={action} className="mt-2">
      <input ref={dataRef} type="hidden" name="avatarData" />
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
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={onChange}
          disabled={pending}
        />
      </label>
      {state?.error && <p className="mt-1.5 text-[11px] text-rose-500 text-center">{state.error}</p>}
      <p className="mt-1.5 text-[10px] text-neutral-400 text-center">정사각형 권장 · 휴대폰 사진도 OK · 자동으로 잘려 저장됩니다</p>
    </form>
  );
}
