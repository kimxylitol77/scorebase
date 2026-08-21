// 오버/언더 시각화 컴포넌트 묶음 — /over-under 페이지 전용, 전부 서버 컴포넌트.
//
// 색은 발산형 한 쌍이다. 오버(따뜻·주황) ↔ 리그 평균(중립 회색) ↔ 언더(차가움·파랑).
// 라이트 #ea7317/#2563eb, 다크 #fb923c/#60a5fa 로 각 표면에서 따로 검증했다
// (CVD 분리 ΔE 25.8~32.4, 대비 3:1 이상 — dataviz 검증 스크립트).
// 색만으로 의미를 전달하지 않도록 모든 막대에 수치를 직접 라벨로 붙인다.

/** 오버 쪽 색(따뜻) — 라이트/다크 각각의 스텝 */
export const OVER_HUE = "text-[#ea7317] dark:text-[#fb923c]";
export const UNDER_HUE = "text-[#2563eb] dark:text-[#60a5fa]";
const OVER_FILL = "bg-[#ea7317] dark:bg-[#fb923c]";
const UNDER_FILL = "bg-[#2563eb] dark:bg-[#60a5fa]";

const fmt1 = (v: number) => v.toFixed(1);

/**
 * 리그 평균을 0으로 놓고 팀이 위/아래로 얼마나 벗어났는지 보여주는 발산형 막대.
 * 가운데 축이 리그 평균이라 "이 팀이 리그에서 오버 쪽인가 언더 쪽인가"가 한눈에 읽힌다.
 */
export function DivergingBar({
  label,
  value,
  average,
  maxDelta,
  detail,
}: {
  label: string;
  value: number;
  average: number;
  maxDelta: number;
  detail: string;
}) {
  const delta = value - average;
  const isOver = delta >= 0;
  // 최대 편차를 반폭(50%)에 대응시킨다. 0 나눗셈과 과도한 폭을 함께 막는다.
  const width = maxDelta > 0 ? Math.min(50, (Math.abs(delta) / maxDelta) * 50) : 0;

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-[3px]">
      <span className="w-24 sm:w-36 shrink-0 truncate text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
      <div className="relative flex-1 h-5">
        {/* 리그 평균선 — 데이터가 아니라 기준선이라 눈에 덜 띄게 둔다 */}
        <span className="absolute left-1/2 top-0 h-full w-px bg-neutral-300 dark:bg-neutral-700" aria-hidden />
        <span
          className={`absolute top-[2px] h-[16px] ${isOver ? OVER_FILL : UNDER_FILL}`}
          style={{
            left: isOver ? "50%" : `${50 - width}%`,
            width: `${width}%`,
            // 데이터가 끝나는 쪽만 둥글게 — 기준선에 붙은 쪽은 각지게 유지한다
            borderRadius: isOver ? "0 4px 4px 0" : "4px 0 0 4px",
          }}
          title={`${label} — ${detail}`}
        />
      </div>
      <span className="w-14 sm:w-16 shrink-0 text-right text-xs sm:text-sm font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {fmt1(value)}%
      </span>
      <span
        className={`w-12 shrink-0 text-right text-[11px] sm:text-xs tabular-nums ${isOver ? OVER_HUE : UNDER_HUE}`}
      >
        {isOver ? "+" : "−"}
        {fmt1(Math.abs(delta))}
      </span>
    </div>
  );
}

/** 값 하나를 크게 보여주는 타일 — 차트로 만들 필요가 없는 헤드라인 숫자용. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "over" | "under" | "neutral";
}) {
  const toneCls =
    tone === "over" ? OVER_HUE : tone === "under" ? UNDER_HUE : "text-neutral-900 dark:text-neutral-100";
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/60 px-4 py-3">
      <div className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className={`mt-1 text-xl sm:text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-500">{sub}</div> : null}
    </div>
  );
}

/**
 * 오버 비율 한 줄을 채움 막대로. 리그 목록처럼 값이 모두 0~100% 인 경우에 쓴다.
 * 채움 색은 평균 위/아래에 따라 발산형 두 극 중 하나를 고른다.
 */
