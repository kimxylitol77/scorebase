// KHL 등 TheSports 공식 표를 캐시로 받는 하키 리그의 순위표 — /standings/KHL 과 /leagues/KHL 순위 탭 공용.
// 전체 순위(승·연장승·연장패·패·득실·승점 + 최근 5경기) 아래에 컨퍼런스 2·디비전 4 표를 격자로 붙인다.
// 승점 = 승 2점(연장·승부치기 승 포함) + 연장·승부치기 패 1점. 데이터 출처는 hockey-table.ts 참조.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { getRecentForm } from "@/lib/predict/recent-form";
import RecentFormDots from "@/components/scores/RecentFormDots";
import { fetchHockeyTable, type HockeyTableGroup, type HockeyTableRow } from "@/lib/sports/thesports/hockey-table";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";

interface TeamInfo { id: number; name: string; logoUrl: string | null }

export default async function HockeyTsStandingsTable({
  league,
  withLeaders = false,
}: {
  league: string;
  withLeaders?: boolean;
}) {
  const table = await fetchHockeyTable(league);
  if (!table) {
    return (
      <p className="rounded-xl border border-neutral-200 dark:border-white/10 px-5 py-10 text-center text-sm text-neutral-500 break-keep">
        순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
      </p>
    );
  }
  const teamIds = [...new Set(table.groups.flatMap((g) => g.rows.map((r) => r.ourTeamId)))];
  const [teams, matches] = await Promise.all([
    prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, logoUrl: true } }),
    // 최근 5경기 도트용 — 이번 시즌 종료 경기만 (8월 이후)
    prisma.match.findMany({
      where: { league, startTime: { gte: seasonStartOf(table.seasonLabel) } },
      select: { status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true },
    }),
  ]);
  const teamMap = new Map<number, TeamInfo>(teams.map((t) => [t.id, t]));
  const nameOf = (id: number) => {
    const t = teamMap.get(id);
    return t ? toKoreanTeamName(t.name, league) || t.name : `Team ${id}`;
  };
  const conferences = table.groups.filter((g) => g.kind === "conference");
  const divisions = table.groups.filter((g) => g.kind === "division");
  const leaders = withLeaders ? await loadLeagueLeaderboard(league) : null;
  const hasLeaders = Object.keys(leaders?.rowsByCategory ?? {}).length > 0;

  const renderTable = (g: HockeyTableGroup, opts: { form: boolean; compact: boolean }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.06] text-[11px] text-neutral-500 whitespace-nowrap">
          <tr>
            <th className="text-right px-2 py-2 font-medium w-8">#</th>
            <th className="text-left px-2 py-2 font-medium">팀</th>
            <th className="text-right px-1.5 py-2 font-medium" title="경기">경기</th>
            <th className="text-right px-1.5 py-2 font-medium" title="정규시간 승">승</th>
            <th className="text-right px-1.5 py-2 font-medium" title="연장·승부치기 승">연장승</th>
            <th className="text-right px-1.5 py-2 font-medium" title="연장·승부치기 패">연장패</th>
            <th className="text-right px-1.5 py-2 font-medium" title="정규시간 패">패</th>
            {!opts.compact && (
              <>
                <th className="text-right px-1.5 py-2 font-medium">득점</th>
                <th className="text-right px-1.5 py-2 font-medium">실점</th>
              </>
            )}
            <th className="text-right px-1.5 py-2 font-medium">득실</th>
            <th className="text-right px-2 py-2 font-medium">승점</th>
            {opts.form && <th className="text-left px-2 py-2 font-medium">최근</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {g.rows.map((r: HockeyTableRow) => {
            const t = teamMap.get(r.ourTeamId);
            const gd = r.goalsFor - r.goalsAgainst;
            return (
              <tr key={r.ourTeamId} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                <td className="px-2 py-2 text-right tabular-nums font-semibold text-neutral-500">{r.position}</td>
                <td className="px-2 py-2">
                  <Link href={`/teams/${r.ourTeamId}`} prefetch={false} className="group flex items-center gap-2 min-w-0">
                    {t?.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt="" width={22} height={22} loading="lazy" className="w-[22px] h-[22px] object-contain shrink-0 bg-white rounded-sm" />
                    ) : (
                      <span className="w-[22px] h-[22px] rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                    )}
                    <span className="font-medium break-keep group-hover:underline underline-offset-2">{nameOf(r.ourTeamId)}</span>
                  </Link>
                </td>
                <td className="px-1.5 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-emerald-600/80 dark:text-emerald-400/80">{r.otWins}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-rose-500/80">{r.otLosses}</td>
                <td className="px-1.5 py-2 text-right tabular-nums text-rose-500">{r.losses}</td>
                {!opts.compact && (
                  <>
                    <td className="px-1.5 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{r.goalsFor}</td>
                    <td className="px-1.5 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{r.goalsAgainst}</td>
                  </>
                )}
                <td className={`px-1.5 py-2 text-right tabular-nums ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-black">{r.points}</td>
                {opts.form && (
                  <td className="px-2 py-2">
                    <RecentFormDots form={getRecentForm(matches, r.ourTeamId, 5)} size="sm" />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const card = "rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none";

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-500 break-keep">
        {table.seasonLabel} 시즌 정규리그 · {table.overall.length}팀 · TheSports 공식 기록 (승 2점 · 연장·승부치기 패 1점)
        {table.stale && " · 갱신 지연 중"}
      </p>

      <section className={card}>
        {renderTable({ kind: "overall", name: "overall", label: "전체 순위", rows: table.overall }, { form: true, compact: false })}
      </section>

      {conferences.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">컨퍼런스</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {conferences.map((g) => (
              <div key={g.name} className={card}>
                <h3 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">{g.label}</h3>
                {renderTable(g, { form: false, compact: true })}
              </div>
            ))}
          </div>
        </section>
      )}

      {divisions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">디비전</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {divisions.map((g) => (
              <div key={g.name} className={card}>
                <h3 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">{g.label}</h3>
                {renderTable(g, { form: false, compact: true })}
              </div>
            ))}
          </div>
        </section>
      )}

      {hasLeaders && leaders && (
        <section id="leaderboard" className="space-y-2 scroll-mt-20">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">시즌 리더보드</h2>
          <LeagueLeaderBoard
            league={league}
            season={leaders.season}
            rowsByCategory={leaders.rowsByCategory}
            footer={`${leaders.season} 시즌 · 종료 경기 박스스코어 집계 · 매일 자동 갱신`}
          />
        </section>
      )}

      <p className="text-[11px] text-neutral-400 break-keep">
        ⓘ 승 = 정규시간 승, 연장승·연장패 = 연장전·승부치기 결과. 컨퍼런스·디비전 순위는 플레이오프 시드 기준. 출처 TheSports.
      </p>
    </div>
  );
}

/** "2026-27" → 2026-08-01 UTC (KHL 개막은 9월, 프리시즌 친선은 다른 리그 코드라 섞이지 않는다). */
function seasonStartOf(label: string): Date {
  const y = Number(label.slice(0, 4));
  return new Date(Date.UTC(Number.isFinite(y) ? y : new Date().getUTCFullYear(), 7, 1));
}
