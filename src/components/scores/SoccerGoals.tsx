// 매치 카드 mini board 영역 — 축구 골 list (분 + 선수 + 자책/PK 표시).
// LIVE/FINISHED 매치 모두 사용. ESPN scoreboard details (scoringPlay) 기반.

import type { SoccerGoal } from "@/lib/sports/live-scores";

interface Props {
  goals: SoccerGoal[];
  awayLabel: string;
  homeLabel: string;
}

export default function SoccerGoals({ goals, awayLabel, homeLabel }: Props) {
  if (!goals || goals.length === 0) return null;

  // 시간 순 정렬 (분 숫자 추출, "45+2'" → 45+2=47)
  const parseMinute = (m: string): number => {
    const mm = m.match(/(\d+)(?:\+(\d+))?/);
    if (!mm) return 0;
    return parseInt(mm[1], 10) + (mm[2] ? parseInt(mm[2], 10) : 0);
  };
  const sorted = [...goals].sort(
    (a, b) => parseMinute(a.minute) - parseMinute(b.minute),
  );

  return (
    <div className="px-3.5 sm:px-4 py-2 text-xs space-y-1">
      {sorted.map((g, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="tabular-nums text-neutral-400 w-9 shrink-0 text-right">
            {g.minute}
          </span>
          <span aria-hidden>{g.ownGoal ? "🔁" : g.penaltyKick ? "🎯" : "⚽"}</span>
          <span
            className={`font-medium truncate ${
              g.side === "away"
                ? "text-neutral-700 dark:text-neutral-300"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            {g.player || "—"}
          </span>
          {g.ownGoal && (
            <span className="text-[10px] text-neutral-400">자책</span>
          )}
          {g.penaltyKick && (
            <span className="text-[10px] text-neutral-400">PK</span>
          )}
          <span className="ml-auto text-[10px] text-neutral-500 truncate">
            {g.side === "away" ? awayLabel : homeLabel}
          </span>
        </div>
      ))}
    </div>
  );
}
