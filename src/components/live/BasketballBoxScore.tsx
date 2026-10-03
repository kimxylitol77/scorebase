// 농구 선수 기록(박스스코어) — 경기 리더 카드 + 팀별 표(이름 열 고정·선발/벤치·팀 합계·미출전·열 머리 정렬·선수 링크).
// 경기 상세 본문(SportLiveDetail)이 /api/live/match 응답(summary.homePlayers/awayPlayers)으로 "팀 STATS 비교" 바로 아래에 그린다.
// 데이터 출처: KBL 공식(선발·+/-·TO·파울)·WKBL 공식(TO·파울)·ESPN(NBA·WNBA). 원천에 없는 열은 숨긴다.

"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

export interface PlayerBox {
  name: string;
  pos?: string | null;
  starter?: boolean;
  min: string;
  points: number;
  reb: number;
  oreb?: number | null;
  assists: number;
  steals?: number | null;
  blocks?: number | null;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  pid?: string | null;
  to?: number | null;
  pf?: number | null;
  plusMinus?: number | null;
  dnp?: boolean;
}

/** 선수 상세 페이지가 있는 리그 — pid 로 /players/{pid}?league= 링크 (NBA 는 API 가 ESPN id 를 BDL id 로 바꿔 싣는다) */
const LINK_LEAGUES = new Set(["NBA", "KBL", "WKBL"]);
const SOURCE: Record<string, string> = { KBL: "KBL 공식", WKBL: "WKBL 공식", NBA: "ESPN", WNBA: "ESPN" };

type Filter = "ALL" | "HOME" | "AWAY";
type SortKey = "min" | "points" | "reb" | "assists" | "steals" | "blocks" | "to" | "pf" | "fg" | "tp" | "ft" | "plusMinus";
type Sort = { key: SortKey; dir: "desc" | "asc" } | null;

const minSec = (m: string) => {
  const [a, b] = (m || "0").split(":").map(Number);
  return (a || 0) * 60 + (b || 0);
};
const sortValue = (p: PlayerBox, k: SortKey): number => {
  switch (k) {
    case "min": return minSec(p.min);
    case "fg": return p.fgm;
    case "tp": return p.tpm;
    case "ft": return p.ftm;
    default: return (p[k] as number | null | undefined) ?? -Infinity;
  }
};
const pct = (m: number, a: number) => (a > 0 ? `${Math.round((m / a) * 100)}%` : "-");

/** 선수 기록 그리기 — 폴링 없이 받은 선수 목록으로 */
export function BasketballBoxScore({
  league, home, away, homeNameKo, awayNameKo,
}: { league: string; home: PlayerBox[]; away: PlayerBox[]; homeNameKo: string; awayNameKo: string }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>(null);
  const all = [...away, ...home];
  // 원천이 주는 열만 — 한 명이라도 값이 있으면 보인다
  const cols = {
    to: all.some((p) => p.to != null),
    pf: all.some((p) => p.pf != null),
    plusMinus: all.some((p) => p.plusMinus != null),
  };
  const linkLeague = LINK_LEAGUES.has(league) ? league : null;
  const onSort = (key: SortKey) =>
    setSort((s) => (!s || s.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null));

  return (
    <div className="space-y-3">
      <LeaderCards away={away} home={home} awayName={awayNameKo} homeName={homeNameKo} linkLeague={linkLeague} />

      <div className="flex items-center gap-1.5">
        {(
          [
            ["ALL", "전체"],
            ["AWAY", awayNameKo],
            ["HOME", homeNameKo],
          ] as Array<[Filter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              filter === key
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/[0.06] dark:text-white/60 dark:hover:bg-white/10"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {(filter === "ALL" || filter === "AWAY") && away.length > 0 && (
        <BoxTable teamName={awayNameKo} players={away} cols={cols} sort={sort} onSort={onSort} linkLeague={linkLeague} />
      )}
      {(filter === "ALL" || filter === "HOME") && home.length > 0 && (
        <BoxTable teamName={homeNameKo} players={home} cols={cols} sort={sort} onSort={onSort} linkLeague={linkLeague} />
      )}

      <p className="text-[11px] text-neutral-500">
        ⓘ 데이터 출처: {SOURCE[league] ?? "-"}. 열 머리를 누르면 정렬(한 번 더 누르면 오름차순, 세 번째는 원래 순서).
        FG/3PT/FT 는 성공-시도{cols.plusMinus ? ", +/- 는 코트에 있는 동안 팀 득실차" : ""}.
      </p>
    </div>
  );
}

function PlayerName({ p, linkLeague }: { p: PlayerBox; linkLeague: string | null }) {
  const cls = "font-medium text-zinc-900 dark:text-white";
  return linkLeague && p.pid ? (
    <Link href={`/players/${p.pid}?league=${linkLeague}`} className={`${cls} hover:underline underline-offset-2`}>
      {p.name}
    </Link>
  ) : (
    <span className={cls}>{p.name}</span>
  );
}

/** 경기 리더 — 두 팀 통틀어 득점·리바운드·어시스트 최고 선수 */
function LeaderCards({
  away, home, awayName, homeName, linkLeague,
}: { away: PlayerBox[]; home: PlayerBox[]; awayName: string; homeName: string; linkLeague: string | null }) {
  const pool = [
    ...away.filter((p) => !p.dnp).map((p) => ({ p, team: awayName })),
    ...home.filter((p) => !p.dnp).map((p) => ({ p, team: homeName })),
  ];
  const cats: Array<[string, (p: PlayerBox) => number]> = [
    ["득점", (p) => p.points],
    ["리바운드", (p) => p.reb],
    ["어시스트", (p) => p.assists],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cats.map(([label, f]) => {
        const best = pool.reduce<(typeof pool)[number] | null>((b, x) => (!b || f(x.p) > f(b.p) ? x : b), null);
        if (!best) return null;
        return (
          <div key={label} className="min-w-0 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <div className="text-[11px] text-zinc-500 dark:text-white/50">{label}</div>
            <div className="text-xl font-bold tabular-nums text-zinc-900 dark:text-white">{f(best.p)}</div>
            <div className="truncate text-xs">
              <PlayerName p={best.p} linkLeague={linkLeague} />
            </div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-white/50">{best.team}</div>
          </div>
        );
      })}
    </div>
  );
}

