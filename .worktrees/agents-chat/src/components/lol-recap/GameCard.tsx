// LoL RECAP — 게임 1개 카드 (헤더 + 진영/킬 + 타임라인 + MVP/LVP + 선수 통계)

import type { LolRecapGameContext } from "@/lib/sports/lol-recap-context";
import TimelineCard from "./TimelineCard";
import MvpLvpCards from "./MvpLvpCards";
import PlayerStatsTable from "./PlayerStatsTable";

interface Props {
  game: LolRecapGameContext;
  team1NameKo: string;
  team2NameKo: string;
}

function durationLabel(sec: number): string {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sideLabel(side?: string): string {
  if (!side) return "";
  if (side.toLowerCase().includes("blue") || side === "1") return "블루";
  if (side.toLowerCase().includes("red") || side === "2") return "레드";
  return side;
}

export default function GameCard({ game, team1NameKo, team2NameKo }: Props) {
  const winnerName = game.winner === "team1" ? team1NameKo : team2NameKo;
  const winnerSide = game.winner === "team1" ? game.team1.side : game.team2.side;
  const mvp = game.players.find((p) => p.isMvp);
  const lvp = game.players.find((p) => p.isLvp);

  return (
    <section
      aria-label={`게임 ${game.gameNumber} 결과`}
      className="my-6 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden"
    >
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-rose-500/10 via-fuchsia-500/10 to-indigo-500/10 dark:from-rose-500/15 dark:via-fuchsia-500/15 dark:to-indigo-500/15 px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-black tracking-tight">
            게임 {game.gameNumber}
          </span>
          <span className="text-xs text-neutral-500 tabular-nums">
            {durationLabel(game.durationSec)}
          </span>
        </div>
        <div className="text-sm font-bold">
          <span className="text-emerald-700 dark:text-emerald-400">{winnerName}</span>
          {winnerSide && (
            <span className="text-neutral-500 font-medium ml-1.5">
              ({sideLabel(winnerSide)} 진영)
            </span>
          )}
          <span className="text-neutral-500 ml-2">승</span>
        </div>
      </div>

      {/* 양 팀 킬 스코어 */}
      <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-around text-center">
        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">{team1NameKo}</div>
          <div
            className={`text-2xl font-black tabular-nums ${game.winner === "team1" ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500"}`}
          >
            {game.team1.kills}
          </div>
          {game.team1.side && (
            <div className="text-[10px] text-neutral-400 mt-0.5">
              {sideLabel(game.team1.side)}
            </div>
          )}
        </div>
        <div className="text-xl font-bold text-neutral-400">vs</div>
        <div>
          <div className="text-[11px] text-neutral-500 mb-0.5">{team2NameKo}</div>
          <div
            className={`text-2xl font-black tabular-nums ${game.winner === "team2" ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500"}`}
          >
            {game.team2.kills}
          </div>
          {game.team2.side && (
            <div className="text-[10px] text-neutral-400 mt-0.5">
              {sideLabel(game.team2.side)}
            </div>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="p-5 space-y-4">
        {game.timeline.length > 0 && (
          <TimelineCard
            events={game.timeline}
            team1NameKo={team1NameKo}
            team2NameKo={team2NameKo}
          />
        )}
        {mvp && lvp && (
          <MvpLvpCards mvp={mvp} lvp={lvp} gameNumber={game.gameNumber} />
        )}
        <PlayerStatsTable
          players={game.players}
          team1NameKo={team1NameKo}
          team2NameKo={team2NameKo}
        />
      </div>
    </section>
  );
}
