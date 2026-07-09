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
    <div className="space-y-2">
      {/* 표 스타일은 축구 리그 순위표(LeagueStandingsTable)와 통일 — 통계 우측정렬·자연폭·무채색·divide-y. */}
      <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-x-auto dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
            <tr>
              <th className="text-right px-3 py-2 font-medium w-10">#</th>
              <th className="text-left px-3 py-2 font-medium">팀</th>
              <th className="text-right px-2 py-2 font-medium">경기</th>
              <th className="text-right px-2 py-2 font-medium">승</th>
              <th className="text-right px-2 py-2 font-medium">패</th>
              <th className="text-right px-2 py-2 font-medium">연장패</th>
              <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득점</th>
              <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">실점</th>
              <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득실</th>
              <th className="text-right px-3 py-2 font-medium">승점</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {std.rows.map((r, i) => {
              const db = findTeam(r);
              const ko = db ? toKoreanTeamName(db.name, "NHL") : r.name;
              const gd = r.goalDiff;
              return (
                <tr key={r.abbrev} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{i + 1}</td>
                  <td className="px-3 py-2 truncate">
                    {db ? (
                      <Link href={`/teams/${db.id}`} prefetch={false} className="group flex items-center gap-2 min-w-0">
                        {db.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={db.logoUrl} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm" />
                        ) : (
                          <div className="w-6 h-6 rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                        )}
                        <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{ko}</span>
                      </Link>
                    ) : (
                      <span className="truncate">{ko}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.gamesPlayed}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.wins}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.losses}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.otLosses}</td>
                  <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalFor}</td>
                  <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{r.goalAgainst}</td>
                  <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400">승점 = 승 2점 + 연장·슛아웃 패 1점 · NHL 공식 기록 · 경기 종료 후 자동 갱신</p>
    </div>
  );
}
