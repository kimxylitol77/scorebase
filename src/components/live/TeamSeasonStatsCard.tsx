// api-football /teams/statistics 기반 양 팀 시즌 통계 비교 카드.
// 친선·예선처럼 리그 standings 없는 매치에 의미 큼.

import type { TeamSeasonStats } from "@/lib/sports/api-football-extras";

interface Props {
  home: TeamSeasonStats | null;
  away: TeamSeasonStats | null;
  homeNameKo: string;
  awayNameKo: string;
}

function Row({
  label,
  home,
  away,
  highlight = "higher",
}: {
  label: string;
  home: number | string | null;
  away: number | string | null;
  highlight?: "higher" | "lower" | "none";
}) {
  const isHomeBig =
    typeof home === "number" && typeof away === "number"
      ? highlight === "higher"
        ? home > away
        : highlight === "lower"
          ? home < away
          : false
      : false;
  const isAwayBig =
    typeof home === "number" && typeof away === "number"
      ? highlight === "higher"
        ? away > home
        : highlight === "lower"
          ? away < home
          : false
      : false;
  return (
    <div className="grid grid-cols-3 items-center py-1.5 text-sm">
      <div className={`text-right tabular-nums ${isHomeBig ? "font-bold text-blue-600 dark:text-blue-400" : "text-neutral-700 dark:text-neutral-300"}`}>
        {home ?? "—"}
      </div>
      <div className="text-center text-[11px] text-neutral-500">{label}</div>
      <div className={`text-left tabular-nums ${isAwayBig ? "font-bold text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
        {away ?? "—"}
      </div>
    </div>
  );
}

function formChip(form: string | null): React.ReactNode {
  if (!form) return null;
  const recent = form.slice(-5).split("");
  return (
    <div className="flex gap-1 justify-center">
      {recent.map((c, i) => {
        const cls =
          c === "W"
            ? "bg-emerald-500/80 text-white"
            : c === "D"
              ? "bg-neutral-400/80 text-white"
              : c === "L"
                ? "bg-rose-500/80 text-white"
                : "bg-neutral-200 dark:bg-neutral-800";
        return (
          <span key={i} className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${cls}`}>
            {c}
          </span>
        );
      })}
    </div>
  );
}

export default function TeamSeasonStatsCard({ home, away, homeNameKo, awayNameKo }: Props) {
  if (!home && !away) return null;
  // 동일 리그·시즌 가정. 하나만 있어도 표시.
  const ctx = home ?? away!;
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          시즌 통계
          <span className="ml-2 text-[11px] text-neutral-500 font-normal">
            {ctx.leagueName} · {ctx.season}
          </span>
        </h2>
        <span className="text-[10px] text-neutral-400">api-football</span>
      </header>

      {/* 팀 헤더 */}
      <div className="grid grid-cols-3 items-center text-xs">
        <div className="text-right text-blue-600 dark:text-blue-400 font-medium truncate">{homeNameKo}</div>
        <div></div>
        <div className="text-left text-rose-600 dark:text-rose-400 font-medium truncate">{awayNameKo}</div>
      </div>

      {/* 최근 폼 */}
      {(home?.form || away?.form) && (
        <div className="grid grid-cols-3 items-center">
          <div className="flex justify-end">{formChip(home?.form ?? null)}</div>
          <div className="text-center text-[11px] text-neutral-500">최근 5경기</div>
          <div className="flex justify-start">{formChip(away?.form ?? null)}</div>
        </div>
      )}

      {/* 메트릭 */}
      <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
        <Row label="경기수" home={home?.played ?? null} away={away?.played ?? null} highlight="none" />
        <Row label="승" home={home?.wins ?? null} away={away?.wins ?? null} highlight="higher" />
        <Row label="무" home={home?.draws ?? null} away={away?.draws ?? null} highlight="none" />
        <Row label="패" home={home?.loses ?? null} away={away?.loses ?? null} highlight="lower" />
        <Row label="득점" home={home?.goalsFor ?? null} away={away?.goalsFor ?? null} highlight="higher" />
        <Row label="실점" home={home?.goalsAgainst ?? null} away={away?.goalsAgainst ?? null} highlight="lower" />
        <Row label="무실점" home={home?.cleanSheet ?? null} away={away?.cleanSheet ?? null} highlight="higher" />
        <Row label="무득점" home={home?.failedToScore ?? null} away={away?.failedToScore ?? null} highlight="lower" />
      </div>
    </section>
  );
}
