"use server";
// 드림팀 유저 대전 — 다른 회원 팀에 비동기 도전, 양쪽 레이팅·전적 갱신 (도전자만 자금·육성·승급)
import type { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamOvrToElo } from "@/lib/dream-team/ovr-to-elo";
import { simulateMatch } from "@/lib/dream-team/simulate";
import { matchCommentary } from "@/lib/dream-team/commentary";
import { updateRating, matchReward } from "@/lib/dream-team/rating";
import { grownOvr, matchXp } from "@/lib/dream-team/grow";
import { nextTier } from "@/lib/dream-team/tiers";
import { tacticNote, teamStrength, type TeamPower } from "@/lib/dream-team/tactics";
import type { PlayState } from "../play/actions";

interface SquadPlayer {
  slot: string;
  playerId: string;
  xp?: number;
  role?: string;
}

function squadPower(players: SquadPlayer[]): TeamPower {
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const squad = players.flatMap((p) => {
    const dp = byId.get(p.playerId);
    return dp ? [{ ovr: grownOvr(dp.ovr, dp.potential, p.xp ?? 0), pos: dp.pos as string, role: p.role }] : [];
  });
  return teamStrength(squad);
}

export async function playUserMatch(_prev: PlayState, formData: FormData): Promise<PlayState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const opponentId = String(formData.get("opponentId") ?? "");
  const me = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!me) return { ok: false, error: "먼저 팀을 만들어주세요." };
  const myPlayers = (me.players as unknown as SquadPlayer[]) ?? [];
  if (myPlayers.length !== 11) return { ok: false, error: "11명을 채운 뒤 도전할 수 있습니다." };

  const opp = await prisma.dreamTeam.findUnique({ where: { id: opponentId } });
  if (!opp || opp.userId === userId) return { ok: false, error: "상대를 찾을 수 없습니다." };
  const oppPlayers = (opp.players as unknown as SquadPlayer[]) ?? [];
  if (oppPlayers.length !== 11) return { ok: false, error: "상대 팀이 미완성입니다." };

  const myPower = squadPower(myPlayers);
  const oppPower = squadPower(oppPlayers);
  const myOvr = Math.round((myPower.atk + myPower.def) / 2);
  const oppOvr = Math.round((oppPower.atk + oppPower.def) / 2);
  const myElo = teamOvrToElo(myOvr);
  const oppElo = teamOvrToElo(oppOvr);

  const seed = (Date.now() % 2147483647) ^ (me.rating * 31) ^ (opp.rating * 17);
  const result = simulateMatch(myPower, oppPower, seed, me.mentality, opp.mentality);

  // 도전자(나) — 레이팅·전적·자금·육성·승급
  const myRatingAfter = updateRating(me.rating, oppElo, result.outcome);
  const reward = matchReward(result.outcome);
  const xpGain = matchXp(result.outcome);
  const newMyPlayers = myPlayers.map((p) => ({ ...p, xp: (p.xp ?? 0) + xpGain }));
  const pointsAfter = me.points + reward;
  const nt = nextTier(me.tier);
  const promoted = !!(nt && pointsAfter >= nt.unlock);
  const newTier = promoted && nt ? nt.key : me.tier;

  // 상대 — 레이팅·전적만 (반대 결과)
  const oppOutcome = result.outcome === "win" ? "loss" : result.outcome === "loss" ? "win" : "draw";
  const oppRatingAfter = updateRating(opp.rating, myElo, oppOutcome);

  const prevLog = Array.isArray(me.matchLog) ? (me.matchLog as unknown[]) : [];
  const newLog = [{ opp: opp.name, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }, ...prevLog].slice(0, 20) as Prisma.InputJsonValue;

  await prisma.$transaction([
    prisma.dreamTeam.update({
      where: { id: me.id },
      data: {
        rating: myRatingAfter,
        points: pointsAfter,
        tier: newTier,
        players: newMyPlayers,
        matchLog: newLog,
        wins: result.outcome === "win" ? { increment: 1 } : undefined,
        draws: result.outcome === "draw" ? { increment: 1 } : undefined,
        losses: result.outcome === "loss" ? { increment: 1 } : undefined,
      },
    }),
    prisma.dreamTeam.update({
      where: { id: opp.id },
      data: {
        rating: oppRatingAfter,
        wins: oppOutcome === "win" ? { increment: 1 } : undefined,
        draws: oppOutcome === "draw" ? { increment: 1 } : undefined,
        losses: oppOutcome === "loss" ? { increment: 1 } : undefined,
      },
    }),
  ]);

  return {
    ok: true,
    result: {
      myName: me.name,
      oppName: opp.name,
      myScore: result.myScore,
      oppScore: result.oppScore,
      outcome: result.outcome,
      prob: result.prob,
      commentary: matchCommentary(result, me.name, opp.name),
      ratingBefore: me.rating,
      ratingAfter: myRatingAfter,
      reward,
      myOvr,
      oppOvr,
      myMentality: me.mentality,
      oppMentality: opp.mentality,
      tacticNote: tacticNote(me.mentality, opp.mentality, result.outcome, result.myScore + result.oppScore),
      xpGain,
      pointsAfter,
      promoted,
      newTierName: promoted && nt ? nt.name : null,
    },
  };
}
