"use client";

// 야구 "최근 5경기 · 상대전적" 섹션 — 홈팀/원정팀/상대전적 3탭 경기별 표.
// 데이터: getBaseballRecentGames (Match 테이블). 경기일·홈팀·점수·원정팀·승패.
// (이닝별 펼침/Toto 핸디·오버언더 배지는 과거 이닝스코어·기준선 데이터 필요 → 후속)

import { useState } from "react";
import type {
  BaseballRecentGames,
  BaseballGameRow,
} from "@/lib/live/baseball-season-analysis";

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  data: BaseballRecentGames;
}

type Tab = "home" | "away" | "h2h";

export default function BaseballRecentGames({
  homeNameKo,
  awayNameKo,
  data,
}: Props) {
  const [tab, setTab] = useState<Tab>("home");
  if (!data.hasData) return null;

  const rows =
    tab === "home" ? data.home : tab === "away" ? data.away : data.h2h;

  const tabs: { key: Tab; label: string }[] = [
    { key: "home", label: `${homeNameKo} (홈)` },
    { key: "away", label: `${awayNameKo} (원정)` },
    { key: "h2h", label: "상대전적" },
  ];

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-black tracking-tight mb-3">
        최근 5경기 · 상대전적
      </h2>

      <div className="grid grid-cols-3 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 mb-3 text-xs sm:text-sm font-bold">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`py-2.5 px-1 truncate transition ${
              tab === t.key
                ? "bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900"
                : "bg-transparent text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-sm text-neutral-500 py-6">
          {tab === "h2h" ? "최근 맞대결 기록이 없습니다." : "최근 경기 기록이 없습니다."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200/70 dark:border-neutral-800/70">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-900/60 text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="text-left font-medium py-2.5 px-2 sm:px-3">경기일</th>
                <th className="text-right font-medium py-2.5 px-1">홈팀</th>
                <th className="text-center font-medium py-2.5 px-2">점수</th>
                <th className="text-left font-medium py-2.5 px-1">원정팀</th>
                <th className="text-center font-medium py-2.5 px-2 sm:px-3">결과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
              {rows.map((g, i) => (
                <GameRow key={i} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GameRow({ g }: { g: BaseballGameRow }) {
  const homeWon = g.winner === "HOME";
  const awayWon = g.winner === "AWAY";
  const scoreCls = (won: boolean) =>
    won ? "text-rose-600 dark:text-rose-400 font-black" : "text-neutral-500";
  return (
    <tr>
      <td className="text-left py-2.5 px-2 sm:px-3 tabular-nums text-neutral-500">
        {g.date}
      </td>
      <td className="text-right py-2.5 px-1 truncate max-w-[22vw]">
        {g.homeName}
      </td>
      <td className="text-center py-2.5 px-2 tabular-nums whitespace-nowrap">
        <span className={scoreCls(homeWon)}>{g.homeScore ?? "-"}</span>
        <span className="text-neutral-300 dark:text-neutral-600 mx-1">:</span>
        <span className={scoreCls(awayWon)}>{g.awayScore ?? "-"}</span>
      </td>
      <td className="text-left py-2.5 px-1 truncate max-w-[22vw]">
        {g.awayName}
      </td>
      <td className="text-center py-2.5 px-2 sm:px-3">
        <ResultBadge winner={g.winner} />
      </td>
    </tr>
  );
}

function ResultBadge({ winner }: { winner: BaseballGameRow["winner"] }) {
  if (winner === "HOME")
    return (
      <span className="inline-block rounded-full border border-rose-400 text-rose-600 dark:border-rose-500/60 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5">
        홈승
      </span>
    );
  if (winner === "AWAY")
    return (
      <span className="inline-block rounded-full border border-blue-400 text-blue-600 dark:border-blue-500/60 dark:text-blue-400 text-[11px] font-bold px-2 py-0.5">
        원정승
      </span>
    );
  if (winner === "DRAW")
    return (
      <span className="inline-block rounded-full border border-neutral-300 text-neutral-500 dark:border-neutral-700 text-[11px] font-bold px-2 py-0.5">
        무
      </span>
    );
  return <span className="text-neutral-400">-</span>;
}
