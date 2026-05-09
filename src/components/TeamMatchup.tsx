// 매치 인사이트 헤드 — 양 팀 마주보는 비교 테이블.
// 한눈에 두 팀의 전력 차이를 볼 수 있게.

import FormDots from "./FormDots";
import type { FormResult } from "@/lib/predict/types";

interface TeamSide {
  name: string;
  form: FormResult[]; // 최신순 (왼쪽 = 가장 최근)
  position: number;
  totalTeams: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

interface Props {
  home: TeamSide;
  away: TeamSide;
}

export default function TeamMatchup({ home, away }: Props) {
  const homeAvgFor = home.played > 0 ? home.goalsFor / home.played : 0;
  const awayAvgFor = away.played > 0 ? away.goalsFor / away.played : 0;
  const homeAvgAgainst = home.played > 0 ? home.goalsAgainst / home.played : 0;
  const awayAvgAgainst = away.played > 0 ? away.goalsAgainst / away.played : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-4 sm:px-6 py-6">
      {/* 팀 헤더 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-6">
        <div className="text-center">
          <div className="text-base sm:text-lg font-bold tracking-tight text-blue-600 dark:text-blue-400 mb-2">
            {home.name}
          </div>
          <div className="flex justify-center">
            <FormDots results={home.form} />
          </div>
        </div>
        <div className="text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          VS
        </div>
        <div className="text-center">
          <div className="text-base sm:text-lg font-bold tracking-tight text-rose-600 dark:text-rose-400 mb-2">
            {away.name}
          </div>
          <div className="flex justify-center">
            <FormDots results={away.form} />
          </div>
        </div>
      </div>

      {/* 비교 row 들 */}
      <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
        <CompareRow
          label="리그순위"
          home={`${home.position}`}
          away={`${away.position}`}
          highlight={
            home.position < away.position
              ? "home"
              : away.position < home.position
                ? "away"
                : null
          }
          big
        />
        <CompareRow
          label="리그성적"
          home={`${home.wins}승 ${home.draws}무 ${home.losses}패`}
          away={`${away.wins}승 ${away.draws}무 ${away.losses}패`}
        />
        <CompareBarRow
          label="평균득점"
          homeValue={homeAvgFor}
          awayValue={awayAvgFor}
          tone="positive"
        />
        <CompareBarRow
          label="평균실점"
          homeValue={homeAvgAgainst}
          awayValue={awayAvgAgainst}
          tone="negative"
        />
      </div>
    </div>
  );
}

function CompareRow({
  label,
  home,
  away,
  highlight,
  big,
}: {
  label: string;
  home: string;
  away: string;
  highlight?: "home" | "away" | null;
  big?: boolean;
}) {
  const valueCls = big
    ? "text-2xl sm:text-3xl font-black tabular-nums"
    : "text-sm sm:text-base font-bold tabular-nums";
  const homeCls = highlight === "home"
    ? "text-blue-600 dark:text-blue-400"
    : "text-neutral-700 dark:text-neutral-300";
  const awayCls = highlight === "away"
    ? "text-rose-600 dark:text-rose-400"
    : "text-neutral-700 dark:text-neutral-300";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3">
      <div className={`text-right ${valueCls} ${homeCls}`}>{home}</div>
      <div className="text-[11px] font-medium text-neutral-500 px-2 whitespace-nowrap">
        {label}
      </div>
      <div className={`text-left ${valueCls} ${awayCls}`}>{away}</div>
    </div>
  );
}

/** 양쪽 값을 막대로 표시 (값이 큰 쪽 강조). tone='positive' 는 큰 값이 좋은 의미, 'negative' 는 작은 값이 좋은 의미 */
function CompareBarRow({
  label,
  homeValue,
  awayValue,
  tone,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  tone: "positive" | "negative";
}) {
  const max = Math.max(homeValue, awayValue, 0.001);
  const homePct = (homeValue / max) * 100;
  const awayPct = (awayValue / max) * 100;
  const homeBetter =
    tone === "positive" ? homeValue > awayValue : homeValue < awayValue;
  const awayBetter =
    tone === "positive" ? awayValue > homeValue : awayValue < homeValue;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3">
      {/* 홈 */}
      <div className="flex items-center justify-end gap-2">
        <span
          className={`text-sm sm:text-base font-bold tabular-nums ${
            homeBetter
              ? "text-blue-600 dark:text-blue-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {homeValue.toFixed(1)}
        </span>
        <div className="w-16 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full ml-auto rounded-full ${
              homeBetter
                ? "bg-blue-500"
                : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            style={{ width: `${homePct}%` }}
          />
        </div>
      </div>
      <div className="text-[11px] font-medium text-neutral-500 px-2 whitespace-nowrap">
        {label}
      </div>
      {/* 원정 */}
      <div className="flex items-center gap-2">
        <div className="w-16 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              awayBetter ? "bg-rose-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            style={{ width: `${awayPct}%` }}
          />
        </div>
        <span
          className={`text-sm sm:text-base font-bold tabular-nums ${
            awayBetter
              ? "text-rose-600 dark:text-rose-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {awayValue.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
