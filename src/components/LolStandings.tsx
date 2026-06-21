// LCK 리그순위 + 선수/챔피언/밴/팀 통계 — 팀순위=data/lol-standings.json(table 백필), 통계=lolGames DB 집계.
import rawStandings from "../../data/lol-standings.json";
import Link from "next/link";
import {
  aggregateLolPlayers,
  aggregateLolChampions,
  aggregateLolBans,
  aggregateLolTeams,
} from "@/lib/sports/lol-player-stats";

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

const TH = "py-2.5 px-3 text-center";
const cardCls = "rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden";
const headCls = "bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500";

export default async function LolStandings({ name }: { name: string }) {
  const data = rawStandings as Data;
  const rows = data.standings;
  const teamShort = new Map(rows.map((r) => [r.teamId, r.short]));
  const [playersAll, champs, bans, teams] = await Promise.all([
    aggregateLolPlayers(),
    aggregateLolChampions(),
    aggregateLolBans(),
    aggregateLolTeams(),
  ]);
  const players = playersAll.filter((p) => p.games >= 10).sort((a, b) => b.kda - a.kda);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-8">
      {/* 팀 순위 */}
      <section>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1">{name} 순위</h1>
        <p className="text-sm text-neutral-500 mb-5">2026 정규시즌 · TheSports</p>
        <div className={cardCls}>
          <table className="w-full text-sm">
            <thead className={headCls}>
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">팀</th>
                <th className={TH + " w-12"}>승</th>
                <th className={TH + " w-12"}>패</th>
                <th className={TH + " w-16"}>승률</th>
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
                    <td className={TH + " tabular-nums"}>{r.win}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{r.lose}</td>
                    <td className={TH + " tabular-nums"}>{wr}%</td>
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
          <div className={cardCls}>
            <table className="w-full text-sm">
              <thead className={headCls}>
                <tr>
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-2 text-left">선수</th>
                  <th className={TH + " w-16"}>KDA</th>
                  <th className={TH + " w-16"}>승률</th>
                  <th className={TH + " w-16"}>분당 CS</th>
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
                    <td className={TH + " tabular-nums font-semibold"}>{p.kda.toFixed(2)}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{Math.round(p.winRate * 100)}%</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{p.csPerMin.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 챔피언 픽 랭킹 */}
      {champs.length > 0 && (
        <section>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1">챔피언 픽 랭킹</h2>
          <p className="text-sm text-neutral-500 mb-5">가장 많이 픽된 챔피언 · 승률</p>
          <div className={cardCls}>
            <table className="w-full text-sm">
              <thead className={headCls}>
                <tr>
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-2 text-left">챔피언</th>
                  <th className={TH + " w-14"}>픽</th>
                  <th className={TH + " w-16"}>승률</th>
                </tr>
              </thead>
              <tbody>
                {champs.slice(0, 15).map((c, i) => (
                  <tr key={c.champ} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-2 font-semibold">{c.champ}</td>
                    <td className={TH + " tabular-nums"}>{c.picks}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{Math.round(c.winRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 밴 랭킹 */}
      {bans.length > 0 && (
        <section>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1">밴 랭킹</h2>
          <p className="text-sm text-neutral-500 mb-5">가장 많이 밴된 챔피언</p>
          <div className={cardCls}>
            <table className="w-full text-sm">
              <thead className={headCls}>
                <tr>
                  <th className="py-2.5 px-3 text-left w-10">#</th>
                  <th className="py-2.5 px-2 text-left">챔피언</th>
                  <th className={TH + " w-16"}>밴</th>
                </tr>
              </thead>
              <tbody>
                {bans.slice(0, 15).map((b, i) => (
                  <tr key={b.champ} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                    <td className="py-2.5 px-2 font-semibold">{b.champ}</td>
                    <td className={TH + " tabular-nums"}>{b.bans}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 팀 스타일 통계 */}
      {teams.length > 0 && (
        <section>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight mb-1">팀 스타일 통계</h2>
          <p className="text-sm text-neutral-500 mb-5">세트당 평균 · 수집 경기 기준</p>
          <div className={cardCls}>
            <table className="w-full text-sm">
              <thead className={headCls}>
                <tr>
                  <th className="py-2.5 px-2 text-left">팀</th>
                  <th className={TH + " w-16"}>평균 킬</th>
                  <th className={TH + " w-16"}>드래곤</th>
                  <th className={TH + " w-16"}>타워</th>
                  <th className={TH + " w-16"}>게임</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <tr key={t.teamId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-2 font-semibold">{t.name}</td>
                    <td className={TH + " tabular-nums font-semibold"}>{t.avgKills.toFixed(1)}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{t.avgDragons.toFixed(1)}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{t.avgTowers.toFixed(1)}</td>
                    <td className={TH + " tabular-nums text-neutral-500"}>{Math.round(t.avgMin)}분</td>
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
