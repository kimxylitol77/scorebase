// 드림팀 우측 순위 사이드 — 상위 팀 top8 (봇 대전·유저 대전 페이지 공용)
import { prisma } from "@/lib/db";
import { TIERS } from "@/lib/dream-team/tiers";

export default async function LeaderboardAside() {
  const teams = await prisma.dreamTeam.findMany({
    include: { user: { select: { nickname: true } } },
    orderBy: { rating: "desc" },
    take: 8,
  });
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-white/[0.04] lg:sticky lg:top-4 lg:self-start">
      <h3 className="mb-2 text-sm font-medium text-neutral-900 dark:text-white">상위 팀</h3>
      {teams.length === 0 ? (
        <p className="text-xs text-neutral-400">아직 등록된 팀이 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {teams.map((t, i) => (
            <a key={t.id} href={`/dream-team/team/${t.id}`} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 flex-shrink-0 text-neutral-400">{i + 1}</span>
                <span className="truncate text-neutral-700 hover:text-rose-600 dark:text-neutral-200">{t.name}</span>
              </span>
              <span className="flex-shrink-0 text-xs text-neutral-500 dark:text-neutral-400">{TIERS[t.tier]?.name ?? t.tier} · {t.rating}</span>
            </a>
          ))}
        </div>
      )}
      <a href="/dream-team/leaderboard" className="mt-3 block text-xs font-medium text-rose-600 hover:underline dark:text-rose-400">전체 리더보드 →</a>
    </div>
  );
}
