import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getUpcomingMatchesForSport } from "@/lib/analysis/matches";
import { kickoffLabel } from "@/lib/analysis/format";
import AnalysisForm, { type MatchOption } from "./AnalysisForm";

export const dynamic = "force-dynamic";

const SPORTS = ["soccer", "baseball", "basketball", "hockey"] as const;

export default async function NewAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/analysis/new");

  // 종목별 예정 경기 — 클라이언트 폼이 종목 토글 시 필터링
  const lists = await Promise.all(
    SPORTS.map((s) => getUpcomingMatchesForSport(s, 40)),
  );
  const matchesBySport: Record<string, MatchOption[]> = {};
  SPORTS.forEach((s, i) => {
    matchesBySport[s] = lists[i].map((m) => ({
      id: m.id,
      home: m.homeTeamName,
      away: m.awayTeamName,
      label: `${m.homeTeamName} vs ${m.awayTeamName} · ${m.league} ${kickoffLabel(m.startTime)}`,
    }));
  });

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
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
