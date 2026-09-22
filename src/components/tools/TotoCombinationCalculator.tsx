"use client";
// 토토 복식 조합 계산기 — 승무패(축구)·승1패(야구)·승5패(농구) 14경기에서 경기마다 고른 결과 수를 곱해 조합 수와 구매금액을 낸다.
// 규칙: 1조합 = 1,000원(스포츠토토 승무패·승1패·승5패 공통), 복식은 한 경기에 결과를 2~3개 고르는 것.

import { useMemo, useState } from "react";

type Mode = "wdl" | "win1" | "win5";
const MODES: Array<{ key: Mode; label: string; outcomes: [string, string, string]; hint: string }> = [
  { key: "wdl", label: "축구 승무패", outcomes: ["승", "무", "패"], hint: "홈 승 · 무승부 · 원정 승" },
  { key: "win1", label: "야구 승1패", outcomes: ["승", "1", "패"], hint: "홈 승 · 1점차 · 원정 승 (1 = 양 팀 점수 차가 1점)" },
  { key: "win5", label: "농구 승5패", outcomes: ["승", "5", "패"], hint: "홈 승 · 5점차 이내 · 원정 승 (5 = 점수 차 5점 이하)" },
];
const GAMES = 14;
export const UNIT_PRICE = 1000;

/** 경기별 선택 수(0~3) → 조합 수. 하나라도 0 이면 미완성(null). */
export function comboCount(picks: number[]): number | null {
  if (picks.length === 0 || picks.some((n) => n <= 0)) return null;
  return picks.reduce((a, n) => a * n, 1);
}

export default function TotoCombinationCalculator() {
  const [mode, setMode] = useState<Mode>("wdl");
  // 경기 × 결과(3) 선택 상태 — 모드가 바뀌어도 선택은 유지(결과 라벨만 달라진다)
  const [sel, setSel] = useState<boolean[][]>(() => Array.from({ length: GAMES }, () => [false, false, false]));
  const m = MODES.find((x) => x.key === mode)!;
  const picks = sel.map((r) => r.filter(Boolean).length);
  const chosen = picks.filter((n) => n > 0).length;
  const combos = useMemo(() => comboCount(picks), [picks]);
  const toggle = (g: number, o: number) => setSel((prev) => prev.map((row, i) => (i === g ? row.map((v, j) => (j === o ? !v : v)) : row)));
  const reset = () => setSel(Array.from({ length: GAMES }, () => [false, false, false]));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-1.5">
        {MODES.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => setMode(x.key)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition ${
              x.key === mode
                ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
                : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10"
            }`}
          >
            {x.label}
          </button>
        ))}
        <button type="button" onClick={reset} className="ml-auto text-[12px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">
          초기화
        </button>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">{m.hint}. 한 경기에 결과를 여러 개 고르면 복식이 됩니다.</p>

      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {sel.map((row, g) => (
          <div key={g} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 dark:bg-white/[0.04]">
            <span className="w-7 shrink-0 text-right text-[12px] font-semibold tabular-nums text-neutral-500">{g + 1}</span>
            {m.outcomes.map((label, o) => (
              <button
                key={o}
                type="button"
                onClick={() => toggle(g, o)}
                aria-pressed={row[o]}
                className={`flex-1 rounded-md py-1.5 text-[13px] font-bold ring-1 transition ${
                  row[o]
                    ? o === 0
                      ? "bg-rose-500 text-white ring-rose-500"
                      : o === 1
                        ? "bg-amber-400 text-neutral-900 ring-amber-400"
                        : "bg-blue-500 text-white ring-blue-500"
                    : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-100 dark:bg-neutral-950 dark:text-neutral-300 dark:ring-white/10 dark:hover:bg-white/[0.08]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">선택한 경기</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{chosen} / {GAMES}</dd>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">조합 수</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{combos == null ? "—" : combos.toLocaleString()}</dd>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">구매금액</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{combos == null ? "—" : `${(combos * UNIT_PRICE).toLocaleString()}원`}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 break-keep">
        {chosen < GAMES ? `${GAMES}경기를 모두 골라야 조합이 완성됩니다. ` : ""}
        조합 수는 경기마다 고른 결과 수의 곱이고, 구매금액은 1조합당 {UNIT_PRICE.toLocaleString()}원입니다. 14경기 전부 맞아야 1등이며 실제 발매 한도·적중금은 회차 공지를 따릅니다.
        이 페이지는 계산만 하며 베팅을 권유하지 않습니다.
      </p>
    </div>
  );
}
