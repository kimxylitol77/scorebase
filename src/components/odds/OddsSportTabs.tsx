// /odds 상단 탭 — 종목 3개 + 베트맨 배당. OddsFlowList(흐름 뷰)와 베트맨 뷰가 함께 쓴다.
// 두 뷰가 서로 다른 컴포넌트라 탭을 한쪽에 두면 다른 쪽에서 탭이 사라진다 → 여기로 분리.

"use client";

import Link from "next/link";

export const ODDS_TABS: [string, string][] = [
  ["soccer", "축구"],
  ["baseball", "야구"],
  ["basketball", "농구"],
  ["betman", "베트맨 배당"],
];

export default function OddsSportTabs({ sport }: { sport: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {ODDS_TABS.map(([s, label]) => (
        // 풀 리로드(<a>)면 <head> 테마 스크립트가 재실행돼 쿠키 미저장/OS 라이트 환경에서
        // 다크→라이트로 튄다. Link 클라 라우팅은 리로드가 없어 테마(html.dark)가 유지된다.
        <Link
          key={s}
          href={`/odds?sport=${s}`}
          className={`rounded-lg px-4 py-1.5 text-[14px] ${
            s === sport
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "border border-neutral-200 text-neutral-500 dark:border-neutral-700"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
