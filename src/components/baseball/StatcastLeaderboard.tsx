"use client";
// MLB Statcast 리더보드 표 — 선수/팀 탭 + 컬럼 클릭 정렬. 데이터는 서버(getStatcastLeaderboard)에서 주입.
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { StatcastPlayer, StatcastTeam } from "@/lib/sports/mlb-statcast-leaderboard";

type Tab = "players" | "teams";
type SortDir = "desc" | "asc";

const fmtPct = (v: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);
const fmtEV = (v: number | null) => (v == null ? "–" : v.toFixed(1));
// 야구 관례 .460 표기
const fmtWoba = (v: number | null) =>
  v == null ? "–" : v.toFixed(3).replace(/^0/, "");

interface ColBase {
  key: string;
  label: string;
  short?: string;
  fmt: (v: number | null) => string;
  align?: "left" | "right";
}

const PLAYER_COLS: Array<ColBase & { get: (p: StatcastPlayer) => number | null }> = [
  { key: "barrelPct", label: "배럴%", fmt: fmtPct, get: (p) => p.barrelPct },
  { key: "avgEV", label: "타구속도", short: "mph", fmt: fmtEV, get: (p) => p.avgEV },
  { key: "hardHitPct", label: "하드히트%", fmt: fmtPct, get: (p) => p.hardHitPct },
  { key: "xwoba", label: "xwOBA", fmt: fmtWoba, get: (p) => p.xwoba },
];

const TEAM_COLS: Array<ColBase & { get: (t: StatcastTeam) => number | null }> = [
  { key: "barrelPct", label: "배럴%", fmt: fmtPct, get: (t) => t.barrelPct },
  { key: "avgEV", label: "타구속도", fmt: fmtEV, get: (t) => t.avgEV },
  { key: "hardHitPct", label: "하드히트%", fmt: fmtPct, get: (t) => t.hardHitPct },
  { key: "xwoba", label: "xwOBA", fmt: fmtWoba, get: (t) => t.xwoba },
];

function sortRows<T>(rows: T[], get: (r: T) => number | null, dir: SortDir): T[] {
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // null 은 항상 아래로
    if (vb == null) return -1;
    return dir === "desc" ? vb - va : va - vb;
  });
}

function SortHead({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`py-3 px-2 font-bold ${className}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-0.5 transition ${
          active ? "text-rose-600 dark:text-rose-400" : "hover:text-neutral-900 dark:hover:text-white"
        }`}
      >
        {label}
        {active &&
          (dir === "desc" ? (
            <ArrowDown className="h-3 w-3" aria-hidden />
          ) : (
            <ArrowUp className="h-3 w-3" aria-hidden />
          ))}
      </button>
    </th>
  );
}

export default function StatcastLeaderboard({
  players,
  teams,
  year,
}: {
  players: StatcastPlayer[];
  teams: StatcastTeam[];
  year: number;
}) {
  const [tab, setTab] = useState<Tab>("players");
  const [sortKey, setSortKey] = useState("xwoba");
  const [dir, setDir] = useState<SortDir>("desc");

  const clickSort = (key: string) => {
    if (key === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  const pCol = PLAYER_COLS.find((c) => c.key === sortKey) ?? PLAYER_COLS[3];
  const tCol = TEAM_COLS.find((c) => c.key === sortKey) ?? TEAM_COLS[3];
  const pRows = sortRows(players, pCol.get, dir);
  const tRows = sortRows(teams, tCol.get, dir);

  return (
    <div className="space-y-4">
      {/* 탭 */}
      <div className="flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-white/[0.06] p-1 w-fit">
        {(
          [
            { k: "players", label: "선수" },
            { k: "teams", label: "팀" },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition ${
              tab === t.k
                ? "bg-white dark:bg-white/[0.12] text-rose-600 dark:text-rose-400 shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="pl-2 pr-3 text-xs text-neutral-400 tabular-nums">{year} 시즌</span>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        컬럼 제목을 눌러 정렬하세요. 규정타석 타자 기준.{" "}
        {tab === "teams" && "팀 값은 소속 규정타석 타자의 가중 평균입니다."}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-white/10">
        {tab === "players" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-left text-xs uppercase tracking-wider text-neutral-500">
                <th className="py-3 pl-4 pr-2 font-bold">#</th>
                <th className="py-3 px-2 font-bold">선수</th>
                <th className="py-3 px-2 font-bold hidden sm:table-cell">팀</th>
                <th className="py-3 px-2 font-bold text-right hidden md:table-cell">PA</th>
                {PLAYER_COLS.map((c) => (
                  <SortHead
                    key={c.key}
                    label={c.label}
                    active={sortKey === c.key}
                    dir={dir}
                    onClick={() => clickSort(c.key)}
                    className="text-right"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pRows.map((p, i) => (
                <tr
                  key={p.playerId}
                  className="border-b border-neutral-100 dark:border-white/[0.06] last:border-0 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
                >
                  <td className="py-2.5 pl-4 pr-2 tabular-nums font-bold text-neutral-500">{i + 1}</td>
                  <td className="py-2.5 px-2">
                    <Link
                      href={`/players/${p.playerId}`}
                      className="font-semibold hover:text-rose-600 dark:hover:text-rose-400 transition"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2.5 px-2 text-neutral-500 hidden sm:table-cell">{p.teamAbbr ?? "–"}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-neutral-500 hidden md:table-cell">{p.pa || "–"}</td>
                  {PLAYER_COLS.map((c) => {
                    const active = sortKey === c.key;
                    return (
                      <td
                        key={c.key}
                        className={`py-2.5 px-2 text-right tabular-nums ${
                          active ? "font-bold text-rose-600 dark:text-rose-400" : ""
                        }`}
                      >
                        {c.fmt(c.get(p))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-white/[0.03] text-left text-xs uppercase tracking-wider text-neutral-500">
                <th className="py-3 pl-4 pr-2 font-bold">#</th>
                <th className="py-3 px-2 font-bold">팀</th>
                <th className="py-3 px-2 font-bold text-right hidden md:table-cell">타자</th>
                {TEAM_COLS.map((c) => (
                  <SortHead
                    key={c.key}
                    label={c.label}
                    active={sortKey === c.key}
                    dir={dir}
                    onClick={() => clickSort(c.key)}
                    className="text-right"
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {tRows.map((t, i) => (
                <tr
                  key={t.teamId}
                  className="border-b border-neutral-100 dark:border-white/[0.06] last:border-0 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition"
                >
                  <td className="py-2.5 pl-4 pr-2 tabular-nums font-bold text-neutral-500">{i + 1}</td>
                  <td className="py-2.5 px-2 font-semibold">
                    {t.name}
                    {t.abbr && <span className="ml-1.5 text-xs text-neutral-400">{t.abbr}</span>}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-neutral-500 hidden md:table-cell">{t.players}</td>
                  {TEAM_COLS.map((c) => {
                    const active = sortKey === c.key;
                    return (
                      <td
                        key={c.key}
                        className={`py-2.5 px-2 text-right tabular-nums ${
                          active ? "font-bold text-rose-600 dark:text-rose-400" : ""
                        }`}
                      >
                        {c.fmt(c.get(t))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
