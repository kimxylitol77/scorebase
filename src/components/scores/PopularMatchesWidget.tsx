// 인기 매치 위젯 (server component) — /scores 상단에 노출.
// 최근 24h unique 방문자 기준 top 5 라이브 매치 가로 스크롤 카드.

import Link from "next/link";
import { getPopularLiveMatches } from "@/lib/popular-matches";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

function statusBadge(status: string | null): { label: string; cls: string } {
  if (status === "LIVE") return { label: "LIVE", cls: "bg-rose-500 text-white" };
  if (status === "FINISHED") return { label: "종료", cls: "bg-neutral-300 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200" };
  if (status === "SCHEDULED") return { label: "예정", cls: "bg-blue-500/80 text-white" };
  if (status === "POSTPONED") return { label: "연기", cls: "bg-amber-500/80 text-white" };
  return { label: status ?? "—", cls: "bg-neutral-200 dark:bg-neutral-800 text-neutral-500" };
}

export default async function PopularMatchesWidget() {
  const matches = await getPopularLiveMatches(5).catch(() => []);
  if (matches.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4">
      <header className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">
          🔥 인기 매치
          <span className="ml-2 text-[11px] text-neutral-500 font-normal">최근 24시간</span>
        </h2>
      </header>
      <div className="-mx-1 overflow-x-auto">
        <ul className="flex gap-2 px-1 pb-1 snap-x">
          {matches.map((m) => {
            const homeKo = m.homeName ? toKoreanTeamName(m.homeName, m.league) : "—";
            const awayKo = m.awayName ? toKoreanTeamName(m.awayName, m.league) : "—";
            const leagueLabel = LEAGUE_DISPLAY[m.league] ?? m.league;
            const sb = statusBadge(m.status);
            return (
              <li key={`${m.league}|${m.externalId}`} className="snap-start shrink-0 w-[180px] sm:w-[200px]">
                <Link
                  href={`/live/${m.league}/${m.externalId}`}
                  className="block rounded-lg border border-neutral-200 dark:border-neutral-800 p-2.5 hover:border-blue-400 dark:hover:border-blue-500 transition"
                >
                  <div className="flex items-center justify-between text-[10px] text-neutral-500 mb-1.5">
                    <span className="truncate">{leagueLabel}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${sb.cls}`}>{sb.label}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{homeKo}</span>
                      {m.homeScore != null && <span className="tabular-nums font-bold">{m.homeScore}</span>}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{awayKo}</span>
                      {m.awayScore != null && <span className="tabular-nums font-bold">{m.awayScore}</span>}
                    </div>
                  </div>
                  <div className="mt-1.5 text-[10px] text-neutral-400 flex items-center gap-1">
                    <span>👥</span>
                    <span className="tabular-nums">{m.views.toLocaleString()} 뷰</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
