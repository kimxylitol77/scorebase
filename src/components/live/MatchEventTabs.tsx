// 경기 이벤트 탭 — iOS 세그먼트 컨트롤(애플 스타일)로 골·이벤트·교체영향을 묶음.
// 세로로 길게 쌓이던 카드들을 한 화면에. content 없는 탭은 호출부에서 제외해 넘김.

"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  key: string;
  label: string;
  content: ReactNode;
}

export default function MatchEventTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState<string | undefined>(tabs[0]?.key);
  if (tabs.length === 0) return null;
  const cur = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-2.5">
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-[11px] bg-neutral-100 dark:bg-neutral-800/70">
          {tabs.map((t) => {
            const on = t.key === cur.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                className={`flex-1 text-center text-[13px] py-1.5 rounded-lg transition ${
                  on
                    ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white font-semibold shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 font-medium hover:text-neutral-700 dark:hover:text-neutral-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}
      <div>{cur.content}</div>
    </div>
  );
}
