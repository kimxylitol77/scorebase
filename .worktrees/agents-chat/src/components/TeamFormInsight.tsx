// 라이브 페이지 하단 — 양 팀 최근 N경기 폼 표시.
// 모든 종목 공통 (NBA/NHL/축구/LOL). SSR 단에서 calcForm 결과 prop 으로 받음.

import Link from "next/link";
import type { TeamForm } from "@/lib/predict/form";

interface Props {
  homeForm: TeamForm | null;
  awayForm: TeamForm | null;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId?: number;
  awayTeamId?: number;
  /** 무승부 가능 여부 (축구만 D 표시, 그 외는 W/L 만) */
  hasDraw?: boolean;
}

export default function TeamFormInsight({
  homeForm,
  awayForm,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  hasDraw = false,
}: Props) {
  const noData = (!homeForm || homeForm.results.length === 0) && (!awayForm || awayForm.results.length === 0);
  if (noData) return null;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] uppercase text-neutral-500">
        <span>📈</span>
        <span>최근 5경기 폼</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormPanel
          form={awayForm}
          teamName={awayTeamName}
          teamId={awayTeamId}
          side="원정"
          hasDraw={hasDraw}
        />
        <FormPanel
          form={homeForm}
          teamName={homeTeamName}
          teamId={homeTeamId}
          side="홈"
          hasDraw={hasDraw}
        />
      </div>
    </div>
  );
}

function FormPanel({
  form,
  teamName,
  teamId,
  side,
  hasDraw,
}: {
  form: TeamForm | null;
  teamName: string;
  teamId?: number;
  side: "홈" | "원정";
  hasDraw: boolean;
}) {
  if (!form || form.results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 dark:border-neutral-800 px-3 py-3 text-sm">
        <div className="text-[11px] text-neutral-500">
          {side} · {teamName}
        </div>
        <div className="mt-1 text-neutral-400">최근 경기 없음</div>
      </div>
    );
  }
  const nameNode = teamId != null ? (
    <Link
      href={`/teams/${teamId}`}
      className="hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition"
    >
      {teamName}
    </Link>
  ) : (
    <>{teamName}</>
  );

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-3">
      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        <span className="truncate">{side}</span>
        <span className="tabular-nums">
          {form.wins}승{hasDraw ? ` ${form.draws}무` : ""} {form.losses}패
        </span>
      </div>
      <div className="mt-0.5 font-semibold tracking-tight truncate">
        {nameNode}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {/* results 는 최신 → 과거 순. 좌측이 가장 최근. */}
        {form.results.map((r, i) => (
          <span
            key={i}
            className={`inline-flex w-6 h-6 rounded-full text-[10px] font-bold items-center justify-center ${
              r === "W"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                : r === "L"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
            title={r === "W" ? "승" : r === "L" ? "패" : "무"}
          >
            {r}
          </span>
        ))}
      </div>
    </div>
  );
}
