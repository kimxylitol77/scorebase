// 우리 모델이 비슷한 확률로 봤던 과거 경기의 실제 결과 분포 카드 — 축구.
// 데이터·판정은 lib/predict/model-calibration-similar.ts 가 단일 출처. 여기는 표시만 한다.

import type { ModelCalibrationStats } from "@/lib/predict/model-calibration-similar";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function ModelCalibrationCard({
  stats,
  homeNameKo,
  awayNameKo,
}: {
  stats: ModelCalibrationStats;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const {
    targetHomeProb,
    band,
    sampleSize,
    homeWins,
    draws,
    awayWins,
    modelAvgHome,
    actualHomeRate,
    actualDrawRate,
    actualAwayRate,
    gapPoints,
  } = stats;

  // 3%p 미만은 표본 오차와 구분하기 어려워 "대체로 맞았다" 로 읽는다.
  const verdict =
    Math.abs(gapPoints) < 3
      ? `모델이 본 확률과 실제 결과가 대체로 일치했다`
      : gapPoints > 0
        ? `이 확률대에서 모델은 홈을 ${gapPoints.toFixed(1)}%p 낮게 봤다 — 실제로는 더 자주 이겼다`
        : `이 확률대에서 모델은 홈을 ${Math.abs(gapPoints).toFixed(1)}%p 높게 봤다 — 실제로는 덜 이겼다`;

  return (
    <div className="rounded-[28px] bg-neutral-100/70 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl p-5 sm:p-6 space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          모델이 비슷하게 봤던 경기
        </h3>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
          {sampleSize}경기
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-300">
        이 경기에서 모델이 본 {homeNameKo} 승리 확률은{" "}
        <strong className="tabular-nums text-neutral-900 dark:text-neutral-50">
          {pct(targetHomeProb)}
        </strong>
        였다. 축구 정규 리그에서 모델이 ±{(band * 100).toFixed(0)}%p 안으로 비슷하게 봤던 과거
        경기를 모아 실제로 어떻게 끝났는지 세어봤다.
      </p>

      {/* 실제 결과 3분할 */}
      <div className="space-y-2">
        <div className="flex h-7 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
          <div
            className="flex items-center justify-center bg-blue-500 dark:bg-blue-500/80"
            style={{ width: `${actualHomeRate * 100}%` }}
          >
            {actualHomeRate >= 0.12 && pct(actualHomeRate)}
          </div>
          <div
            className="flex items-center justify-center bg-neutral-400 dark:bg-neutral-600"
            style={{ width: `${actualDrawRate * 100}%` }}
          >
            {actualDrawRate >= 0.12 && pct(actualDrawRate)}
          </div>
          <div
            className="flex items-center justify-center bg-rose-500 dark:bg-rose-500/80"
            style={{ width: `${actualAwayRate * 100}%` }}
          >
            {actualAwayRate >= 0.12 && pct(actualAwayRate)}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
          <span>
            <span className="text-blue-600 dark:text-blue-400">홈 승</span> {homeWins}
          </span>
          <span>무승부 {draws}</span>
          <span>
            <span className="text-rose-600 dark:text-rose-400">원정 승</span> {awayWins}
          </span>
        </div>
      </div>

      {/* 모델이 본 값 vs 실제 */}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] px-3 py-2.5">
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">모델이 본 홈 승률</div>
          <div className="text-[15px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
            {pct(modelAvgHome)}
          </div>
        </div>
        <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] px-3 py-2.5">
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">실제 홈 승률</div>
          <div className="text-[15px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
            {pct(actualHomeRate)}
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl px-4 py-3 text-[12px] font-semibold ${
          Math.abs(gapPoints) < 3
            ? "bg-white/70 text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300"
            : gapPoints > 0
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300"
              : "bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300"
        }`}
      >
        {verdict}
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        과거 표본의 경향이며 이 경기({homeNameKo} 대 {awayNameKo})의 결과를 보장하지 않는다. 표본은 축구
        정규 리그 종료 경기 {sampleSize}건 기준이며, 승부차기가 붙는 컵·토너먼트와 친선은 90분
        결과가 아니라 제외했다.
      </p>
    </div>
  );
}