export function RatioBar({ value, average }: { value: number; average: number }) {
  const isOver = value >= average;
  return (
    <span className="relative block h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800">
      <span
        className={`absolute left-0 top-0 h-2 rounded-full ${isOver ? OVER_FILL : UNDER_FILL}`}
        style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
      />
    </span>
  );
}

/**
 * 리그 오버 비율 분포 히스토그램 (SVG).
 * 우리가 커버하는 리그가 어느 구간에 몰려 있는지 보여주고, 특정 리그 위치를 표시한다.
 */
export function DistributionChart({
  values,
  highlight,
  highlightLabel,
}: {
  values: number[];
  highlight?: number;
  highlightLabel?: string;
}) {
  const MIN = 25;
  const MAX = 80;
  const BUCKET = 5;
  const buckets: number[] = [];
  for (let x = MIN; x < MAX; x += BUCKET) {
    buckets.push(values.filter((v) => v >= x && v < x + BUCKET).length);
  }
  const peak = Math.max(1, ...buckets);
  const W = 720;
  const H = 190;
  const PAD_L = 30;
  const PAD_B = 26;
  const plotW = W - PAD_L - 10;
  const plotH = H - PAD_B - 12;
  const bw = plotW / buckets.length;
  const xOf = (v: number) => PAD_L + ((v - MIN) / (MAX - MIN)) * plotW;

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`리그별 오버 2.5 비율 분포. ${values.length}개 리그.`}
      >
        {/* 기준 눈금 — 배경 역할이라 옅게 */}
        {[30, 40, 50, 60, 70, 80].map((t) => (
          <g key={t}>
            <line
              x1={xOf(t)} x2={xOf(t)} y1={12} y2={12 + plotH}
              className="stroke-neutral-200 dark:stroke-neutral-800" strokeWidth={1}
            />
            <text
              x={xOf(t)} y={H - 8} textAnchor="middle"
              className="fill-neutral-500 dark:fill-neutral-500" fontSize={11}
            >
              {t}%
            </text>
          </g>
        ))}
        {buckets.map((c, i) => {
          const h = (c / peak) * plotH;
          const x = PAD_L + i * bw;
          const mid = MIN + i * BUCKET + BUCKET / 2;
          return (
            <rect
              key={i}
              x={x + 1}
              y={12 + plotH - h}
              width={Math.max(1, bw - 2)}
              height={h}
              rx={4}
              className={mid >= 50 ? "fill-[#ea7317] dark:fill-[#fb923c]" : "fill-[#2563eb] dark:fill-[#60a5fa]"}
              opacity={0.85}
            >
              <title>{`${mid - BUCKET / 2}~${mid + BUCKET / 2}% 구간 — ${c}개 리그`}</title>
            </rect>
          );
        })}
        {highlight != null ? (
          <g>
            <line
              x1={xOf(highlight)} x2={xOf(highlight)} y1={6} y2={12 + plotH}
              className="stroke-neutral-900 dark:stroke-neutral-100" strokeWidth={2}
            />
            <text
              x={Math.min(W - 60, Math.max(PAD_L, xOf(highlight)))} y={6}
              textAnchor="middle" dominantBaseline="hanging"
              className="fill-neutral-900 dark:fill-neutral-100" fontSize={11} fontWeight={700}
            >
              {highlightLabel}
            </text>
          </g>
        ) : null}
      </svg>
      <figcaption className="mt-1 text-center text-[11px] text-neutral-500 dark:text-neutral-500">
        가로축은 오버 2.5 비율, 세로 높이는 해당 구간에 속한 리그 수입니다.
      </figcaption>
    </figure>
  );
}

/** 두 극이 무엇을 뜻하는지 알려 주는 범례 — 색만으로 의미를 전달하지 않기 위해 항상 붙인다. */
export function OverUnderLegend({ average }: { average: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] sm:text-xs text-neutral-600 dark:text-neutral-400">
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${OVER_FILL}`} aria-hidden />
        리그 평균보다 오버가 잦음
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`inline-block h-2.5 w-2.5 rounded-sm ${UNDER_FILL}`} aria-hidden />
        리그 평균보다 언더가 잦음
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-px bg-neutral-400 dark:bg-neutral-600" aria-hidden />
        가운데 선 = 리그 평균 {fmt1(average)}%
      </span>
    </div>
  );
}
