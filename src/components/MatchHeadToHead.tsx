// 양 팀 H2H + 시즌 비교 카드 — 라이브 페이지 공통.
// Daum 스포츠 스타일: 팀명, H2H W-D-L, 최근 H2H 결과 원형 dots, 리그순위, 시즌성적, 승률, 평균득실.

import Link from "next/link";
import type { FormResult } from "@/lib/predict/types";

interface H2HResult {
  results: FormResult[];
  wins: number;
  draws: number;
  losses: number;
}

interface Standing {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  position: number;
}

interface Props {
  homeShortName: string;
  awayShortName: string;
  homeTeamId: number;
  awayTeamId: number;
  /** home 관점 H2H — 'W' = home 승 */
  h2hHome: H2HResult;
  homeStanding: Standing | null;
  awayStanding: Standing | null;
  totalTeams: number;
  /** 무승부 가능 종목 (축구만 true) */
  hasDraw?: boolean;
  /** 평균득점/실점 단위 (축구="골", 야구·NBA·NHL·LOL="점"·"킬" 등) */
  scoreUnit?: string;
  scoreLabel?: { for: string; against: string };
}

function pct(n: number, d: number, digits = 3): string {
  if (d === 0) return "—";
  const v = n / d;
  return v.toFixed(digits);
}
function avg(n: number, d: number, digits = 2): string {
  if (d === 0) return "—";
  return (n / d).toFixed(digits);
}
function fmtRank(pos: number, total: number): string {
  if (!pos) return "—";
  return `${pos}위 / ${total}팀`;
}

