"use client";

// 해외 LoL(LEC/LCS) 순위·로스터·통계 탭 UI — 순위/로스터/선수/챔피언 4탭.
// 데이터는 server(LolSimpleStandings)에서 props. 순위·로스터=순위 json, 선수·챔피언=lolGames 집계.

import { useState } from "react";

export interface ForeignRosterPlayer {
  playerId: string;
  name: string;
  realName: string;
  photo: string;
  position: number | null;
}
export interface ForeignTeamRow {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
  roster: ForeignRosterPlayer[];
}
export interface ForeignPlayerRow {
  playerId: string;
  name: string;
  teamShort: string;
  photo: string;
  kda: number;
  winRate: number;
  csPerMin: number;
  games: number;
}
export interface ForeignChampRow {
  champ: string;
  logo: string;
  picks: number;
  winRate: number;
}

interface Props {
  league: string;
  standings: ForeignTeamRow[];
  players: ForeignPlayerRow[];
  champs: ForeignChampRow[];
}

const TABS = ["순위", "로스터", "선수", "챔피언"];
const POS_LABEL: Record<number, string> = { 1: "원딜", 2: "미드", 3: "탑", 4: "정글", 5: "서포터" };
const card =
  "overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
const headRow = "text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10";

export default function LolForeignTabs({ standings, players, champs }: Props) {
  const [tab, setTab] = useState(0);
  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition ${
              i === tab
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 순위 */}
      {tab === 0 && (
        <div className={card}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className="text-left py-2.5 px-3 font-semibold w-10">#</th>
                  <th className="text-left py-2.5 px-2 font-semibold">팀</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-12">승</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-12">패</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-16">승률</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r) => {
                  const played = r.win + r.lose;
                  const wr = played ? Math.round((r.win / played) * 100) : 0;
                  return (
                    <tr key={r.teamId} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                      <td className="text-left py-2.5 px-3 tabular-nums text-neutral-500 font-bold">{r.rank}</td>
                      <td className="py-2.5 px-2">
                        <span className="flex items-center gap-2.5">
                          {r.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                          ) : (
                            <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                          )}
                          <span className="font-semibold truncate max-w-[180px] sm:max-w-none">{r.name}</span>
                        </span>
                      </td>
                      <td className="text-center py-2.5 px-2 tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">{r.win}</td>
                      <td className="text-center py-2.5 px-2 tabular-nums text-rose-500">{r.lose}</td>
                      <td className="text-center py-2.5 px-3 tabular-nums font-black">{wr}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 로스터 */}
      {tab === 1 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {standings.map((r) => (
            <div key={r.teamId} className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-4">
              <div className="flex items-center gap-2 mb-3">
                {r.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                )}
                <span className="font-bold text-sm">{r.name}</span>
                <span className="text-xs text-neutral-400 tabular-nums ml-auto">{r.win}승 {r.lose}패</span>
              </div>
              {r.roster.length === 0 ? (
                <p className="text-xs text-neutral-400">로스터 정보 없음</p>
              ) : (
                <ul className="space-y-1.5">
                  {r.roster.map((p) => (
                    <li key={p.playerId} className="flex items-center gap-2.5">
                      {p.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photo} alt="" className="w-12 h-12 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                      ) : (
                        <span className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-[11px] font-bold text-neutral-500">
                          {p.name.slice(0, 1)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-sm">{p.name}</span>
                        {p.realName && <span className="text-xs text-neutral-400 ml-1.5 truncate">{p.realName}</span>}
                      </span>
                      {p.position != null && POS_LABEL[p.position] && (
                        <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded px-1.5 py-0.5 shrink-0">
                          {POS_LABEL[p.position]}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 선수 (KDA 랭킹) */}
      {tab === 2 && (
        <div className={card}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className="text-left py-2.5 px-3 font-semibold w-10">#</th>
                  <th className="text-left py-2.5 px-2 font-semibold">선수</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-16">KDA</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-16">승률</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-16">분당 CS</th>
                </tr>
              </thead>
              <tbody>
                {players.map((pl, i) => (
                  <tr key={pl.playerId} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="text-left py-2.5 px-3 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        {pl.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={pl.photo} alt="" className="w-11 h-11 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                        ) : (
                          <span className="w-11 h-11 rounded-full shrink-0 bg-neutral-100 dark:bg-neutral-800" />
                        )}
                        <span className="font-semibold">{pl.name}</span>
                        <span className="text-neutral-400 text-xs">{pl.teamShort}</span>
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-2 tabular-nums font-semibold">{pl.kda.toFixed(2)}</td>
                    <td className="text-center py-2.5 px-2 tabular-nums text-neutral-500">{Math.round(pl.winRate * 100)}%</td>
                    <td className="text-center py-2.5 px-3 tabular-nums text-neutral-500">{pl.csPerMin.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-400 px-4 py-2">5세트 이상 출전 · KDA 순</p>
        </div>
      )}

      {/* 챔피언 (픽 랭킹) */}
      {tab === 3 && (
        <div className={card}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className="text-left py-2.5 px-3 font-semibold w-10">#</th>
                  <th className="text-left py-2.5 px-2 font-semibold">챔피언</th>
                  <th className="text-center py-2.5 px-2 font-semibold w-16">픽</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-16">승률</th>
                </tr>
              </thead>
              <tbody>
                {champs.map((c, i) => (
                  <tr key={c.champ} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="text-left py-2.5 px-3 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        {c.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.logo} alt="" className="w-6 h-6 rounded shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                        ) : (
                          <span className="w-6 h-6 rounded shrink-0 bg-neutral-100 dark:bg-neutral-800" />
                        )}
                        <span className="font-semibold">{c.champ}</span>
                      </span>
                    </td>
                    <td className="text-center py-2.5 px-2 tabular-nums">{c.picks}</td>
                    <td className="text-center py-2.5 px-3 tabular-nums text-neutral-500">{Math.round(c.winRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
