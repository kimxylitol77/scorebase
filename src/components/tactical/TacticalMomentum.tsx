// 전술 리뷰 본문 도식 — 분당 공격 압력. 가운데 축 위는 홈, 아래는 원정이 상대 진영에서 공격을 이어간 정도다.
// 골은 득점한 쪽에 점으로 찍는다. 값은 ts trend(−100~+100)를 그대로 쓴다.
import type { GoalSequence, Momentum } from "@/lib/tactical/insights";

const HOME = "#2563eb";
const AWAY = "#dc2626";
const W = 100;
const H = 38;
const MID = H / 2;

export default function TacticalMomentum({ home, away, m, goals }: { home: string; away: string; m: Momentum; goals: GoalSequence[] }) {
  const total = m.minutes.length;
  if (total < 20) return null;
  const bw = W / total;
  const firstHalf = m.minutes.filter((x) => x.minute <= 45).length;
  // 후반은 46분부터 다시 센다 — 전반 추가시간 칸이 있으면 x 위치는 순번으로 잡는다
  const xOf = (idx: number) => idx * bw;
  const idxOfMinute = (minute: number) => {
    const i = m.minutes.findIndex((x) => x.minute >= minute);
    return i === -1 ? total - 1 : i;
  };
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200/70 dark:bg-white/[0.04] dark:ring-white/10">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="font-bold text-zinc-900 dark:text-white">경기 흐름</span>
        <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: HOME }} aria-hidden />
          {home}
        </span>
        <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-white/60">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: AWAY }} aria-hidden />
          {away}
        </span>
        <span className="ml-auto text-[11px] text-zinc-400">분당 공격 압력 · 점은 득점</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H + 5}`} className="w-full" role="img" aria-label={`${home} 대 ${away} 분당 공격 압력 그래프`}>
        <line x1={0} y1={MID} x2={W} y2={MID} stroke="currentColor" strokeOpacity={0.25} strokeWidth={0.15} className="text-zinc-500" />
        {m.minutes.map((x, i) => {
          if (x.value === 0) return null;
          const h = (Math.abs(x.value) / 100) * (MID - 2);
          return (
            <rect
              key={i}
              x={xOf(i) + bw * 0.12}
              y={x.value > 0 ? MID - h : MID}
              width={bw * 0.76}
              height={h}
              rx={0.15}
              fill={x.value > 0 ? HOME : AWAY}
              opacity={0.9}
            />
          );
        })}
        <line x1={xOf(firstHalf)} y1={1} x2={xOf(firstHalf)} y2={H - 1} stroke="currentColor" strokeOpacity={0.35} strokeWidth={0.2} strokeDasharray="0.8 0.8" className="text-zinc-500" />
        {goals.map((g, i) => {
          const cx = xOf(idxOfMinute(g.minute)) + bw / 2;
          return (
            <circle key={i} cx={cx} cy={g.side === "home" ? 2.2 : H - 2.2} r={1.25} fill="#fbbf24" stroke={g.side === "home" ? HOME : AWAY} strokeWidth={0.45} />
          );
        })}
        {[1, 15, 30, 45, 60, 75, 90].map((min) => (
          <text key={min} x={Math.min(W - 1.5, xOf(idxOfMinute(min)) + (min === 1 ? 0.5 : 0))} y={H + 4} fontSize={2.4} fill="currentColor" className="text-zinc-400" textAnchor={min === 1 ? "start" : "middle"}>
            {min === 1 ? "시작" : `${min}′`}
          </text>
        ))}
      </svg>
    </figure>
  );
}
