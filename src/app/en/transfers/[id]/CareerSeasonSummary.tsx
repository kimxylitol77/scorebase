// 시즌별 팀 요약 (영어판). scripts/en-mirror 로 자동 생성.
import type { CareerGroup } from "./career-data";

interface TeamSeasonRow {
  season: number;
  seasonLabel: string;
  teamName: string;
  teamLogo: string | null;
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number; // 평점×출전 누적 (가중평균용)
  ratedApps: number;
}

function ratingCls(r: number | null): string {
  if (r == null) return "text-neutral-400";
  if (r >= 7.0) return "text-emerald-600 dark:text-emerald-400";
  if (r >= 6.5) return "text-amber-600 dark:text-amber-400";
  return "text-orange-600 dark:text-orange-400";
}

export default function CareerSeasonSummary({ groups }: { groups: CareerGroup[] }) {
  // 클럽 대회만 (국가대표 제외) — 시즌+팀 단위 합산.
  const byKey = new Map<string, TeamSeasonRow>();
  for (const g of groups) {
    if (g.cat === "national") continue;
    for (const r of g.rows) {
      // 연령별 대표(U23 등)가 클럽 분류로 새는 경우 제외 (Brazil U23 실측).
      if (/\bU-?\d{2}\b/i.test(r.teamName)) continue;
      const key = `${r.season}|${r.teamName}`;
      const cur = byKey.get(key) ?? {
        season: r.season, seasonLabel: r.seasonLabel, teamName: r.teamName, teamLogo: r.teamLogo ?? null,
        apps: 0, goals: 0, assists: 0, ratingSum: 0, ratedApps: 0,
      };
      cur.apps += r.appearances;
      cur.goals += r.goals;
      cur.assists += r.assists;
      if (r.rating != null && r.appearances > 0) { cur.ratingSum += r.rating * r.appearances; cur.ratedApps += r.appearances; }
      if (!cur.teamLogo && r.teamLogo) cur.teamLogo = r.teamLogo;
      byKey.set(key, cur);
    }
  }
  if (byKey.size < 2) return null;

  // 시즌 내림차순, 시즌 내 출전 내림차순 (첫 행=주 소속, 나머지=들여쓰기).
  const bySeason = new Map<number, TeamSeasonRow[]>();
  for (const row of byKey.values()) bySeason.set(row.season, [...(bySeason.get(row.season) ?? []), row]);
  const seasons = [...bySeason.entries()].sort((a, b) => b[0] - a[0]);
  for (const [, rows] of seasons) rows.sort((a, b) => b.apps - a.apps);

  const total = [...byKey.values()].reduce(
    (a, r) => ({ apps: a.apps + r.apps, goals: a.goals + r.goals, assists: a.assists + r.assists, ratingSum: a.ratingSum + r.ratingSum, ratedApps: a.ratedApps + r.ratedApps }),
    { apps: 0, goals: 0, assists: 0, ratingSum: 0, ratedApps: 0 },
  );
  const avgOf = (r: { ratingSum: number; ratedApps: number }) => (r.ratedApps > 0 ? r.ratingSum / r.ratedApps : null);

  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3.5 pb-2">
        <h2 className="text-lg font-semibold">Season by season, by club</h2>
        <p className="text-xs text-neutral-400">Club competitions combined · multiple clubs in one season appear as extra rows (loans etc.)</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-neutral-400 border-b border-black/5 dark:border-white/5">
            <th className="px-3 py-1.5 text-left font-semibold">Season</th>
            <th className="px-3 py-1.5 text-left font-semibold">Club</th>
            <th className="px-2 py-1.5 text-right font-semibold">Apps</th>
            <th className="px-2 py-1.5 text-right font-semibold text-rose-400">Goals</th>
            <th className="px-2 py-1.5 text-right font-semibold text-blue-400">Assists</th>
            <th className="px-3 py-1.5 text-right font-semibold">Rating</th>
          </tr>
        </thead>
        <tbody>
          {seasons.flatMap(([season, rows]) =>
            rows.map((r, i) => {
              const avg = avgOf(r);
              return (
                <tr key={`${season}-${r.teamName}`} className="border-b border-black/5 dark:border-white/5 last:border-0">
                  <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums font-semibold">{i === 0 ? r.seasonLabel : ""}</td>
                  <td className="px-3 py-2">
                    <div className={`flex items-center gap-2 min-w-0 ${i > 0 ? "pl-5" : ""}`}>
                      {i > 0 && <span className="text-neutral-400 -ml-4">↳</span>}
                      {r.teamLogo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.teamLogo} alt="" className="w-[18px] h-[18px] object-contain shrink-0" />
                      )}
                      <span className="truncate">{r.teamName}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.apps}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-rose-500">{r.goals}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-blue-500">{r.assists}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-bold ${ratingCls(avg)}`}>{avg != null ? avg.toFixed(2) : "-"}</td>
                </tr>
              );
            }),
          )}
          <tr className="bg-neutral-50 dark:bg-white/[0.03]">
            <td className="px-3 py-2 text-xs font-bold" colSpan={2}>Total / average</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold">{total.apps}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-rose-500">{total.goals}</td>
            <td className="px-2 py-2 text-right tabular-nums font-bold text-blue-500">{total.assists}</td>
            <td className={`px-3 py-2 text-right tabular-nums font-bold ${ratingCls(avgOf(total))}`}>{avgOf(total) != null ? avgOf(total)!.toFixed(2) : "-"}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
