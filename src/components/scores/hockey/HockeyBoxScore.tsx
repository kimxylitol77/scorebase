// 하키 선수 박스스코어 — TheSports detailLive.players (home/away). 팀 탭(로고) + 공격수·수비수·골리 구획(ESPN 박스스코어 방식).
// 코드 의미·평점 계산은 lib/sports/hockey/box(게임센터와 공용). player_id → 한글·포지션·등번호(nhl-live-names).

"use client";

import { useState } from "react";
import Link from "next/link";
import { nhlPlayerInfo } from "@/lib/sports/nhl-live-names";
import { ratingColor } from "@/lib/sports/hockey/game-score";
import {
  goalsAgainstOf, isGoalie, isSkater, ratingOf, statOf, toiLabel,
  type HockeyPlayerRow,
} from "@/lib/sports/hockey/box";

export type { HockeyPlayerRow };

interface Props {
  players: { home?: HockeyPlayerRow[]; away?: HockeyPlayerRow[] };
  homeNameKo: string;
  awayNameKo: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  homeColor?: string;
  awayColor?: string;
  /** 선수 페이지가 있는 리그면 이름에 /players/{id}?league= 링크 (KHL·유럽 하키 — ts id 체계가 같다) */
  playerLinkLeague?: string;
}

const TH = "text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10 [&>th]:whitespace-nowrap [&>th]:py-1.5 [&>th]:font-semibold";

function name(id: string): { ko: string; pos?: string; no?: number } {
  const info = nhlPlayerInfo(id);
  return { ko: info?.ko || info?.en || "선수", pos: info?.pos, no: info?.no };
}

function RatingChip({ r }: { r: number | null }) {
  if (r == null) return <span className="text-neutral-400">—</span>;
  return (
    <span className="inline-block min-w-[2.1rem] rounded px-1 py-0.5 text-center text-[11px] font-bold tabular-nums text-white" style={{ background: ratingColor(r) }}>
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
        <span className="truncate font-semibold">
          {league ? <Link href={`/players/${id}?league=${league}`} className="hover:underline">{n.ko}</Link> : n.ko}
        </span>
        {n.pos && <span className="shrink-0 rounded bg-neutral-100 px-1 text-[9px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-400">{n.pos}</span>}
      </div>
    </td>
  );
}

function GroupRow({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="pt-3 pb-1 pl-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">{label}</td>
    </tr>
  );
}

function SkaterRows({ rows, league }: { rows: HockeyPlayerRow[]; league?: string }) {
  return (
    <>
      {rows.map((r) => {
        const pm = statOf(r, 56);
        return (
          <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
            <NameCell id={r.id} league={league} />
            <td className="text-center py-1.5 px-1 tabular-nums font-bold">{statOf(r, 26) ?? 0}</td>
            <td className="text-center py-1.5 px-1 tabular-nums">{statOf(r, 27) ?? 0}</td>
            <td className={`text-center py-1.5 px-1 tabular-nums ${pm != null && pm > 0 ? "text-emerald-600 dark:text-emerald-400" : pm != null && pm < 0 ? "text-rose-500" : "text-neutral-500"}`}>
              {pm == null ? "—" : pm > 0 ? `+${pm}` : pm}
            </td>
            <td className="text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{statOf(r, 28) ?? 0}</td>
            <td className="hidden sm:table-cell text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{statOf(r, 29) ?? 0}</td>
            <td className="hidden sm:table-cell text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{statOf(r, 30) ?? 0}</td>
            <td className="hidden sm:table-cell text-center py-1.5 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{statOf(r, 22) ?? 0}</td>
            <td className="text-right py-1.5 px-1 tabular-nums text-neutral-500">{toiLabel(statOf(r, 23))}</td>
            <td className="text-right py-1.5 pr-1"><RatingChip r={ratingOf(r)} /></td>
          </tr>
        );
      })}
    </>
  );
}

