"use client";
// 드래프트 카드의 원형 선수 사진 — 사진이 없거나 깨지면 팀 색 바탕의 실루엣으로 대체
import { useState } from "react";
import { User } from "lucide-react";

export default function PlayerFace({ src, color, size = 48 }: { src: string | null; color: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white/70 dark:ring-white/15"
      style={{ width: size, height: size, background: color }}
      aria-hidden
    >
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover object-top" />
      ) : (
        <User className="text-white/70" style={{ width: size * 0.55, height: size * 0.55 }} />
      )}
    </span>
  );
}
