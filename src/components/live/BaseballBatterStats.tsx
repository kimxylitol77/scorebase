"use client";

// 야구 "타자 전력" 섹션 — 홈/원정 탭 + 선수별 시즌 타율/안타/타점/OPS 테이블.
// 데이터: getBaseballSeasonAnalysis (BaseballPlayerSeasonStats). 안타 내림차순 정렬됨.
// MLB 는 로스터 ~13명, KBO/NPB 는 규정타석 ~3명(공식 페이지 제약).

import { useState } from "react";
import type { BaseballBatter } from "@/lib/live/baseball-season-analysis";

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  homeBatters: BaseballBatter[];
  awayBatters: BaseballBatter[];
}

function fmt(n: number | null, digits: number): string {
  if (n == null || Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

export default function BaseballBatterStats({
  homeNameKo,
  awayNameKo,
  homeBatters,
  awayBatters,
}: Props) {
  const [tab, setTab] = useState<"home" | "away">("home");
  if (homeBatters.length === 0 && awayBatters.length === 0) return null;

  const batters = tab === "home" ? homeBatters : awayBatters;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-black tracking-tight mb-3">
        타자 전력
      </h2>

      {/* 홈/원정 탭 */}
      <div className="grid grid-cols-2 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 mb-3 text-sm font-bold">
        <button
          type="button"
          onClick={() => setTab("home")}
          className={`py-2.5 transition ${
            tab === "home"
              ? "bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900"
              : "bg-transparent text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          }`}
        >
          {homeNameKo} <span className="font-medium opacity-80">(홈)</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("away")}
          className={`py-2.5 transition ${
            tab === "away"
              ? "bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900"
              : "bg-transparent text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
          }`}
        >
          {awayNameKo} <span className="font-medium opacity-80">(원정)</span>
        </button>
      </div>

      {batters.length === 0 ? (
        <p className="text-center text-sm text-neutral-500 py-6">
          타자 시즌 기록 준비 중입니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-800/70">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-900/60 text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="text-left font-medium py-2.5 px-3">선수명</th>
                <th className="text-right font-medium py-2.5 px-2">타율</th>
                <th className="text-right font-medium py-2.5 px-2">안타</th>
                <th className="text-right font-medium py-2.5 px-2">타점</th>
                <th className="text-right font-medium py-2.5 px-3">OPS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
              {batters.map((b, i) => (
                <tr key={`${b.playerName}-${i}`}>
                  <td className="text-left py-2.5 px-3 font-medium truncate max-w-[40vw]">
                    {b.playerName}
                  </td>
                  <td className="text-right py-2.5 px-2 tabular-nums">
                    {fmt(b.avg, 3)}
                  </td>
                  <td className="text-right py-2.5 px-2 tabular-nums">
                    {b.hits ?? "-"}
                  </td>
                  <td className="text-right py-2.5 px-2 tabular-nums">
                    {b.rbi ?? "-"}
                  </td>
                  <td className="text-right py-2.5 px-3 tabular-nums font-semibold">
                    {fmt(b.ops, 3)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
