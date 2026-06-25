"use server";
// 드림팀 경기 실행 서버 액션 — 내 팀 vs 봇 시뮬, 레이팅·전적·자금·선수 육성·티어 승급 갱신
import type { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamOvrToElo } from "@/lib/dream-team/ovr-to-elo";
import { simulateMatch } from "@/lib/dream-team/simulate";
import { BOT_TEAMS } from "@/lib/dream-team/bots";
import { matchCommentary } from "@/lib/dream-team/commentary";
import { updateRating, matchReward } from "@/lib/dream-team/rating";
import { grownOvr, matchXp } from "@/lib/dream-team/grow";
import { nextTier } from "@/lib/dream-team/tiers";
import { tacticNote, teamStrength } from "@/lib/dream-team/tactics";

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
  myMentality: string; // 내 전술 멘탈리티
  oppMentality: string; // 상대 전술 멘탈리티
  tacticNote: string; // 전술 한 줄 코멘트
  xpGain: number; // 출전 선수가 받은 xp
  pointsAfter: number; // 누적 자금(€M)
  promoted: boolean; // 티어 승급 여부
  newTierName: string | null; // 승급 시 새 티어 이름
}

export interface PlayState {
  ok: boolean;
  error?: string;
  result?: PlayResult;
}

interface SquadPlayer {
  slot: string;
  playerId: string;
  xp?: number;
  role?: string;
}

export async function playMatch(_prev: PlayState, formData: FormData): Promise<PlayState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const botId = String(formData.get("botId") ?? "");
  const bot = BOT_TEAMS.find((b) => b.id === botId);
  if (!bot) return { ok: false, error: "상대를 찾을 수 없습니다." };

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "먼저 팀을 만들어주세요." };
  const players = (team.players as unknown as SquadPlayer[]) ?? [];
  if (players.length !== 11) return { ok: false, error: "11명을 채운 뒤 경기할 수 있습니다." };

  // 육성 반영 OVR(grownOvr) + 역할로 팀 공격력·수비력 산출
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const squad = players.flatMap((p) => {
    const dp = byId.get(p.playerId);
    return dp ? [{ ovr: grownOvr(dp.ovr, dp.potential, p.xp ?? 0), pos: dp.pos as string, role: p.role }] : [];
  });
  const myPower = teamStrength(squad);
  const myOvr = Math.round((myPower.atk + myPower.def) / 2);

  const seed = (Date.now() % 2147483647) ^ (team.rating * 31);
  const result = simulateMatch(myPower, { atk: bot.avgOvr, def: bot.avgOvr }, seed, team.mentality, bot.mentality);

  const oppElo = teamOvrToElo(bot.avgOvr);
  const ratingAfter = updateRating(team.rating, oppElo, result.outcome);
  const reward = matchReward(result.outcome);
  const xpGain = matchXp(result.outcome);

  // 출전 선수 xp 누적
  const newPlayers = players.map((p) => ({ ...p, xp: (p.xp ?? 0) + xpGain }));

  // 자금 누적 → 티어 승급 체크
  const pointsAfter = team.points + reward;
  const nt = nextTier(team.tier);
  const promoted = !!(nt && pointsAfter >= nt.unlock);
  const newTier = promoted && nt ? nt.key : team.tier;

  const prevLog = Array.isArray(team.matchLog) ? (team.matchLog as unknown[]) : [];
  const newLog = [{ opp: bot.name, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }, ...prevLog].slice(0, 20) as Prisma.InputJsonValue;

  await prisma.dreamTeam.update({
    where: { id: team.id },
    data: {
      rating: ratingAfter,
      points: pointsAfter,
      tier: newTier,
      players: newPlayers,
      matchLog: newLog,
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
      myMentality: team.mentality,
      oppMentality: bot.mentality,
      tacticNote: tacticNote(team.mentality, bot.mentality, result.outcome, result.myScore + result.oppScore),
      xpGain,
      pointsAfter,
      promoted,
      newTierName: promoted && nt ? nt.name : null,
    },
  };
}
