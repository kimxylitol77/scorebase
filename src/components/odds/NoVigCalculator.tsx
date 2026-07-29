"use client";
// No-Vig(공정 배당) 계산기 — 입력한 배당에서 북메이커 마진(vig)을 걷어내 공정 확률·공정 배당을 보여준다.

import { useMemo, useState } from "react";

type Mode = "two" | "three";

const MODE_TABS: [Mode, string][] = [
  ["two", "2-way (승·패)"],
  ["three", "3-way (홈·무·원정)"],
];

const LABELS: Record<Mode, string[]> = {
  two: ["홈 승", "원정 승"],
  three: ["홈 승", "무승부", "원정 승"],
};

type FairRow = {
  label: string;
  odds: number;
  rawProb: number; // 표시 배당 그대로의 확률 (1/배당, vig 포함)
  fairProb: number; // vig 제거 후 확률
  fairOdds: number;
};

/**
 * vig 제거 = implied(1/배당) 을 implied 합으로 나누는 비례 배분.
 * 수식 출처 — src/lib/odds/odds-api.ts 의 impliedFromOdds (Match.marketHome/Draw/Away 산출과 동일).
 * 입력이 하나라도 비었거나 1.0 이하면 null (조용히 대기).
 */
export function computeNoVig(
  labels: string[],
  values: string[],
): { overround: number; rows: FairRow[] } | null {
  const odds = values.map((v) => Number(v.trim()));
  if (odds.length !== labels.length) return null;
  if (odds.some((d) => !Number.isFinite(d) || d <= 1)) return null;

  const implied = odds.map((d) => 1 / d);
  const sum = implied.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;

  const rows: FairRow[] = labels.map((label, i) => {
    const fairProb = implied[i] / sum;
    return {
      label,
      odds: odds[i],
      rawProb: implied[i],
      fairProb,
      fairOdds: 1 / fairProb,
    };
  });
  return { overround: sum - 1, rows };
}

export default function NoVigCalculator({ defaultMode = "three" }: { defaultMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [two, setTwo] = useState<string[]>(["", ""]);
  const [three, setThree] = useState<string[]>(["", "", ""]);

  const values = mode === "two" ? two : three;
  const setValues = mode === "two" ? setTwo : setThree;
  const labels = LABELS[mode];

  const result = useMemo(() => computeNoVig(labels, values), [labels, values]);

  const update = (i: number, v: string) => {
    // 숫자·소수점만 통과 — 잘못된 입력은 에러 대신 무시한다.
    if (v !== "" && !/^\d*\.?\d*$/.test(v)) return;
    setValues((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  };

  return (
    <section className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <h2 className="text-[17px] font-medium">공정 배당(No-Vig) 계산기</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        북메이커 배당에는 마진(vig)이 섞여 있어 배당의 역수는 진짜 확률이 아닙니다. 배당을 입력하면
        마진을 걷어낸 공정 확률과 공정 배당을 계산합니다.
      </p>

      <div className="mt-4 flex gap-2">
        {MODE_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex-none rounded-md border px-3 py-1.5 text-[13px] transition ${
              mode === key
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={`mt-4 grid max-w-xl gap-2 ${mode === "two" ? "grid-cols-2" : "grid-cols-3"}`}>
        {labels.map((label, i) => (
          <label key={label} className="block">
            <span className="block text-[11px] text-neutral-400">{label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={values[i]}
              onChange={(e) => update(i, e.target.value)}
              placeholder="1.90"
              aria-label={`${label} 배당`}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[15px] tabular-nums text-neutral-800 outline-none transition placeholder:text-neutral-300 focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-500"
            />
          </label>
        ))}
      </div>

      {result ? (
        <div className="mt-4">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              북메이커 마진 (오버라운드)
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[22px] font-medium tabular-nums text-neutral-800 dark:text-neutral-100">
                {/* 부동소수 오차로 -1e-16 이 "-0.00%" 로 찍히던 것 방지 */}
                {(Math.abs(result.overround) < 1e-9 ? 0 : result.overround * 100).toFixed(2)}%
              </span>
              <span className="text-[12px] text-neutral-400">
                표시 확률 합 {((1 + result.overround) * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
            <table className="w-full border-collapse whitespace-nowrap text-[12px] sm:text-[13px]">
              <thead className="bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                <tr className="h-9">
                  <th className="px-2 text-left font-medium sm:px-3">결과</th>
                  <th className="px-2 text-right font-medium sm:px-3">입력 배당</th>
                  <th className="px-2 text-right font-medium sm:px-3">표시 확률</th>
                  <th className="px-2 text-right font-medium sm:px-3">공정 확률</th>
                  <th className="px-2 text-right font-medium sm:px-3">공정 배당</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr
                    key={r.label}
                    className="h-10 border-t border-neutral-200 dark:border-neutral-700"
                  >
                    <td className="px-2 text-left text-neutral-700 dark:text-neutral-200 sm:px-3">{r.label}</td>
                    <td className="px-2 text-right tabular-nums text-neutral-500 dark:text-neutral-400 sm:px-3">
                      {r.odds.toFixed(2)}
                    </td>
                    <td className="px-2 text-right tabular-nums text-neutral-500 dark:text-neutral-400 sm:px-3">
                      {(r.rawProb * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 text-right tabular-nums text-neutral-700 dark:text-neutral-200 sm:px-3">
                      {(r.fairProb * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 text-right font-medium tabular-nums text-neutral-900 dark:text-neutral-50 sm:px-3">
                      {r.fairOdds.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[12px] leading-relaxed text-neutral-400">
            공정 배당보다 낮은 배당은 마진만큼 손해입니다. 다른 업체 배당이 공정 배당보다 높다면 그쪽이
            더 유리합니다.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-neutral-400">
          {labels.join(" · ")} 배당을 모두 입력하면 계산됩니다. (1.00 초과 소수 배당)
        </p>
      )}
    </section>
  );
}
