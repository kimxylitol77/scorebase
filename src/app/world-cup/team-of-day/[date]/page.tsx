// /world-cup/team-of-day/[date] — 특정 KST 날짜(YYYY-MM-DD)의 월드컵 베스트 XI.
// 최신 완료일이면 base(/team-of-day)로 redirect 해 canonical 중복을 막는다.
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getTeamOfDay,
  finishedDatesKst,
  latestFinishedDateKst,
} from "@/lib/sports/thesports/team-of-day";
import TeamOfDayView, { fmtDateKo, koName } from "@/components/TeamOfDayView";

export const revalidate = 1800;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return { title: "월드컵 베스트 XI | Scorebase" };
  const tod = await getTeamOfDay(date);
  if (!tod) return { title: "월드컵 베스트 XI | Scorebase" };
  const stars = tod.xi.slice(0, 3).map(koName).join(", ");
  const dk = fmtDateKo(date);
  return {
    title: `${dk} 월드컵 베스트 XI — ${stars} | Scorebase`,
    description: `2026 북중미 월드컵 ${dk} ${tod.matchCount}경기 최고 평점 11인. TheSports 경기 평점 기반 4-2-3-1 팀 오브 더 데이. ${stars} 등 ${dk} 베스트 XI.`,
    keywords: ["월드컵 베스트XI", "팀오브더데이", `${dk} 월드컵`, "2026 월드컵", "월드컵 평점", "스코어베이스"],
    alternates: { canonical: `/world-cup/team-of-day/${date}` },
  };
}

export default async function Page({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  // 최신 완료일은 base 가 canonical — 같은 날이면 redirect.
  const latest = await latestFinishedDateKst();
  if (date === latest) redirect("/world-cup/team-of-day");

  const [tod, allDates] = await Promise.all([getTeamOfDay(date), finishedDatesKst()]);
  if (!tod || tod.xi.length === 0) notFound();

  return <TeamOfDayView tod={tod} allDates={allDates} currentDate={date} />;
}
