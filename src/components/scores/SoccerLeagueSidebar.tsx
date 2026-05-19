// 축구 페이지 좌측 사이드바 — 인기 리그 + 국가별 그룹 (AiScore 스타일).
// 데스크탑(lg+)에서만 노출, 모바일은 hidden.

import Link from "next/link";
import Image from "next/image";
import {
  POPULAR_SOCCER_LEAGUES,
  COUNTRY_BY_LEAGUE,
  COUNTRY_FLAG,
  COUNTRY_ORDER,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
} from "@/lib/sports/sport-leagues";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";

interface Props {
  /** 표시 대상 리그 (보통 leaguesForSport("soccer")) */
  leagues: string[];
  /** 현재 선택된 리그 — null/undefined = "전체" */
  activeLeague?: string | null;
  /** 일자 유지용 */
  date: string;
  /** 상태 필터 유지용 */
  status?: string | null;
}

function buildHref(date: string, status: string | null | undefined, league?: string | null): string {
  const params = new URLSearchParams();
  params.set("sport", "soccer");
  params.set("date", date);
  if (league) params.set("league", league);
  if (status && status !== "all") params.set("status", status);
  return `/scores?${params.toString()}`;
}

function sortByLeagueOrder(a: string, b: string): number {
  const oa = LEAGUE_ORDER[a] ?? 999;
  const ob = LEAGUE_ORDER[b] ?? 999;
  if (oa !== ob) return oa - ob;
  return (LEAGUE_DISPLAY[a] ?? a).localeCompare(LEAGUE_DISPLAY[b] ?? b, "ko");
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
}: Props) {
  // 인기 리그 — POPULAR_SOCCER_LEAGUES 중 leagues 에 있는 것만
  const popular = POPULAR_SOCCER_LEAGUES.filter((l) => leagues.includes(l));

  // 국가별 그룹 — POPULAR 에 포함된 리그도 모두 표시 (중복 노출 허용)
  const byCountry = new Map<string, string[]>();
  for (const l of leagues) {
    const country = COUNTRY_BY_LEAGUE[l];
    if (!country) continue;
    const arr = byCountry.get(country) ?? [];
    arr.push(l);
    byCountry.set(country, arr);
  }
  const countriesSorted = Array.from(byCountry.keys()).sort((a, b) => {
    const ia = COUNTRY_ORDER.indexOf(a);
    const ib = COUNTRY_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b, "ko");
  });

  const itemClass =
    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight transition-colors text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800";
  const itemActiveClass =
    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] leading-tight bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-semibold";

  return (
    <aside
      className="hidden lg:block w-36 shrink-0 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden"
      aria-label="축구 리그 목록"
    >
      {/* 전체 */}
      <Link
        href={buildHref(date, status, null)}
        className={!activeLeague ? itemActiveClass : itemClass}
      >
        <span className="text-[14px] leading-none">⚽</span>
        <span className="truncate">전체 리그</span>
      </Link>

      {/* 인기 리그 */}
      {popular.length > 0 && (
        <section className="mt-4">
          <h3 className="px-2 mb-1.5 text-[10px] font-bold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
            인기 리그
          </h3>
          <ul className="space-y-0.5">
            {popular.map((l) => {
              const logo = leagueLogoUrl(l);
              return (
                <li key={`pop-${l}`}>
                  <Link
                    href={buildHref(date, status, l)}
                    className={activeLeague === l ? itemActiveClass : itemClass}
                  >
                    {logo ? (
                      <Image
                        src={logo}
                        alt=""
                        width={16}
                        height={16}
                        className="shrink-0 object-contain"
                        unoptimized
                      />
                    ) : (
                      <span className="inline-block w-4 shrink-0" />
                    )}
                    <span className="truncate">{LEAGUE_DISPLAY[l] ?? l}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* 국가별 */}
      {countriesSorted.length > 0 && (
        <section className="mt-4">
          <h3 className="px-2 mb-1.5 text-[10px] font-bold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
            국가별 리그
          </h3>
          <div className="space-y-3">
            {countriesSorted.map((country) => {
              const countryLeagues = (byCountry.get(country) ?? []).sort(sortByLeagueOrder);
              const flag = COUNTRY_FLAG[country] ?? "";
              return (
                <div key={country}>
                  <div className="flex items-center gap-1.5 px-2 mb-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {flag && (
                      <span className="text-[14px] leading-none" aria-hidden>
                        {flag}
                      </span>
                    )}
                    <span className="truncate">{country}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {countryLeagues.map((l) => {
                      const logo = leagueLogoUrl(l);
                      return (
                        <li key={`c-${country}-${l}`}>
                          <Link
                            href={buildHref(date, status, l)}
                            className={
                              activeLeague === l ? itemActiveClass : itemClass
                            }
                          >
                            {logo ? (
                              <Image
                                src={logo}
                                alt=""
                                width={14}
                                height={14}
                                className="shrink-0 object-contain opacity-80"
                                unoptimized
                              />
                            ) : (
                              <span className="inline-block w-3.5 shrink-0" />
                            )}
                            <span className="truncate">
                              {LEAGUE_DISPLAY[l] ?? l}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}
