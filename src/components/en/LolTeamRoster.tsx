// LolTeamRoster (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import Link from "next/link";
import lolStandings from "../../../data/lol-standings.json";
import lolPlayers from "../../../data/lol-players.json";
import { aggregateLolPlayers, aggregateLolTeams } from "@/lib/sports/lol-player-stats";

export default async function LolTeamRoster({ teamId }: { teamId: number }) {
  const std = (
    lolStandings as { standings: { dbId: number | null; teamId: string }[] }
  ).standings.find((s) => s.dbId === teamId);
  if (!std) return null;
  const tsId = std.teamId;
  const photos = (lolPlayers as { players: Record<string, { photo?: string }> }).players;

  const [players, teams] = await Promise.all([aggregateLolPlayers(), aggregateLolTeams()]);
  const roster = players.filter((p) => p.teamId === tsId).sort((a, b) => b.games - a.games);
  const stat = teams.find((t) => t.teamId === tsId);
  if (!roster.length) return null;

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h2 className="text-lg font-bold tracking-tight">🎮 Roster</h2>
        <span className="text-xs text-neutral-400">{roster.length} players · from collected games · tap for detail</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {roster.map((p) => (
          <Link
            key={p.playerId}
            href={`/players/${p.playerId}?league=LOL`}
            className="flex items-center gap-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900/40 transition"
          >
            {photos[p.playerId]?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photos[p.playerId]!.photo}
                alt=""
                className="w-10 h-10 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800"
                loading="lazy"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center">
                <span className="text-xs font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              <div className="text-xs text-neutral-500 tabular-nums">
                KDA {p.kda.toFixed(2)} · win rate {Math.round(p.winRate * 100)}%
              </div>
            </div>
          </Link>
        ))}
      </div>
      {stat && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
          <span>Per game — kills <b className="text-neutral-700 dark:text-neutral-300">{stat.avgKills.toFixed(1)}</b></span>
          <span>dragons <b className="text-neutral-700 dark:text-neutral-300">{stat.avgDragons.toFixed(1)}</b></span>
          <span>towers <b className="text-neutral-700 dark:text-neutral-300">{stat.avgTowers.toFixed(1)}</b></span>
          <span>games <b className="text-neutral-700 dark:text-neutral-300">{Math.round(stat.avgMin)}min</b></span>
        </div>
      )}
    </section>
  );
}
