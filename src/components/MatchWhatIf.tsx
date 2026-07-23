"use client";
// 인터랙티브 "만약에" 시뮬레이터 — 사용자가 양 팀 기대 득점(λ)을 슬라이더로 조절하면
// 1X2·OVER 2.5·양 팀 득점·유력 스코어를 브라우저에서 실시간 재계산. 서버 부하 0.
// 수식은 src/lib/predict/dixon-coles.ts 와 동일(RHO=-0.12·MAX_GOALS=8)이라 슬라이더를
// 모델 기본값에 두면 위 "예상 스코어" 카드 수치와 일치한다.

import { useMemo, useState } from "react";

const RHO = -0.12; // dixon-coles.ts 와 동일 — 저점수 상관 보정(무·저득점 살짝 ↑)
const MAX_GOALS = 8;

function poisson(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

// Dixon-Coles τ 보정 — dixon-coles.ts 와 동일 수식
function tau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1 - lh * la * rho;
  if (i === 0 && j === 1) return 1 + lh * rho;
  if (i === 1 && j === 0) return 1 + la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

interface SimResult {
  pHome: number;
  pDraw: number;
  pAway: number;
  pOver: number;
  pBtts: number;
  topScore: { home: number; away: number; prob: number };
}

function simulate(lh: number, la: number): SimResult {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    ph[i] = poisson(i, lh);
    pa[i] = poisson(i, la);
  }
  let total = 0;
  const grid: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    grid[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j] * tau(i, j, lh, la, RHO);
      grid[i][j] = p;
      total += p;
    }
  }
  let pHome = 0,
    pDraw = 0,
    pAway = 0,
    pOver = 0,
    pBtts = 0;
  let top = { home: 0, away: 0, prob: 0 };
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = grid[i][j] / total;
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i + j >= 3) pOver += p;
      if (i >= 1 && j >= 1) pBtts += p;
      if (p > top.prob) top = { home: i, away: j, prob: p };
    }
  }
  return { pHome, pDraw, pAway, pOver, pBtts, topScore: top };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const clamp = (x: number) => Math.max(0.2, Math.min(4, x));

/** 확률 막대 한 줄 */
function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium text-zinc-600 dark:text-white/60">{label}</span>
        <span className="font-bold tabular-nums text-zinc-900 dark:text-white">{pct(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-white/10">
        <div
          className={`h-full rounded-full ${tone} transition-[width] duration-200`}
          style={{ width: `${Math.max(2, Math.round(value * 100))}%` }}
        />
      </div>
    </div>
  );
}

/** 기대 득점 슬라이더 한 개 */
function GoalSlider({
  name,
  value,
  onChange,
  accent,
}: {
  name: string;
  value: number;
  onChange: (v: number) => void;
  accent: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="truncate text-xs font-semibold text-zinc-700 dark:text-white/70">{name}</span>
        <span className="tabular-nums text-sm font-black text-zinc-950 dark:text-white">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0.2}
        max={4}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${name} 기대 득점`}
        className={`w-full cursor-pointer ${accent}`}
      />
    </div>
  );
}

export default function MatchWhatIf({
  homeName,
  awayName,
  initHome,
  initAway,
}: {
  homeName: string;
  awayName: string;
  initHome: number;
  initAway: number;
}) {
  const base = useMemo(
    () => ({ h: clamp(initHome), a: clamp(initAway) }),
    [initHome, initAway],
  );
  const [lh, setLh] = useState(base.h);
  const [la, setLa] = useState(base.a);
  const r = useMemo(() => simulate(lh, la), [lh, la]);
  const dirty = Math.abs(lh - base.h) > 0.001 || Math.abs(la - base.a) > 0.001;

  return (
    <div className="mt-3 rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold text-zinc-800 dark:text-white/80">
          만약에 시뮬레이터
          <span className="ml-1.5 font-normal text-zinc-400 dark:text-white/40">
            기대 득점을 바꿔보세요
          </span>
        </h4>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setLh(base.h);
              setLa(base.a);
            }}
            className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-zinc-300/70 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
          >
            모델값으로 초기화
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GoalSlider name={homeName} value={lh} onChange={setLh} accent="accent-blue-500" />
        <GoalSlider name={awayName} value={la} onChange={setLa} accent="accent-rose-500" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <Bar label={`${homeName} 승`} value={r.pHome} tone="bg-blue-500" />
        <Bar label="OVER 2.5" value={r.pOver} tone="bg-orange-500" />
        <Bar label="무승부" value={r.pDraw} tone="bg-zinc-400 dark:bg-zinc-500" />
        <Bar label="양 팀 득점" value={r.pBtts} tone="bg-pink-500" />
        <Bar label={`${awayName} 승`} value={r.pAway} tone="bg-rose-500" />
        <div className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-1.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <span className="text-[11px] font-medium text-zinc-600 dark:text-white/60">유력 스코어</span>
          <span className="tabular-nums text-sm font-black text-zinc-950 dark:text-white">
            {r.topScore.home}–{r.topScore.away}
            <span className="ml-1 text-[11px] font-semibold text-zinc-400 dark:text-white/40">
              {pct(r.topScore.prob)}
            </span>
          </span>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
        ⓘ 슬라이더로 양 팀 기대 득점을 조절하면 Dixon-Coles 득점 모델로 확률이 실시간 재계산됩니다.
        기본값은 우리 모델 추정치이며, 통계 학습용 참고 정보입니다.
      </p>
    </div>
  );
}
