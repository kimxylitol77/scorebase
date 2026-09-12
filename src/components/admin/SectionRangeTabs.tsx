// 관리자 통계 카드 안의 기간 탭(7일·30일·전체) — 서버가 세 기간을 한 번에 렌더해 넘기고 여기서 탭만 바꾼다.
// 상단 전역 기간 토글은 페이지 전체를 다시 불러와 느리다(2026-09-12 사용자 지적) — 카드 단위는 즉시 전환.
// 활성 패널만 마운트한다(recharts ResponsiveContainer 가 숨은 컨테이너에서 폭 0 으로 깨진다).
// 선택을 localStorage 에 기억하지 않는다 — effect 안 setState 는 lint 금지이고, 초기값으로 읽으면 SSR(7일)과 어긋난다.
"use client";

import { useState, type ReactNode } from "react";

export type RangeKey = "7d" | "30d" | "all";
const LABEL: Record<RangeKey, string> = { "7d": "최근 7일", "30d": "최근 30일", all: "전체" };
const ORDER: RangeKey[] = ["7d", "30d", "all"];

export default function SectionRangeTabs({
  id,
  panels,
  defaultKey = "7d",
}: {
  /** 카드 식별자 — 버튼 aria 라벨용 */
  id: string;
  panels: Record<RangeKey, ReactNode>;
  defaultKey?: RangeKey;
}) {
  const [active, setActive] = useState<RangeKey>(defaultKey);
  const pick = (k: RangeKey) => setActive(k);
  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
        {ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => pick(k)}
            aria-pressed={k === active}
            aria-label={`${id} ${LABEL[k]}`}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              k === active
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {LABEL[k]}
          </button>
        ))}
      </div>
      {panels[active]}
    </div>
  );
}
