// LoL RECAP — MVP/LVP 카드 2개 가로 배치

import type { MvpCandidate } from "@/lib/sports/lol-mvp-selector";
import { championKoreanName } from "@/lib/sports/leaguepedia";

interface Props {
  mvp: MvpCandidate;
  lvp: MvpCandidate;
  gameNumber: number;
}

function PlayerHeader({ p }: { p: MvpCandidate }) {
  const display = p.koreanName ?? p.playerName;
  const sub = p.realName
    ? `${p.playerName}, ${p.realName}`
    : p.koreanName
      ? p.playerName
      : "";
  return (
    <div>
      <div className="text-base font-black tracking-tight text-neutral-900 dark:text-white">
        {display}
      </div>
      {sub && (
        <div className="text-[11px] text-neutral-500 mt-0.5">({sub})</div>
      )}
    </div>
  );
}

export default function MvpLvpCards({ mvp, lvp, gameNumber }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* MVP */}
      <div className="rounded-xl border-2 border-amber-400 dark:border-amber-500/60 bg-amber-50 dark:bg-amber-500/5 p-4">
        <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-amber-700 dark:text-amber-400 mb-2">
          🏆 GAME {gameNumber} MVP
        </div>
        <PlayerHeader p={mvp} />
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="font-semibold text-neutral-500">{mvp.role}</span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold text-neutral-900 dark:text-white">
            {championKoreanName(mvp.champion)}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold tabular-nums">
            {mvp.kills}/{mvp.deaths}/{mvp.assists}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            KDA {mvp.kda.toFixed(2)}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 font-medium">
          {mvp.highlight}
        </p>
      </div>

      {/* LVP */}
      <div className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-4">
        <div className="text-[11px] font-bold tracking-[0.15em] uppercase text-neutral-500 mb-2">
          📉 GAME {gameNumber} LVP
        </div>
        <PlayerHeader p={lvp} />
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className="font-semibold text-neutral-500">{lvp.role}</span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold text-neutral-900 dark:text-white">
            {championKoreanName(lvp.champion)}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold tabular-nums">
            {lvp.kills}/{lvp.deaths}/{lvp.assists}
          </span>
          <span className="text-neutral-400">·</span>
          <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
            KDA {lvp.kda.toFixed(2)}
          </span>
        </div>
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 font-medium">
          {lvp.highlight}
        </p>
      </div>
    </div>
  );
}
