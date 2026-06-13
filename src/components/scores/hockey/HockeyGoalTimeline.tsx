// 하키 골 타임라인 — TheSports detailLive.incidents (type 2=골, 3=페널티).
// 득점자·어시스트는 player_id → 한글(nhl-live-names). second(누적초) → P{n} MM:SS 환산.

import { nhlPlayerKo } from "@/lib/sports/nhl-live-names";

export interface HockeyIncident {
  type: number;
  second?: number;
  position?: number; // 1=home, 2=away
  player_id?: string;
  assists1_id?: string;
  assists2_id?: string;
  home_score?: number;
  away_score?: number;
  card_minute?: number;
}

interface Props {
  incidents: HockeyIncident[];
  homeNameKo: string;
  awayNameKo: string;
}

function periodTime(second: number): string {
  const P = 1200; // 정규 피리어드 20분
  if (second <= 3 * P) {
    const period = Math.floor(second / P) + (second % P === 0 && second > 0 ? 0 : 1);
    const p = Math.min(period, 3);
    const inP = second - (p - 1) * P;
    return `P${p} ${Math.floor(inP / 60)}:${String(inP % 60).padStart(2, "0")}`;
  }
  const inOt = second - 3 * P;
  return `OT ${Math.floor(inOt / 60)}:${String(inOt % 60).padStart(2, "0")}`;
}

export default function HockeyGoalTimeline({ incidents, homeNameKo, awayNameKo }: Props) {
  const goals = (incidents ?? [])
    .filter((i) => i.type === 2)
    .sort((a, b) => (a.second ?? 0) - (b.second ?? 0));
  if (goals.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">골 타임라인</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      <ul className="space-y-2">
        {goals.map((g, i) => {
          const home = g.position === 1;
          const scorer = nhlPlayerKo(g.player_id) || "—";
          const assists = [nhlPlayerKo(g.assists1_id), nhlPlayerKo(g.assists2_id)]
            .filter(Boolean)
            .join(", ");
          return (
            <li
              key={i}
              className={`flex items-center gap-2 text-xs ${home ? "flex-row" : "flex-row-reverse text-right"}`}
            >
              <span className="tabular-nums text-neutral-400 w-16 shrink-0">
                {periodTime(g.second ?? 0)}
              </span>
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${home ? "bg-rose-500" : "bg-blue-500"}`}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="font-bold">🥅 {scorer}</span>
                {assists && (
                  <span className="text-neutral-500"> · {assists}</span>
                )}
              </span>
              <span className="tabular-nums font-bold text-neutral-700 dark:text-neutral-300 shrink-0">
                {g.home_score}-{g.away_score}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-neutral-400">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 align-middle mr-1" />
        {homeNameKo}
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle ml-3 mr-1" />
        {awayNameKo} · 괄호는 어시스트
      </p>
    </section>
  );
}
