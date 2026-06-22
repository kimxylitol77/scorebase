// 드림팀 경기 페이지 — 내 팀으로 같은 티어 봇과 대전
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamAvgOvr } from "@/lib/dream-team/ovr-to-elo";
import { botsForTier } from "@/lib/dream-team/bots";
import { TIERS } from "@/lib/dream-team/tiers";
import AmbientGlow from "@/components/AmbientGlow";
import PlayClient from "./PlayClient";

export const metadata: Metadata = { title: "드림팀 경기 | Scorebase" };

export default async function PlayPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login?from=/dream-team/play");

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) redirect("/dream-team");

  const players = (team.players as { slot: string; playerId: string }[]) ?? [];
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const myOvr = pool.length ? Math.round(teamAvgOvr(pool.map((p) => p.ovr))) : 0;
  const bots = botsForTier(team.tier);
  const tierName = TIERS[team.tier]?.name ?? team.tier;

  return (
    <main className="relative mx-auto max-w-3xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          {tierName} 리그
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">경기하기</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          같은 티어 봇과 겨뤄 레이팅과 이적 자금을 모으세요. 자금이 쌓이면 상위 티어가 열립니다.
        </p>
        <PlayClient
          teamName={team.name}
          myOvr={myOvr}
          rating={team.rating}
          record={{ w: team.wins, d: team.draws, l: team.losses }}
          points={team.points}
          bots={bots}
          ready={players.length === 11}
        />
        <div className="mt-6 flex gap-4 text-sm">
          <a href="/dream-team" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">← 빌더</a>
          <a href="/dream-team/versus" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">유저 대전</a>
          <a href="/dream-team/leaderboard" className="text-neutral-500 hover:text-rose-600 dark:text-neutral-400">리더보드 →</a>
        </div>
      </div>
    </main>
  );
}
