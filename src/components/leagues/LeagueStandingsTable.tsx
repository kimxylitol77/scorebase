// 리그 순위표 (표만) — 리그 페이지 "순위" 탭 콘텐츠. StandingsOnlyView 의 표 부분을 탭용으로 분리.
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { toKoreanTeamName } from "@/lib/team-names";

export default async function LeagueStandingsTable({ league }: { league: string }) {
  const standings = await getFullStandings(league);
  const teamIds = [...new Set(standings.map((r) => r.teamId))];
  const teams = teamIds.length
    ? await prisma.team.findMany({
        where: { id: { in: teamIds } },
        select: { id: true, name: true, logoUrl: true },
      })
    : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const rows = standings
    .map((r) => {
      const team = teamMap.get(r.teamId);
      const en = team?.name ?? `Team #${r.teamId}`;
      return { ...r, teamName: toKoreanTeamName(en, league), logoUrl: team?.logoUrl ?? null };
    })
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.position - b.position);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        순위 데이터를 수집 중입니다. 잠시 후 다시 확인해주세요.
      </div>
    );
  }

  const groupNames = [...new Set(rows.map((r) => r.group).filter(Boolean))] as string[];
  const isGrouped = groupNames.length >= 2;
  const sections = isGrouped
    ? groupNames.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }))
    : [{ group: null as string | null, rows }];

  return (
    <div className="space-y-5">
      {sections.map((sec) => (
        <div key={sec.group ?? "_single"} className="space-y-2">
          {sec.group && (
            <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 px-1">{sec.group}</h3>
          )}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
                <tr>
                  <th className="text-right px-3 py-2 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 font-medium">팀</th>
                  <th className="text-right px-2 py-2 font-medium">경기</th>
                  <th className="text-right px-2 py-2 font-medium">승</th>
                  <th className="text-right px-2 py-2 font-medium">무</th>
                  <th className="text-right px-2 py-2 font-medium">패</th>
                  <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득실</th>
                  <th className="text-right px-3 py-2 font-medium">승점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sec.rows.map((r) => {
                  const played = r.won + r.draw + r.loss;
                  const gd = r.goalDiff ?? (r.goalsFor != null && r.goalsAgainst != null ? r.goalsFor - r.goalsAgainst : null);
                  return (
                    <tr key={r.teamId} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{r.position}</td>
                      <td className="px-3 py-2 truncate">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logoUrl} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm" />
                          ) : (
                            <div className="w-6 h-6 rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                          )}
                          <span className="truncate">{r.teamName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{played}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.won}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.draw}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.loss}</td>
                      <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">
                        {gd != null ? (gd > 0 ? `+${gd}` : `${gd}`) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-neutral-400">현재 시즌 · 매일 자동 갱신</p>
    </div>
  );
}
