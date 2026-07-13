// 매치 인사이트 헤드 — 양 팀 마주보는 통합 비교 테이블.
// 시즌 / 최근 / 강도 / 흐름 4개 그룹으로 한눈에.

import FormDots from "./FormDots";
import type { FormResult } from "@/lib/predict/types";

export interface TeamSide {
  name: string;
  form: FormResult[];
  // 시즌
  position: number;
  /** 시즌 누적 승점 — 글 스냅샷 값(있으면) 또는 실시간 standings.points */
  seasonPoints: number;
  totalTeams: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  attackRank?: number;
  defenseRank?: number;
  // 홈/원정 split — 홈팀은 홈 성적, 원정팀은 원정 성적이 들어옴
  splitLabel: string;
  splitPlayed: number;
  splitWins: number;
  splitDraws: number;
  splitLosses: number;
  splitPpg: number;
  // 최근 5경기 평균
  recentMatches: number;
  recentAvgFor: number;
  recentAvgAgainst: number;
  recentPpg: number;
  // 흐름
  winningRun: number;
  unbeatenRun: number;
  losingRun: number;
  cleanSheetsLast5: number;
  failedToScoreLast5: number;
}

interface Props {
  home: TeamSide;
  away: TeamSide;
  showDraw?: boolean; // false 면 무승부 표기 안 함 (NBA 등)
  /** 표시 범위 — overview=팀 헤더+시즌 전체만, detail=홈원정·최근·흐름만.
   *  팀 전력 섹션의 "여기까지 기본 노출 + 나머지 접기" 분할용. 기본 all. */
  sections?: "all" | "overview" | "detail";
}

