// NHL 순위 테이블 — /standings/NHL 페이지 + /leagues/NHL 순위 탭 공용. 공식 API 결과(std)를
// DB 팀(한글명·로고·팀링크)과 매핑해 표로. std 미전달 시 자체 fetch(리그 탭용). 승 2점·연장패 1점.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fetchNhlStandings } from "@/lib/sports/nhl-api";

type Std = NonNullable<Awaited<ReturnType<typeof fetchNhlStandings>>>;

function nhlNormName(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default async function NhlStandingsTable({ std: stdProp }: { std?: Std | null }) {
  const std = stdProp ?? (await fetchNhlStandings());
  if (!std || std.rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-neutral-500">순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.</p>
    );
  }

  // NHL API 팀 ↔ DB Team 매핑 (한글명·로고·팀 링크). 풀네임 일치 우선.
  const dbTeams = await prisma.team.findMany({
    where: { league: "NHL" },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const findTeam = (row: { name: string; placeName: string; abbrev: string }) => {
    const an = nhlNormName(row.name);
    const common = nhlNormName(row.name.replace(row.placeName, ""));
    const aa = (row.abbrev || "").toLowerCase();
    return dbTeams.find((db) => {
      const dn = nhlNormName(db.name);
      if (dn === an) return true;
      if (common.length > 2 && (dn.includes(common) || common.includes(dn))) return true;
      if (db.shortName && nhlNormName(db.shortName) === nhlNormName(row.abbrev)) return true;
      if (aa && dn.endsWith(aa)) return true;
      return false;
    });
  };

  return (
    <>
      <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-neutral-500 border-b border-neutral-200 dark:border-white/10">
                <th className="text-right py-2 pl-3 pr-2 font-semibold">#</th>
                <th className="text-left py-2 px-2 font-semibold">팀</th>
                <th className="text-center py-2 px-2 font-semibold w-10">경기</th>
                <th className="text-center py-2 px-2 font-semibold w-10">승</th>
                <th className="text-center py-2 px-2 font-semibold w-10">패</th>
                <th className="text-center py-2 px-2 font-semibold w-12">연장패</th>
                <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">득점</th>
                <th className="text-center py-2 px-2 font-semibold w-12 hidden sm:table-cell">실점</th>
                <th className="text-center py-2 px-2 font-semibold w-12">득실</th>
                <th className="text-right py-2 pr-3 pl-2 font-semibold w-12">승점</th>
              </tr>
            </thead>
            <tbody>
              {std.rows.map((r, i) => {
                const db = findTeam(r);
                const ko = db ? toKoreanTeamName(db.name, "NHL") : r.name;
                const gd = r.goalDiff;
                return (
                  <tr
                    key={r.abbrev}
                    className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  >
                    <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{i + 1}</td>
                    <td className="py-2 px-2">
                      {db ? (
                        <Link href={`/teams/${db.id}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                          {db.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={db.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                          ) : (
                            <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                          )}
                          <span className="font-semibold truncate max-w-[160px] sm:max-w-none">{ko}</span>
                        </Link>
                      ) : (
                        <span className="font-semibold">{ko}</span>
                      )}
                    </td>
                    <td className="text-center py-2 px-2 tabular-nums text-neutral-600 dark:text-neutral-400">{r.gamesPlayed}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-rose-500">{r.losses}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-neutral-500">{r.otLosses}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.goalFor}</td>
                    <td className="text-center py-2 px-2 tabular-nums text-neutral-700 dark:text-neutral-300 hidden sm:table-cell">{r.goalAgainst}</td>
                    <td className={`text-center py-2 px-2 tabular-nums font-semibold ${gd > 0 ? "text-emerald-600 dark:text-emerald-400" : gd < 0 ? "text-rose-500" : "text-neutral-500"}`}>
                      {gd > 0 ? `+${gd}` : gd}
                    </td>
                    <td className="text-right py-2 pr-3 pl-2 tabular-nums font-black text-base">{r.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="text-[11px] text-neutral-400 text-center pt-2">
        ⓘ 승점 = 승 2점 + 연장·슛아웃 패 1점. NHL 공식 기록 기준 · 경기 종료 후 자동 갱신.
      </div>
    </>
  );
}
