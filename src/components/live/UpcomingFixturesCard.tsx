// 양 팀 다음 경기 카드 — 현재 매치 이후 양 팀의 가까운 예정 매치 표시.
// /live/[league]/[gameId] 의 정보 풍부도 향상 — 사용자가 다음 일정 즉시 확인.

import Link from "next/link";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export interface UpcomingFixture {
  matchId: number;
  league: string;
  externalId: string;
  startTime: Date;
  homeName: string;
  awayName: string;
  /** 이 카드에서 어느 팀 시점 — 표시상 강조용 */
  perspective: "home" | "away";
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  homeUpcoming: UpcomingFixture[];
  awayUpcoming: UpcomingFixture[];
}

function fmtDate(d: Date): string {
  // KST 변환 (UTC+9)
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const w = ["일", "월", "화", "수", "목", "금", "토"][kst.getUTCDay()];
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${m}/${day}(${w}) ${hh}:${mm}`;
}

function row(f: UpcomingFixture, viewerTeam: "home" | "away", teamNameKo: string) {
  const opponentName = f.perspective === "home" ? f.awayName : f.homeName;
  const opponentKo = toKoreanTeamName(opponentName, f.league);
  const isHome = f.perspective === "home";
  return (
    <Link
      href={`/live/${f.league}/${f.externalId}`}
      className="block py-2 px-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[10px] text-neutral-400 tabular-nums w-[88px] flex-shrink-0">
          {fmtDate(f.startTime)}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex-shrink-0">
          {isHome ? "홈" : "원정"}
        </span>
        <span className="text-neutral-400">vs</span>
        <span className="font-medium truncate flex-1">{opponentKo}</span>
        <span className="text-[10px] text-neutral-400 truncate hidden sm:inline">
          {LEAGUE_DISPLAY[f.league] ?? f.league}
        </span>
      </div>
    </Link>
  );
}

export default function UpcomingFixturesCard({
  homeNameKo,
  awayNameKo,
  homeUpcoming,
  awayUpcoming,
}: Props) {
  if (homeUpcoming.length === 0 && awayUpcoming.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">다음 경기</h2>
        <span className="text-[10px] text-neutral-400">양 팀 일정</span>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {homeUpcoming.length > 0 && (
          <div>
            <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mb-1 px-1">{homeNameKo}</div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {homeUpcoming.map((f) => (
                <li key={f.matchId}>{row(f, "home", homeNameKo)}</li>
              ))}
            </ul>
          </div>
        )}
        {awayUpcoming.length > 0 && (
          <div>
            <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold mb-1 px-1">{awayNameKo}</div>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {awayUpcoming.map((f) => (
                <li key={f.matchId}>{row(f, "away", awayNameKo)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
