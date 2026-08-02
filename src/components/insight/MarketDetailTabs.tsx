"use client";

// AI 예측 종합의 마켓 서브탭 셸 — 종합 / 오버언더 / BTTS 등 마켓별 심화 뷰 전환.
// 콘텐츠는 서버(MatchInsight)에서 렌더해 children 으로 받는다 — 여기는 탭 상태만.

import { useState, type ReactNode } from "react";

export interface MarketTab {
  key: string;
  label: string;
  content: ReactNode;
}

export default function MarketDetailTabs({ tabs }: { tabs: MarketTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  if (tabs.length === 0) return null;
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <div>
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              t.key === current.key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-white/50 dark:hover:bg-white/[0.1]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current.content}
    </div>
  );
}
