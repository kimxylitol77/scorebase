// 캘리브레이션 곡선 — 이 벤치마크에서 사람들이 실제로 퍼 나를 그림 한 장.
// 손으로 작성한 영어권 전용 컴포넌트다. en-mirror 로 생성되지 않으니 직접 수정한다.
//
// 대각선 = 완벽한 보정(말한 확신 = 실제 적중). 배당 시장은 대각선에 붙고,
// LLM 은 그 아래로 처진다. 확신이 커질수록 격차가 벌어진다는 게 핵심이라
// 두 곡선을 같은 축에 겹쳐 그린다. JS 없이 서버에서 SVG 로 렌더한다.

import type { CalibrationBin } from "@/lib/predict/llm-benchmark";

const W = 660;
const H = 450;
const PAD = { l: 58, r: 18, t: 18, b: 52 };
const LO = 0.4;
const HI = 0.9;
const IW = W - PAD.l - PAD.r;
const IH = H - PAD.t - PAD.b;

const px = (p: number) => PAD.l + ((p - LO) / (HI - LO)) * IW;
const py = (p: number) => PAD.t + ((HI - p) / (HI - LO)) * IH;
const clamp = (p: number) => Math.max(LO, Math.min(HI, p));

/** 표본이 많은 점을 크게 — 눈으로 가중치가 보이게 한다. */
const radius = (n: number) => Math.max(3.5, Math.min(9, 2.2 * Math.log10(Math.max(n, 10))));

function Series({
  bins, color, label,
}: {
  bins: CalibrationBin[];
  color: string;
  label: string;
}) {
  const pts = bins.map((b) => `${px(clamp(b.claimed))},${py(clamp(b.actual))}`).join(" ");
  return (
    <g>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {bins.map((b, i) => (
        <g key={i}>
          <line
            x1={px(clamp(b.claimed))} y1={py(clamp(b.actual + b.ci))}
            x2={px(clamp(b.claimed))} y2={py(clamp(b.actual - b.ci))}
            stroke={color} strokeWidth={1.5} opacity={0.55}
          />
          <circle
            cx={px(clamp(b.claimed))} cy={py(clamp(b.actual))} r={radius(b.n)}
            fill={color} stroke="var(--cal-bg)" strokeWidth={1.5}
          >
            <title>{`${label} — stated ${(b.claimed * 100).toFixed(1)}%, actual ${(b.actual * 100).toFixed(1)}% ±${(b.ci * 100).toFixed(1)} (n=${b.n})`}</title>
          </circle>
        </g>
      ))}
    </g>
  );
}

export default function CalibrationChart({
  llm, market,
}: {
  llm: CalibrationBin[];
  market: CalibrationBin[];
}) {
  const ticks = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  return (
    <figure className="[--cal-bg:#ffffff] dark:[--cal-bg:#0a0a0a]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Calibration curve: stated confidence versus actual accuracy, for LLMs and the betting market"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={px(t)} y1={PAD.t} x2={px(t)} y2={PAD.t + IH}
              className="stroke-zinc-200 dark:stroke-white/10" strokeWidth={1}
            />
            <line
              x1={PAD.l} y1={py(t)} x2={PAD.l + IW} y2={py(t)}
              className="stroke-zinc-200 dark:stroke-white/10" strokeWidth={1}
            />
            <text
              x={px(t)} y={PAD.t + IH + 20} textAnchor="middle"
              className="fill-zinc-500 dark:fill-white/45" fontSize={12}
            >
              {Math.round(t * 100)}%
            </text>
            <text
              x={PAD.l - 10} y={py(t) + 4} textAnchor="end"
              className="fill-zinc-500 dark:fill-white/45" fontSize={12}
            >
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}

        {/* 완벽한 보정 = 대각선 */}
        <line
          x1={px(LO)} y1={py(LO)} x2={px(HI)} y2={py(HI)}
          className="stroke-zinc-400 dark:stroke-white/30" strokeWidth={1.5} strokeDasharray="6 5"
        />
        <text
          x={px(0.845)} y={py(0.875)} textAnchor="middle"
          className="fill-zinc-400 dark:fill-white/35" fontSize={11.5}
        >
          perfectly calibrated
        </text>

        <Series bins={market} color="#10b981" label="Betting market" />
        <Series bins={llm} color="#f43f5e" label="LLMs" />

        <text
          x={PAD.l + IW / 2} y={H - 8} textAnchor="middle"
          className="fill-zinc-600 dark:fill-white/55" fontSize={13} fontWeight={600}
        >
          Confidence the forecaster stated
        </text>
        <text
          x={-(PAD.t + IH / 2)} y={16} textAnchor="middle" transform="rotate(-90)"
          className="fill-zinc-600 dark:fill-white/55" fontSize={13} fontWeight={600}
        >
          How often it was actually right
        </text>
      </svg>

      <figcaption className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-zinc-600 dark:text-white/55">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f43f5e" }} />
          LLMs (7 models pooled)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#10b981" }} />
          Betting market
        </span>
        <span className="text-zinc-400 dark:text-white/35">
          Dot size = sample size · bars = 95% CI
        </span>
      </figcaption>
    </figure>
  );
}
