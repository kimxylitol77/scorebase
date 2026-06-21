// 리그 순위표 (표만) — 리그 페이지 "순위" 탭 콘텐츠. StandingsOnlyView 의 표 부분을 탭용으로 분리.
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { toKoreanTeamName } from "@/lib/team-names";

// 리그별 진출권·강등 구역 (순위 1-indexed). 표준 시즌 기준 — 매 시즌 UEFA 계수 미세변동은 단순화.
type ZoneType = "ucl" | "uel" | "uecl" | "relegPo" | "releg";
const ZONES: Record<string, { from: number; to: number; type: ZoneType }[]> = {
  EPL: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 5, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  LALIGA: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 6, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  SERIE_A: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 6, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  BUNDESLIGA: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 5, type: "uel" }, { from: 6, to: 6, type: "uecl" }, { from: 16, to: 16, type: "relegPo" }, { from: 17, to: 18, type: "releg" }],
  LIGUE_1: [{ from: 1, to: 3, type: "ucl" }, { from: 4, to: 4, type: "uel" }, { from: 5, to: 5, type: "uecl" }, { from: 16, to: 16, type: "relegPo" }, { from: 17, to: 18, type: "releg" }],
};
const ZONE_BORDER: Record<ZoneType, string> = {
  ucl: "border-l-blue-500",
  uel: "border-l-orange-400",
  uecl: "border-l-teal-400",
  relegPo: "border-l-amber-400",
  releg: "border-l-rose-500",
};
const ZONE_DOT: Record<ZoneType, string> = {
  ucl: "bg-blue-500",
  uel: "bg-orange-400",
  uecl: "bg-teal-400",
  relegPo: "bg-amber-400",
  releg: "bg-rose-500",
};
const ZONE_LABEL: Record<ZoneType, string> = {
  ucl: "챔피언스리그",
  uel: "유로파리그",
  uecl: "컨퍼런스리그",
  relegPo: "강등 PO",
  releg: "강등",
};

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

  // 진출권·강등 구역 (그룹 리그는 순위 의미가 달라 미적용)
  const zones = isGrouped ? [] : ZONES[league] ?? [];
  const zoneOf = (pos: number): ZoneType | null =>
    zones.find((z) => pos >= z.from && pos <= z.to)?.type ?? null;
  const presentZones = [...new Set(zones.map((z) => z.type))];

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
                  const z = zoneOf(r.position);
                  return (
                    <tr key={r.teamId} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold text-neutral-500 border-l-4 ${z ? ZONE_BORDER[z] : "border-l-transparent"}`}>{r.position}</td>
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
      {presentZones.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 px-1">
          {presentZones.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${ZONE_DOT[t]}`} />
              {ZONE_LABEL[t]}
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-neutral-400">현재 시즌 · 매일 자동 갱신</p>
    </div>
  );
}
