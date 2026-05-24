/** AI 모델 vs 시장 평균 진행률 바 비교. */

interface Props {
  aiProb: number; // 0~1
  marketProb: number; // 0~1
  /** 매치 한쪽 라벨 — 예: "롯데 자이언츠 승" */
  outcomeLabel: string;
}

export default function ProbBars({ aiProb, marketProb, outcomeLabel }: Props) {
  const aiPct = Math.round(aiProb * 100);
  const marketPct = Math.round(marketProb * 100);

  return (
    <div className="insight-card relative z-10 space-y-3">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
        승률 비교 · {outcomeLabel}
      </div>
      <Row label="AI 모델" pct={aiPct} variant="green" />
      <Row label="시장 평균" pct={marketPct} variant="gray" />
    </div>
  );
}

function Row({
  label,
  pct,
  variant,
}: {
  label: string;
  pct: number;
  variant: "green" | "cyan" | "gray";
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold text-[var(--insight-text-2)]">
          {label}
        </span>
        <span className="tabular-nums text-[13px] font-black text-[var(--insight-text)]">
          {pct}%
        </span>
      </div>
      <div className="insight-bar-track">
        <div
          className={`insight-bar-fill ${variant}`}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
