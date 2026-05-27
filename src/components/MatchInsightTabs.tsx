// 매치 인사이트 통합 탭 카드 (네이버 스타일).
// MatchInsight.tsx (server) 가 모든 sections 를 prep 후 이 client 컴포넌트에 ReactNode 로 전달.
// 활성 탭만 표시 (CSS hidden — SSR 모든 탭 렌더, client 가 hide/show).
//
// 5개 스포츠 공통 (축구 / 야구 / 농구 / 하키 / 롤). article + /live 페이지 동일 디자인.

"use client";

import { useState, type ReactNode } from "react";

export interface InsightTab {
  key: string;
  label: string;
  enabled: boolean;
  content: ReactNode;
}

export interface MatchInsightTabsProps {
  headerLabel: string;
  headerSubLabel?: string;
  headerBadges?: ReactNode;
  headerSummary?: string;
  tabs: InsightTab[];
}

export default function MatchInsightTabs({
  headerLabel,
  headerSubLabel,
  headerBadges,
  headerSummary,
  tabs,
}: MatchInsightTabsProps) {
  const visibleTabs = tabs.filter((t) => t.enabled);
  const initialKey = visibleTabs[0]?.key ?? "";
  const [active, setActive] = useState<string>(initialKey);

  if (visibleTabs.length === 0) return null;

  const activeKey = visibleTabs.find((t) => t.key === active)?.key ?? visibleTabs[0].key;

  return (
    <section className="my-10 rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none overflow-hidden">
      {/* 헤더 */}
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-neutral-100 dark:border-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold tracking-tight text-zinc-950 dark:text-white">
              {headerLabel}
            </h3>
            {headerSubLabel && (
              <span className="text-[10px] font-medium normal-case tracking-normal text-zinc-400 dark:text-white/35">
                · {headerSubLabel}
              </span>
            )}
            {headerBadges}
          </div>
          {headerSummary && (
            <span className="text-xs font-medium text-zinc-500 dark:text-white/45">
              {headerSummary}
            </span>
          )}
        </div>
      </div>

      {/* 탭 바 */}
      <div className="px-3 sm:px-4 pt-3 pb-3 border-b border-neutral-100 dark:border-neutral-900">
        <div className="flex items-center gap-1 text-sm overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden whitespace-nowrap">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                activeKey === t.key
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 — 모든 탭 SSR, active 만 보이게 */}
      <div className="p-5 sm:p-6 space-y-6">
        {visibleTabs.map((t) => (
          <div key={t.key} className={activeKey === t.key ? "" : "hidden"}>
            {t.content}
          </div>
        ))}
      </div>
    </section>
  );
}
