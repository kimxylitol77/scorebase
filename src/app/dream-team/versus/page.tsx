// 드림팀 유저 대전 페이지 — 다른 회원 팀 목록에서 도전
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamAvgOvr } from "@/lib/dream-team/ovr-to-elo";
import { grownOvr } from "@/lib/dream-team/grow";
import { TIERS } from "@/lib/dream-team/tiers";
import AmbientGlow from "@/components/AmbientGlow";
import VersusClient from "./VersusClient";

export const metadata: Metadata = { title: "드림팀 유저 대전 | Scorebase" };

interface SquadPlayer {
  slot: string;
  playerId: string;
  xp?: number;
}

function squadOvr(players: SquadPlayer[]): number {
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const ovrs = players
    .map((p) => {
      const dp = byId.get(p.playerId);
      return dp ? grownOvr(dp.ovr, dp.potential, p.xp ?? 0) : 0;
    })
    .filter((o) => o > 0);
  return ovrs.length ? Math.round(teamAvgOvr(ovrs)) : 0;
}

export default async function VersusPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?from=/dream-team/versus");
  const me = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!me) redirect("/dream-team");
  const myPlayers = (me.players as unknown as SquadPlayer[]) ?? [];

  const raw = await prisma.dreamTeam.findMany({
    where: { userId: { not: userId } },
    include: { user: { select: { nickname: true } } },
    orderBy: { rating: "desc" },
    take: 30,
  });
  const opponents = raw
    .filter((o) => Array.isArray(o.players) && (o.players as unknown as SquadPlayer[]).length === 11)
    .slice(0, 8)
    .map((o) => ({
      id: o.id,
      name: o.name,
      nickname: o.user.nickname,
      rating: o.rating,
      tier: TIERS[o.tier]?.name ?? o.tier,
      ovr: squadOvr(o.players as unknown as SquadPlayer[]),
    }));

  return (
    <main className="relative mx-auto max-w-3xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          유저 대전
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">다른 감독에게 도전</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          다른 회원의 드림팀에 도전합니다. 승패에 따라 양쪽 레이팅이 함께 변동됩니다.
        </p>
        <VersusClient teamName={me.name} myOvr={squadOvr(myPlayers)} rating={me.rating} opponents={opponents} ready={myPlayers.length === 11} />
        <div className="mt-6 flex gap-4 text-sm">
          <a href="/dream-team/play" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">← 봇 대전</a>
          <a href="/dream-team/leaderboard" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">리더보드 →</a>
        </div>
      </div>
    </main>
  );
}
