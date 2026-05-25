// 축구 momentum trend chart — TheSports /v1/football/match/trend/detail.
// 응답: { count, per, data: [[전반 분당 값들], [후반 분당 값들]] }
// 값 -100~+100 (home 양수, away 음수, 1분 단위 momentum).
// 의존성 없는 SVG 영역 차트 + 0선 기준 위/아래 그라데이션.

interface Props {
  trend: {
    count?: number;
    per?: number;
    data?: number[][];
  };
  homeNameKo: string;
  awayNameKo: string;
}

const W = 600;
const H = 160;
const PAD_X = 8;
const PAD_Y = 6;

export default function MatchTrendChart({ trend, homeNameKo, awayNameKo }: Props) {
  const halves = Array.isArray(trend?.data) ? trend.data.filter(Array.isArray) : [];
  if (halves.length === 0) return null;

  const flat = halves.flat().filter((v): v is number => typeof v === "number");
  if (flat.length === 0) return null;

  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const total = halves.reduce((s, arr) => s + arr.length, 0);
  if (total < 2) return null;

  const stepX = innerW / (total - 1);
  const midY = PAD_Y + innerH / 2;
  const halfH = innerH / 2;

  const yOf = (v: number) => midY - (Math.max(-100, Math.min(100, v)) / 100) * halfH;
  const xOf = (i: number) => PAD_X + i * stepX;

  let idx = 0;
  const points: Array<{ x: number; y: number; v: number }> = [];
  for (const arr of halves) {
    for (const v of arr) {
      if (typeof v === "number") {
        points.push({ x: xOf(idx), y: yOf(v), v });
      }
      idx++;
    }
  }
  if (points.length < 2) return null;

  // 면 path — 좌하단 → 점들 → 우하단으로 닫음 (수직 그라데이션 위/아래 시각화).
  const areaPath =
    `M ${points[0].x} ${midY} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${points[points.length - 1].x} ${midY} Z`;

  const linePath =
    `M ${points[0].x} ${points[0].y} ` +
    points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");

  // 전반/후반 구분선 — 전반 길이 - 1 위치 (인덱스 기반).
  const halftimeX =
    halves.length >= 2 && halves[0].length > 0
      ? xOf(halves[0].length - 1) + stepX / 2
      : null;

  // 누적 합 — 어느 팀이 우세였는지 한 줄 요약.
  const sumAll = flat.reduce((s, v) => s + v, 0);
  const sumP1 = (halves[0] ?? []).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
  const sumP2 = (halves[1] ?? []).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">
          경기 흐름 (Momentum)
        </h2>
        <span className="text-[11px] text-neutral-500">TheSports trend</span>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-semibold truncate">
          {homeNameKo}
        </div>
        <div className="text-neutral-500 text-[10px]">분당 momentum</div>
        <div className="text-left text-blue-600 dark:text-blue-400 font-semibold truncate">
          {awayNameKo}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-[160px]"
        role="img"
        aria-label={`${homeNameKo} vs ${awayNameKo} momentum trend`}
      >
        <defs>
          <linearGradient id="trend-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(244 63 94)" stopOpacity="0.55" />
            <stop offset="50%" stopColor="rgb(244 63 94)" stopOpacity="0" />
            <stop offset="50%" stopColor="rgb(59 130 246)" stopOpacity="0" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* 0 기준선 */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={midY}
          y2={midY}
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="1"
        />

        {/* 전반·후반 구분선 */}
        {halftimeX !== null && (
          <line
            x1={halftimeX}
            x2={halftimeX}
            y1={PAD_Y}
            y2={H - PAD_Y}
            stroke="currentColor"
            strokeOpacity="0.25"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* 면 */}
        <path d={areaPath} fill="url(#trend-gradient)" />

        {/* 선 */}
        <path
          d={linePath}
          fill="none"
          stroke="rgb(120 113 108)"
          strokeOpacity="0.6"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
        <div className="text-center">
          <div className="text-neutral-500">전반 합</div>
          <div className={sumP1 >= 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-blue-600 dark:text-blue-400 font-bold"}>
            {sumP1 > 0 ? "+" : ""}{sumP1}
          </div>
        </div>
        <div className="text-center">
          <div className="text-neutral-500">후반 합</div>
          <div className={sumP2 >= 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-blue-600 dark:text-blue-400 font-bold"}>
            {sumP2 > 0 ? "+" : ""}{sumP2}
          </div>
        </div>
        <div className="text-center">
          <div className="text-neutral-500">전체 합</div>
          <div className={sumAll >= 0 ? "text-rose-600 dark:text-rose-400 font-bold" : "text-blue-600 dark:text-blue-400 font-bold"}>
            {sumAll > 0 ? "+" : ""}{sumAll}
          </div>
        </div>
      </div>
    </section>
  );
}
