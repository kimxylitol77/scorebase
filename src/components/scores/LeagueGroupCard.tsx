// 리그 그룹 카드 — 같은 리그 매치를 하나의 elevated 카드로 묶는다.
// 헤더(국기/배지 + 리그명 + 경기수 + 선택적 링크) + 행 슬롯. 리그명을 매 행 반복하지 않게 해 스캔성↑.

import Link from "next/link";
import type { ReactNode } from "react";
import { ALL_LEAGUES, getLeagueFlag } from "@/lib/sports/sport-leagues";
import { hasStandingsTable } from "@/lib/sports/standings-valid";
import { getLeagueBadge } from "./soccer/leagueBadge";

export default function LeagueGroupCard({
  league,
  count,
  href,
  linkLabel,
  children,
  accent,
}: {
  league: string;
  count?: number;
  href?: string | null;
  linkLabel?: string;
  children: ReactNode;
  /** 월드컵 등 강조 그룹 — amber ring */
  accent?: "wc" | null;
}) {
  const badge = getLeagueBadge(league);
  const flag = getLeagueFlag(league);
  // 리그명 클릭 → 리그 정보 페이지(/leagues). 순위표는 헤더 우측 "순위 →" 로 분리 —
  // 순위=순위 페이지 / 리그명=리그 정보 페이지 구분 (2026-08-16 네비 정리).
  const leagueHref = (ALL_LEAGUES as readonly string[]).includes(league)
    ? `/leagues/${league}`
    : null;
  const standingsHref = hasStandingsTable(league) ? `/standings/${league}` : null;
  const nameNode = (
    <>
      <span className="shrink-0 text-[13px] leading-none" aria-hidden>
        {flag || "🏆"}
      </span>
      <span className="text-[12.5px] font-extrabold tracking-tight truncate">
        {badge.label}
      </span>
      {count != null && (
        <span className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 shrink-0">
          {count}
        </span>
      )}
    </>
  );
  return (
    <section
      className={`rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-28px_rgba(15,23,42,0.20)] overflow-hidden dark:bg-white/[0.045] dark:shadow-none ${
        accent === "wc"
          ? "border-amber-400/70 dark:border-amber-500/40"
          : "border-neutral-200/80 dark:border-white/10"
      }`}
    >
      <div className="flex items-center gap-2 px-3.5 sm:px-4 py-2.5 border-b border-neutral-200/70 dark:border-white/10">
        {leagueHref ? (
          <Link
            href={leagueHref}
            prefetch={false}
            aria-label={`${badge.label} 리그 정보`}
            className="flex items-center gap-2 min-w-0 -mx-1 px-1 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            {nameNode}
          </Link>
        ) : (
          nameNode
        )}
        {href ? (
          <Link
            href={href}
            prefetch={false}
            className="ml-auto shrink-0 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
          >
            {linkLabel ?? "순위"} →
          </Link>
        ) : standingsHref ? (
          <Link
            href={standingsHref}
            prefetch={false}
            className="ml-auto shrink-0 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
          >
            순위 →
          </Link>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
