// 심화 분석 접기 섹션 — 명세 v2 "심화는 <details> 기본 접힘".
// 네이티브 <details>/<summary> 라 JS 없이 동작(서버 컴포넌트). 화살표는 open 시 90° 회전.
// 가벼운 관전자는 안 펼치면 그만, 헤비유저는 필요한 것만 펼친다.

import type { ReactNode } from "react";

interface Props {
  title: string;
  /** 부제(우측 회색) — 예: "라인업 · 타자 · 배당 · 승률" */
  hint?: string;
  /** 기본 펼침 여부 (기본 false = 접힘) */
  defaultOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: Props) {
  return (
    <details open={defaultOpen} className="group">
      <summary className="flex items-center gap-2 cursor-pointer list-none select-none rounded-xl px-3 sm:px-4 py-3 bg-neutral-50 dark:bg-neutral-900/60 ring-1 ring-neutral-200/70 dark:ring-neutral-800/70 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition">
        <svg
          className="w-3.5 h-3.5 text-neutral-400 shrink-0 transition-transform duration-200 group-open:rotate-90"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="text-sm sm:text-base font-black tracking-tight">
          {title}
        </span>
        {hint && (
          <span className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
            {hint}
          </span>
        )}
        <span className="ml-auto text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          <span className="group-open:hidden">펼치기</span>
          <span className="hidden group-open:inline">접기</span>
        </span>
      </summary>
      <div className="space-y-4 pt-3">{children}</div>
    </details>
  );
}
