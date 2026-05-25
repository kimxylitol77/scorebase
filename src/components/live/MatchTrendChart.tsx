// MatchTrendChart — 매치 시간별 momentum bar chart + 골 marker (TheSports help center 디자인).
// 데이터: TheSports /v1/football/match/trend/{live|detail} 응답 (cache.trend).
//
// 구조:
//   trend.data = [[전반 분당 momentum N개], [후반 분당 momentum M개]]
//   값 -100 ~ +100 (home positive, away negative, 1분 단위)
//
// 표시: 양 팀 명 + 점수 + 시간별 momentum bar (위 home rose, 아래 away blue)
//       + 골 marker (분 위치 + 선수명 라벨)

import type { SoccerGoal } from "@/lib/sports/live-scores";

export interface MatchTrendData {
  count?: number;
  per?: number;
  data?: number[][];
}

interface Props {
  trend: MatchTrendData;
  homeNameKo: string;
  awayNameKo: string;
  homeScore?: number | null;
  awayScore?: number | null;
  goals?: SoccerGoal[] | null;
}

// 골 minute parsing — "23'" / "45+2'" / "45+3" 등
function parseGoalMinute(minute: string): number {
  const m = minute.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return 0;
  return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) : 0);
}

export default function MatchTrendChart({
  trend,
  homeNameKo,
  awayNameKo,
  homeScore,
  awayScore,
  goals,
}: Props) {
  if (!trend || !Array.isArray(trend.data) || trend.data.length === 0) return null;
  const firstHalf = Array.isArray(trend.data[0]) ? trend.data[0] : [];
  const secondHalf = Array.isArray(trend.data[1]) ? trend.data[1] : [];
  if (firstHalf.length === 0 && secondHalf.length === 0) return null;

  const total = firstHalf.length + secondHalf.length;
  const W = 400;
  const H = 140;
  const MID = 78;
  const MAX_BAR = 56;
  const barW = W / total;
  const firstHalfEnd = firstHalf.length * barW;

  const HOME_COLOR = "#f43f5e";
  const AWAY_COLOR = "#3b82f6";

  function goalX(minute: number): number {
    if (minute <= firstHalf.length) {
      return (minute - 1) * barW;
    }
    const sIdx = Math.min(minute - 45 - 1, secondHalf.length - 1);
    return firstHalfEnd + sIdx * barW;
  }

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">경기 추이</h2>
        <span className="text-[11px] text-neutral-500">시간별 momentum + 골 marker</span>
      </header>

      {/* 양 팀 명 + 점수 (점수 있을 때만 prominent) */}
      <div className="flex items-center justify-between rounded-md bg-neutral-50 dark:bg-neutral-900 px-3 py-2 mb-3">
        <span className="flex-1 text-right text-[13px] font-semibold text-rose-600 dark:text-rose-400 truncate">{homeNameKo}</span>
        {homeScore != null && awayScore != null && (
          <span className="px-4 text-lg font-extrabold tabular-nums whitespace-nowrap">
            <span className="text-rose-600 dark:text-rose-400">{homeScore}</span>
            <span className="mx-1 text-neutral-500">:</span>
            <span className="text-blue-600 dark:text-blue-400">{awayScore}</span>
          </span>
        )}
        {(homeScore == null || awayScore == null) && (
          <span className="px-4 text-neutral-500 text-xs">vs</span>
        )}
        <span className="flex-1 text-left text-[13px] font-semibold text-blue-600 dark:text-blue-400 truncate">{awayNameKo}</span>
      </div>

      {/* SVG chart */}
      <div className="rounded-md bg-neutral-50 dark:bg-neutral-900 p-2 pt-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full text-neutral-700 dark:text-neutral-300"
          preserveAspectRatio="none"
          style={{ height: 140, overflow: "visible" }}
        >
          {/* 중간선 (0) */}
          <line x1={0} y1={MID} x2={W} y2={MID} stroke="currentColor" strokeWidth={0.5} opacity={0.3} />

          {/* HT divider + label */}
          {firstHalf.length > 0 && (
            <>
              <line
                x1={firstHalfEnd}
                y1={20}
                x2={firstHalfEnd}
                y2={H - 4}
                stroke="currentColor"
                strokeDasharray="2 2"
                strokeWidth={0.5}
                opacity={0.4}
              />
              <text
                x={firstHalfEnd}
                y={16}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill="currentColor"
                opacity={0.6}
              >
                HT
              </text>
            </>
          )}

          {/* 전반 bars */}
          {firstHalf.map((v, i) => {
            const x = i * barW;
            const ratio = Math.max(-100, Math.min(100, v)) / 100;
            const barH = Math.abs(ratio) * MAX_BAR;
            const isHome = ratio >= 0;
            const y = isHome ? MID - barH : MID;
            return (
              <rect
                key={`f-${i}`}
                x={x}
                y={y}
                width={Math.max(0.5, barW - 0.3)}
                height={barH}
                fill={isHome ? HOME_COLOR : AWAY_COLOR}
                opacity={0.85}
              />
            );
          })}
          {/* 후반 bars */}
          {secondHalf.map((v, i) => {
            const x = firstHalfEnd + i * barW;
            const ratio = Math.max(-100, Math.min(100, v)) / 100;
            const barH = Math.abs(ratio) * MAX_BAR;
            const isHome = ratio >= 0;
            const y = isHome ? MID - barH : MID;
            return (
              <rect
                key={`s-${i}`}
                x={x}
                y={y}
                width={Math.max(0.5, barW - 0.3)}
                height={barH}
                fill={isHome ? HOME_COLOR : AWAY_COLOR}
                opacity={0.85}
              />
            );
          })}

          {/* 골 marker — 깃대 line + 원 + 선수명 라벨 */}
          {(goals ?? []).map((g, i) => {
            const minute = parseGoalMinute(g.minute);
            if (minute <= 0) return null;
            const x = goalX(minute);
            const isHome = g.side === "home";
            const color = isHome ? HOME_COLOR : AWAY_COLOR;
            const flagY = isHome ? MID - MAX_BAR - 8 : MID + MAX_BAR + 8;
            const labelY = isHome ? flagY - 4 : flagY + 12;
            const barTopY = isHome ? MID - MAX_BAR : MID + MAX_BAR;
            return (
              <g key={`g-${i}`}>
                <line x1={x} y1={barTopY} x2={x} y2={flagY} stroke={color} strokeWidth={1} />
                <circle cx={x} cy={flagY} r={4} fill={color} stroke="#fff" strokeWidth={1} />
                <text
                  x={x}
                  y={labelY}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={600}
                  fill={color}
                >
                  {minute}&apos; {g.player}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 시간 라벨 */}
      <div className="flex justify-between mt-2 px-1 text-[10px] text-neutral-500 tabular-nums">
        <span>0&apos;</span>
        <span>15&apos;</span>
        <span>30&apos;</span>
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">HT</span>
        <span>60&apos;</span>
        <span>75&apos;</span>
        <span>FT</span>
      </div>
    </section>
  );
}
