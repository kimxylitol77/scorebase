// V-리그 등 배구 리그 탭용 순위표 — /standings/[league] 의 VolleyballStandings 와 같은 캐시(fetchVolleyballTable)를 읽는 요약판.
// 승점·승패·세트 득실. 리그 페이지 순위 탭에서 쓴다 (StandingsOnlyView 는 축구 매핑이라 배구는 빈 화면).
import Link from "next/link";
import { prisma } from "@/lib/db";
import { fetchVolleyballTable } from "@/lib/sports/thesports/volleyball-table";

export default async function VolleyballLeagueTable({ league }: { league: string }) {
  const groups = await fetchVolleyballTable(league);
  if (groups.length === 0) {
    return <p className="text-sm text-neutral-500 break-keep">순위 데이터 수집 중입니다. 시즌 개막 후 자동으로 표시됩니다.</p>;
  }
  const ids = groups.flatMap((g) => g.rows.map((r) => r.ourTeamId));
  const teams = await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, logoUrl: true } });
  const byId = new Map(teams.map((t) => [t.id, t]));
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.name} className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          {groups.length > 1 && <h3 className="px-4 py-2.5 text-sm font-black bg-neutral-50 dark:bg-white/[0.04] border-b border-neutral-200 dark:border-white/10">{g.name}</h3>}
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
              <tr><th className="text-right px-3 py-2 w-8">#</th><th className="text-left px-2 py-2">팀</th><th className="text-right px-2 py-2">경기</th><th className="text-right px-2 py-2">승</th><th className="text-right px-2 py-2">패</th><th className="text-right px-2 py-2">세트</th><th className="text-right px-3 py-2">승점</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {g.rows.map((r) => {
                const t = byId.get(r.ourTeamId);
                return (
                  <tr key={r.ourTeamId} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-neutral-500">{r.position}</td>
                    <td className="px-2 py-2">
                      <Link href={`/teams/${r.ourTeamId}`} prefetch={false} className="flex items-center gap-2 min-w-0 hover:underline underline-offset-2">
                        {t?.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.logoUrl} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                        ) : <span className="w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 shrink-0" />}
                        <span className="font-medium break-keep">{t?.name ?? r.ourTeamId}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{r.played}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{r.wins}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-rose-500">{r.losses}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{r.setsWin}-{r.setsLoss}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-black">{r.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-[11px] text-neutral-400">ⓘ TheSports 공식 순위 · 전체 표는 <Link href={`/standings/${league}`} className="underline">순위표 페이지</Link>.</p>
    </div>
  );
}
