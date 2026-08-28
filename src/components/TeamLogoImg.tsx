// 팀·리그 로고 공용 렌더 — 원본이 50~90KB PNG(thesports·api-sports)인데 화면은 16~24px 라
// Next image optimizer 를 태워 장당 ~2KB AVIF 로 내린다 (/scores 전송량의 80%가 로고였다, 2026-08-28 실측).
// 404(로고 없는 군소팀)는 onError 로 이니셜 폴백. optimizer 미등록 호스트는 plain <img> 유지.
"use client";

import Image from "next/image";
import { useState } from "react";

// next.config.ts images.remotePatterns 에 등록된 호스트만 — 미등록 호스트를 Image 로 그리면 런타임 에러
const OPTIMIZE_HOSTS = [
  "img.thesports.com",
  "eimg.thesports.com",
  "media.api-sports.io",
  "liquipedia.net",
  "a.espncdn.com",
];

export function isOptimizableLogo(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return OPTIMIZE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export default function TeamLogoImg({
  url,
  name,
  size,
  className,
  fallbackClassName,
}: {
  url?: string | null;
  name: string;
  /** 표시 px (정사각) — srcset 은 1x/2x 자동 */
  size: number;
  className: string;
  fallbackClassName: string;
}) {
  const [err, setErr] = useState(false);
  if (url && !err) {
    if (isOptimizableLogo(url)) {
      return (
        <Image src={url} alt="" width={size} height={size} className={className} loading="lazy" onError={() => setErr(true)} />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={className} loading="lazy" onError={() => setErr(true)} />;
  }
  return <span className={fallbackClassName}>{name.slice(0, 1)}</span>;
}
