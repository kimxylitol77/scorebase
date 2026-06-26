// 드림팀 빌더 페이지 — 회원이 티어 예산 안에서 11명 스쿼드를 구성
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { allDreamPlayers } from "@/lib/dream-team/pool";
import AmbientGlow from "@/components/AmbientGlow";
import DreamTeamBuilder from "./DreamTeamBuilder";
import TeamRecord from "./TeamRecord";
import DreamTeamNav from "./DreamTeamNav";

export const metadata: Metadata = {
  title: "드림팀 빌더 | Scorebase",
  description: "빅5 현역 선수로 나만의 드림팀을 구성하고 다른 팀과 경기하세요.",
};

export default async function DreamTeamPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?from=/dream-team");

  const pool = allDreamPlayers();
  const existing = await prisma.dreamTeam.findFirst({ where: { userId } });
  const topRaw = await prisma.dreamTeam.findMany({
    include: { user: { select: { nickname: true } } },
    orderBy: { rating: "desc" },
    take: 5,
  });
  const topTeams = topRaw.map((t) => ({ id: t.id, name: t.name, nickname: t.user.nickname, rating: t.rating, tier: t.tier }));
  const initial = existing
    ? { name: existing.name, formation: existing.formation, mentality: existing.mentality, lineup: existing.lineup as unknown, squad: existing.squad as unknown }
    : null;

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <DreamTeamNav />
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          드림팀 빌더
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">나만의 드림팀 만들기</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          아마추어 예산 안에서 가성비 선수를 발굴해 11명을 채우세요. 몸값이 아니라 능력치(OVR)로 승부합니다.
        </p>
        {existing && (
          <div className="mt-4">
            <TeamRecord
              tier={existing.tier}
              rating={existing.rating}
              wins={existing.wins}
              draws={existing.draws}
              losses={existing.losses}
              points={existing.funds}
              matchLog={(existing.matchLog as { opp: string; my: number; op: number; outcome: string; ts: number }[]) ?? []}
            />
          </div>
        )}
        <DreamTeamBuilder pool={pool} initial={initial} tierKey={existing?.tier ?? "amateur"} topTeams={topTeams} siteUrl={process.env.SITE_URL ?? "https://www.scorebase.kr"} />
      </div>
    </main>
  );
}
