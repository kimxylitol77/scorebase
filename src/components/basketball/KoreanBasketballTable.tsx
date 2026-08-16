// KBL/WKBL 순위표(승률·승차 체계) — /standings/{KBL,WKBL} 과 /leagues/{KBL,WKBL} 순위 탭 공용.
// 오프시즌엔 fetcher 가 지난 시즌 최종 표로 폴백하고 seasonLabel/pastSeason 을 채워 준다.
// withLastLeaders 를 켜면 그 폴백 표 아래에 같은 시즌 리더보드를 붙인다(리그 탭 전용 — 순위
// 페이지는 자체 "시즌 리더보드" 섹션이 따로 있어 켜면 같은 표가 두 번 나온다).
import { prisma } from "@/lib/db";
import { fetchBasketballStandings } from "@/lib/sports/basketball-standings";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";

export default async function KoreanBasketballTable({
  league,
  withLastLeaders = false,
}: {
  league: string;
  withLastLeaders?: boolean;
}) {
  const std = await fetchBasketballStandings(league);
  if (!std || std.rows.length === 0) {
    return (
      <p className="text-sm text-neutral-500 break-keep">
        순위 데이터 수집 중입니다. 잠시 후 다시 확인해주세요.
      </p>
    );
  }

  const teams = await prisma.team.findMany({
    where: { id: { in: std.rows.map((r) => r.ourTeamId) } },
    select: { id: true, logoUrl: true },
  });
  const logoById = new Map(teams.map((t) => [t.id, t.logoUrl]));
  // "2025-2026" → "2025-26" (사이트 시즌 표기 관행)
  const label = std.seasonLabel?.replace(/-20(\d\d)$/, "-$1");
  const subtitle = label
    ? `${label} 시즌 정규리그${std.pastSeason ? " 최종" : ""} 순위 · ${league} 공식 기록${std.pastSeason ? " · 새 시즌 개막 후 자동 갱신" : ""}`
    : `${league} 공식 기록 · 경기 결과 자동 반영`;

  // 지난 시즌 표일 때만 리더보드를 붙인다 — 시즌 중엔 현재 기록이라 "최종"이 아니고,
  // 라벨이 없으면 어느 시즌인지 단정할 수 없어 리더보드 시즌을 맞출 수 없다.
  const lastLeaders =
    withLastLeaders && std.pastSeason && label
      ? await loadLeagueLeaderboard(league, label)
      : null;
  const hasLastLeaders = Object.keys(lastLeaders?.rowsByCategory ?? {}).length > 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500 break-keep">{subtitle}</p>

      <section className="rounded-2xl border border-neutral-200 dark:border-white/10 overflow-hidden">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-neutral-400">
              <th className="text-right py-2 pl-3 pr-2 font-semibold w-8">#</th>
              <th className="text-left py-2 px-2 font-semibold">팀</th>
              <th className="text-center py-2 px-1 font-semibold w-10">경기</th>
              <th className="text-center py-2 px-1 font-semibold w-8">승</th>
              <th className="text-center py-2 px-1 font-semibold w-8">패</th>
              <th className="text-center py-2 px-1 font-semibold w-14">승률</th>
              <th className="text-right py-2 pr-3 pl-1 font-semibold w-12">승차</th>
            </tr>
          </thead>
          <tbody>
            {std.rows.map((r) => {
              const logo = logoById.get(r.ourTeamId);
              const rate = r.played > 0 ? (r.wins / r.played).toFixed(3).replace(/^0/, "") : "-";
              return (
                <tr key={r.ourTeamId} className="border-b border-neutral-100 dark:border-white/5 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <td className="text-right py-2 pl-3 pr-2 tabular-nums text-neutral-500 font-bold">{r.position}</td>
                  <td className="py-2 px-2">
                    <span className="flex items-center gap-2">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-800 shrink-0" />
                      )}
                      <span className="font-semibold truncate max-w-[150px] sm:max-w-none">{r.teamName}</span>
                    </span>
                  </td>
                  <td className="text-center py-2 px-1 tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                  <td className="text-center py-2 px-1 tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                  <td className="text-center py-2 px-1 tabular-nums text-rose-500">{r.losses}</td>
                  <td className="text-center py-2 px-1 tabular-nums font-semibold">{rate}</td>
                  <td className="text-right py-2 pr-3 pl-1 tabular-nums font-black">{r.gamesBehind ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {hasLastLeaders && (
        <LeagueLeaderBoard
          league={league}
          season={label!}
          rowsByCategory={lastLeaders!.rowsByCategory}
          footer={`${label} 시즌 최종 기록`}
        />
      )}

      <p className="text-[11px] text-neutral-400">ⓘ 승률 순 공식 순위 · 승차 = 1위와의 격차(경기 수) · 출처 {league === "KBL" ? "KBL(kbl.or.kr)" : "WKBL(wkbl.or.kr)"}.</p>
    </div>
  );
}
