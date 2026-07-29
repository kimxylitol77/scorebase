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
      // MLB 헤드샷(213×320)은 cover 로 채우면 모자·턱이 잘린다 → contain 으로 머리 전체를 담고
      // 아래 기준 정렬. 남는 좌우는 사진 배경(흰·연회색)과 맞춘 slate-200 으로 채운다.
      className="rounded-full object-contain object-bottom bg-slate-200 ring-2 ring-white dark:ring-neutral-900 shadow"
      style={{ width: size, height: size }}
    />
  );
}
