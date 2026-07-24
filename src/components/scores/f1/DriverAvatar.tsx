// F1 드라이버 아바타 — 원형 사진 + 국기 배지, 로드 실패 시 이니셜 폴백.
"use client";

import { useState } from "react";

export default function DriverAvatar({
  photo,
  flag,
  country,
  name,
}: {
  photo: string | null;
  flag: string | null;
  country: string | null;
  name: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <span className="relative inline-block shrink-0 w-7 h-7">
      {photo && !err ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={name}
          loading="lazy"
          onError={() => setErr(true)}
          className="w-7 h-7 rounded-full object-cover object-[50%_18%] bg-neutral-100 dark:bg-neutral-800 ring-1 ring-black/5 dark:ring-white/10"
        />
      ) : (
        <span className="flex w-7 h-7 items-center justify-center rounded-full bg-neutral-200 text-[11px] font-bold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          {name.slice(0, 1)}
        </span>
      )}
      {flag && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flag}
          alt={country ?? ""}
          className="absolute -bottom-0.5 -right-0.5 w-3 h-[9px] rounded-[1px] object-cover ring-1 ring-white dark:ring-neutral-950"
        />
      )}
    </span>
  );
}
