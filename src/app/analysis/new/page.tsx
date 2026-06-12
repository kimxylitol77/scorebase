import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getUpcomingMatchesForSport } from "@/lib/analysis/matches";
import { kstDateKey, kstDateLabel, kstTimeLabel } from "@/lib/analysis/format";
import AnalysisForm, { type MatchOption } from "./AnalysisForm";

export const dynamic = "force-dynamic";

const SPORTS = ["soccer", "baseball", "basketball", "hockey", "esports", "volleyball", "mma"] as const;

export default async function NewAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/analysis/new");

  // 종목별 예정 경기 — 날짜/리그/경기 계층은 클라이언트 폼에서 좁혀나감.
  // 배구는 SportCode/V리그 수집 합류 전(별도 작업 진행 중) — 분류만 제공, 매치는 빈 목록.
  const lists = await Promise.all(
    SPORTS.map((s) =>
      s === "volleyball" ? Promise.resolve([]) : getUpcomingMatchesForSport(s, 120),
    ),
  );
  const matchesBySport: Record<string, MatchOption[]> = {};
  SPORTS.forEach((s, i) => {
    matchesBySport[s] = lists[i].map((m) => ({
      id: m.id,
      league: m.league,
      leagueLabel: m.leagueLabel,
      home: m.home,
      away: m.away,
      dateKey: kstDateKey(m.startTime),
      dateLabel: kstDateLabel(m.startTime),
      timeLabel: kstTimeLabel(m.startTime),
      hcLine: m.hcLine,
      ouLine: m.ouLine,
      oddsHome: m.oddsHome,
      oddsDraw: m.oddsDraw,
      oddsAway: m.oddsAway,
      oddsHcHome: m.oddsHcHome,
      oddsHcAway: m.oddsHcAway,
      oddsOver: m.oddsOver,
      oddsUnder: m.oddsUnder,
    }));
  });

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">분석글 작성</h1>
        <Link
          href="/analysis"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← 목록
        </Link>
      </div>
      <AnalysisForm matchesBySport={matchesBySport} />
    </main>
  );
}
