"use client";
// MatchInsight 용 recharts 차트 지연 로딩 래퍼 — 글 상세(articles/[slug] 등) 초기 번들에서
// recharts 청크 분리 (2026-07-02 감사 B3). 높이는 각 차트 실제 컨테이너와 동일 고정 = CLS 방지.
// BaseballLiveDetail 의 LiveWinProbability dynamic 선례와 동일 패턴.

import dynamic from "next/dynamic";

function skeleton(heightPx: number) {
  return function ChartSkeleton() {
    return (
      <div
        style={{ height: heightPx }}
        className="w-full animate-pulse rounded-xl bg-zinc-100 dark:bg-white/[0.04]"
        aria-hidden
      />
    );
  };
}

export const WinProbDonut = dynamic(() => import("./WinProbDonut"), {
  ssr: false,
  loading: skeleton(200),
});
export const EloTrendChart = dynamic(() => import("./EloTrendChart"), {
  ssr: false,
  loading: skeleton(220),
});
export const GoalScatter = dynamic(() => import("./GoalScatter"), {
  ssr: false,
  loading: skeleton(260),
});
