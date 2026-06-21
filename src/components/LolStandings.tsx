// LCK 리그순위 + 선수 KDA 랭킹 — 팀=data/lol-standings.json(table 백필), 선수=lolGames DB 집계.
import rawStandings from "../../data/lol-standings.json";
import Link from "next/link";
import { aggregateLolPlayers } from "@/lib/sports/lol-player-stats";

interface Row {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
}
interface Data {
  league: string;
  name: string;
  updatedAt: string;
  standings: Row[];
}

export default async function LolStandings({ name }: { name: string }) {
  const data = rawStandings as Data;
  const rows = data.standings;
  const teamShort = new Map(rows.map((r) => [r.teamId, r.short]));
  const players = (await aggregateLolPlayers())
    .filter((p) => p.games >= 10)
    .sort((a, b) => b.kda - a.kda);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* 팀 순위 */}
      <section>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">{name} 순위</h1>
        <p className="text-sm text-neutral-500 mb-5">2026 정규시즌 · TheSports</p>
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500">
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">팀</th>
                <th className="py-2.5 px-3 text-center w-12">승</th>
                <th className="py-2.5 px-3 text-center w-12">패</th>
                <th className="py-2.5 px-3 text-center w-16">승률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const played = r.win + r.lose;
                const wr = played ? Math.round((r.win / played) * 100) : 0;
                return (
                  <tr key={r.teamId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-bold tabular-nums">{r.rank}</td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        {r.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                        ) : (
                          <div className="w-6 h-6 shrink-0" />
                        )}
                        <span className="font-semibold truncate">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums">{r.win}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-neutral-500">{r.lose}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums">{wr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 선수 KDA 랭킹 */}
      {players.length > 0 && (
        <section>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1">선수 KDA 랭킹</h2>
          <p className="text-sm text-neutral-500 mb-5">최소 10세트 · 수집 경기 기준</p>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500">
                <tr>
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-2 text-left">선수</th>
                  <th className="py-2.5 px-3 text-center w-16">KDA</th>
                  <th className="py-2.5 px-3 text-center w-14">CS</th>
                  <th className="py-2.5 px-3 text-center w-14">세트</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, 15).map((p, i) => (
                  <tr key={p.playerId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-2">
                      <Link href={`/players/${p.playerId}?league=LOL`} className="hover:underline">
                        <span className="font-semibold">{p.name}</span>
                      </Link>
                      <span className="text-neutral-400 text-xs ml-1.5">{teamShort.get(p.teamId) ?? ""}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center tabular-nums font-semibold">{p.kda.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-neutral-500">{Math.round(p.csPerGame)}</td>
                    <td className="py-2.5 px-3 text-center tabular-nums text-neutral-500">{p.games}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-neutral-400">업데이트 {data.updatedAt.slice(0, 10)}</p>
    </div>
  );
}
