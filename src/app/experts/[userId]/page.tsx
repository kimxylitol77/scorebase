// 예측 전문가 개인 프로필 — 적중률·연승·작성 글 이력.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getUserProfile,
  getUserLeagueAccuracy,
  getUserPredictions,
} from "@/lib/analysis/profile";
import ProfileHeader from "@/components/experts/ProfileHeader";
import LeagueAccuracyBar from "@/components/experts/LeagueAccuracyBar";
import PredictionHistoryItem from "@/components/experts/PredictionHistoryItem";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const p = await getUserProfile(userId);
  if (!p) return { title: "전문가 — 스코어베이스" };
  return {
    title: `${p.nickname}님의 예측 — 스코어베이스`,
    description: `${p.nickname} 적중률 ${p.rate}% (${p.hit}/${p.total}). 리그별 정확도와 과거 예측 이력을 확인하세요.`,
  };
}

function tabCls(active: boolean): string {
  return `flex-1 text-center py-2.5 rounded-full text-sm font-bold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
    active
      ? "bg-neutral-900 text-white ring-neutral-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900 dark:ring-white"
      : "bg-white/60 text-neutral-500 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
  }`;
}

export default async function ExpertProfilePage({ params, searchParams }: Props) {
  const { userId } = await params;
  const { tab: tabRaw, page: pageRaw } = await searchParams;
  const tab: "live" | "past" = tabRaw === "live" ? "live" : "past";
  const page = Math.max(1, Number(pageRaw) || 1);

  const profile = await getUserProfile(userId);
  if (!profile) notFound();

  const [leagues, history] = await Promise.all([
    getUserLeagueAccuracy(userId),
    getUserPredictions(userId, { tab, page }),
  ]);

  return (
    <main className="relative max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />
      <Link
        href="/experts"
        className="group inline-flex items-center gap-1 text-sm text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        <ChevronLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-0.5" aria-hidden />
        전문가 순위
      </Link>

      <div className="mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 예측 전문가
        </span>
        <div className="mt-4">
          <ProfileHeader p={profile} />
        </div>
      </div>

      {/* 리그별 정확도 */}
      {leagues.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-1.5 text-sm font-bold mb-3 text-neutral-700 dark:text-neutral-300">
            <BarChart3 className="h-4 w-4 shrink-0 text-rose-500" aria-hidden /> 리그별 정확도
          </h2>
          <div className="space-y-3">
            {leagues.map((l) => (
              <LeagueAccuracyBar key={l.league} item={l} />
            ))}
          </div>
        </section>
      )}

      {/* 예측 이력 */}
      <section className="mt-8">
        <div className="flex gap-2 mb-4">
          <Link href={`/experts/${userId}?tab=past`} className={tabCls(tab === "past")}>
            과거 예측
          </Link>
          <Link href={`/experts/${userId}?tab=live`} className={tabCls(tab === "live")}>
            실시간 예측
          </Link>
        </div>

        {history.items.length === 0 ? (
          <p className="text-sm text-neutral-500 py-16 text-center">
            {tab === "live" ? "진행 예정인 예측이 없습니다." : "아직 채점된 예측이 없습니다."}
          </p>
        ) : (
          <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] divide-y divide-neutral-100 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:divide-white/5">
            {history.items.map((it) => (
              <PredictionHistoryItem key={it.postId} item={it} />
            ))}
          </ul>
        )}

        {history.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-5 text-sm">
            {page > 1 ? (
              <Link
                href={`/experts/${userId}?tab=${tab}&page=${page - 1}`}
                className="text-neutral-600 dark:text-neutral-300 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-rose-500"
              >
                ← 이전
              </Link>
            ) : (
              <span className="text-neutral-300 dark:text-neutral-700">← 이전</span>
            )}
            <span className="text-neutral-500 tabular-nums">
              {page} / {history.totalPages}
            </span>
            {page < history.totalPages ? (
              <Link
                href={`/experts/${userId}?tab=${tab}&page=${page + 1}`}
                className="text-neutral-600 dark:text-neutral-300 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-rose-500"
              >
                다음 →
              </Link>
            ) : (
              <span className="text-neutral-300 dark:text-neutral-700">다음 →</span>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
