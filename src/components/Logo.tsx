// Scorebase 로고 — SVG 마크 + 워드마크.
// 마크: 데이터/성장 차트를 연상시키는 4개 막대 (왼쪽 작고 오른쪽 큼)
// 그라디언트: 메인 사이트 액센트 (보라 → 파랑)

import Link from "next/link";

interface Props {
  /** "default" 또는 "compact" — compact 는 부제 숨김 */
  variant?: "default" | "compact";
  /** 클릭 가능 (Link) 사용 여부 */
  asLink?: boolean;
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="sb-grad" x1="0" y1="32" x2="32" y2="0">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <rect x="3" y="20" width="5" height="9" rx="1.5" fill="url(#sb-grad)" opacity="0.55" />
      <rect x="11" y="14" width="5" height="15" rx="1.5" fill="url(#sb-grad)" opacity="0.75" />
      <rect x="19" y="8" width="5" height="21" rx="1.5" fill="url(#sb-grad)" opacity="0.9" />
      <rect x="27" y="3" width="5" height="26" rx="1.5" fill="url(#sb-grad)" />
    </svg>
  );
}

export default function Logo({
  variant = "default",
  asLink = true,
}: Props) {
  const inner = (
    <span className="inline-flex items-center gap-2">
      <Mark size={26} />
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-xl sm:text-[22px] font-black tracking-tight leading-none text-neutral-900 dark:text-white">
          Scorebase
        </span>
        {variant === "default" && (
          <span className="hidden md:inline text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
            Sports&nbsp;Daily
          </span>
        )}
      </span>
    </span>
  );

  if (!asLink) return inner;

  return (
    <Link href="/" className="group inline-flex items-center hover:opacity-90 transition">
      {inner}
    </Link>
  );
}
