"use server";
// 드림팀 경기 실행 서버 액션 — 내 팀 vs 봇 시즌 경기(시뮬·레이팅·자금·육성) + 시즌 정산(순위 보너스·승급)
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getDreamPlayers } from "@/lib/dream-team/pool";
import { teamOvrToElo } from "@/lib/dream-team/ovr-to-elo";
import { simulateMatch } from "@/lib/dream-team/simulate";
import { BOT_TEAMS, botsForTier } from "@/lib/dream-team/bots";
import { matchCommentary } from "@/lib/dream-team/commentary";
import { updateRating, matchReward } from "@/lib/dream-team/rating";
import { grownOvr, matchXp } from "@/lib/dream-team/grow";
import { nextTier, TIERS } from "@/lib/dream-team/tiers";
import { tacticNote, teamStrength } from "@/lib/dream-team/tactics";
import { computeStandings, myRank, seasonBonus, seasonLength, type SeasonGame, type StandRow } from "@/lib/dream-team/season";

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
  const home = String(formData.get("home") ?? "") === "true";
  const bot = BOT_TEAMS.find((b) => b.id === botId);
  if (!bot) return { ok: false, error: "상대를 찾을 수 없습니다." };

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "먼저 팀을 만들어주세요." };
  const players = (team.players as unknown as SquadPlayer[]) ?? [];
  if (players.length !== 11) return { ok: false, error: "11명을 채운 뒤 경기할 수 있습니다." };

  // 시즌 일정 검증 — 현재 티어 봇만, 시즌 완료·중복 경기 방지
  if (bot.tier !== team.tier) return { ok: false, error: "상대를 찾을 수 없습니다." };
  const bots = botsForTier(team.tier);
  const seasonGames = (team.seasonGames as unknown as SeasonGame[]) ?? [];
  if (seasonGames.length >= seasonLength(bots)) return { ok: false, error: "시즌 일정을 모두 치렀습니다. 시즌을 정산하세요." };
  if (seasonGames.some((g) => g.botId === botId && g.home === home)) return { ok: false, error: "이미 치른 경기입니다." };

  // 육성 반영 OVR(grownOvr) + 역할로 팀 공격력·수비력 산출
  const pool = getDreamPlayers(players.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const squad = players.flatMap((p) => {
    const dp = byId.get(p.playerId);
    return dp ? [{ ovr: grownOvr(dp.ovr, dp.potential, p.xp ?? 0), pos: dp.pos as string, role: p.role }] : [];
  });
  const myPower = teamStrength(squad);
  const myOvr = Math.round((myPower.atk + myPower.def) / 2);

  const seed = (Date.now() % 2147483647) ^ (team.rating * 31) ^ (home ? 13 : 27);
  const result = simulateMatch(myPower, { atk: bot.avgOvr, def: bot.avgOvr }, seed, team.mentality, bot.mentality);

  const oppElo = teamOvrToElo(bot.avgOvr);
  const ratingAfter = updateRating(team.rating, oppElo, result.outcome);
  const reward = matchReward(result.outcome);
  const xpGain = matchXp(result.outcome);

  // 출전 선수 xp 누적
  const newPlayers = players.map((p) => ({ ...p, xp: (p.xp ?? 0) + xpGain }));

  // 자금 누적 (승급은 시즌 정산에서만 — 시즌 중 티어 변경 방지)
  const pointsAfter = team.points + reward;

  const newSeasonGames = [...seasonGames, { botId, home, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }] as unknown as Prisma.InputJsonValue;
  const prevLog = Array.isArray(team.matchLog) ? (team.matchLog as unknown[]) : [];
  const newLog = [{ opp: bot.name, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }, ...prevLog].slice(0, 20) as Prisma.InputJsonValue;

  await prisma.dreamTeam.update({
    where: { id: team.id },
    data: {
      rating: ratingAfter,
      points: pointsAfter,
      players: newPlayers,
      matchLog: newLog,
      seasonGames: newSeasonGames,
      wins: result.outcome === "win" ? { increment: 1 } : undefined,
      draws: result.outcome === "draw" ? { increment: 1 } : undefined,
      losses: result.outcome === "loss" ? { increment: 1 } : undefined,
    },
  });
  revalidatePath("/dream-team/play");

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
      promoted: false,
      newTierName: null,
    },
  };
}

export interface SeasonEndResult {
  seasonNo: number;
  rank: number;
  total: number;
  champion: boolean;
  bonus: number;
  pointsAfter: number;
  promoted: boolean;
  newTierName: string | null;
  standings: StandRow[];
  record: { w: number; d: number; l: number };
}

export interface SeasonState {
  ok: boolean;
  error?: string;
  result?: SeasonEndResult;
}

// 시즌 정산 — 일정 10경기를 모두 치른 뒤 최종 순위·보너스·승급을 확정하고 다음 시즌으로 넘긴다.
export async function endSeason(_prev: SeasonState, _formData: FormData): Promise<SeasonState> {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "로그인이 필요합니다." };

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "팀을 찾을 수 없습니다." };

  const bots = botsForTier(team.tier);
  const seasonGames = (team.seasonGames as unknown as SeasonGame[]) ?? [];
  if (seasonGames.length < seasonLength(bots)) return { ok: false, error: "아직 시즌 일정이 남았습니다." };

  const standings = computeStandings(team.name, bots, seasonGames, team.seasonNo);
  const rank = myRank(standings);
  const bonus = seasonBonus(rank);
  const champion = rank === 1;
  const me = standings.find((r) => r.isMe) ?? { w: 0, d: 0, l: 0 };
  const pointsAfter = team.points + bonus;

  // 승급 — 보너스로 여러 티어를 한 번에 넘을 수도 있어 반복 체크
  let newTier = team.tier;
  let nt = nextTier(newTier);
  while (nt && pointsAfter >= nt.unlock) {
    newTier = nt.key;
    nt = nextTier(newTier);
  }
  const promoted = newTier !== team.tier;

  const prevHistory = Array.isArray(team.seasonHistory) ? (team.seasonHistory as unknown[]) : [];
  const newHistory = [{ seasonNo: team.seasonNo, rank, total: standings.length, champion, w: me.w, d: me.d, l: me.l }, ...prevHistory].slice(0, 20) as Prisma.InputJsonValue;

  await prisma.dreamTeam.update({
    where: { id: team.id },
    data: {
      seasonNo: team.seasonNo + 1,
      seasonGames: [],
      seasonHistory: newHistory,
      points: pointsAfter,
      tier: newTier,
    },
  });
  revalidatePath("/dream-team/play");

  return {
    ok: true,
    result: {
      seasonNo: team.seasonNo,
      rank,
      total: standings.length,
      champion,
      bonus,
      pointsAfter,
      promoted,
      newTierName: promoted ? TIERS[newTier]?.name ?? null : null,
      standings,
      record: { w: me.w, d: me.d, l: me.l },
    },
  };
}
