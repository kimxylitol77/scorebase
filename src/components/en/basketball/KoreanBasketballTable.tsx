// basketball__KoreanBasketballTable (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { prisma } from "@/lib/db";
import { fetchBasketballStandings } from "@/lib/sports/basketball-standings";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import LeagueLeaderBoard from "@/components/en/LeagueLeaderBoard";

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
        Collecting standings data. Please check back shortly.
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
    ? `${label} regular season${std.pastSeason ? " final" : ""} standings · ${league} official records${std.pastSeason ? " · updates when the new season starts" : ""}`
    : `${league} official records · results applied automatically`;

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
              <th className="text-left py-2 px-2 font-semibold">Team</th>
              <th className="text-center py-2 px-1 font-semibold w-10">GP</th>
              <th className="text-center py-2 px-1 font-semibold w-8">W</th>
              <th className="text-center py-2 px-1 font-semibold w-8">L</th>
              <th className="text-center py-2 px-1 font-semibold w-14">PCT</th>
              <th className="text-right py-2 pr-3 pl-1 font-semibold w-12">GB</th>
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
          footer={`${label} final record`}
        />
      )}

      <p className="text-[11px] text-neutral-400">ⓘ Official standings by win percentage · GB is games behind the leader · source {league === "KBL" ? "KBL(kbl.or.kr)" : "WKBL(wkbl.or.kr)"}.</p>
    </div>
  );
}
