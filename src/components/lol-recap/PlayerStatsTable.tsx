// LoL RECAP — 10명 선수 통계 테이블 (라인별 정렬, MVP/LVP 강조)

import type { MvpCandidate } from "@/lib/sports/lol-mvp-selector";
import { championKoreanName } from "@/lib/sports/leaguepedia";

interface Props {
  players: MvpCandidate[];
  team1NameKo: string;
  team2NameKo: string;
}

const ROLE_ORDER = ["TOP", "JGL", "MID", "ADC", "SUP"];

function sortPlayers(players: MvpCandidate[]): MvpCandidate[] {
  const byTeam = (t: "team1" | "team2") =>
    players
      .filter((p) => p.team === t)
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  return [...byTeam("team1"), ...byTeam("team2")];
}

export default function PlayerStatsTable({
  players,
  team1NameKo,
  team2NameKo,
}: Props) {
  const sorted = sortPlayers(players);
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">팀</th>
            <th className="text-left px-2 py-2 font-medium">라인</th>
            <th className="text-left px-2 py-2 font-medium">선수</th>
            <th className="text-left px-2 py-2 font-medium">챔피언</th>
            <th className="text-right px-2 py-2 font-medium">KDA</th>
            <th className="text-right px-2 py-2 font-medium">CS</th>
            <th className="text-right px-3 py-2 font-medium">DPM</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {sorted.map((p) => {
            const isMvp = p.isMvp;
            const isLvp = p.isLvp;
            const rowCls = isMvp
              ? "bg-amber-50 dark:bg-amber-500/5"
              : isLvp
                ? "bg-rose-50 dark:bg-rose-500/5"
                : "";
            return (
              <tr key={`${p.team}-${p.bdlPlayerId}`} className={rowCls}>
                <td className="px-3 py-2 text-xs text-neutral-500 whitespace-nowrap">
                  {p.team === "team1" ? team1NameKo : team2NameKo}
                </td>
                <td className="px-2 py-2 font-semibold text-neutral-700 dark:text-neutral-300">
                  {p.role}
                </td>
                <td className="px-2 py-2 font-bold">
                  {p.koreanName ?? p.playerName}
                  {isMvp && <span className="ml-1.5 text-amber-600 dark:text-amber-400" aria-label="MVP">🏆</span>}
                  {isLvp && <span className="ml-1.5 text-neutral-500" aria-label="LVP">📉</span>}
                </td>
                <td className="px-2 py-2 text-neutral-700 dark:text-neutral-300">
                  {championKoreanName(p.champion)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  <span className="text-neutral-500">{p.kills}/{p.deaths}/{p.assists}</span>
                  <span className="ml-1.5 text-neutral-900 dark:text-white">
                    ({p.kda.toFixed(2)})
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                  {p.cs}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-300">
                  {p.dpm}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
