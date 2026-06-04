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
  return `flex-1 text-center py-2.5 rounded-xl text-sm font-bold border transition ${
    active
      ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-900 dark:border-neutral-100"
      : "border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <Link
        href="/experts"
        className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        ← 전문가 순위
      </Link>

      <div className="mt-4">
        <ProfileHeader p={profile} />
      </div>

      {/* 리그별 정확도 */}
      {leagues.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-bold mb-3 text-neutral-700 dark:text-neutral-300">
            리그별 정확도
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
          <ul className="overflow-hidden rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 divide-y divide-neutral-100 dark:divide-neutral-800/70">
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
                className="text-neutral-600 dark:text-neutral-300 hover:text-rose-500"
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
                className="text-neutral-600 dark:text-neutral-300 hover:text-rose-500"
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
