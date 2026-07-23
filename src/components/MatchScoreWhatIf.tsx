"use client";
// 비축구(야구·농구·하키) 점수 기반 "만약에" 시뮬레이터 — 사용자가 양 팀 예상 점수를
// 조절하면 승패·OVER·핸디캡을 브라우저에서 실시간 재계산. 서버 부하 0.
// 무승부가 없는 종목이라 축구용 MatchWhatIf(Poisson-DC)와 분리. 수식은
// src/lib/predict/markets.ts 의 Normal 경로(predictTotalMarket·predictHandicapMarket)와
// 동일해, 슬라이더를 모델 기본값에 두면 위 OVER·핸디캡 카드와 일치한다.
// 주의: 승패 확률은 이 점수 모델(Normal 마진)로 계산 — 상단 "AI 예측 종합"의
// 1X2(Elo+시장 블렌드)와는 계산 방식이 달라 값이 다를 수 있다(컴포넌트 안내문에 명시).

import { useMemo, useState } from "react";

// erf 근사 (Abramowitz & Stegun 7.1.26) — markets.ts 와 동일
function erf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
function normalCdf(x: number, mean: number, std: number): number {
  return 0.5 * (1 + erf((x - mean) / (std * Math.sqrt(2))));
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

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

function ScoreSlider({
  name,
  value,
  min,
  max,
  step,
  unit,
  onChange,
  accent,
}: {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  accent: string;
}) {
  // 정수 스텝(농구)이면 소수점 없이 표기
  const display = step >= 1 ? Math.round(value).toString() : value.toFixed(1);
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="truncate text-xs font-semibold text-zinc-700 dark:text-white/70">{name}</span>
        <span className="tabular-nums text-sm font-black text-zinc-950 dark:text-white">
          {display}
          <span className="ml-0.5 text-[11px] font-semibold text-zinc-400 dark:text-white/40">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${name} 예상 점수`}
        className={`w-full cursor-pointer ${accent}`}
      />
    </div>
  );
}

export default function MatchScoreWhatIf({
  homeName,
  awayName,
  initHome,
  initAway,
  overLine,
  totalStd,
  marginStd,
  handicapLine,
  unit,
  min,
  max,
  step,
}: {
  homeName: string;
  awayName: string;
  initHome: number;
  initAway: number;
  overLine: number;
  totalStd: number;
  marginStd: number;
  handicapLine: number;
  unit: string;
  min: number;
  max: number;
  step: number;
}) {
  const clamp = (x: number) => Math.max(min, Math.min(max, x));
  const base = useMemo(
    () => ({ h: clamp(initHome), a: clamp(initAway) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initHome, initAway, min, max],
  );
  const [h, setH] = useState(base.h);
  const [a, setA] = useState(base.a);
  const dirty = Math.abs(h - base.h) > 0.001 || Math.abs(a - base.a) > 0.001;

  const r = useMemo(() => {
    const margin = h - a;
    const total = h + a;
    const pAway = normalCdf(0, margin, marginStd); // P(margin < 0)
    const pHome = 1 - pAway;
    const pOver = Math.max(0.01, Math.min(0.99, 1 - normalCdf(overLine, total, totalStd)));
    // 핸디캡 — 강팀 -line cover vs 약팀 +line cover 중 높은 쪽 (markets.ts 와 동일)
    const homeCovers = 1 - normalCdf(handicapLine, margin, marginStd);
    const awayCovers = normalCdf(handicapLine, margin, marginStd);
    const homeBetter = homeCovers >= awayCovers;
    return {
      pHome,
      pAway,
      pOver,
      total,
      margin,
      hcSide: homeBetter ? homeName : awayName,
      hcSign: homeBetter ? "-" : "+",
      hcProb: homeBetter ? homeCovers : awayCovers,
    };
  }, [h, a, marginStd, totalStd, overLine, handicapLine, homeName, awayName]);

  return (
    <div className="rounded-[1rem] bg-zinc-50 p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-bold text-zinc-800 dark:text-white/80">
          만약에 시뮬레이터
          <span className="ml-1.5 font-normal text-zinc-400 dark:text-white/40">예상 점수를 바꿔보세요</span>
        </h4>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setH(base.h);
              setA(base.a);
            }}
            className="rounded-full bg-zinc-200/70 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-zinc-300/70 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
          >
            모델값으로 초기화
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ScoreSlider name={homeName} value={h} min={min} max={max} step={step} unit={unit} onChange={setH} accent="accent-blue-500" />
        <ScoreSlider name={awayName} value={a} min={min} max={max} step={step} unit={unit} onChange={setA} accent="accent-rose-500" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <Bar label={`${homeName} 승`} value={r.pHome} tone="bg-blue-500" />
        <Bar label={`OVER ${overLine}`} value={r.pOver} tone="bg-orange-500" />
        <Bar label={`${awayName} 승`} value={r.pAway} tone="bg-rose-500" />
        <Bar label={`핸디캡 ${r.hcSide} ${r.hcSign}${handicapLine}`} value={r.hcProb} tone="bg-violet-500" />
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
        ⓘ 슬라이더로 양 팀 예상 점수를 조절하면 점수 기반 모델(정규분포)로 OVER·핸디캡·승패 확률이
        실시간 재계산됩니다. 승패 확률은 이 점수 모델 기준이라 상단 &lsquo;AI 예측 종합&rsquo;의
        1X2(Elo·시장 블렌드)와 계산 방식이 달라 값이 다를 수 있습니다. 통계 학습용 참고 정보입니다.
      </p>
    </div>
  );
}
