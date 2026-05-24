"use client";

import { useState, type ReactNode } from "react";

interface Props {
  title?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function ExpandableDetails({
  title = "AI 분석 요약",
  children,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="insight-card relative z-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between"
      >
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
          {title}
        </span>
        <span
          className={`text-[var(--insight-text-3)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-3 text-[13px] leading-relaxed text-[var(--insight-text-2)] space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}
