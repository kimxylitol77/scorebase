"use client";
// 야구 선수 페이지 탭 — 전 탭 SSR 렌더(SEO 보존), 비활성은 CSS hidden 으로 감춤.

import { useState, type ReactNode } from "react";

export default function PlayerTabs({
  tabs,
}: {
  tabs: { key: string; label: string; content: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  // 비활성 탭은 display:none 상태로 마운트되는데, 그 안의 recharts 차트는 0×0 에서
  // 마운트되면 ResizeObserver 가 붙지 않아 탭을 열어도 영영 빈칸으로 남는다.
  // 탭이 처음 열리는 순간 key 를 바꿔 "보이는 상태"에서 다시 마운트시킨다.
  const [opened, setOpened] = useState<string[]>(() => (tabs[0] ? [tabs[0].key] : []));
  const openTab = (key: string) => {
    setActive(key);
    setOpened((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-black/5 dark:border-white/10 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => openTab(t.key)}
            className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              active === t.key
                ? "border-rose-500 text-rose-600 dark:text-rose-400"
                : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={`${t.key}:${opened.includes(t.key)}`}
          className={active === t.key ? "space-y-6" : "hidden"}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
