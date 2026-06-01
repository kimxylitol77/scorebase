// 야구 "팀 시즌 성적" 비교 섹션 — 원정(좌) / 홈(우) 좌우 막대.
// 데이터: getBaseballSeasonAnalysis (BaseballTeamSeasonStats). 경기 상태 무관 렌더.
// 막대 스타일은 축구 TeamMatchup 의 CompareBarRow 를 야구용(원정 좌·홈 우)으로 옮긴 것.

import type { BaseballTeamSeason } from "@/lib/live/baseball-season-analysis";

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  home: BaseballTeamSeason | null;
  away: BaseballTeamSeason | null;
}

interface RowDef {
  label: string;
  key: "era" | "ops" | "avg" | "homeRuns" | "stolenBases" | "whip";
  decimals: number;
  lowerBetter?: boolean; // ERA·WHIP 는 낮을수록 좋음
}

const ROWS: RowDef[] = [
  { label: "평균자책점", key: "era", decimals: 2, lowerBetter: true },
  { label: "OPS", key: "ops", decimals: 3 },
  { label: "타율", key: "avg", decimals: 3 },
  { label: "홈런", key: "homeRuns", decimals: 0 },
  { label: "도루", key: "stolenBases", decimals: 0 },
  { label: "WHIP", key: "whip", decimals: 2, lowerBetter: true },
];

export default function BaseballSeasonComparison({
  homeNameKo,
  awayNameKo,
  home,
  away,
}: Props) {
  if (!home && !away) return null;
  const rows = ROWS.filter(
    (r) => home?.[r.key] != null && away?.[r.key] != null,
  );
  if (rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-black tracking-tight mb-4">
        팀 시즌 성적
      </h2>

      {/* 헤더 — 원정(좌) / VS / 홈(우) + 승패 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 mb-2">
        <TeamHead name={awayNameKo} team={away} side="원정" align="right" />
        <div className="text-[11px] font-bold text-neutral-400">VS</div>
        <TeamHead name={homeNameKo} team={home} side="홈" align="left" />
      </div>

      <div className="rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
        {rows.map((r) => (
          <BarRow
            key={r.key}
            label={r.label}
            away={Number(away![r.key])}
            home={Number(home![r.key])}
            decimals={r.decimals}
            lowerBetter={r.lowerBetter}
          />
        ))}
      </div>
    </section>
  );
}

function TeamHead({
  name,
  team,
  side,
  align,
}: {
  name: string;
  team: BaseballTeamSeason | null;
  side: "홈" | "원정";
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-sm sm:text-base font-bold truncate">{name}</div>
      <div className="text-[11px] text-neutral-500 tabular-nums">
        {side}
        {team ? ` · ${team.wins}승 ${team.losses}패` : ""}
      </div>
    </div>
  );
}

/** 원정(좌, rose) / 홈(우, blue) 좌우 막대 + 가운데 라벨. */
function BarRow({
  label,
  away,
  home,
  decimals,
  lowerBetter,
}: {
  label: string;
  away: number;
  home: number;
  decimals: number;
  lowerBetter?: boolean;
}) {
  const max = Math.max(away, home, 0.001);
  const awayPct = (away / max) * 100;
  const homePct = (home / max) * 100;
  const awayBetter = lowerBetter ? away < home : away > home;
  const homeBetter = lowerBetter ? home < away : home > away;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 py-2.5 sm:py-3 px-2.5 sm:px-4">
      {/* away (좌) */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
        <span
          className={`text-xs sm:text-base font-bold tabular-nums ${
            awayBetter
              ? "text-rose-600 dark:text-rose-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {away.toFixed(decimals)}
        </span>
        <div className="w-8 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full ml-auto rounded-full ${
              awayBetter ? "bg-rose-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            style={{ width: `${awayPct}%` }}
          />
        </div>
      </div>
      <div className="text-[10px] sm:text-[11px] font-medium text-neutral-500 px-1 sm:px-2 whitespace-nowrap text-center">
        {label}
      </div>
      {/* home (우) */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <div className="w-8 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full ${
              homeBetter ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            style={{ width: `${homePct}%` }}
          />
        </div>
        <span
          className={`text-xs sm:text-base font-bold tabular-nums ${
            homeBetter
              ? "text-blue-600 dark:text-blue-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {home.toFixed(decimals)}
        </span>
      </div>
    </div>
  );
}
