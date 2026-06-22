"use client";

// LCK 순위·통계 탭 UI — 순위/선수/챔피언/밴/팀 5탭. 선수 사진·챔피언 아이콘 포함. 데이터는 server(LolStandings)에서 props.

import { useState } from "react";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";

export interface TeamRow {
  rank: number;
  teamId: string;
  name: string;
  logo: string;
  win: number;
  lose: number;
  dbId: number | null;
}
export interface PlayerRow {
  playerId: string;
  name: string;
  teamName: string;
  teamLogo: string;
  teamDbId: number | null;
  photo: string;
  kda: number;
  winRate: number;
  csPerMin: number;
  games: number;
}
export interface ChampRow {
  champ: string;
  logo: string;
  picks: number;
  winRate: number;
}
export interface BanRow {
  champ: string;
  logo: string;
  bans: number;
}
export interface TeamStatRow {
  teamId: string;
  name: string;
  logo: string;
  dbId: number | null;
  avgKills: number;
  avgDragons: number;
  avgTowers: number;
  avgMin: number;
}

interface Props {
  name: string;
  updatedAt: string;
  standings: TeamRow[];
  players: PlayerRow[];
  champs: ChampRow[];
  bans: BanRow[];
  teams: TeamStatRow[];
}

const TABS = ["순위", "선수", "챔피언", "밴", "팀 통계"];
const card = "rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden";
const head = "bg-neutral-50 dark:bg-neutral-900/60 text-xs text-neutral-500";
const C = "py-2.5 px-3 text-center";

function Champ({ logo, name }: { logo: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-6 h-6 rounded shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
      ) : (
        <span className="w-6 h-6 rounded shrink-0 bg-neutral-100 dark:bg-neutral-800" />
      )}
      <span className="font-semibold">{name}</span>
    </span>
  );
}

function TeamCell({ logo, name, dbId }: { logo: string; name: string; dbId: number | null }) {
  const inner = (
    <>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
      ) : (
        <span className="w-6 h-6 shrink-0" />
      )}
      <span className="font-semibold">{name}</span>
    </>
  );
  return dbId ? (
    <Link href={`/teams/${dbId}`} className="inline-flex items-center gap-2 hover:underline">
      {inner}
    </Link>
  ) : (
    <span className="inline-flex items-center gap-2">{inner}</span>
  );
}

