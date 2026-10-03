// 리그 팀 통계 표 — 순위표 아래. 기본 열(승패·득실·홈/원정·최근 5경기)은 전 리그 공통, 공식 세부 기록 있는 리그는 열이 붙는다.
import Link from "next/link";
import TeamLogoImg from "@/components/TeamLogoImg";
import { getLeagueTeamStats } from "@/lib/sports/league-team-stats";

const FORM_CLS = { W: "bg-emerald-500", D: "bg-neutral-400", L: "bg-rose-500" } as const;

export default async function LeagueTeamStats({ league }: { league: string }) {
  const s = await getLeagueTeamStats(league).catch(() => null);
  if (!s || s.rows.length < 2) return null;
  const rec = (v: [number, number, number]) => (s.hasDraw ? `${v[0]}-${v[1]}-${v[2]}` : `${v[0]}-${v[2]}`);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-1">
        <h2 className="text-base font-bold tracking-tight">팀 통계</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.last ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {s.label} {s.last ? "지난 시즌" : "이번 시즌"}
        </span>
        <span className="text-[12px] text-neutral-500">경기당 기록{s.extraSource ? ` · 세부 기록 ${s.extraSource}` : ""}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <table className="w-full whitespace-nowrap text-[13px] tabular-nums">
          <thead className="text-[11px] text-neutral-500">
            <tr className="border-b border-neutral-100 dark:border-white/[0.06]">
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium dark:bg-neutral-950">팀</th>
              <th className="px-2 py-2 font-medium">경기</th>
              <th className="px-2 py-2 font-medium">{s.hasDraw ? "승-무-패" : "승-패"}</th>
              <th className="px-2 py-2 font-medium">득점</th>
              <th className="px-2 py-2 font-medium">실점</th>
              <th className="px-2 py-2 font-medium">득실</th>
              {s.extraCols.map((c) => <th key={c} className="px-2 py-2 font-medium">{c}</th>)}
              <th className="px-2 py-2 font-medium">홈</th>
              <th className="px-2 py-2 font-medium">원정</th>
              <th className="px-2 py-2 font-medium">최근 5</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
            {s.rows.map((r, i) => {
              const diff = (r.pf - r.pa) / r.g;
              return (
                <tr key={r.teamId} className="text-center">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left dark:bg-neutral-950">
                    <Link href={`/teams/${r.teamId}`} prefetch={false} className="flex items-center gap-2 hover:underline">
                      <span className="w-5 text-right text-xs text-neutral-400">{i + 1}</span>
                      <TeamLogoImg url={r.logoUrl} name={r.name} size={20} className="h-5 w-5 shrink-0 object-contain" fallbackClassName="h-5 w-5 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                      <span className="max-w-[9rem] truncate font-semibold sm:max-w-none">{r.name}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-neutral-500">{r.g}</td>
                  <td className="px-2 py-2 font-semibold">{s.hasDraw ? `${r.w}-${r.d}-${r.l}` : `${r.w}-${r.l}`}</td>
                  <td className="px-2 py-2">{(r.pf / r.g).toFixed(s.hasDraw ? 2 : 1)}</td>
                  <td className="px-2 py-2">{(r.pa / r.g).toFixed(s.hasDraw ? 2 : 1)}</td>
                  <td className={`px-2 py-2 font-semibold ${diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff < 0 ? "text-rose-600 dark:text-rose-400" : ""}`}>
                    {diff > 0 ? "+" : ""}{diff.toFixed(s.hasDraw ? 2 : 1)}
                  </td>
                  {s.extraCols.map((c, k) => <td key={c} className="px-2 py-2">{r.extra?.[k] ?? "-"}</td>)}
                  <td className="px-2 py-2 text-neutral-500">{rec(r.home)}</td>
                  <td className="px-2 py-2 text-neutral-500">{rec(r.away)}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex gap-0.5">
                      {r.form.map((f, k) => <span key={k} className={`h-2 w-2 rounded-full ${FORM_CLS[f]}`} title={f === "W" ? "승" : f === "L" ? "패" : "무"} />)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-1 text-[11px] text-neutral-400 break-keep">
        정규시즌 경기 결과로 계산 · 득실은 경기당 · 정렬은 {s.hasDraw ? "승점" : "승률"} 순
        {s.extraCols.length ? " · 야투%는 2점+3점, 리바는 공격+수비" : ""}
        {s.last ? " · 모든 팀이 3경기를 치르면 이번 시즌으로 바뀝니다" : ""} · 휴대폰에선 옆으로 밀어 보세요
      </p>
    </section>
  );
}