export default function TeamMatchup({ home, away, showDraw = true, sections = "all" }: Props) {
  const homeAvgFor = home.played > 0 ? home.goalsFor / home.played : 0;
  const awayAvgFor = away.played > 0 ? away.goalsFor / away.played : 0;
  const homeAvgAgainst = home.played > 0 ? home.goalsAgainst / home.played : 0;
  const awayAvgAgainst = away.played > 0 ? away.goalsAgainst / away.played : 0;
  // 승률 — 무승부 없는 종목(야구·농구)에서 승점/경기당승점 대신 표기.
  const homeWinRate = home.played > 0 ? home.wins / home.played : 0;
  const awayWinRate = away.played > 0 ? away.wins / away.played : 0;
  const homeSplitWinRate = home.splitPlayed > 0 ? home.splitWins / home.splitPlayed : 0;
  const awaySplitWinRate = away.splitPlayed > 0 ? away.splitWins / away.splitPlayed : 0;
  const homeRecentWinRate = formWinRate(home.form);
  const awayRecentWinRate = formWinRate(away.form);

  const showOverview = sections !== "detail";
  const showDetail = sections !== "overview";

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 sm:px-6 py-5 sm:py-6">
      {/* 팀 헤더 */}
      {showOverview && (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 mb-5 sm:mb-6">
        <div className="text-center min-w-0">
          <div className="text-sm sm:text-lg font-bold tracking-tight text-blue-600 dark:text-blue-400 mb-2 truncate">
            {home.name}
          </div>
          <div className="flex justify-center">
            <FormDots results={home.form} />
          </div>
        </div>
        <div className="text-[10px] sm:text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          VS
        </div>
        <div className="text-center min-w-0">
          <div className="text-sm sm:text-lg font-bold tracking-tight text-rose-600 dark:text-rose-400 mb-2 truncate">
            {away.name}
          </div>
          <div className="flex justify-center">
            <FormDots results={away.form} />
          </div>
        </div>
      </div>
      )}

      {/* 그룹: 시즌 전체 */}
      {showOverview && (
      <Group label="시즌 전체">
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
          home={
            showDraw
              ? `${home.wins}승 ${home.draws}무 ${home.losses}패`
              : `${home.wins}승 ${home.losses}패`
          }
          away={
            showDraw
              ? `${away.wins}승 ${away.draws}무 ${away.losses}패`
              : `${away.wins}승 ${away.losses}패`
          }
        />
        {/* 승점제 리그(축구)는 승점, 무승부 없는 종목(야구·농구)은 승률.
            승점은 글 스냅샷 값 우선이라 본문 "N점" 과 일치. */}
        {showDraw ? (
          <CompareRow
            label="승점"
            home={`${home.seasonPoints}점`}
            away={`${away.seasonPoints}점`}
            highlight={
              home.seasonPoints > away.seasonPoints
                ? "home"
                : away.seasonPoints > home.seasonPoints
                  ? "away"
                  : null
            }
          />
        ) : (
          <CompareRow
            label="승률"
            home={fmtWinRate(homeWinRate)}
            away={fmtWinRate(awayWinRate)}
            highlight={
              homeWinRate > awayWinRate
                ? "home"
                : awayWinRate > homeWinRate
                  ? "away"
                  : null
            }
          />
        )}
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
        {(home.attackRank || away.attackRank) && (
          <CompareRow
            label="공격력"
            home={home.attackRank ? `${home.attackRank}위` : "-"}
            away={away.attackRank ? `${away.attackRank}위` : "-"}
            highlight={
              home.attackRank && away.attackRank
                ? home.attackRank < away.attackRank
                  ? "home"
                  : away.attackRank < home.attackRank
                    ? "away"
                    : null
                : null
            }
          />
        )}
        {(home.defenseRank || away.defenseRank) && (
          <CompareRow
            label="수비력"
            home={home.defenseRank ? `${home.defenseRank}위` : "-"}
            away={away.defenseRank ? `${away.defenseRank}위` : "-"}
            highlight={
              home.defenseRank && away.defenseRank
                ? home.defenseRank < away.defenseRank
                  ? "home"
                  : away.defenseRank < home.defenseRank
                    ? "away"
                    : null
                : null
            }
          />
        )}
      </Group>
      )}

      {/* 그룹: 홈/원정 강도 */}
      {showDetail && (home.splitPlayed > 0 || away.splitPlayed > 0) && (
        <Group label={`홈 · 원정 강도 (${home.splitLabel} / ${away.splitLabel})`}>
          <CompareRow
            label="기록"
            home={
              home.splitPlayed > 0
                ? splitRecord(home.splitWins, home.splitDraws, home.splitLosses, showDraw)
                : "—"
            }
            away={
              away.splitPlayed > 0
                ? splitRecord(away.splitWins, away.splitDraws, away.splitLosses, showDraw)
                : "—"
            }
          />
          {showDraw ? (
            <CompareBarRow
              label="경기당 승점"
              homeValue={home.splitPpg}
              awayValue={away.splitPpg}
              tone="positive"
              decimals={2}
            />
          ) : (
            <CompareBarRow
              label="승률"
              homeValue={homeSplitWinRate}
              awayValue={awaySplitWinRate}
              tone="positive"
              decimals={3}
            />
          )}
        </Group>
      )}

      {/* 그룹: 최근 5경기 */}
      {showDetail && (home.recentMatches > 0 || away.recentMatches > 0) && (
        <Group label="최근 5경기">
          <CompareBarRow
            label="평균득점"
            homeValue={home.recentAvgFor}
            awayValue={away.recentAvgFor}
            tone="positive"
          />
          <CompareBarRow
            label="평균실점"
            homeValue={home.recentAvgAgainst}
            awayValue={away.recentAvgAgainst}
            tone="negative"
          />
          {showDraw ? (
            <CompareBarRow
              label="경기당 승점"
              homeValue={home.recentPpg}
              awayValue={away.recentPpg}
              tone="positive"
              decimals={2}
            />
          ) : (
            <CompareBarRow
              label="최근 승률"
              homeValue={homeRecentWinRate}
              awayValue={awayRecentWinRate}
              tone="positive"
              decimals={3}
            />
          )}
        </Group>
      )}

      {/* 그룹: 흐름 */}
      {showDetail && (
      <Group label="흐름 (최근 5경기)">
        <CompareRow
          label="진행중"
          home={streakLabel(home)}
          away={streakLabel(away)}
        />
        <CompareRow
          label={showDraw ? "클린시트" : "무실점"}
          home={`${home.cleanSheetsLast5}경기`}
          away={`${away.cleanSheetsLast5}경기`}
          highlight={
            home.cleanSheetsLast5 > away.cleanSheetsLast5
              ? "home"
              : away.cleanSheetsLast5 > home.cleanSheetsLast5
                ? "away"
                : null
          }
        />
        <CompareRow
          label="무득점"
          home={`${home.failedToScoreLast5}경기`}
          away={`${away.failedToScoreLast5}경기`}
          highlight={
            home.failedToScoreLast5 < away.failedToScoreLast5
              ? "home"
              : away.failedToScoreLast5 < home.failedToScoreLast5
                ? "away"
                : null
          }
        />
      </Group>
      )}
    </div>
  );
}

