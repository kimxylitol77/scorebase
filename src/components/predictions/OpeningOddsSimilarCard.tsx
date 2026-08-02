// 오프닝 배당이 비슷했던 과거 경기의 실제 결과 분포 카드 — 야구 3리그.
// 데이터·판정은 lib/predict/opening-odds-similar.ts 가 단일 출처. 여기는 표시만 한다.

import type { OpeningSimilarStats } from "@/lib/predict/opening-odds-similar";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function OpeningOddsSimilarCard({ stats }: { stats: OpeningSimilarStats }) {
  const {
    targetImplied,
    band,
    sampleSize,
    homeWins,
    awayWins,
    draws,
    actualHomeWinRate,
    decisiveSample,
    marketAvgImplied,
    gapPoints,
  } = stats;

  // 3%p 미만은 표본 오차와 구분하기 어려워 "대체로 맞았다" 로 읽는다.
  const verdict =
    Math.abs(gapPoints) < 3
      ? { text: "시장 예상과 실제 결과가 대체로 일치했다", tone: "neutral" as const }
      : gapPoints > 0
        ? { text: `시장이 홈을 ${gapPoints.toFixed(1)}%p 과소평가했다`, tone: "home" as const }
        : { text: `시장이 홈을 ${Math.abs(gapPoints).toFixed(1)}%p 과대평가했다`, tone: "away" as const };

  return (
    <div className="rounded-[28px] bg-neutral-100/70 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl p-5 sm:p-6 space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          오프닝 배당이 비슷했던 경기
        </h3>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
          {sampleSize}경기
        </span>
      </div>

      <p className="text-[12px] leading-relaxed text-neutral-600 dark:text-neutral-300">
        이 경기의 오프닝 홈 승리 확률은{" "}
        <strong className="tabular-nums text-neutral-900 dark:text-neutral-50">
          {pct(targetImplied)}
        </strong>{" "}
        였다. 같은 리그에서 오프닝이 ±{(band * 100).toFixed(0)}%p 안으로 비슷했던 과거 경기를 모아
        실제 결과를 세어봤다.
      </p>

      <div className="space-y-3">
        <Bar label="시장이 본 홈 승리 확률" value={marketAvgImplied} tone="market" />
        <Bar
          label={draws > 0 ? "실제 홈 승리 비율 (무승부 제외)" : "실제 홈 승리 비율"}
          value={actualHomeWinRate}
          tone="actual"
        />
      </div>

      <div className="flex items-center gap-2 text-[11px] tabular-nums text-neutral-600 dark:text-neutral-300">
        <span className="rounded-full bg-white/70 dark:bg-white/[0.06] px-2 py-0.5">
          홈승 {homeWins}
        </span>
        <span className="rounded-full bg-white/70 dark:bg-white/[0.06] px-2 py-0.5">
          원정승 {awayWins}
        </span>
        {draws > 0 && (
          <span className="rounded-full bg-white/70 dark:bg-white/[0.06] px-2 py-0.5">
            무승부 {draws}
          </span>
        )}
      </div>

      <div
        className={`rounded-2xl px-4 py-3 text-[12px] font-semibold ${
          verdict.tone === "home"
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300"
            : verdict.tone === "away"
              ? "bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300"
              : "bg-white/70 text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300"
        }`}
      >
        {verdict.text}
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        과거 표본의 경향이며 이 경기의 결과를 보장하지 않는다.{" "}
        {draws > 0
          ? `표본 ${sampleSize}경기 기준, 승률은 무승부 ${draws}경기를 뺀 ${decisiveSample}경기 기준(오프닝 배당은 무승부에 걸 수 없어 홈·원정 둘로만 나뉘므로 기준을 맞췄다).`
          : `표본 ${sampleSize}경기 기준.`}
      </p>
    </div>
  );
}

function Bar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "market" | "actual";
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {label}
        </span>
        <span className="text-[13px] font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
          {pct(value)}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            tone === "market" ? "bg-neutral-400 dark:bg-neutral-500" : "bg-emerald-500"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );
}
