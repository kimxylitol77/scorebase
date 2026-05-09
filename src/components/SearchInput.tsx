"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** "compact" 헤더용 작은 입력 / "full" /search 페이지용 큰 입력 */
  variant?: "compact" | "full";
  defaultValue?: string;
  autoFocus?: boolean;
  /** 모바일 메뉴에서 호출하면 메뉴 자동 닫음 */
  onSubmit?: () => void;
}

export default function SearchInput({
  variant = "compact",
  defaultValue = "",
  autoFocus = false,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onSubmit?.();
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  if (variant === "full") {
    return (
      <form onSubmit={handleSubmit} className="relative">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="기사 제목·본문 검색 (예: 리버풀, 시즌 분석)"
          autoFocus={autoFocus}
          className="w-full pl-11 pr-4 py-3 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="검색"
        className="w-44 lg:w-56 pl-8 pr-3 py-1.5 rounded-full text-sm bg-neutral-100 dark:bg-neutral-900 border border-transparent hover:bg-neutral-200/70 dark:hover:bg-neutral-800 focus:outline-none focus:bg-white dark:focus:bg-neutral-950 focus:border-neutral-300 dark:focus:border-neutral-700 focus:ring-2 focus:ring-blue-500 transition"
      />
    </form>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle
        cx="11"
        cy="11"
        r="7"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M20 20L17 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
