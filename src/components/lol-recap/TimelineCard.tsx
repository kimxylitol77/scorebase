// LoL RECAP — 게임 타임라인 (오브젝트 이벤트 시계열)

import type { TimelineEvent } from "@/lib/sports/lol-timeline";

interface Props {
  events: TimelineEvent[];
  team1NameKo: string;
  team2NameKo: string;
}

export default function TimelineCard({ events, team1NameKo, team2NameKo }: Props) {
  if (events.length === 0) return null;
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4">
      <div className="text-xs font-bold tracking-[0.15em] uppercase text-neutral-500 mb-3">
        타임라인
      </div>
      <ol className="space-y-1.5">
        {events.map((e, idx) => {
          const teamName = e.team === "team1" ? team1NameKo : team2NameKo;
          const isWin = e.type === "game_end";
          return (
            <li
              key={`${e.type}-${idx}`}
              className="flex items-center gap-2.5 text-sm"
            >
              <span className="text-lg leading-none w-6 text-center" aria-hidden>
                {e.emoji}
              </span>
              {e.estimatedMinute != null && (
                <span className="text-[11px] tabular-nums text-neutral-400 w-10">
                  ~{Math.round(e.estimatedMinute)}분
                </span>
              )}
              <span
                className={`font-medium ${isWin ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-neutral-800 dark:text-neutral-200"}`}
              >
                {e.labelKo}
              </span>
              <span className="text-neutral-500">·</span>
              <span className="font-semibold text-neutral-900 dark:text-white">
                {teamName}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
