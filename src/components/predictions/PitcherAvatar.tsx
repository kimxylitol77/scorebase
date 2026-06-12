"use client";

// 선발 투수 아바타 — 사진 로드 실패(CDN 미보유 선수) 시 이니셜 fallback.
import { useState } from "react";

export default function PitcherAvatar({
  src,
  name,
  size = 64,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center ring-2 ring-white dark:ring-neutral-900 shadow"
      >
        <span className="font-black text-neutral-500 dark:text-neutral-300" style={{ fontSize: size * 0.34 }}>
          {name.slice(0, 1)}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={() => setErr(true)}
      className="rounded-full object-cover object-top bg-neutral-100 dark:bg-neutral-800 ring-2 ring-white dark:ring-neutral-900 shadow"
      style={{ width: size, height: size }}
    />
  );
}
