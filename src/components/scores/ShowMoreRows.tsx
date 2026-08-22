// 리그 카드 행 "더 보기" — 초과분은 펼치기 전엔 DOM 에 올리지 않는다 (FA컵 134경기 통째 렌더 → 첫 로딩 7.5초 진범).
// 구분선(divide-y) 컨테이너 안에 쓰이므로 버튼도 한 행처럼 렌더.

"use client";

import { useState, type ReactNode } from "react";

export default function ShowMoreRows({
  initial,
  more,
  moreCount,
  unit = "경기",
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
          {open ? "접기" : `${unit} ${moreCount}개 더 보기`}
        </button>
      </div>
    </>
  );
}
