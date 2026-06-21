"use client";
// 야구 선수 페이지 탭 — 전 탭 SSR 렌더(SEO 보존), 비활성은 CSS hidden 으로 감춤.

import { useState, type ReactNode } from "react";

export default function PlayerTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
              active === t.key
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? "space-y-6" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