function SkaterTable({ rows, league }: { rows: HockeyPlayerRow[]; league?: string }) {
  const byPoints = (a: HockeyPlayerRow, b: HockeyPlayerRow) =>
    (statOf(b, 26) ?? 0) + (statOf(b, 27) ?? 0) - ((statOf(a, 26) ?? 0) + (statOf(a, 27) ?? 0)) ||
    (ratingOf(b) ?? 0) - (ratingOf(a) ?? 0);
  const skaters = rows.filter(isSkater);
  if (skaters.length === 0) return null;
  const defense = skaters.filter((r) => name(r.id).pos === "D").sort(byPoints);
  const forwards = skaters.filter((r) => name(r.id).pos !== "D").sort(byPoints);
  return (
    <table className="w-full text-xs border-separate border-spacing-0">
      <thead>
        <tr className={TH}>
          <th className="text-left pl-1">선수</th>
          <th className="text-center px-1 w-7">골</th>
          <th className="text-center px-1 w-7">도움</th>
          <th className="text-center px-1 w-8">+/-</th>
          <th className="text-center px-1 w-8">슈팅</th>
          <th className="hidden sm:table-cell text-center px-1 w-8">히트</th>
          <th className="hidden sm:table-cell text-center px-1 w-8">블록</th>
          <th className="hidden sm:table-cell text-center px-1 w-8">PIM</th>
          <th className="text-right px-1 w-11">출전</th>
          <th className="text-right pr-1 w-11">평점</th>
        </tr>
      </thead>
      <tbody>
        {forwards.length > 0 && <GroupRow label="공격수" cols={10} />}
        <SkaterRows rows={forwards} league={league} />
        {defense.length > 0 && <GroupRow label="수비수" cols={10} />}
        <SkaterRows rows={defense} league={league} />
      </tbody>
    </table>
  );
}

function GoalieTable({ rows, league }: { rows: HockeyPlayerRow[]; league?: string }) {
  const goalies = rows.filter((r) => isGoalie(r) && (statOf(r, 23) ?? 0) > 0);
  if (goalies.length === 0) return null;
  return (
    <table className="mt-2 w-full text-xs border-separate border-spacing-0">
      <thead>
        <tr className={TH}>
          <th className="text-left pl-1">골리</th>
          <th className="text-center px-1 w-10">세이브</th>
          <th className="text-center px-1 w-8">실점</th>
          <th className="text-center px-1 w-12">선방률</th>
          <th className="text-right px-1 w-11">출전</th>
          <th className="text-right pr-1 w-11">평점</th>
        </tr>
      </thead>
      <tbody>
        {goalies.map((r) => {
          const pct = statOf(r, 25);
          return (
            <tr key={r.id} className="border-b border-neutral-100 dark:border-white/5">
              <NameCell id={r.id} league={league} />
              <td className="text-center py-1.5 px-1 tabular-nums">{statOf(r, 24) ?? 0}</td>
              <td className="text-center py-1.5 px-1 tabular-nums">{goalsAgainstOf(r) ?? "—"}</td>
              <td className="text-center py-1.5 px-1 tabular-nums font-bold">{pct == null ? "—" : `${(pct > 1 ? pct : pct * 100).toFixed(1)}%`}</td>
              <td className="text-right py-1.5 px-1 tabular-nums text-neutral-500">{toiLabel(statOf(r, 23))}</td>
              <td className="text-right py-1.5 pr-1"><RatingChip r={ratingOf(r)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function HockeyBoxScore({ players, homeNameKo, awayNameKo, homeLogo, awayLogo, homeColor, awayColor, playerLinkLeague }: Props) {
  const home = players?.home ?? [];
  const away = players?.away ?? [];
  const [tab, setTab] = useState<"home" | "away">("home");
  if (home.length === 0 && away.length === 0) return null;
  const rows = tab === "home" ? home : away;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">선수 기록</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900">
        {(["home", "away"] as const).map((t) => {
          const active = t === tab;
          const label = t === "home" ? homeNameKo : awayNameKo;
          const logo = t === "home" ? homeLogo : awayLogo;
          const color = t === "home" ? homeColor : awayColor;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                active ? "bg-white shadow-sm dark:bg-neutral-800" : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
              style={active && color ? { boxShadow: `inset 0 -2px 0 ${color}` } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo && <img src={logo} alt="" width={16} height={16} className="h-4 w-4 shrink-0 object-contain" />}
              <span className="truncate">{label}</span>
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
