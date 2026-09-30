// 하키 선수 박스스코어 — TheSports detailLive.players (home/away).
// 선수별 stat: 20(1골리/2스케이터)·21포인트·22 PIM·23 TOI(초)·26골·27어시·28유효슛·29히트·30블록·32 FO%·56(+/-)
//   ·78 턴오버·79 가로채기·24세이브·25 SV% (2026-09-30 ESPN 박스스코어와 선수별 대조로 확정).
// player_id → 한글·포지션·등번호(nhl-live-names). 평점은 ts 미제공이라 자체 계산(lib/sports/hockey/game-score). 홈/원정 탭 전환.

"use client";

import { useState } from "react";
import Link from "next/link";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";
import { goalieRating, ratingColor, skaterRating } from "@/lib/sports/hockey/game-score";

export interface HockeyPlayerRow {
  id: string;
  stats: Array<[number, number]>;
}

interface Props {
  players: { home?: HockeyPlayerRow[]; away?: HockeyPlayerRow[] };
  homeNameKo: string;
  awayNameKo: string;
  /** 선수 페이지가 있는 리그면 이름에 /players/{id}?league= 링크 (KHL·유럽 하키 — ts id 체계가 같다) */
  playerLinkLeague?: string;
}

function PlayerName({ id, ko, league }: { id: string; ko: string; league?: string }) {
  if (!league) return <span className="font-semibold">{ko}</span>;
  return <Link href={`/players/${id}?league=${league}`} className="font-semibold hover:underline">{ko}</Link>;
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

function name(id: string): { ko: string; pos?: string; no?: number } {
  const info = nhlPlayerInfo(id);
  return { ko: info?.ko || info?.en || "선수", pos: info?.pos, no: info?.no };
}

function RatingChip({ r }: { r: number }) {
  return (
    <span className="inline-block min-w-[2.1rem] rounded px-1 py-0.5 text-[11px] font-bold tabular-nums text-white" style={{ background: ratingColor(r) }}>
      {r.toFixed(1)}
    </span>
  );
}

function NameCell({ id, league }: { id: string; league?: string }) {
  const n = name(id);
  return (
    <td className="py-1.5 pl-1 max-w-0 w-full">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-neutral-400">{n.no ?? ""}</span>
        <span className="truncate"><PlayerName id={id} ko={n.ko} league={league} /></span>
        {n.pos && <span className="shrink-0 rounded bg-neutral-100 px-1 text-[9px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-400">{n.pos}</span>}
      </div>
    </td>
  );
}

function goalsAgainst(r: HockeyPlayerRow): number | null {
  const sv = stat(r, 24);
  const pct = stat(r, 25);
  if (sv == null || pct == null) return null;
  const p = pct > 1 ? pct / 100 : pct;
  if (p <= 0) return null;
  return Math.max(0, Math.round(sv / p - sv));
}

function SkaterTable({ rows, league }: { rows: HockeyPlayerRow[]; league?: string }) {
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
        <tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10 [&>th]:whitespace-nowrap">
          <th className="text-left py-1.5 pl-1 font-semibold">선수</th>
          <th className="text-center py-1.5 px-1 font-semibold w-7">골</th>
          <th className="text-center py-1.5 px-1 font-semibold w-7">도움</th>
          <th className="text-center py-1.5 px-1 font-semibold w-8">+/-</th>
          <th className="text-center py-1.5 px-1 font-semibold w-8">슈팅</th>
          <th className="hidden sm:table-cell text-center py-1.5 px-1 font-semibold w-8">히트</th>
          <th className="hidden sm:table-cell text-center py-1.5 px-1 font-semibold w-8">블록</th>
          <th className="text-right py-1.5 px-1 font-semibold w-11">출전</th>
          <th className="text-right py-1.5 pr-1 font-semibold w-11">평점</th>
        </tr>
      </thead>
      <tbody>
        {skaters.map((r) => {
          const pm = stat(r, 56);
          const rating = skaterRating({
            g: stat(r, 26) ?? 0, a: stat(r, 27) ?? 0, sog: stat(r, 28) ?? 0,
            blk: stat(r, 30) ?? 0, pim: stat(r, 22) ?? 0, pm: pm ?? 0,
          });
          return (
            <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
              <NameCell id={r.id} league={league} />
              <td className="text-center py-1.5 px-1 tabular-nums font-bold">{stat(r, 26) ?? 0}</td>
              <td className="text-center py-1.5 px-1 tabular-nums">{stat(r, 27) ?? 0}</td>
              <td
                className={`text-center py-1.5 px-1 tabular-nums ${pm != null && pm > 0 ? "text-emerald-600 dark:text-emerald-400" : pm != null && pm < 0 ? "text-rose-500" : "text-neutral-500"}`}
              >
                {pm == null ? "—" : pm > 0 ? `+${pm}` : pm}
              </td>
              <td className="text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{stat(r, 28) ?? 0}</td>
              <td className="hidden sm:table-cell text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{stat(r, 29) ?? 0}</td>
              <td className="hidden sm:table-cell text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{stat(r, 30) ?? 0}</td>
              <td className="text-right py-1.5 px-1 tabular-nums text-neutral-500">{toi(stat(r, 23))}</td>
              <td className="text-right py-1.5 pr-1"><RatingChip r={rating} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GoalieTable({ rows, league }: { rows: HockeyPlayerRow[]; league?: string }) {
  const goalies = rows.filter((r) => stat(r, 20) === 1 && (stat(r, 23) ?? 0) > 0);
  if (goalies.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-[11px] font-bold text-neutral-500 mb-1">골리</h3>
      <table className="w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10 [&>th]:whitespace-nowrap">
            <th className="text-left py-1.5 pl-1 font-semibold">선수</th>
            <th className="text-center py-1.5 px-1 font-semibold w-10">세이브</th>
            <th className="text-center py-1.5 px-1 font-semibold w-8">실점</th>
            <th className="text-center py-1.5 px-1 font-semibold w-12">선방률</th>
            <th className="text-right py-1.5 px-1 font-semibold w-11">출전</th>
            <th className="text-right py-1.5 pr-1 font-semibold w-11">평점</th>
          </tr>
        </thead>
        <tbody>
          {goalies.map((r) => {
            const ga = goalsAgainst(r);
            return (
              <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
                <NameCell id={r.id} league={league} />
                <td className="text-center py-1.5 px-1 tabular-nums">{stat(r, 24) ?? 0}</td>
                <td className="text-center py-1.5 px-1 tabular-nums">{ga ?? "—"}</td>
                <td className="text-center py-1.5 px-1 tabular-nums font-bold">{svPct(stat(r, 25))}</td>
                <td className="text-right py-1.5 px-1 tabular-nums text-neutral-500">{toi(stat(r, 23))}</td>
                <td className="text-right py-1.5 pr-1">{ga != null ? <RatingChip r={goalieRating(stat(r, 24) ?? 0, ga)} /> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HockeyBoxScore({ players, homeNameKo, awayNameKo, playerLinkLeague }: Props) {
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

      <SkaterTable rows={rows} league={playerLinkLeague} />
      <GoalieTable rows={rows} league={playerLinkLeague} />
      <p className="mt-3 text-[10px] leading-relaxed text-neutral-500 break-keep">
        평점은 TheSports 가 주지 않아 스코어베이스가 NHL Game Score 방식(골·도움·유효슛·블록·페널티·+/-, 골리는 세이브·실점)으로
        계산했습니다. 6.3 이 보통, 경기 중에는 계속 바뀝니다.
      </p>
    </section>
  );
}
