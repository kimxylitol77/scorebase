// 팀 역대 우승·명장·레전드 — 위키피디아 사실 기반 정적 데이터(data/team-history.json) 표시.
// AI 창작 아님. 데이터 없는 팀(승격팀 등)은 page 에서 미렌더.
import { Trophy } from "lucide-react";

export interface TeamHistoryData {
  titles: { comp: string; count: number }[]; // 한글 대회명
  managers: { name: string; years: string }[]; // 한글 감독명
  legends: string[]; // 한글 선수명
}

export default function TeamHistory({ data, teamName }: { data: TeamHistoryData; teamName: string }) {
  const totalTitles = data.titles.reduce((s, t) => s + t.count, 0);
  const hasAny = data.titles.length > 0 || data.managers.length > 0 || data.legends.length > 0;
  if (!hasAny) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
        <h2 className="text-lg font-bold tracking-tight">{teamName} 역사</h2>
        {totalTitles > 0 && (
          <span className="text-xs text-neutral-400">주요 우승 {totalTitles}회</span>
        )}
      </div>

      {/* 역대 우승 — 대회별 횟수 */}
      {data.titles.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-neutral-400 mb-2">역대 우승</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {data.titles.map((t) => (
              <div key={t.comp} className="rounded-xl bg-white ring-1 ring-black/5 px-3 py-2.5 dark:bg-white/[0.04] dark:ring-white/10">
                <div className="text-[11px] text-neutral-500 truncate">{t.comp}</div>
                <div className="text-lg font-black tabular-nums">
                  {t.count}
                  <span className="text-[11px] font-medium text-neutral-400 ml-0.5">회</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 역대 명장 */}
      {data.managers.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-neutral-400 mb-2">역대 명장</h3>
          <div className="flex flex-wrap gap-2">
            {data.managers.map((m) => (
              <div key={m.name} className="rounded-lg bg-neutral-50 ring-1 ring-black/5 px-3 py-1.5 dark:bg-white/[0.03] dark:ring-white/10">
                <span className="text-sm font-semibold">{m.name}</span>
                <span className="text-[11px] text-neutral-400 ml-1.5 tabular-nums">{m.years}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 클럽 레전드 */}
      {data.legends.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-neutral-400 mb-2">클럽 레전드</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.legends.map((n) => (
              <span key={n} className="rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200/60 px-2.5 py-1 text-xs font-medium dark:bg-amber-400/[0.08] dark:text-amber-300 dark:ring-amber-400/20">
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
