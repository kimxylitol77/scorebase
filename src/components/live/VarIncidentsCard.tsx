// VAR 판정 카드 — incidents 의 type=28 (VAR review) 만 모아서 별도 표시.
// 일반 타임라인에서 묻히지 않게 강조.

import { toKoreanPlayerName } from "@/lib/player-names";

interface SoccerEvent {
  minute: number;
  extra: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
}

interface Props {
  events: SoccerEvent[];
  homeNameKo: string;
  awayNameKo: string;
}

function localize(name: string | null | undefined): string | null {
  if (!name) return null;
  if (/[가-힣]/.test(name)) return name;
  return toKoreanPlayerName(name) || name;
}

export default function VarIncidentsCard({ events, homeNameKo, awayNameKo }: Props) {
  const vars = events.filter((e) => e.type === "var");
  if (vars.length === 0) return null;

  return (
    <section className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/30 dark:bg-purple-950/20 p-3 sm:p-4 space-y-2">
      <header className="flex items-center gap-2">
        <span className="text-base">📺</span>
        <h2 className="text-sm font-semibold text-purple-700 dark:text-purple-300">VAR 판정 ({vars.length}건)</h2>
      </header>
      <ul className="space-y-1.5">
        {vars.map((v, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="tabular-nums text-xs font-bold text-purple-600 dark:text-purple-400 min-w-[44px]">
              {v.minute}{v.extra > 0 ? `+${v.extra}` : ""}'
            </span>
            <span className="text-[11px] text-neutral-500 min-w-[60px]">
              {v.side === "home" ? homeNameKo : awayNameKo}
            </span>
            <span className="flex-1 text-neutral-700 dark:text-neutral-300">
              {localize(v.playerName) ?? "—"}
              <span className="ml-2 text-xs text-neutral-500">{v.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
