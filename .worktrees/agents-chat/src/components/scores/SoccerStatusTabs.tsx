// 축구 페이지 상태 필터 — 전체 / 라이브 / 예정 / 종료 (AiScore 스타일).
// LeagueChips 대체로 sport=soccer 일 때만 노출.

import Link from "next/link";

export type SoccerStatusFilter = "all" | "live" | "scheduled" | "finished";

interface Props {
  active: SoccerStatusFilter;
  counts: { all: number; live: number; scheduled: number; finished: number };
  /** 일자 유지용 */
  date: string;
  /** 리그 필터 유지용 (선택) */
  league?: string | null;
}

function buildHref(date: string, league: string | null | undefined, status: SoccerStatusFilter): string {
  const params = new URLSearchParams();
  params.set("sport", "soccer");
  params.set("date", date);
  if (league) params.set("league", league);
  if (status !== "all") params.set("status", status);
  return `/scores?${params.toString()}`;
}

export default function SoccerStatusTabs({ active, counts, date, league }: Props) {
  const items: { key: SoccerStatusFilter; label: string; count: number }[] = [
    { key: "all", label: "전체", count: counts.all },
    { key: "live", label: "라이브", count: counts.live },
    { key: "scheduled", label: "예정", count: counts.scheduled },
    { key: "finished", label: "종료", count: counts.finished },
  ];

  return (
    <nav
      className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2 sm:overflow-x-auto sm:[&::-webkit-scrollbar]:hidden"
      aria-label="경기 상태 필터"
    >
      {items.map((item) => {
        const isActive = active === item.key;
        const isLive = item.key === "live";
        const baseClass =
          "flex sm:inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-2.5 sm:px-4 sm:py-2 rounded-md text-[13px] sm:text-sm font-semibold whitespace-nowrap transition-colors";
        const stateClass = isActive
          ? isLive
            ? "bg-rose-600 text-white shadow-sm"
            : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700";
        return (
          <Link
            key={item.key}
            href={buildHref(date, league, item.key)}
            className={`${baseClass} ${stateClass}`}
            aria-current={isActive ? "page" : undefined}
          >
            {isLive && (
              <span
                className={`relative flex h-2 w-2 ${isActive ? "" : "text-rose-500"}`}
                aria-hidden
              >
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${
                    isActive ? "bg-white" : "bg-rose-500"
                  }`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    isActive ? "bg-white" : "bg-rose-500"
                  }`}
                />
              </span>
            )}
            <span>{item.label}</span>
            {item.count > 0 && (
              <span
                className={`text-xs tabular-nums ${
                  isActive ? "opacity-90" : "opacity-60"
                }`}
              >
                ({item.count})
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