export default function LolStandingsTabs(p: Props) {
  const [tab, setTab] = useState(0);
  return (
    <div className="relative max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      <AmbientGlow />
      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/scores?sport=esports" className="hover:underline">
          e스포츠 라이브
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{p.name} 순위·선수정보</span>
      </nav>

      <header>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 리그 순위
        </span>
        <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{p.name} 순위·선수정보</h1>
        <p className="text-sm text-neutral-500 mt-2 break-keep">
          한국 · League of Legends Champions Korea · 2026 시즌 · TheSports
        </p>
      </header>

      {/* 리그 스위처 — LCK ↔ LEC ↔ LCS */}
      <div className="flex gap-1.5">
        {([["LOL", "LCK"], ["LEC", "LEC"], ["LCS", "LCS"]] as const).map(([code, lbl]) => (
          <Link
            key={code}
            href={`/standings/${code}`}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${
              code === "LOL"
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {lbl}
          </Link>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap transition ${
              i === tab
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 순위 */}
      {tab === 0 && (
        <div className={card}>
          <table className="w-full text-sm">
            <thead className={head}>
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">팀</th>
                <th className={C + " w-12"}>승</th>
                <th className={C + " w-12"}>패</th>
                <th className={C + " w-16"}>승률</th>
              </tr>
            </thead>
            <tbody>
              {p.standings.map((r) => {
                const played = r.win + r.lose;
                const wr = played ? Math.round((r.win / played) * 100) : 0;
                return (
                  <tr key={r.teamId} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="py-2.5 px-3 font-bold tabular-nums">{r.rank}</td>
                    <td className="py-2.5 px-2">
                      <TeamCell logo={r.logo} name={r.name} dbId={r.dbId} />
                    </td>
                    <td className={C + " tabular-nums"}>{r.win}</td>
                    <td className={C + " tabular-nums text-neutral-500"}>{r.lose}</td>
                    <td className={C + " tabular-nums"}>{wr}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 선수 */}
      {tab === 1 && (
        <div className={card}>
          <table className="w-full text-sm">
            <thead className={head}>
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">선수</th>
                <th className="py-2.5 px-2 text-left">팀</th>
                <th className={C + " w-16"}>KDA</th>
                <th className={C + " w-16"}>승률</th>
                <th className={C + " w-16"}>분당 CS</th>
              </tr>
            </thead>
            <tbody>
              {p.players.map((pl, i) => (
                <tr key={pl.playerId} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                  <td className="py-2.5 px-2">
                    <Link href={`/players/${pl.playerId}?league=LOL`} className="inline-flex items-center gap-2 hover:underline">
                      {pl.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pl.photo} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                      ) : (
                        <span className="w-7 h-7 rounded-full shrink-0 bg-neutral-100 dark:bg-neutral-800" />
                      )}
                      <span className="font-semibold">{pl.name}</span>
                    </Link>
                  </td>
                  <td className="py-2.5 px-2">
                    <TeamCell logo={pl.teamLogo} name={pl.teamName} dbId={pl.teamDbId} />
                  </td>
                  <td className={C + " tabular-nums font-semibold"}>{pl.kda.toFixed(2)}</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{Math.round(pl.winRate * 100)}%</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{pl.csPerMin.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 챔피언 */}
      {tab === 2 && (
        <div className={card}>
          <table className="w-full text-sm">
            <thead className={head}>
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">챔피언</th>
                <th className={C + " w-14"}>픽</th>
                <th className={C + " w-16"}>승률</th>
              </tr>
            </thead>
            <tbody>
              {p.champs.map((c, i) => (
                <tr key={c.champ} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                  <td className="py-2.5 px-2"><Champ logo={c.logo} name={c.champ} /></td>
                  <td className={C + " tabular-nums"}>{c.picks}</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{Math.round(c.winRate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 밴 */}
      {tab === 3 && (
        <div className={card}>
          <table className="w-full text-sm">
            <thead className={head}>
              <tr>
                <th className="py-2.5 px-3 text-left w-10">#</th>
                <th className="py-2.5 px-2 text-left">챔피언</th>
                <th className={C + " w-16"}>밴</th>
              </tr>
            </thead>
            <tbody>
              {p.bans.map((b, i) => (
                <tr key={b.champ} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-2.5 px-3 font-bold tabular-nums">{i + 1}</td>
                  <td className="py-2.5 px-2"><Champ logo={b.logo} name={b.champ} /></td>
                  <td className={C + " tabular-nums"}>{b.bans}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 팀 통계 */}
      {tab === 4 && (
        <div className={card}>
          <table className="w-full text-sm">
            <thead className={head}>
              <tr>
                <th className="py-2.5 px-2 text-left">팀</th>
                <th className={C + " w-16"}>평균 킬</th>
                <th className={C + " w-16"}>드래곤</th>
                <th className={C + " w-16"}>타워</th>
                <th className={C + " w-16"}>게임</th>
              </tr>
            </thead>
            <tbody>
              {p.teams.map((t) => (
                <tr key={t.teamId} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="py-2.5 px-2"><TeamCell logo={t.logo} name={t.name} dbId={t.dbId} /></td>
                  <td className={C + " tabular-nums font-semibold"}>{t.avgKills.toFixed(1)}</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{t.avgDragons.toFixed(1)}</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{t.avgTowers.toFixed(1)}</td>
                  <td className={C + " tabular-nums text-neutral-500"}>{Math.round(t.avgMin)}분</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-neutral-400 mt-3">업데이트 {p.updatedAt.slice(0, 10)}</p>
    </div>
  );
}
