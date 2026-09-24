// LoL 팀 메타 스탯 — 최근 N경기(10~50) 퍼블·첫 타워·드래곤/바론 선취율·경기당 킬·평균 경기시간.
// 출처 TheSports team/stats (data/lol-career.json). 우리 세트 집계엔 없는 오브젝트 선취 지표라 여기서만 볼 수 있다.
import { lolTeamForm } from "@/lib/sports/lol-career";
import { Swords } from "lucide-react";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const mmss = (sec: number) => `${Math.floor(sec / 60)}분 ${String(Math.round(sec % 60)).padStart(2, "0")}초`;

export default function LolTeamMetaStats({ teamId }: { teamId: number }) {
  const form = lolTeamForm(teamId);
  if (form.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight">
        <Swords className="h-5 w-5 text-neutral-400" aria-hidden /> 오브젝트·교전 지표
      </h2>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 dark:bg-white/[0.04]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">구간</th>
              <th className="px-2 py-2 text-right font-medium">전적</th>
              <th className="px-2 py-2 text-right font-medium">퍼스트 블러드</th>
              <th className="px-2 py-2 text-right font-medium">첫 타워</th>
              <th className="px-2 py-2 text-right font-medium">첫 드래곤</th>
              <th className="px-2 py-2 text-right font-medium">첫 바론</th>
              <th className="px-2 py-2 text-right font-medium">경기당 킬</th>
              <th className="px-3 py-2 text-right font-medium">평균 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {form.map((f) => (
              <tr key={f.window}>
                <td className="px-3 py-2 font-medium whitespace-nowrap">최근 {f.window}경기</td>
                <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{f.line.win}-{f.line.lose}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(f.line.firstBlood)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(f.line.firstTower)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(f.line.firstDragon)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{pct(f.line.firstBaron)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{f.line.killsPerMatch.toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{mmss(f.line.avgSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">
        출처: TheSports 팀 누적 기록. 선취율은 해당 구간에서 그 오브젝트를 먼저 가져간 경기 비율입니다.
      </p>
    </section>
  );
}
