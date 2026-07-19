// 축구 페이지 보기 방식 토글 — 리그별 그룹(기본) / 시간순 평면 (?sort=time).
// SoccerStatusTabs 와 동일 칩 톤. sport=soccer 일 때만 노출.

import Link from "next/link";

export type SoccerSortMode = "league" | "time";

interface Props {
  active: SoccerSortMode;
  /** 일자 유지용 */
  date: string;
  /** 리그 필터 유지용 (선택) */
  league?: string | null;
  /** 상태 필터 유지용 (선택) */
  status?: string | null;
}

function buildHref(
  date: string,
  league: string | null | undefined,
  status: string | null | undefined,
  sort: SoccerSortMode,
): string {
  const params = new URLSearchParams();
  params.set("sport", "soccer");
  params.set("date", date);
  if (league) params.set("league", league);
  if (status && status !== "all") params.set("status", status);
  if (sort === "time") params.set("sort", "time");
  return `/scores?${params.toString()}`;
}

export default function SoccerSortToggle({ active, date, league, status }: Props) {
  const items: { key: SoccerSortMode; label: string }[] = [
    { key: "league", label: "리그별" },
    { key: "time", label: "시간순" },
  ];
  return (
    <nav className="flex gap-1.5" aria-label="경기 정렬 방식">
      {items.map((item) => {
        const isActive = active === item.key;
        return (
          <Link
            key={item.key}
            href={buildHref(date, league, status, item.key)}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
