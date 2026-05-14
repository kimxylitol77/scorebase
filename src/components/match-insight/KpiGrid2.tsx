/** 예상 득점 합 / 오버언더 기준선 2개 KPI 카드. */

interface Props {
  expectedTotal: number;
  /** 시장 O/U 기준 (예: 8.5) */
  ouLine: number;
  /** AI 가 OVER 인지 UNDER 인지 */
  aiSide: "OVER" | "UNDER" | "PUSH";
}

export default function KpiGrid2({ expectedTotal, ouLine, aiSide }: Props) {
  const sideColor =
    aiSide === "OVER"
      ? "text-[var(--insight-success)]"
      : aiSide === "UNDER"
        ? "text-[var(--insight-cyan)]"
        : "text-[var(--insight-text-2)]";

  return (
    <div className="grid grid-cols-2 gap-3 relative z-10">
      <div className="insight-card">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
          AI 예상 득점 합
        </div>
        <div className="insight-big-number gold mt-2" style={{ fontSize: 38 }}>
          {expectedTotal.toFixed(1)}
        </div>
      </div>
      <div className="insight-card">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)]">
          오버언더 기준선
        </div>
        <div
          className="mt-2 font-black tabular-nums text-[var(--insight-text)]"
          style={{ fontSize: 38, lineHeight: 1 }}
        >
          {ouLine.toFixed(1)}
        </div>
        <div className={`text-[12px] font-bold mt-1 ${sideColor}`}>
          AI: {aiSide}
        </div>
      </div>
    </div>
  );
}
