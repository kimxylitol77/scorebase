// scores__SoccerMiniBoard (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

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
      return "1st half";
    case "2H":
      return "2nd half";
    case "HT":
      return "Half-time";
    case "ET":
      return "Extra time";
    case "FT":
      return "FT";
    case "LIVE":
      return "Live";
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
