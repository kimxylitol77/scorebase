// scores__ShowMoreRows (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import { useState, type ReactNode } from "react";

export default function ShowMoreRows({
  initial,
  more,
  moreCount,
  unit = " matches",
  wrapClass = "px-3 py-1.5 text-center",
}: {
  initial: ReactNode;
  more: ReactNode;
  moreCount: number;
  /** "경기" | "리그" — 버튼 문구 단위 */
  unit?: string;
  wrapClass?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {initial}
      {open && more}
      <div className={wrapClass}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-[11px] font-semibold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:underline"
        >
          {open ? "Show less" : `${unit} ${moreCount} more`}
        </button>
      </div>
    </>
  );
}