function streakLabel(t: TeamSide): string {
  if (t.winningRun >= 2) return `🔥 ${t.winningRun}연승`;
  if (t.unbeatenRun >= 3) return `${t.unbeatenRun}경기 무패`;
  if (t.losingRun >= 2) return `❄️ ${t.losingRun}연패`;
  return "특이 흐름 없음";
}

/** 최근 폼(W/D/L)에서 승률 계산 — 야구·농구 "최근 승률" 행용. */
function formWinRate(form: FormResult[]): number {
  if (form.length === 0) return 0;
  return form.filter((r) => r === "W").length / form.length;
}

/** 승률을 야구식 .XXX 로 — 0.620 → ".620", 1.000 → "1.000". */
function fmtWinRate(r: number): string {
  return r.toFixed(3).replace(/^0/, "");
}

/** 홈/원정 기록 문자열 — 무승부 종목만 "N무" 포함. */
function splitRecord(
  wins: number,
  draws: number,
  losses: number,
  showDraw: boolean,
): string {
  return showDraw ? `${wins}승 ${draws}무 ${losses}패` : `${wins}승 ${losses}패`;
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-neutral-400 dark:text-neutral-500 mb-1.5 px-1">
        {label}
      </div>
      <div className="rounded-xl border border-neutral-200/70 dark:border-neutral-800/70 divide-y divide-neutral-200/70 dark:divide-neutral-800/70">
        {children}
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
    ? "text-xl sm:text-3xl font-black tabular-nums"
    : "text-xs sm:text-base font-bold tabular-nums";
  const homeCls =
    highlight === "home"
      ? "text-blue-600 dark:text-blue-400"
      : "text-neutral-700 dark:text-neutral-300";
  const awayCls =
    highlight === "away"
      ? "text-rose-600 dark:text-rose-400"
      : "text-neutral-700 dark:text-neutral-300";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 py-2.5 sm:py-3 px-2.5 sm:px-4">
      <div className={`text-right ${valueCls} ${homeCls} truncate`}>{home}</div>
      <div className="text-[10px] sm:text-[11px] font-medium text-neutral-500 px-1 sm:px-2 whitespace-nowrap text-center">
        {label}
      </div>
      <div className={`text-left ${valueCls} ${awayCls} truncate`}>{away}</div>
    </div>
  );
}

function CompareBarRow({
  label,
  homeValue,
  awayValue,
  tone,
  decimals = 1,
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  tone: "positive" | "negative";
  decimals?: number;
}) {
  const max = Math.max(homeValue, awayValue, 0.001);
  const homePct = (homeValue / max) * 100;
  const awayPct = (awayValue / max) * 100;
  const homeBetter =
    tone === "positive" ? homeValue > awayValue : homeValue < awayValue;
  const awayBetter =
    tone === "positive" ? awayValue > homeValue : awayValue < homeValue;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 py-2.5 sm:py-3 px-2.5 sm:px-4">
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
        <span
          className={`text-xs sm:text-base font-bold tabular-nums ${
            homeBetter
              ? "text-blue-600 dark:text-blue-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {homeValue.toFixed(decimals)}
        </span>
        <div className="w-8 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-shrink-0">
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
      <div className="text-[10px] sm:text-[11px] font-medium text-neutral-500 px-1 sm:px-2 whitespace-nowrap text-center">
        {label}
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
        <div className="w-8 sm:w-24 h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full ${
              awayBetter ? "bg-rose-500" : "bg-neutral-300 dark:bg-neutral-700"
            }`}
            style={{ width: `${awayPct}%` }}
          />
        </div>
        <span
          className={`text-xs sm:text-base font-bold tabular-nums ${
            awayBetter
              ? "text-rose-600 dark:text-rose-400"
              : "text-neutral-700 dark:text-neutral-300"
          }`}
        >
          {awayValue.toFixed(decimals)}
        </span>
      </div>
    </div>
  );
}
