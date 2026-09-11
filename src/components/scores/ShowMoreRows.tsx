// 리그 카드 행 "더 보기" — 초과분은 펼치기 전엔 DOM 에 올리지 않는다 (FA컵 134경기 통째 렌더 → 첫 로딩 7.5초 진범).
// 구분선(divide-y) 컨테이너 안에 쓰이므로 버튼도 한 행처럼 렌더.

"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function ShowMoreRows({
  initial,
  more,
  moreCount,
  unit = "경기",
  wrapClass = "px-3 py-1.5 text-center",
  pill = false,
}: {
  initial: ReactNode;
  more: ReactNode;
  moreCount: number;
  /** "경기" | "리그" — 버튼 문구 단위 */
  unit?: string;
  wrapClass?: string;
  /** 알약 버튼(카드 사이 리그 더 보기). 카드 안 한 행(경기)은 행 높이를 지켜야 해서 글자·화살표만 보강. */
  pill?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 리그 더 보기가 회색 글자 한 줄이라 안 보인다는 지적(2026-09-11). 문구(unit)로 판정하면 영어판 미러에서 깨져 prop 으로 받는다.
  const cls = pill
    ? "inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-4 py-2 text-[13px] font-bold text-blue-700 ring-1 ring-blue-500/20 hover:bg-blue-500/15 dark:text-blue-300 transition-colors"
    : "inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300";
  return (
    <>
      {initial}
      {open && more}
      <div className={wrapClass}>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={cls}>
          {open ? "접기" : `${unit} ${moreCount}개 더 보기`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
    </>
  );
}
