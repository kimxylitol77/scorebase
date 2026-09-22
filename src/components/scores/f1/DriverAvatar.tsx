// F1 드라이버 아바타 — 원형 사진 + 국기 배지, 로드 실패 시 이니셜 폴백.
"use client";

import { useState } from "react";

export default function DriverAvatar({
  photo,
  flag,
  country,
  name,
  size = "sm",
}: {
  photo: string | null;
  flag: string | null;
  country: string | null;
  name: string;
  /** sm = 28px(F1 기본) · lg = 48px(골프 선수 목록 — 작아서 안 보인다는 요청, 2026-09-22) */
  size?: "sm" | "lg";
}) {
  const [err, setErr] = useState(false);
  const box = size === "lg" ? "w-12 h-12" : "w-7 h-7";
  const initial = size === "lg" ? "text-base" : "text-[11px]";
  return (
    <span className={`relative inline-block shrink-0 ${box}`}>
      {photo && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={name}
          loading="lazy"
          onError={() => setErr(true)}
          className={`${box} rounded-full object-cover object-[50%_18%] bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10`}
        />
      ) : (
        <span className={`flex ${box} items-center justify-center rounded-full bg-neutral-200 ${initial} font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400`}>
          {name.slice(0, 1)}
        </span>
      )}
      {flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flag}
          alt={country ?? ""}
          className={`absolute -bottom-0.5 -right-0.5 ${size === "lg" ? "w-4 h-3" : "w-3 h-[9px]"} rounded-[1px] object-cover ring-1 ring-white dark:ring-neutral-950`}
        />
      )}
    </span>
  );
}
