// /world-cup/team-of-day — 월드컵 '오늘의 베스트 XI' (최근 완료일 경기 평점 기반 4-2-3-1).
// 데이터: getTeamOfDay() 가 TheSportsMatchCache 평점을 실시간 집계 (Vercel 안전, cron·빌드 불필요).
// 과거 날짜는 /world-cup/team-of-day/[date] 동적 라우트로 조회 (날짜 칩 네비게이션).
import Link from "next/link";
import type { Metadata } from "next";
import { getTeamOfDay, finishedDatesKst } from "@/lib/sports/thesports/team-of-day";
import TeamOfDayView, { fmtDateKo, koName } from "@/components/TeamOfDayView";

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
      <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-black mb-3">오늘의 베스트 XI</h1>
          <p className="text-neutral-500 text-sm mb-6">아직 평점이 집계된 완료 경기가 없습니다. 경기 종료 후 자동으로 채워집니다.</p>
          <Link href="/predictions/WORLD_CUP" className="text-sm text-amber-600 dark:text-amber-400 hover:underline">← 월드컵 예측·조별 순위 보기</Link>
        </div>
      </div>
    );
  }
  return <TeamOfDayView tod={tod} allDates={allDates} currentDate={tod.date} />;
}
