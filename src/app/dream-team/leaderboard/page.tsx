// 드림팀 리더보드 — 전체 팀 레이팅 순위 (공개)
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/dream-team/tiers";
import AmbientGlow from "@/components/AmbientGlow";

export const metadata: Metadata = {
  title: "드림팀 리더보드 | Scorebase",
  description: "드림팀 레이팅 전체 순위.",
};

export default async function LeaderboardPage() {
  const userId = await getCurrentUserId();
  const teams = await prisma.dreamTeam.findMany({
    include: { user: { select: { nickname: true } } },
    orderBy: { rating: "desc" },
    take: 100,
  });
  const myRank = userId ? teams.findIndex((t) => t.userId === userId) : -1;

  return (
    <main className="relative mx-auto max-w-3xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          드림팀 리더보드
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">레이팅 순위</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          봇·유저 대전으로 쌓은 레이팅 전체 순위입니다.
          {myRank >= 0 && <span className="ml-1 font-medium text-rose-600 dark:text-rose-400">내 순위 {myRank + 1}위</span>}
        </p>

        {teams.length === 0 ? (
          <p className="mt-8 rounded-xl border border-neutral-200 bg-white px-4 py-10 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04]">
            아직 등록된 팀이 없습니다. 첫 주인공이 되어보세요.
          </p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-500 dark:border-neutral-800 dark:bg-white/[0.04] dark:text-neutral-400">
                  <th className="px-3 py-2 font-medium">순위</th>
                  <th className="px-3 py-2 font-medium">팀 · 감독</th>
                  <th className="px-3 py-2 font-medium">티어</th>
                  <th className="px-3 py-2 text-right font-medium">레이팅</th>
                  <th className="px-3 py-2 text-right font-medium">전적</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => {
                  const mine = t.userId === userId;
                  return (
                    <tr key={t.id} className={`border-b border-neutral-100 last:border-0 dark:border-neutral-800/60 ${mine ? "bg-rose-500/5" : ""}`}>
                      <td className="px-3 py-2.5 font-medium text-neutral-900 dark:text-white">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-neutral-900 dark:text-white">{t.name}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{t.user.nickname}</div>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-600 dark:text-neutral-300">{TIERS[t.tier]?.name ?? t.tier}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-neutral-900 dark:text-white">{t.rating}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-neutral-500 dark:text-neutral-400">
                        {t.wins}승 {t.draws}무 {t.losses}패
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex gap-4 text-sm">
          <a href="/dream-team" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">← 빌더</a>
          <a href="/dream-team/play" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">경기하기 →</a>
        </div>
      </div>
    </main>
  );
}
