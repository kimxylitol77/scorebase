"use server";
// 드림팀 경기 실행 서버 액션 — 내 팀 vs 봇 시뮬, 레이팅·전적·자금 갱신
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamAvgOvr, teamOvrToElo } from "@/lib/dream-team/ovr-to-elo";
import { simulateMatch, type MatchSimResult } from "@/lib/dream-team/simulate";
import { BOT_TEAMS } from "@/lib/dream-team/bots";
import { matchCommentary } from "@/lib/dream-team/commentary";
import { updateRating, matchReward } from "@/lib/dream-team/rating";

export interface PlayResult {
  myName: string;
  oppName: string;
  myScore: number;
  oppScore: number;
  outcome: "win" | "draw" | "loss";
  prob: { home: number; draw: number; away: number };
  commentary: string;
  ratingBefore: number;
  ratingAfter: number;
  reward: number;
  myOvr: number;
  oppOvr: number;
}

export interface PlayState {
  ok: boolean;
  error?: string;
  result?: PlayResult;
}

export async function playMatch(_prev: PlayState, formData: FormData): Promise<PlayState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const botId = String(formData.get("botId") ?? "");
  const bot = BOT_TEAMS.find((b) => b.id === botId);
  if (!bot) return { ok: false, error: "상대를 찾을 수 없습니다." };

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "먼저 팀을 만들어주세요." };
  const players = (team.players as { slot: string; playerId: string }[]) ?? [];
  if (players.length !== 11) return { ok: false, error: "11명을 채운 뒤 경기할 수 있습니다." };

  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const myOvr = Math.round(teamAvgOvr(pool.map((p) => p.ovr)));
  const seed = (Date.now() % 2147483647) ^ (team.rating * 31);
  const result: MatchSimResult = simulateMatch(myOvr, bot.avgOvr, seed);

  const oppElo = teamOvrToElo(bot.avgOvr);
  const ratingAfter = updateRating(team.rating, oppElo, result.outcome);
  const reward = matchReward(result.outcome);

  await prisma.dreamTeam.update({
    where: { id: team.id },
    data: {
      rating: ratingAfter,
      points: { increment: reward },
      wins: result.outcome === "win" ? { increment: 1 } : undefined,
      draws: result.outcome === "draw" ? { increment: 1 } : undefined,
      losses: result.outcome === "loss" ? { increment: 1 } : undefined,
    },
  });

  return {
    ok: true,
    result: {
      myName: team.name,
      oppName: bot.name,
      myScore: result.myScore,
      oppScore: result.oppScore,
      outcome: result.outcome,
      prob: result.prob,
      commentary: matchCommentary(result, team.name, bot.name),
      ratingBefore: team.rating,
      ratingAfter,
      reward,
      myOvr,
      oppOvr: bot.avgOvr,
    },
  };
}
