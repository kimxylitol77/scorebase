// 불펜 피로도 탭 — 양 팀 구원 투수의 최근 6일 등판(투구수·이닝)을 격자로, 연투·과부하 판정을 알약으로 보여준다.
import Link from "next/link";
import { STATUS_LABEL, type BullpenTeamReport, type FatigueStatus, type PitcherReport } from "@/lib/sports/baseball/bullpen-fatigue";

const STATUS_CLS: Record<FatigueStatus, string> = {
  danger: "bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300",
  heavy: "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  caution: "bg-sky-500/10 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  rested: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
};

const fmtInnings = (n: number) => {
  const whole = Math.floor(n + 1e-9);
  const thirds = Math.round((n - whole) * 3);
  return thirds === 0 ? `${whole}` : `${whole ? `${whole} ` : ""}${thirds}/3`;
};
const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function PitcherRow({ p, days, hasPitchCounts }: { p: PitcherReport; days: string[]; hasPitchCounts: boolean }) {
  const byDate = new Map(p.usage.map((u) => [u.date, u]));
  return (
    <tr className="border-b border-neutral-100 last:border-0 dark:border-neutral-800/60">
      <td className="px-2 py-1.5">
        {p.href ? (
          <Link href={p.href} className="font-medium text-neutral-800 hover:underline dark:text-neutral-100">{p.name}</Link>
        ) : (
          <span className="font-medium text-neutral-800 dark:text-neutral-100">{p.name}</span>
        )}
        <div className="text-[10px] text-neutral-400">{p.note}</div>
      </td>
      {days.map((d) => {
        const u = byDate.get(d);
        return (
          <td key={d} className="px-1 py-1.5 text-center tabular-nums">
            {u ? (
              <span
                className={`inline-block min-w-[30px] rounded px-1 py-0.5 text-[11px] font-semibold ${
                  (u.er ?? 0) > 0 ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-neutral-100 text-neutral-700 dark:bg-white/[0.08] dark:text-neutral-200"
                }`}
                title={`${fmtInnings(u.innings)}이닝${u.tbf != null ? ` · ${u.tbf}타자` : ""}${u.er != null ? ` · 자책 ${u.er}` : ""}`}
              >
                {hasPitchCounts && u.pitches != null ? u.pitches : fmtInnings(u.innings)}
              </span>
            ) : (
              <span className="text-neutral-300 dark:text-neutral-700">·</span>
            )}
          </td>
        );
      })}
      <td className="px-2 py-1.5 text-right">
        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_CLS[p.status]}`}>
          {STATUS_LABEL[p.status]}
        </span>
      </td>
    </tr>
  );
}

function TeamBlock({ name, report }: { name: string; report: BullpenTeamReport | null }) {
  if (!report) {
    return (
      <div className="rounded-xl border border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <div className="mb-1 font-semibold text-neutral-800 dark:text-neutral-100">{name}</div>
        불펜 기록을 불러오지 못했습니다.
      </div>
    );
  }
  const counts = report.pitchers.reduce(
    (acc, p) => ((acc[p.status] += 1), acc),
    { danger: 0, heavy: 0, caution: 0, rested: 0 } as Record<FatigueStatus, number>,
  );
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-white/[0.04]">
        <span className="text-sm font-semibold text-neutral-900 dark:text-white">{name}</span>
        <span className="text-[11px] text-neutral-500">최근 6일 등판 {report.pitchers.length}명</span>
        {counts.danger + counts.heavy > 0 && (
          <span className="ml-auto text-[11px] font-semibold text-rose-600 dark:text-rose-300">
            {counts.danger > 0 && `연투 ${counts.danger}`}
            {counts.danger > 0 && counts.heavy > 0 && " · "}
            {counts.heavy > 0 && `과부하 ${counts.heavy}`}
          </span>
        )}
      </div>
      {report.pitchers.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-neutral-500">최근 6일 구원 등판 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-neutral-200 text-[10px] text-neutral-500 dark:border-neutral-800">
                <th className="px-2 py-1.5 text-left font-medium">투수</th>
                {report.days.map((d) => (
                  <th key={d} className="px-1 py-1.5 text-center font-medium tabular-nums">{dayLabel(d)}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {report.pitchers.map((p) => (
                <PitcherRow key={p.pid} p={p} days={report.days} hasPitchCounts={report.hasPitchCounts} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BullpenFatigueCard({
  homeName,
  awayName,
  home,
  away,
}: {
  homeName: string;
  awayName: string;
  home: BullpenTeamReport | null;
  away: BullpenTeamReport | null;
}) {
  const hasPitchCounts = (home ?? away)?.hasPitchCounts ?? false;
  return (
    <div>
      <p className="mb-3 text-[12px] text-neutral-500 dark:text-neutral-400">
        오늘 경기 전날까지의 구원 등판입니다. 칸의 숫자는 {hasPitchCounts ? "투구수" : "이닝(KBO 공식 기록엔 투구수가 없어 이닝·상대 타자 수로 판단)"}이고, 자책점을 준 등판은 붉게 표시됩니다.
        연투 중(이틀 연속 등판)·과부하(3일 누적 {hasPitchCounts ? "40구" : "10타자"} 이상) 투수는 오늘 대기할 가능성이 큽니다. 선발로 나온 투수는 뺐습니다.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <TeamBlock name={homeName} report={home} />
        <TeamBlock name={awayName} report={away} />
      </div>
    </div>
  );
}
