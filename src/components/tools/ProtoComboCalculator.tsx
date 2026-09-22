"use client";
// 프로토 승부식 조합 계산기 — 경기별 배당을 곱해 합성 배당·예상 적중금·내재 확률을 보여준다. 순수 산술, 서버 없음.
// 베트맨 규칙: 합성 배당은 각 경기 배당의 곱(소수 둘째 자리 절사), 적중금 = 구매금액 × 합성 배당. 최대 적중 배당 상한은 회차 공지에 따르므로 표시하지 않는다.

import { useMemo, useState } from "react";

const MAX_LEGS = 10;
const won = (n: number) => `${Math.floor(n).toLocaleString()}원`;

/** 배당 문자열 목록 → 합성 배당(둘째 자리 절사). 유효 배당(>1)이 하나도 없으면 null. */
export function comboOdds(values: string[]): { legs: number; product: number } | null {
  const odds = values.map((v) => Number(v.trim())).filter((d) => Number.isFinite(d) && d > 1);
  if (odds.length === 0) return null;
  const raw = odds.reduce((a, b) => a * b, 1);
  return { legs: odds.length, product: Math.floor(raw * 100) / 100 };
}

export default function ProtoComboCalculator() {
  const [legs, setLegs] = useState<string[]>(["1.85", "1.62", "2.10"]);
  const [stake, setStake] = useState("10000");
  const result = useMemo(() => comboOdds(legs), [legs]);
  const stakeNum = Number(stake.replace(/[^0-9]/g, "")) || 0;
  const payout = result ? stakeNum * result.product : 0;

  const setLeg = (i: number, v: string) => setLegs((prev) => prev.map((x, j) => (j === i ? v : x)));

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="space-y-2">
        {legs.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[12px] text-neutral-500">경기 {i + 1}</span>
            <input
              inputMode="decimal"
              value={v}
              onChange={(e) => setLeg(i, e.target.value)}
              placeholder="배당 (예 1.85)"
              className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[14px] tabular-nums dark:border-neutral-700 dark:bg-neutral-950"
            />
            {legs.length > 1 && (
              <button type="button" onClick={() => setLegs((p) => p.filter((_, j) => j !== i))} className="text-[12px] text-neutral-400 hover:text-rose-500" aria-label="경기 삭제">
                삭제
              </button>
            )}
          </div>
        ))}
        {legs.length < MAX_LEGS && (
          <button type="button" onClick={() => setLegs((p) => [...p, ""])} className="rounded-full border border-neutral-200 px-3 py-1 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/[0.06]">
            + 경기 추가 (최대 {MAX_LEGS})
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="w-14 shrink-0 text-[12px] text-neutral-500">구매금액</span>
        <input
          inputMode="numeric"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[14px] tabular-nums dark:border-neutral-700 dark:bg-neutral-950"
        />
        <span className="text-[12px] text-neutral-500">원</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">경기 수</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{result?.legs ?? 0}</dd>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">합성 배당</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{result ? result.product.toFixed(2) : "—"}</dd>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">예상 적중금</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{result ? won(payout) : "—"}</dd>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
          <dt className="text-[11px] text-neutral-500">배당이 말하는 확률</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums">{result ? `${((1 / result.product) * 100).toFixed(1)}%` : "—"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-500 break-keep">
        합성 배당은 각 경기 배당의 곱을 소수 둘째 자리에서 절사한 값이고, 적중금은 구매금액 × 합성 배당입니다. ‘배당이 말하는 확률’은 합성 배당의 역수로,
        발매사 마진이 포함돼 실제 확률보다 높게 나옵니다. 회차별 최대 적중 배당 상한은 베트맨 공지를 따릅니다. 이 페이지는 계산만 하며 베팅을 권유하지 않습니다.
      </p>
    </div>
  );
}
