"use client";
// 순위표 보기 전환 탭 — 서버에서 미리 그린 표(지구·컨퍼런스·리그 전체)를 받아 하나만 보여 준다. NHL 순위 탭 전용.
import { useState, type ReactNode } from "react";

export default function StandingsViewTabs({ views }: { views: Array<{ key: string; label: string; node: ReactNode }> }) {
  const [active, setActive] = useState(views[0]?.key);
  return (
    <div className="min-w-0 space-y-3">
      <div className="inline-flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setActive(v.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              active === v.key
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
      {views.map((v) => (
        <div key={v.key} hidden={active !== v.key} className="min-w-0">
          {v.node}
        </div>
      ))}
    </div>
  );
}
