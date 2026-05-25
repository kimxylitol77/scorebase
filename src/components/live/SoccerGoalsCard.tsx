// 골 전용 카드 — BeSoccer 스타일.
// 행 구조: [HOME 칸] [분] [⚽ 선수 / 👟 어시 + 아바타]  (어웨이 골이면 좌우 반전)

import Image from "next/image";
import { toKoreanPlayerName } from "@/lib/player-names";

interface SoccerEvent {
  minute: number;
  extra: number;
  type: "goal" | "card" | "subst" | "var";
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
  playerId?: string | null;
  assistId?: string | null;
}

interface Props {
  events: SoccerEvent[];
  homeNameKo: string;
  awayNameKo: string;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  playerLogoById?: Record<string, string>;
}

function localize(name: string | null | undefined): string {
  if (!name) return "—";
  if (/[가-힣]/.test(name)) return name;
  return toKoreanPlayerName(name) || name;
}

function timeLabel(ev: SoccerEvent): string {
  return ev.extra > 0 ? `${ev.minute}+${ev.extra}'` : `${ev.minute}'`;
}

function goalLabel(detail: string): string {
  if (detail === "Own Goal") return "자책골";
  if (detail === "Penalty") return "PK 골";
  if (detail === "Missed Penalty") return "PK 실축";
  if (detail === "Penalty Shootout") return "PK 슛아웃";
  if (detail === "Extra Time Goal") return "연장 골";
  return "";
}

function PlayerAvatar({
  id,
  name,
  teamLogo,
  logoById,
}: {
  id: string | null | undefined;
  name: string | null;
  teamLogo?: string | null;
  logoById?: Record<string, string>;
}) {
  const url = id ? logoById?.[id] : undefined;
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      {url ? (
        <Image
          src={url}
          alt={name ?? "player"}
          width={40}
          height={40}
          className="rounded-full bg-neutral-100 dark:bg-neutral-900 object-cover w-10 h-10 border-2 border-white dark:border-neutral-900 shadow"
          unoptimized
        />
      ) : (
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 text-sm font-bold text-neutral-600 dark:text-neutral-300 border-2 border-white dark:border-neutral-900 shadow">
          {name ? name.trim()[0]?.toUpperCase() ?? "?" : "?"}
        </span>
      )}
      {teamLogo && (
        <Image
          src={teamLogo}
          alt=""
          width={14}
          height={14}
          className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800"
          unoptimized
        />
      )}
    </div>
  );
}

export default function SoccerGoalsCard({
  events,
  homeNameKo: _homeNameKo,
  awayNameKo: _awayNameKo,
  homeLogoUrl,
  awayLogoUrl,
  playerLogoById,
}: Props) {
  const goals = events.filter((e) => e.type === "goal");
  if (goals.length === 0) return null;
  // 시간 오름차순 (BeSoccer 처럼 33', 44', 48' 순)
  const sorted = [...goals].sort((a, b) => (a.minute * 100 + a.extra) - (b.minute * 100 + b.extra));

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      <header className="px-3 sm:px-4 py-2 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-100 dark:border-neutral-800">
        <h2 className="text-sm font-bold tracking-wide">GOALS</h2>
      </header>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
        {sorted.map((g, i) => {
          const playerKo = localize(g.playerName);
          const assistKo = g.assistName ? localize(g.assistName) : null;
          const label = goalLabel(g.detail);
          const teamLogo = g.side === "home" ? homeLogoUrl : awayLogoUrl;
          const playerBlock = (
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 dark:text-emerald-400 text-base">⚽</span>
                  <span className="font-semibold truncate">{playerKo}</span>
                  {label && (
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium ml-1">
                      {label}
                    </span>
                  )}
                </div>
                {assistKo && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-neutral-500">
                    <span>👟</span>
                    <span className="truncate">{assistKo}</span>
                  </div>
                )}
              </div>
            </div>
          );
          return (
            <li
              key={i}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 sm:px-4 py-2.5"
            >
              {/* HOME 칸 */}
              {g.side === "home" ? (
                <>
                  <div className="flex items-center gap-3 min-w-0 justify-end">
                    <PlayerAvatar
                      id={g.playerId}
                      name={g.playerName}
                      teamLogo={teamLogo}
                      logoById={playerLogoById}
                    />
                    <div className="text-right min-w-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        {label && (
                          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                            {label}
                          </span>
                        )}
                        <span className="font-semibold truncate">{playerKo}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 text-base">⚽</span>
                      </div>
                      {assistKo && (
                        <div className="flex items-center gap-1.5 justify-end mt-0.5 text-xs text-neutral-500">
                          <span className="truncate">{assistKo}</span>
                          <span>👟</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm min-w-[44px] text-center">
                    {timeLabel(g)}
                  </div>
                  <div />
                </>
              ) : (
                <>
                  <div />
                  <div className="tabular-nums font-bold text-emerald-700 dark:text-emerald-400 text-sm min-w-[44px] text-center">
                    {timeLabel(g)}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    {playerBlock}
                    <PlayerAvatar
                      id={g.playerId}
                      name={g.playerName}
                      teamLogo={teamLogo}
                      logoById={playerLogoById}
                    />
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
