/**
 * AI 추정 vs 시장 평균 격차 KPI 카드.
 * edge ≥ 5%p → "유의미 격차" + 초록 글로우
 * edge ≥ 2%p → "약한 격차" + 옅은 글로우
 * 그 외 → "시장과 일치" + 글로우 없음
 */

interface Props {
  /** "롯데 자이언츠 우세" 같은 한국어 표기 */
  pickLabel: string;
  /** AI 추정 승률 (0~1) */
  aiProb: number;
  /** 시장 추정 승률 (0~1) */
  marketProb: number;
}

function tier(edgePp: number): {
  cardCls: string;
  badge: string | null;
  edgeLabel: string;
  pickSub: string | null;
} {
  if (edgePp >= 5)
    return {
      cardCls: "insight-card glow-success",
      badge: "유의미 격차",
      edgeLabel: "시장 시각과 격차",
      pickSub: null,
    };
  if (edgePp >= 2)
    return {
      cardCls: "insight-card glow-soft",
      badge: "약한 격차",
      edgeLabel: "시장 시각과 격차",
      pickSub: null,
    };
  return {
    cardCls: "insight-card",
    badge: null,
    edgeLabel: "시장 평균 대비",
    pickSub: "AI와 시장 추정이 유사함",
  };
}

export default function AiValuePickCard({
  pickLabel,
  aiProb,
  marketProb,
}: Props) {
  const aiPct = Math.round(aiProb * 100);
  const marketPct = Math.round(marketProb * 100);
  const edgePp = aiPct - marketPct;
  const { cardCls, badge, edgeLabel, pickSub } = tier(Math.abs(edgePp));

  return (
    <div className={`${cardCls} relative z-10`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
          AI 추정 시각
        </span>
        {badge && <span className="insight-badge-strong">{badge}</span>}
      </div>
      <div className="text-[15px] font-bold text-[var(--insight-text)] mb-3">
        {pickLabel}
      </div>
      <div className="flex items-end gap-3 mb-3">
        <span className={`insight-big-number ${edgePp >= 2 ? "green" : ""}`}>
          {aiPct}
          <span className="text-[24px] align-top">%</span>
        </span>
        <div className="pb-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--insight-text-3)]">
            {edgeLabel}
          </div>
          <div
            className={`text-[14px] font-bold ${
              edgePp >= 2
                ? "text-[var(--insight-success)]"
                : "text-[var(--insight-text-2)]"
            }`}
          >
            {edgePp > 0 ? "+" : ""}
            {edgePp}%p
          </div>
        </div>
      </div>
      {pickSub ? (
        <p className="text-[11px] text-[var(--insight-text-3)]">{pickSub}</p>
      ) : (
        <p className="text-[11px] text-[var(--insight-text-3)]">
          AI 모델 {aiPct}% · 시장 평균 {marketPct}%
        </p>
      )}
    </div>
  );
}
