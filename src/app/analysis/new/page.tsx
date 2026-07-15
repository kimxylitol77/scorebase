// 분석글 작성 폼 — 종목→날짜→경기→마켓→픽 선택 후 발행.
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { getUpcomingMatchesForSport } from "@/lib/analysis/matches";
import { kstDateKey, kstDateLabel, kstTimeLabel } from "@/lib/analysis/format";
import SignupGateCard from "@/components/SignupGateCard";
import AnalysisForm, { type MatchOption } from "./AnalysisForm";

export const dynamic = "force-dynamic";

const SPORTS = ["soccer", "baseball", "basketball", "hockey", "esports", "volleyball", "mma"] as const;

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <AmbientGlow />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 분석 작성
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">분석글 작성</h1>
        </div>
        <Link
          href="/analysis"
          className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> 목록
        </Link>
      </div>
      {children}
    </main>
  );
}

export default async function NewAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <PageShell>
        <SignupGateCard from="/analysis/new" />
      </PageShell>
    );
  }

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
    <PageShell>
      <AnalysisForm matchesBySport={matchesBySport} />
    </PageShell>
  );
}
