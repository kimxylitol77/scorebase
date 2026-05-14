/** 오늘의 핵심 변수 — 짧은 4줄 bullet. */

export interface Factor {
  /** "⚾", "🏟️" 같은 이모지 (옵션) */
  icon?: string;
  /** 메인 텍스트 */
  text: string;
  /** 보조 톤 — "긍정"=초록, "주의"=노랑, "중립"=회색 */
  tone?: "good" | "warn" | "neutral";
}

interface Props {
  factors: Factor[];
}

export default function KeyFactors({ factors }: Props) {
  return (
    <div className="insight-card relative z-10">
      <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--insight-text-3)] mb-3">
        오늘의 핵심 변수
      </div>
      <ul className="space-y-2">
        {factors.map((f, i) => {
          const toneCls =
            f.tone === "good"
              ? "text-[var(--insight-success)]"
              : f.tone === "warn"
                ? "text-[var(--insight-gold)]"
                : "text-[var(--insight-text-2)]";
          return (
            <li key={i} className="flex items-start gap-2.5 text-[13px]">
              <span
                aria-hidden
                className={`shrink-0 mt-0.5 ${toneCls}`}
                style={{ width: 16 }}
              >
                {f.icon ?? "•"}
              </span>
              <span className="leading-snug text-[var(--insight-text-2)]">
                {f.text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
