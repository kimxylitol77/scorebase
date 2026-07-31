import Link from "next/link";
import { prisma } from "@/lib/db";
import { getStandingsState } from "@/lib/sports/thesports/standings-helper";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import LeagueBadge from "@/components/LeagueBadge";

interface Props {
  league: string;
  /** 리그 페이지 탭 안에 순위표만 임베드할 때 true — 자체 header/CTA 생략. */
  embedded?: boolean;
}

const POPULAR_LEAGUES: Array<{ code: string; label: string }> = [
  { code: "EPL", label: "프리미어리그" },
  { code: "LALIGA", label: "라리가" },
  { code: "BUNDESLIGA", label: "분데스리가" },
  { code: "K_LEAGUE_1", label: "K리그 1" },
  { code: "J1_LEAGUE", label: "J1 리그" },
];

export default async function StandingsOnlyView({ league, embedded = false }: Props) {
  // 개막 전에는 지난 시즌 표를 대신 보여주지 않고 "시즌 개막 전"으로 안내한다.
  const { rows: standings, state, firstFixtureAt } = await getStandingsState(league);
  const displayName = LEAGUE_DISPLAY[league] ?? league.replace(/_/g, " ");

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
      return {
        ...r,
        teamName: toKoreanTeamName(en, league),
        logoUrl: team?.logoUrl ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.group ?? "").localeCompare(b.group ?? "") || a.position - b.position,
    );

  // 그룹(J1/J2 2026 East/West 등) 있으면 섹션 분리, 없으면 단일표.
  const groupNames = [
    ...new Set(rows.map((r) => r.group).filter(Boolean)),
  ] as string[];
  const isGrouped = groupNames.length >= 2;
  const sections = isGrouped
    ? groupNames.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }))
    : [{ group: null as string | null, rows }];

  return (
    <main className={embedded ? "space-y-5" : "max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6"}>
      {!embedded && (
        <header className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <LeagueBadge league={league} />
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{displayName}</h1>
          </div>
          <p className="text-sm text-neutral-500">
            📊 현재 시즌 순위표 · 매일 자동 갱신
          </p>
        </header>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500 space-y-1">
          {state === "PRESEASON" ? (
            <>
              <div className="font-semibold text-neutral-600 dark:text-neutral-300">시즌 개막 전</div>
              <p>
                새 시즌 순위표는 개막 후 표시됩니다
                {firstFixtureAt
                  ? ` · 첫 경기 ${firstFixtureAt.toISOString().slice(0, 10)}`
                  : ""}
              </p>
            </>
          ) : (
            <p>순위 데이터를 수집 중입니다. 잠시 후 다시 확인해주세요.</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {isGrouped && (
            <p className="text-xs text-neutral-500">
              ※ 2026 J리그 100년 비전 리그 — 지역 그룹별 순위
            </p>
          )}
          {sections.map((sec) => (
            <div key={sec.group ?? "_single"} className="space-y-2">
              {sec.group && (
                <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 px-1">
                  {sec.group}
                </h2>
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
                        <tr
                          key={r.teamId}
                          id={`team-${r.teamId}`}
                          className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 target:bg-amber-50 dark:target:bg-amber-500/10 scroll-mt-24"
                        >
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{r.position}</td>
                          <td className="px-3 py-2 truncate">
                            <div className="flex items-center gap-2 min-w-0">
                              {r.logoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={r.logoUrl}
                                  alt=""
                                  width={24}
                                  height={24}
                                  loading="lazy"
                                  className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm"
                                />
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
        </div>
      )}

      {!embedded && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-4 text-sm text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-semibold">⏳ 예측 기능 준비 중</div>
          <p className="text-xs text-amber-800 dark:text-amber-300/80">
            이 리그는 현재 순위표만 제공됩니다. Elo 레이팅 기반 우승/강등 시뮬레이션은 데이터가 더 쌓이는 대로 추가될 예정입니다.
          </p>
        </section>
      )}

      {!embedded && (
        <section className="space-y-2">
          <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
            인기 리그 예측 보러가기
          </div>
          <div className="flex flex-wrap gap-2">
            {POPULAR_LEAGUES.map((lg) => (
              <Link
                key={lg.code}
                href={`/predictions/${lg.code}`}
                className="text-sm px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition"
              >
                {lg.label}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
