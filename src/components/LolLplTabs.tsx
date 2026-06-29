"use client";

// LPL 순위·로스터 탭 UI — 순위는 그룹(part_stage)별 분리 표(그룹마다 1위 시작), 로스터는 팀별.
//  LPL 은 lolGames 미수집(LCK/LEC/LCS 만 수집) → 선수·챔피언 통계 탭 없음(LolForeignTabs 와 구분).

import { useState } from "react";

export interface LplRosterPlayer {
  playerId: string;
  name: string;
  realName: string;
  photo: string;
  position: number | null;
}
export interface LplTeamRow {
  rank: number;
  teamId: string;
  name: string;
  short: string;
  logo: string;
  win: number;
  lose: number;
  roster: LplRosterPlayer[];
}
export interface LplGroup {
  name: string;
  standings: LplTeamRow[];
}

const TABS = ["순위", "로스터"];
const POS_LABEL: Record<number, string> = { 1: "원딜", 2: "미드", 3: "탑", 4: "정글", 5: "서포터" };
const card =
  "overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";
const headRow = "text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10";

export default function LolLplTabs({ groups }: { groups: LplGroup[] }) {
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

      {/* 순위 — 그룹별 표 */}
      {tab === 0 && (
        <div className="space-y-4">
          {groups.map((grp) => (
            <div key={grp.name} className={card}>
              <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-white/10 text-sm font-bold text-neutral-700 dark:text-neutral-200">
                {grp.name}
              </div>
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
                    {grp.standings.map((r) => {
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
          ))}
        </div>
      )}

      {/* 로스터 — 팀별 */}
      {tab === 1 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {groups.flatMap((grp) => grp.standings).map((r) => (
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
    </div>
  );
}
