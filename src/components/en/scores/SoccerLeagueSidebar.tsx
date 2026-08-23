// scores__SoccerLeagueSidebar (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import Link from "next/link";
import { POPULAR_SOCCER_LEAGUES, COUNTRY_BY_LEAGUE, COUNTRY_FLAG, COUNTRY_ORDER, LEAGUE_ORDER } from "@/lib/sports/sport-leagues";
import { LEAGUE_DISPLAY_EN as LEAGUE_DISPLAY } from "@/lib/i18n/en";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { enLeagueName, enCountryName } from "@/lib/i18n/en";
import SoccerLeagueSidebarList, { type SidebarLeagueItem } from "./SoccerLeagueSidebarList";

interface Props {
  /** 표시 대상 리그 (보통 leaguesForSport("soccer")) */
  leagues: string[];
  /** 현재 선택된 리그 — null/undefined = "전체" */
  activeLeague?: string | null;
  /** 일자 유지용 */
  date: string;
  /** 상태 필터 유지용 */
  status?: string | null;
  /** 정렬 방식 유지용 (선택) — "time" 만 URL 에 실림 */
  sort?: string | null;
  /** 리그별 오늘 경기 수 — 주어지면 경기 있는 리그만 표시 + 카운트 뱃지. */
  matchCounts?: Record<string, number>;
  /** 전체 경기 수 ("전체 리그" 옆 카운트) */
  totalCount?: number;
}

function buildHref(
  date: string,
  status: string | null | undefined,
  league?: string | null,
  sort?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("sport", "soccer");
  params.set("date", date);
  if (league) params.set("league", league);
  if (status && status !== "all") params.set("status", status);
  if (sort === "time") params.set("sort", "time");
  return `/scores?${params.toString()}`;
}

function sortByLeagueOrder(a: string, b: string): number {
  const oa = LEAGUE_ORDER[a] ?? 999;
  const ob = LEAGUE_ORDER[b] ?? 999;
  if (oa !== ob) return oa - ob;
  return enLeagueName(a).localeCompare(enLeagueName(b), "en");
}

function leagueLogoUrl(league: string): string | null {
  const id = API_FOOTBALL_LEAGUE_ID[league];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}

export default function SoccerLeagueSidebar({
  leagues,
  activeLeague,
  date,
  status,
  sort,
  matchCounts,
  totalCount,
}: Props) {
  // matchCounts 주어지면 경기 있는 리그만 노출. 없으면(하위호환) 전체.
  const cnt = (l: string) => matchCounts?.[l] ?? 0;
  const hasMatch = (l: string) => !matchCounts || cnt(l) > 0;

  // 인기 리그 — POPULAR_SOCCER_LEAGUES 중 leagues 에 있고 경기 있는 것만 (구획 분배는 클라이언트 목록이)
  const popular = POPULAR_SOCCER_LEAGUES.filter((l) => leagues.includes(l) && hasMatch(l));

  // 목록 아이템 메타 — 경기 있는 리그만. 정렬은 리그 순서 → 이름.
  const items: SidebarLeagueItem[] = leagues
    .filter(hasMatch)
    .sort(sortByLeagueOrder)
    .map((l) => {
      const country = enCountryName(COUNTRY_BY_LEAGUE[l] ?? "") || null;
      return {
        code: l,
        name: enLeagueName(l),
        logo: leagueLogoUrl(l),
        href: buildHref(date, status, l, sort),
        count: cnt(l),
        country,
        flag: country ? (COUNTRY_FLAG[country] ?? "") : "",
      };
    });

  const itemClass =
    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight transition-colors text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";
  const itemActiveClass =
    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold";

  return (
    <aside
      className="hidden lg:block w-48 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
      aria-label="Football leagues"
    >
      {/* 전체 */}
      <Link
        href={buildHref(date, status, null, sort)}
        className={!activeLeague ? itemActiveClass : itemClass}
      >
        <span className="text-[14px] leading-none">⚽</span>
        <span className="truncate">All leagues</span>
        {totalCount != null && (
          <span className="ml-auto pl-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 tabular-nums">
            {totalCount}
          </span>
        )}
      </Link>

      {/* 즐겨찾기 → 인기 → 오늘 경기 많은 리그 → 국가별(기본 접힘) + 검색 */}
      <SoccerLeagueSidebarList
        items={items}
        popular={popular}
        countryOrder={COUNTRY_ORDER}
        activeLeague={activeLeague}
      />
    </aside>
  );
}
