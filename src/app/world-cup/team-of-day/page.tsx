// /world-cup/team-of-day — 월드컵 '오늘의 베스트 XI' (최근 완료일 경기 평점 기반 4-2-3-1).
// 데이터: getTeamOfDay() 가 TheSportsMatchCache 평점을 실시간 집계 (Vercel 안전, cron·빌드 불필요).
// 과거 날짜는 /world-cup/team-of-day/[date] 동적 라우트로 조회 (날짜 칩 네비게이션).
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { getTeamOfDay, finishedDatesKst } from "@/lib/sports/thesports/team-of-day";
import TeamOfDayView, { fmtDateKo, koName } from "@/components/TeamOfDayView";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  const tod = await getTeamOfDay();
  if (!tod) return { title: "월드컵 오늘의 베스트 XI | Scorebase" };
  const stars = tod.xi.slice(0, 3).map(koName).join(", ");
  const dk = fmtDateKo(tod.date);
  return {
    title: `${dk} 월드컵 베스트 XI — ${stars} | Scorebase`,
    description: `2026 북중미 월드컵 ${dk} ${tod.matchCount}경기 최고 평점 11인. TheSports 경기 평점 기반 4-2-3-1 팀 오브 더 데이. ${stars} 등 오늘의 베스트 XI — 매일 자동 갱신.`,
    keywords: ["월드컵 베스트XI", "팀오브더데이", "오늘의 베스트11", "2026 월드컵", "월드컵 평점", "스코어베이스"],
    alternates: { canonical: "/world-cup/team-of-day" },
  };
}

export default async function Page() {
  const [tod, allDates] = await Promise.all([getTeamOfDay(), finishedDatesKst()]);
  if (!tod || tod.xi.length === 0) {
    return (
      <div className="relative min-h-screen bg-white dark:bg-[#0a0a0a] text-neutral-900 dark:text-white py-16 px-4">
        <AmbientGlow />
        <div className="max-w-md mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 베스트 XI
          </span>
          <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">오늘의 베스트 XI</h1>
          <p className="mt-4 mb-7 text-neutral-500 text-sm leading-relaxed break-keep dark:text-neutral-400">아직 평점이 집계된 완료 경기가 없습니다. 경기 종료 후 자동으로 채워집니다.</p>
          <Link
            href="/predictions/WORLD_CUP"
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-rose-500/20 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-rose-400 dark:ring-white/15 dark:hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> 월드컵 예측·조별 순위 보기
          </Link>
        </div>
      </div>
    );
  }
  return <TeamOfDayView tod={tod} allDates={allDates} currentDate={tod.date} />;
}
