// /scores "내 경기" 보조 — 오늘 목록에 없는 즐겨찾기(어제 종료·다른 날 예정)를 /api/matches/by-ids 로 받아
// 최종 점수(FT)·예정 시각과 함께 유지한다. 별표를 해제할 때까지 사라지지 않는다(2026-09-21 사용자 요청).
"use client";
import { useEffect, useState } from "react";
import LeagueBadge from "../LeagueBadge";
import FavoriteStar from "./FavoriteStar";
import { postponedLabel } from "@/lib/sports/sport-leagues";

export interface OtherDayRow {
  id: string;
  league: string;
  status: string; // LIVE | FINISHED | SCHEDULED | POSTPONED
  startTime: string;
  homeName: string;
  awayName: string;
  homeLogo: string | null;
  awayLogo: string | null;
  homeScore: number | null;
  awayScore: number | null;
}

/** 오늘 목록(todayIds) 밖의 즐겨찾기 숫자 id 를 60초마다 by-ids 로 조회. 종료 → 예정 순, 최근 경기 먼저. */
export function useOtherDayFavorites(favIds: Set<string>, todayIds: string[]): OtherDayRow[] {
  const [rows, setRows] = useState<OtherDayRow[]>([]);
  const today = new Set(todayIds);
  const missing = [...favIds].filter((id) => !today.has(id) && /^\d+$/.test(id)).sort();
  const key = missing.join(",");
  useEffect(() => {
    if (!key) {
      // 즐겨찾기 변화에 따른 파생 리셋 — 외부 저장소(localStorage) 동기화라 effect 가 맞다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows([]);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/matches/by-ids?ids=${key}`, { cache: "no-store" });
        if (!res.ok) return;
        const json: { matches?: Array<Omit<OtherDayRow, "id"> & { id: number }> } = await res.json();
        if (!alive) return;
        const order = (s: string) => (s === "LIVE" ? 0 : s === "FINISHED" ? 1 : 2);
        setRows(
          (json.matches ?? [])
            .map((m) => ({ ...m, id: String(m.id) }))
            .sort((a, b) => order(a.status) - order(b.status) || (a.status === "SCHEDULED" ? a.startTime.localeCompare(b.startTime) : b.startTime.localeCompare(a.startTime))),
        );
      } catch {
        // 다음 주기 재시도
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  return rows;
}

function fmtKst(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("month")}/${g("day")} ${g("hour")}:${g("minute")}`;
}

export function OtherDayFavoriteRows({ rows, title }: { rows: OtherDayRow[]; title: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <h3 className="text-[13px] font-semibold tracking-tight text-neutral-700 dark:text-neutral-300">{title}</h3>
        <span className="text-[11px] text-neutral-400 tabular-nums">{rows.length}경기 · 별표를 해제할 때까지 유지</span>
      </div>
      <ul className="rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 divide-y divide-neutral-100 dark:divide-neutral-800">
        {rows.map((m) => {
          const done = m.status === "FINISHED";
          const label = m.status === "POSTPONED" ? postponedLabel(m.league) : done ? "종료 FT" : m.status === "LIVE" ? "LIVE" : fmtKst(m.startTime);
          return (
            <li key={m.id} className={`grid grid-cols-[auto_3.25rem_1fr_auto_1fr_auto] items-center gap-2 px-2 py-2 text-[12px] ${done ? "opacity-70" : ""}`}>
              <FavoriteStar matchId={m.id} stopPropagation={false} />
              <span className="min-w-0 overflow-hidden [&>*]:max-w-full [&>*]:truncate [&>*]:whitespace-nowrap"><LeagueBadge league={m.league} size="sm" /></span>
              <span className="flex items-center justify-end gap-1.5 min-w-0">
                <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">{m.homeName}</span>
                {m.homeLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.homeLogo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
                )}
              </span>
              <span className="whitespace-nowrap font-black tabular-nums text-neutral-900 dark:text-white">
                {m.homeScore != null && m.awayScore != null && m.status !== "SCHEDULED" ? `${m.homeScore} - ${m.awayScore}` : <span className="text-neutral-400">vs</span>}
              </span>
              <span className="flex items-center gap-1.5 min-w-0">
                {m.awayLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.awayLogo} alt="" className="h-4 w-4 shrink-0 object-contain" loading="lazy" />
                )}
                <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">{m.awayName}</span>
              </span>
              <span className={`whitespace-nowrap text-[10px] font-semibold tabular-nums ${m.status === "LIVE" ? "text-rose-600 dark:text-rose-400" : "text-neutral-400"}`}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
