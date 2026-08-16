"use client";
// 나라별 인원 칩 — 누르면 아래 시즌 성적 표가 그 나라 선수만 남는다.
// 표 행은 서버에서 만든 노드를 그대로 받는다(팀 로고·선수 링크 조회가 서버에 있어서).

import { useState, type ReactNode } from "react";

export interface CountryRow {
  country: string;
  node: ReactNode;
}

export default function CountryFilter({
  countries,
  flags,
  rows,
}: {
  countries: Array<[string, number]>;
  flags: Record<string, string>;
  rows: CountryRow[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const shown = selected ? rows.filter((r) => r.country === selected) : rows;

  const chip = (label: string, count: number, value: string | null) => {
    const on = selected === value;
    return (
      <li key={value ?? "all"}>
        <button
          type="button"
          onClick={() => setSelected(on ? null : value)}
          aria-pressed={on}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
            on
              ? "border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300"
              : "border-neutral-200 hover:border-sky-400 dark:border-neutral-800 dark:hover:border-sky-600"
          }`}
        >
          <span className={on ? "" : "text-neutral-700 dark:text-neutral-300"}>{label}</span>
          <span className="font-black tabular-nums text-sky-600 dark:text-sky-400">{count}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">나라별 인원</h2>
          <p className="text-[11px] text-neutral-400">나라를 누르면 아래 표가 그 나라 선수만 보입니다</p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {chip("전체", rows.length, null)}
          {countries.map(([c, n]) => chip(`${flags[c] ? `${flags[c]} ` : ""}${c}`, n, c))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">
          시즌 성적
          {selected && (
            <span className="ml-2 text-xs font-normal text-neutral-500">
              {selected} {shown.length}명
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-1.5 underline underline-offset-2 hover:text-sky-600"
              >
                전체 보기
              </button>
            </span>
          )}
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
                <th className="px-3 py-2 text-left">선수</th>
                <th className="px-2 py-2 text-left">소속</th>
                <th className="px-2 py-2 text-center">출전</th>
                <th className="px-2 py-2 text-center">골</th>
                <th className="px-2 py-2 text-center">도움</th>
                <th className="px-2 py-2 text-center">분</th>
                <th className="px-2 py-2 text-center">평점</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {shown.map((r) => r.node)}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