function BoxTable({
  teamName, players, cols, sort, onSort, linkLeague,
}: {
  teamName: string;
  players: PlayerBox[];
  cols: { to: boolean; pf: boolean; plusMinus: boolean };
  sort: Sort;
  onSort: (k: SortKey) => void;
  linkLeague: string | null;
}) {
  const played = players.filter((p) => !p.dnp);
  const dnp = players.filter((p) => p.dnp);
  const hasStarters = played.some((p) => p.starter);
  // 정렬 중이면 한 줄로, 아니면 원천 순서(선발 → 벤치)
  const rows = sort
    ? [...played].sort((a, b) => (sort.dir === "desc" ? sortValue(b, sort.key) - sortValue(a, sort.key) : sortValue(a, sort.key) - sortValue(b, sort.key)))
    : played;
  const groups: Array<{ label: string | null; rows: PlayerBox[] }> =
    !sort && hasStarters
      ? [
          { label: "선발", rows: rows.filter((p) => p.starter) },
          { label: "벤치", rows: rows.filter((p) => !p.starter) },
        ]
      : [{ label: null, rows }];

  const sum = (f: (p: PlayerBox) => number | null | undefined) => played.reduce((s, p) => s + (f(p) ?? 0), 0);
  const t = {
    points: sum((p) => p.points), reb: sum((p) => p.reb), assists: sum((p) => p.assists),
    steals: sum((p) => p.steals), blocks: sum((p) => p.blocks), to: sum((p) => p.to), pf: sum((p) => p.pf),
    fgm: sum((p) => p.fgm), fga: sum((p) => p.fga), tpm: sum((p) => p.tpm), tpa: sum((p) => p.tpa),
    ftm: sum((p) => p.ftm), fta: sum((p) => p.fta),
  };

  const headers: Array<[SortKey, string, boolean]> = [
    ["min", "MIN", true], ["points", "PTS", true], ["reb", "REB", true], ["assists", "AST", true],
    ["steals", "STL", true], ["blocks", "BLK", true], ["to", "TO", cols.to], ["pf", "PF", cols.pf],
    ["fg", "FG", true], ["tp", "3PT", true], ["ft", "FT", true], ["plusMinus", "+/-", cols.plusMinus],
  ];
  const shown = headers.filter(([, , on]) => on);
  // 이름 열 고정 — 가로 스크롤해도 누구 기록인지 보인다
  const stickyTd = "sticky left-0 z-10 bg-white dark:bg-zinc-900";
  const num = "px-1.5 py-2 text-right tabular-nums";
  const muted = "text-zinc-600 dark:text-white/70";

  const cells = (p: PlayerBox) => (
    <>
      <td className={`${num} text-zinc-500`}>{p.min || "-"}</td>
      <td className={`${num} font-bold text-zinc-900 dark:text-white`}>{p.points}</td>
      <td className={num}>{p.reb}</td>
      <td className={num}>{p.assists}</td>
      <td className={num}>{p.steals ?? "-"}</td>
      <td className={num}>{p.blocks ?? "-"}</td>
      {cols.to && <td className={num}>{p.to ?? "-"}</td>}
      {cols.pf && <td className={num}>{p.pf ?? "-"}</td>}
      <td className={`${num} ${muted}`}>{p.fgm}-{p.fga}</td>
      <td className={`${num} ${muted}`}>{p.tpm}-{p.tpa}</td>
      <td className={`${num} ${muted}`}>{p.ftm}-{p.fta}</td>
      {cols.plusMinus && (
        <td className={`${num} pr-2.5 ${p.plusMinus != null && p.plusMinus > 0 ? "text-emerald-600 dark:text-emerald-400" : p.plusMinus != null && p.plusMinus < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
          {p.plusMinus == null ? "-" : p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}
        </td>
      )}
    </>
  );

  return (
    <div>
      <div className="mb-1.5 text-xs font-bold text-zinc-700 dark:text-white/70">{teamName}</div>
      {/* 고정 열이 불투명해야 해서 표 전체 배경을 칠한다(반투명 카드 배경이면 고정 열만 다른 색으로 뜬다) */}
      <div className="overflow-x-auto rounded-[1rem] bg-white ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-white/45">
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-50 px-2.5 py-2 text-left font-semibold dark:bg-zinc-800">선수</th>
              {shown.map(([key, label]) => (
                <th key={key} className="px-1.5 py-2 text-right font-semibold">
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className={`uppercase hover:text-zinc-900 dark:hover:text-white ${sort?.key === key ? "text-zinc-900 dark:text-white" : ""}`}
                  >
                    {label}
                    {sort?.key === key ? (sort.dir === "desc" ? " ▼" : " ▲") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/10">
            {groups.map((g) => (
              <GroupRows key={g.label ?? "all"} label={g.label} colSpan={shown.length + 1}>
                {g.rows.map((p, i) => (
                  <tr key={`${p.name}-${i}`}>
                    <td className={`${stickyTd} px-2.5 py-2 text-left`}>
                      <PlayerName p={p} linkLeague={linkLeague} />
                      {p.pos && <span className="ml-1 text-[10px] text-zinc-400">{p.pos}</span>}
                    </td>
                    {cells(p)}
                  </tr>
                ))}
              </GroupRows>
            ))}
            {dnp.map((p, i) => (
              <tr key={`dnp-${p.name}-${i}`} className="text-zinc-400 dark:text-white/35">
                <td className={`${stickyTd} px-2.5 py-2 text-left`}>
                  <PlayerName p={p} linkLeague={linkLeague} />
                </td>
                <td colSpan={shown.length} className="px-2.5 py-2 text-left text-[11px]">미출전</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-black/10 bg-zinc-50 font-semibold dark:border-white/15 dark:bg-zinc-800">
            <tr>
              <td className="sticky left-0 z-10 bg-zinc-50 px-2.5 py-2 text-left dark:bg-zinc-800">합계</td>
              <td className={num} />
              <td className={`${num} text-zinc-900 dark:text-white`}>{t.points}</td>
              <td className={num}>{t.reb}</td>
              <td className={num}>{t.assists}</td>
              <td className={num}>{t.steals}</td>
              <td className={num}>{t.blocks}</td>
              {cols.to && <td className={num}>{t.to}</td>}
              {cols.pf && <td className={num}>{t.pf}</td>}
              <td className={num}>{t.fgm}-{t.fga}</td>
              <td className={num}>{t.tpm}-{t.tpa}</td>
              <td className={num}>{t.ftm}-{t.fta}</td>
              {cols.plusMinus && <td className={num} />}
            </tr>
            <tr className="text-[11px] font-normal text-zinc-500 dark:text-white/50">
              <td className="sticky left-0 z-10 bg-zinc-50 px-2.5 pb-2 text-left dark:bg-zinc-800">성공률</td>
              <td colSpan={4 + 2 + (cols.to ? 1 : 0) + (cols.pf ? 1 : 0)} />
              <td className={`${num} pt-0`}>{pct(t.fgm, t.fga)}</td>
              <td className={`${num} pt-0`}>{pct(t.tpm, t.tpa)}</td>
              <td className={`${num} pt-0`}>{pct(t.ftm, t.fta)}</td>
              {cols.plusMinus && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GroupRows({ label, colSpan, children }: { label: string | null; colSpan: number; children: ReactNode }) {
  return (
    <>
      {label && (
        <tr className="bg-zinc-50 dark:bg-zinc-800">
          <td className="sticky left-0 z-10 bg-zinc-50 px-2.5 py-1 text-left text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-white/45">
            {label}
          </td>
          <td colSpan={colSpan - 1} />
        </tr>
      )}
      {children}
    </>
  );
}