function H2HDots({
  results,
  perspective,
  hasDraw,
}: {
  results: FormResult[];
  perspective: "home" | "away";
  hasDraw: boolean;
}) {
  // home 관점 results — away 입장에선 W↔L 뒤집기
  const flipped = perspective === "away"
    ? results.map((r) => (r === "W" ? "L" : r === "L" ? "W" : "D") as FormResult)
    : results;
  if (flipped.length === 0) {
    return <div className="text-xs text-neutral-400">기록 없음</div>;
  }
  return (
    <div className="flex items-center gap-1">
      {flipped.map((r, i) => {
        const label = r === "W" ? "승" : r === "L" ? "패" : hasDraw ? "무" : "—";
        return (
          <span
            key={i}
            className={`inline-flex w-6 h-6 rounded-full border text-[10px] font-bold items-center justify-center ${
              r === "W"
                ? "border-rose-400 text-rose-600 dark:border-rose-500/60 dark:text-rose-400"
                : r === "L"
                  ? "border-blue-400 text-blue-600 dark:border-blue-500/60 dark:text-blue-400"
                  : "border-neutral-300 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
            }`}
            title={r}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function H2HSummary({
  h2h,
  perspective,
  hasDraw,
}: {
  h2h: H2HResult;
  perspective: "home" | "away";
  hasDraw: boolean;
}) {
  // home 관점이라 away 입장에선 wins↔losses 스왑
  const wins = perspective === "away" ? h2h.losses : h2h.wins;
  const losses = perspective === "away" ? h2h.wins : h2h.losses;
  return (
    <div className="text-sm font-bold tabular-nums">
      <span className="text-rose-600 dark:text-rose-400">{wins}승</span>{" "}
      {hasDraw && (
        <>
          <span className="text-neutral-500">{h2h.draws}무</span>{" "}
        </>
      )}
      <span className="text-blue-600 dark:text-blue-400">{losses}패</span>
    </div>
  );
}

function StatBar({
  label,
  homeValue,
  awayValue,
  homeRaw,
  awayRaw,
  higherBetter,
}: {
  label: string;
  homeValue: string;
  awayValue: string;
  homeRaw: number | null;
  awayRaw: number | null;
  /** 높을수록 좋은 stat */
  higherBetter?: boolean;
}) {
  const homeBetter =
    homeRaw != null && awayRaw != null && homeRaw !== awayRaw &&
    (higherBetter ? homeRaw > awayRaw : homeRaw < awayRaw);
  const awayBetter =
    homeRaw != null && awayRaw != null && homeRaw !== awayRaw && !homeBetter;

  // bar 길이 — 두 값 합 대비 비율
  const total = (homeRaw ?? 0) + (awayRaw ?? 0);
  const homePct = total > 0 ? Math.round(((homeRaw ?? 0) / total) * 100) : 50;
  const awayPct = 100 - homePct;

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center text-sm py-1.5">
      <div className="flex items-center gap-2 justify-end">
        <div
          className={`tabular-nums font-bold ${
            awayBetter ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {awayValue}
        </div>
        <div className="w-16 sm:w-24 h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${awayBetter ? "bg-rose-500" : "bg-neutral-400 dark:bg-neutral-600"}`}
            style={{ width: `${awayPct}%`, marginLeft: "auto", float: "right" }}
          />
        </div>
      </div>
      <div className="text-[11px] text-neutral-500 text-center px-2 whitespace-nowrap">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 sm:w-24 h-1 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${homeBetter ? "bg-rose-500" : "bg-neutral-400 dark:bg-neutral-600"}`}
            style={{ width: `${homePct}%` }}
          />
        </div>
        <div
          className={`tabular-nums font-bold ${
            homeBetter ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {homeValue}
        </div>
      </div>
    </div>
  );
}

function CenterLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] text-neutral-500 text-center px-2 whitespace-nowrap">
      {children}
    </div>
  );
}

export default function MatchHeadToHead({
  homeShortName,
  awayShortName,
  homeTeamId,
  awayTeamId,
  h2hHome,
  homeStanding,
  awayStanding,
  totalTeams,
  hasDraw = false,
  scoreLabel = { for: "평균득점", against: "평균실점" },
}: Props) {
  const homeWinPct = homeStanding
    ? pct(homeStanding.wins, homeStanding.played)
    : "—";
  const awayWinPct = awayStanding
    ? pct(awayStanding.wins, awayStanding.played)
    : "—";

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-4">
      {/* 상단 — 팀명 + H2H */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-start">
        <div className="text-center space-y-2">
          <Link
            href={`/teams/${awayTeamId}`}
            className="block text-lg sm:text-xl font-black tracking-tight hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition truncate"
          >
            {awayShortName}
          </Link>
          <H2HSummary h2h={h2hHome} perspective="away" hasDraw={hasDraw} />
          <div className="flex justify-center">
            <H2HDots results={h2hHome.results} perspective="away" hasDraw={hasDraw} />
          </div>
        </div>
        <div className="text-center pt-1 space-y-1">
          <div className="text-base font-black text-neutral-300 dark:text-neutral-700">
            VS
          </div>
          <div className="text-[11px] text-neutral-500">상대전적</div>
          <div className="text-[11px] text-neutral-500">최근 {h2hHome.results.length}경기</div>
        </div>
        <div className="text-center space-y-2">
          <Link
            href={`/teams/${homeTeamId}`}
            className="block text-lg sm:text-xl font-black tracking-tight hover:underline hover:text-blue-600 dark:hover:text-blue-400 transition truncate"
          >
            {homeShortName}
          </Link>
          <H2HSummary h2h={h2hHome} perspective="home" hasDraw={hasDraw} />
          <div className="flex justify-center">
            <H2HDots results={h2hHome.results} perspective="home" hasDraw={hasDraw} />
          </div>
        </div>
      </div>

      {/* 하단 — 시즌 비교 */}
      {(homeStanding || awayStanding) && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-1">
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center text-sm py-1.5">
            <div className="text-right tabular-nums font-bold text-neutral-700 dark:text-neutral-300">
              {awayStanding ? fmtRank(awayStanding.position, totalTeams) : "—"}
            </div>
            <CenterLabel>리그순위</CenterLabel>
            <div className="text-left tabular-nums font-bold text-neutral-700 dark:text-neutral-300">
              {homeStanding ? fmtRank(homeStanding.position, totalTeams) : "—"}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center text-sm py-1.5">
            <div className="text-right tabular-nums font-bold text-neutral-700 dark:text-neutral-300">
              {awayStanding
                ? `${awayStanding.wins}승${hasDraw ? ` ${awayStanding.draws}무` : ""} ${awayStanding.losses}패`
                : "—"}
            </div>
            <CenterLabel>시즌성적</CenterLabel>
            <div className="text-left tabular-nums font-bold text-neutral-700 dark:text-neutral-300">
              {homeStanding
                ? `${homeStanding.wins}승${hasDraw ? ` ${homeStanding.draws}무` : ""} ${homeStanding.losses}패`
                : "—"}
            </div>
          </div>
          <StatBar
            label="시즌승률"
            homeValue={homeWinPct}
            awayValue={awayWinPct}
            homeRaw={homeStanding ? homeStanding.wins / Math.max(1, homeStanding.played) : null}
            awayRaw={awayStanding ? awayStanding.wins / Math.max(1, awayStanding.played) : null}
            higherBetter
          />
          <StatBar
            label={scoreLabel.for}
            homeValue={homeStanding ? avg(homeStanding.goalsFor, homeStanding.played, 2) : "—"}
            awayValue={awayStanding ? avg(awayStanding.goalsFor, awayStanding.played, 2) : "—"}
            homeRaw={homeStanding ? homeStanding.goalsFor / Math.max(1, homeStanding.played) : null}
            awayRaw={awayStanding ? awayStanding.goalsFor / Math.max(1, awayStanding.played) : null}
            higherBetter
          />
          <StatBar
            label={scoreLabel.against}
            homeValue={homeStanding ? avg(homeStanding.goalsAgainst, homeStanding.played, 2) : "—"}
            awayValue={awayStanding ? avg(awayStanding.goalsAgainst, awayStanding.played, 2) : "—"}
            homeRaw={homeStanding ? homeStanding.goalsAgainst / Math.max(1, homeStanding.played) : null}
            awayRaw={awayStanding ? awayStanding.goalsAgainst / Math.max(1, awayStanding.played) : null}
          />
        </div>
      )}
    </div>
  );
}
