// 드림팀 경기 페이지 — 내 팀으로 같은 티어 봇과 대전
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamAvgOvr } from "@/lib/dream-team/ovr-to-elo";
import { botsForTier } from "@/lib/dream-team/bots";
import { TIERS } from "@/lib/dream-team/tiers";
import { computeStandings, seasonFixtures, seasonLength, type SeasonGame } from "@/lib/dream-team/season";
import AmbientGlow from "@/components/AmbientGlow";
import PlayClient from "./PlayClient";
import DreamTeamNav from "../DreamTeamNav";
import LeaderboardAside from "../LeaderboardAside";

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

  const seasonGames = (team.seasonGames as unknown as SeasonGame[]) ?? [];
  const standings = computeStandings(team.name, bots, seasonGames, team.seasonNo);
  const total = seasonLength(bots);
  const playedKeys = new Set(seasonGames.map((g) => `${g.botId}:${g.home}`));
  const remaining = seasonFixtures(bots)
    .filter((f) => !playedKeys.has(`${f.botId}:${f.home}`))
    .map((f) => {
      const b = bots.find((x) => x.id === f.botId)!;
      return { botId: f.botId, home: f.home, name: b.name, avgOvr: b.avgOvr, mentality: b.mentality };
    });
  const seasonComplete = seasonGames.length >= total;

  return (
    <main className="relative mx-auto max-w-5xl px-4 py-10">
      <AmbientGlow />
      <div className="relative">
        <DreamTeamNav />
        <span className="inline-block rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30">
          {tierName} 리그
        </span>
        <h1 className="mt-3 text-2xl font-semibold text-neutral-900 dark:text-white">시즌 리그</h1>
        <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          같은 티어 5팀과 홈·원정 10경기를 치러 순위를 다툽니다. 시즌이 끝나면 순위에 따라 보너스 자금을 받고, 자금이 쌓이면 상위 티어로 승급합니다.
        </p>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <PlayClient
            teamName={team.name}
            myOvr={myOvr}
            rating={team.rating}
            record={{ w: team.wins, d: team.draws, l: team.losses }}
            points={team.points}
            ready={players.length === 11}
            seasonNo={team.seasonNo}
            standings={standings}
            remaining={remaining}
            played={seasonGames.length}
            total={total}
            seasonComplete={seasonComplete}
          />
          <LeaderboardAside />
        </div>
      </div>
    </main>
  );
}
