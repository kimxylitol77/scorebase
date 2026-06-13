// 하키 선수 박스스코어 — TheSports detailLive.players (home/away).
// 선수별 stat: 20(1골리/2스케이터)·26골·27어시·56(+/-)·28유효슛·23 TOI(초)·24세이브·25 SV%.
// player_id → 한글(nhl-live-names). 홈/원정 탭 전환.

"use client";

import { useState } from "react";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";

export interface HockeyPlayerRow {
  id: string;
  stats: Array<[number, number]>;
}

interface Props {
  players: { home?: HockeyPlayerRow[]; away?: HockeyPlayerRow[] };
  homeNameKo: string;
  awayNameKo: string;
}

function stat(row: HockeyPlayerRow, id: number): number | undefined {
  return row.stats.find(([s]) => s === id)?.[1];
}

function toi(sec?: number): string {
  if (!sec) return "—";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function svPct(v?: number): string {
  if (v == null) return "—";
  return (v > 1 ? v : v * 100).toFixed(1) + "%";
}

function name(id: string): { ko: string; pos?: string } {
  const info = nhlPlayerInfo(id);
  return { ko: info?.ko || info?.en || "선수", pos: info?.pos };
}

function SkaterTable({ rows }: { rows: HockeyPlayerRow[] }) {
  const skaters = rows
    .filter((r) => stat(r, 20) === 2)
    .sort(
      (a, b) =>
        (stat(b, 26) ?? 0) + (stat(b, 27) ?? 0) - ((stat(a, 26) ?? 0) + (stat(a, 27) ?? 0)) ||
        (stat(b, 28) ?? 0) - (stat(a, 28) ?? 0),
    );
  if (skaters.length === 0) return null;
  return (
    <table className="w-full text-xs border-separate border-spacing-0">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
          <th className="text-left py-1.5 pl-1 font-semibold">선수</th>
          <th className="text-center py-1.5 px-1 font-semibold w-7">골</th>
          <th className="text-center py-1.5 px-1 font-semibold w-7">도움</th>
          <th className="text-center py-1.5 px-1 font-semibold w-8">+/-</th>
          <th className="text-center py-1.5 px-1 font-semibold w-8">유효슛</th>
          <th className="text-right py-1.5 pr-1 font-semibold w-12">출전</th>
        </tr>
      </thead>
      <tbody>
        {skaters.map((r) => {
          const n = name(r.id);
          const pm = stat(r, 56);
          return (
            <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
              <td className="py-1.5 pl-1">
                <span className="font-semibold">{n.ko}</span>
                {n.pos && <span className="text-neutral-400 text-[10px] ml-1">{n.pos}</span>}
              </td>
              <td className="text-center py-1.5 px-1 tabular-nums font-bold">{stat(r, 26) ?? 0}</td>
              <td className="text-center py-1.5 px-1 tabular-nums">{stat(r, 27) ?? 0}</td>
              <td
                className={`text-center py-1.5 px-1 tabular-nums ${pm != null && pm > 0 ? "text-emerald-600 dark:text-emerald-400" : pm != null && pm < 0 ? "text-rose-500" : "text-neutral-500"}`}
              >
                {pm == null ? "—" : pm > 0 ? `+${pm}` : pm}
              </td>
              <td className="text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{stat(r, 28) ?? 0}</td>
              <td className="text-right py-1.5 pr-1 tabular-nums text-neutral-500">{toi(stat(r, 23))}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GoalieTable({ rows }: { rows: HockeyPlayerRow[] }) {
  const goalies = rows.filter((r) => stat(r, 20) === 1 && (stat(r, 23) ?? 0) > 0);
  if (goalies.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-[11px] font-bold text-neutral-500 mb-1">골리</h3>
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
            <th className="text-left py-1.5 pl-1 font-semibold">선수</th>
            <th className="text-center py-1.5 px-1 font-semibold w-10">세이브</th>
            <th className="text-center py-1.5 px-1 font-semibold w-12">선방률</th>
            <th className="text-right py-1.5 pr-1 font-semibold w-12">출전</th>
          </tr>
        </thead>
        <tbody>
          {goalies.map((r) => {
            const n = name(r.id);
            return (
              <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
                <td className="py-1.5 pl-1 font-semibold">{n.ko}</td>
                <td className="text-center py-1.5 px-1 tabular-nums">{stat(r, 24) ?? 0}</td>
                <td className="text-center py-1.5 px-1 tabular-nums font-bold">{svPct(stat(r, 25))}</td>
                <td className="text-right py-1.5 pr-1 tabular-nums text-neutral-500">{toi(stat(r, 23))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HockeyBoxScore({ players, homeNameKo, awayNameKo }: Props) {
  const home = players?.home ?? [];
  const away = players?.away ?? [];
  const [tab, setTab] = useState<"home" | "away">("home");
  if (home.length === 0 && away.length === 0) return null;
  const rows = tab === "home" ? home : away;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">선수 기록</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      <div className="flex gap-1 mb-3">
        {(["home", "away"] as const).map((t) => {
          const active = t === tab;
          const label = t === "home" ? homeNameKo : awayNameKo;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition truncate max-w-[45%] ${
                active
                  ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300"
                  : "bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <SkaterTable rows={rows} />
      <GoalieTable rows={rows} />
    </section>
  );
}
