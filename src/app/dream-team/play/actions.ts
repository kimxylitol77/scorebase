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
import { lineupMembers, applyMatchEffects, conditionPenalty, type SquadMember, type LineupSlot } from "@/lib/dream-team/squad";
import { marketValue } from "@/lib/dream-team/pricing";
import { generateMatchEvents, type MatchEvent } from "@/lib/dream-team/match-events";

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
  fundsAfter: number; // 누적 자금(€M)
  promoted: boolean; // 티어 승급 여부
  newTierName: string | null; // 승급 시 새 티어 이름
  events: MatchEvent[]; // 라이브 중계용 분 단위 타임라인
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
  const home = String(formData.get("home") ?? "") === "true";
  const bot = BOT_TEAMS.find((b) => b.id === botId);
  if (!bot) return { ok: false, error: "상대를 찾을 수 없습니다." };

  const team = await prisma.dreamTeam.findFirst({ where: { userId } });
  if (!team) return { ok: false, error: "먼저 팀을 만들어주세요." };
  const lineup = (team.lineup as unknown as LineupSlot[]) ?? [];
  const roster = (team.squad as unknown as SquadMember[]) ?? [];
  const members = lineupMembers(roster, lineup);
  if (members.length !== 11) return { ok: false, error: "11명을 채운 뒤 경기할 수 있습니다." };
  if (members.some((m) => m.injuryGames > 0)) return { ok: false, error: "부상 선수가 선발에 있습니다. 빌더에서 교체하세요." };

  // 시즌 일정 검증 — 현재 티어 봇만, 시즌 완료·중복 경기 방지
  if (bot.tier !== team.tier) return { ok: false, error: "상대를 찾을 수 없습니다." };
  const bots = botsForTier(team.tier);
  const seasonGames = (team.seasonGames as unknown as SeasonGame[]) ?? [];
  if (seasonGames.length >= seasonLength(bots)) return { ok: false, error: "시즌 일정을 모두 치렀습니다. 시즌을 정산하세요." };
  if (seasonGames.some((g) => g.botId === botId && g.home === home)) return { ok: false, error: "이미 치른 경기입니다." };

  // 육성 반영 OVR(grownOvr) + 역할로 팀 공격력·수비력 산출
  const pool = getDreamPlayers(members.map((m) => m.playerId));
  const byId = new Map(pool.map((p) => [p.id, p]));
  const powerInput = members.flatMap((m) => {
    const dp = byId.get(m.playerId);
    if (!dp) return [];
    const ovr = grownOvr(dp.ovr, dp.potential, m.xp);
    return [{ ovr: Math.max(40, ovr - conditionPenalty(m.condition)), pos: dp.pos as string, role: m.role }];
  });
  const myPower = teamStrength(powerInput);
  const myOvr = Math.round((myPower.atk + myPower.def) / 2);

  const seed = (Date.now() % 2147483647) ^ (team.rating * 31) ^ (home ? 13 : 27);
  const result = simulateMatch(myPower, { atk: bot.avgOvr, def: bot.avgOvr }, seed, team.mentality, bot.mentality);

  const oppElo = teamOvrToElo(bot.avgOvr);
  const ratingAfter = updateRating(team.rating, oppElo, result.outcome);
  const reward = matchReward(result.outcome);
  const xpGain = matchXp(result.outcome);

  // 출전=xp+·컨디션↓·부상 확률 / 벤치=컨디션 회복·부상 카운트↓
  const newSquad = applyMatchEffects(roster, lineup, xpGain, seed);

  // 자금 누적 (승급은 시즌 정산에서만 — 시즌 중 티어 변경 방지)
  const fundsAfter = team.funds + reward;

  const newSeasonGames = [...seasonGames, { botId, home, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }] as unknown as Prisma.InputJsonValue;
  const prevLog = Array.isArray(team.matchLog) ? (team.matchLog as unknown[]) : [];
  const newLog = [{ opp: bot.name, my: result.myScore, op: result.oppScore, outcome: result.outcome, ts: Date.now() }, ...prevLog].slice(0, 20) as Prisma.InputJsonValue;

  await prisma.dreamTeam.update({
    where: { id: team.id },
    data: {
      rating: ratingAfter,
      funds: fundsAfter,
      squad: newSquad as unknown as Prisma.InputJsonValue,
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
      fundsAfter,
      promoted: false,
      newTierName: null,
      events: generateMatchEvents(result.myScore, result.oppScore, seed),
    },
  };
}

export interface SeasonEndResult {
  seasonNo: number;
  rank: number;
  total: number;
  champion: boolean;
  bonus: number;
  fundsAfter: number;
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
  const fundsAfter = team.funds + bonus;
  // 구단가치 = 보유 스쿼드 몸값 + 자금. 다음 티어 규모(예산)에 도달하면 승급.
  const roster = (team.squad as unknown as SquadMember[]) ?? [];
  const priceById = new Map(getDreamPlayers(roster.map((s) => s.playerId)).map((p) => [p.id, p]));
  const squadValue = roster.reduce((sum, m) => {
    const p = priceById.get(m.playerId);
    return sum + (p ? marketValue(p, m.xp, team.seasonNo) : 0);
  }, 0);
  const clubValue = squadValue + fundsAfter;
  let newTier = team.tier;
  let nt = nextTier(newTier);
  while (nt && clubValue >= nt.budget) {
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
      funds: fundsAfter,
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
      fundsAfter,
      promoted,
      newTierName: promoted ? TIERS[newTier]?.name ?? null : null,
      standings,
      record: { w: me.w, d: me.d, l: me.l },
    },
  };
}
