// 축구 매치 카드의 하단 진행 정보.
// 분 표시 + 진행률 바 (0~90+).

export interface SoccerContext {
  /** 경기 분 (0~90+) */
  minute?: number | null;
  /** "1H" "2H" "HT" "FT" "ET" 등 — api-football status.short */
  halfLabel?: string | null;
}

interface Props {
  ctx: SoccerContext;
}

function halfText(short?: string | null): string {
  switch (short) {
    case "1H":
      return "전반";
    case "2H":
      return "후반";
    case "HT":
      return "하프타임";
    case "ET":
      return "연장";
    case "FT":
      return "종료";
    case "LIVE":
      return "진행 중";
    default:
      return short ?? "";
  }
}

export default function SoccerMiniBoard({ ctx }: Props) {
  const { minute, halfLabel } = ctx;
  if (minute == null && !halfLabel) return null;

  const half = halfText(halfLabel);
  const pct = Math.min(100, ((minute ?? 0) / 90) * 100);

  return (
    <div className="space-y-1.5 text-[11px]">
      <div className="flex items-center justify-between text-neutral-500">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
          {minute != null ? `${minute}'` : ""} {half}
        </span>
        <span className="text-neutral-400">90&apos;</span>
      </div>
      <div className="h-1 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
