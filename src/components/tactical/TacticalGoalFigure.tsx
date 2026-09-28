// 전술 리뷰 본문 도식 — 골 하나의 과정. 패스가 이어진 자리를 번호로 찍고 화살표로 잇는다(오른쪽이 상대 골문).
// 좌표는 ts goalLine 을 insights.ts 가 공격 방향 기준으로 정규화한 값. 피치는 공용 Pitch/PitchMarker.
import Pitch, { PitchMarker } from "@/components/pitch/Pitch";
import type { GoalSequence } from "@/lib/tactical/insights";

const ASPECT = 105 / 68;
const VB_H = 100 / ASPECT;
const HOME = "#2563eb";
const AWAY = "#dc2626";

export default function TacticalGoalFigure({ goal, team, names }: { goal: GoalSequence; team: string; names: Record<string, string> }) {
  const color = goal.side === "home" ? HOME : AWAY;
  const pts = goal.steps.map((s) => ({ ...s, vy: (s.y * VB_H) / 100 }));
  const shooter = pts[pts.length - 1];
  const markerId = `arrow-${goal.side}-${goal.number}`;
  const scorer = shooter.playerId ? names[shooter.playerId] : null;
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-3 pb-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-bold text-zinc-900 dark:text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} aria-hidden />
          {goal.minute}분 {team}
          {goal.ownGoal ? " (상대 자책골)" : scorer ? ` ${scorer}` : ""}
        </span>
        <span className="text-zinc-500 dark:text-white/50">
          {goal.passes === 0 ? "연결 없이 마무리" : `${goal.startZone}에서 ${goal.passes}번 연결`} · {goal.shotZone}
        </span>
        <span className="ml-auto text-[11px] text-zinc-400">공격 방향 →</span>
      </figcaption>
      <Pitch orientation="horizontal" aspect={ASPECT} stripes className="rounded-none">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${VB_H}`} preserveAspectRatio="xMidYMid meet" fill="none" aria-hidden="true">
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#ffffff" />
            </marker>
          </defs>
          {pts.slice(0, -1).map((p, i) => (
            <line key={i} x1={p.x} y1={p.vy} x2={pts[i + 1].x} y2={pts[i + 1].vy} stroke="#ffffff" strokeOpacity={0.9} strokeWidth={0.45} markerEnd={`url(#${markerId})`} />
          ))}
          {/* 슈팅 — 골문 중앙으로 점선 */}
          <line x1={shooter.x} y1={shooter.vy} x2={100} y2={VB_H / 2} stroke="#fbbf24" strokeWidth={0.5} strokeDasharray="1.2 0.9" markerEnd={`url(#${markerId})`} />
        </svg>
        {pts.map((p, i) => (
          <PitchMarker key={i} x={p.x} y={p.y} className="z-10">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold text-white shadow-md ring-2 ring-white/90 sm:h-7 sm:w-7"
              style={{ background: i === pts.length - 1 ? "#f59e0b" : color }}
            >
              {i + 1}
            </span>
          </PitchMarker>
        ))}
      </Pitch>
      {/* 이름은 피치 밖에 — 위에 얹으면 가장자리에서 잘리고 가까운 선수끼리 겹친다 */}
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 py-2.5 text-[12px] text-zinc-600 dark:text-white/70">
        {pts.map((p, i) => {
          const last = i === pts.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1">
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                style={{ background: last ? "#f59e0b" : color }}
              >
                {i + 1}
              </span>
              <span className={last ? "font-bold text-zinc-900 dark:text-white" : ""}>
                {(p.playerId && names[p.playerId]) || "선수"}
                {last ? " 슈팅" : ""}
              </span>
              {!last && <span className="text-zinc-400" aria-hidden>→</span>}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
