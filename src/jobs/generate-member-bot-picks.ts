// 회원 커스텀 봇 매일 픽 생성 — isActive 봇 전체에 대해 향후 24h 저장 pred 매치의 1X2 픽을 upsert.
// gpt-predictions cron(하루 2회) 피기백. 확률·픽은 member-bot.ts 손잡이 수식으로 재계산한다.
// 매치당 피처 1회 생성 → 봇 N개에 산술 적용(봇당 <0.01ms — 2026-07-19 조사 3절).
// 조건식 시스템(knobs.kind="rules")은 손잡이 수식 대신 rule-system.ts 조건 평가로 픽 방향을 정한다(확률은 우리 모델값).
import { prisma } from "@/lib/db";
import { buildRuleFeatures, isRuleKnobs, matchesRules, parseRuleKnobs, type RuleMatchInput } from "@/lib/predict/rule-system";
import type { PredictMatch } from "@/lib/predict/types";
import {
  buildLeagueFeatures,
  clampKnobs,
  computeCustomProb,
  leagueConfigOf,
  pickOf,
  type BotKnobs,
} from "@/lib/predict/member-bot";

const LOOKAHEAD_H = 24;
/** 봇 수 폭증 대비 상한 — 계정당 3개 제한이라 사실상 여유값 */
const MAX_BOTS = 200;
/** 1회 실행 upsert 상한 — 초과분은 다음 실행(하루 2회)이 이어받음 */
const MAX_UPSERTS = 3000;

export async function runGenerateMemberBotPicks() {
  const allBots = await prisma.memberBot.findMany({
    where: { isActive: true },
    select: { id: true, league: true, knobs: true },
    orderBy: { createdAt: "asc" },
    take: MAX_BOTS,
  });
  if (allBots.length === 0) return { bots: 0, matches: 0, picks: 0, rulePicks: 0 };
  const ruleBots = allBots.filter((b) => isRuleKnobs(b.knobs));
  const bots = allBots.filter((b) => !isRuleKnobs(b.knobs));

  const now = new Date();
  const targets = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + LOOKAHEAD_H * 3600_000) },
      predHome: { not: null },
      predDraw: { not: null },
      predAway: { not: null },
    },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
      awayStarter: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      marketBookmakers: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      openingMarketHome: true,
      openingMarketAway: true,
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
    },
    orderBy: { startTime: "asc" },
  });
  if (targets.length === 0) return { bots: allBots.length, matches: 0, picks: 0, rulePicks: 0 };

  const rulePicks = await generateRulePicks(ruleBots, targets);

  // 봇이 커버하는 리그만 히스토리 로드 (bot.league="ALL" 이면 전 리그)
  const hasAll = bots.some((b) => b.league === "ALL");
  const botLeagues = new Set(bots.map((b) => b.league));
  const leagues = Array.from(new Set(targets.map((t) => t.league))).filter(
    (lg) => hasAll || botLeagues.has(lg),
  );
  if (leagues.length === 0) return { bots: allBots.length, matches: 0, picks: 0, rulePicks };

  let picks = 0;
  for (const lg of leagues) {
    const lgTargets = targets.filter((t) => t.league === lg);
    // as-of Elo·폼·prior 재구성용 리그 전체 히스토리 (bot-backtest 와 동일 select)
    const history = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
    });
    const features = buildLeagueFeatures(history as PredictMatch[], lgTargets, lg);
    const cfg = leagueConfigOf(lg);
    const lgBots = bots.filter((b) => b.league === "ALL" || b.league === lg);

    for (const f of features) {
      const t = lgTargets.find((x) => x.id === f.matchId);
      // 킥오프 가드 — 실행 중 경기가 시작되면 픽 생성 안 함 (경기 전 예측 원칙)
      if (!t || t.startTime.getTime() <= Date.now()) continue;
      for (const b of lgBots) {
        if (picks >= MAX_UPSERTS) break;
        const knobs = clampKnobs(b.knobs as Partial<BotKnobs> | null);
        const wp = computeCustomProb(f, cfg, knobs);
        const pick = pickOf(wp);
        const prob = pick === "HOME" ? wp.home : pick === "AWAY" ? wp.away : wp.draw;
        await prisma.memberBotPick.upsert({
          where: { botId_matchId_market: { botId: b.id, matchId: f.matchId, market: "1X2" } },
          create: { botId: b.id, matchId: f.matchId, market: "1X2", pick, prob },
          update: { pick, prob },
        });
        picks++;
      }
    }
  }

  console.log(
    `[member-bot] 픽 생성 — 봇 ${bots.length} · 조건식 ${ruleBots.length} · 매치 ${targets.length} · upsert ${picks} · 조건식 upsert ${rulePicks}`,
  );
  return { bots: allBots.length, matches: targets.length, picks, rulePicks };
}

type RuleTarget = Omit<RuleMatchInput, "status"> & { startTime: Date };

/**
 * 조건식 시스템 픽 — 대상 경기의 as-of 폼 피처(직전 60일 종료 경기)를 만들고 조건에 걸리면 픽 방향으로 upsert.
 * 확률은 우리 모델의 그 방향 확률. 무승부 없는 종목에 DRAW 방향은 건너뛴다.
 */
async function generateRulePicks(
  ruleBots: Array<{ id: string; league: string; knobs: unknown }>,
  targets: Array<RuleTarget & { league: string }>,
): Promise<number> {
  if (ruleBots.length === 0) return 0;
  const systems = ruleBots
    .map((b) => ({ id: b.id, system: parseRuleKnobs(b.knobs, b.league) }))
    .filter((x): x is { id: string; system: NonNullable<ReturnType<typeof parseRuleKnobs>> } => !!x.system);
  if (systems.length === 0) return 0;
  const leagues = Array.from(new Set(targets.map((t) => t.league))).filter((lg) => systems.some((s) => s.system.league === "ALL" || s.system.league === lg));
  if (leagues.length === 0) return 0;
  const now = new Date();
  const history = await prisma.match.findMany({
    where: { league: { in: leagues }, status: "FINISHED", startTime: { gte: new Date(now.getTime() - 60 * 86_400_000), lte: now } },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, startTime: true, homeScore: true, awayScore: true },
  });
  const lgTargets = targets.filter((t) => leagues.includes(t.league));
  const targetIds = new Set(lgTargets.map((t) => t.id));
  const features = buildRuleFeatures([
    ...history.filter((h) => !targetIds.has(h.id)),
    ...lgTargets.map((t) => ({ ...t, status: "SCHEDULED", target: true })),
  ]);
  const byId = new Map(lgTargets.map((t) => [t.id, t]));
  let n = 0;
  for (const f of features) {
    const t = byId.get(f.matchId);
    if (!t || t.startTime.getTime() <= Date.now()) continue;
    for (const { id, system } of systems) {
      if (system.league !== "ALL" && system.league !== t.league) continue;
      if (!matchesRules(f, system.conds)) continue;
      const prob = system.side === "HOME" ? t.predHome : system.side === "AWAY" ? t.predAway : t.predDraw;
      if (prob == null || (system.side === "DRAW" && prob <= 0)) continue;
      if (n >= MAX_UPSERTS) return n;
      await prisma.memberBotPick.upsert({
        where: { botId_matchId_market: { botId: id, matchId: f.matchId, market: "1X2" } },
        create: { botId: id, matchId: f.matchId, market: "1X2", pick: system.side, prob },
        update: { pick: system.side, prob },
      });
      n++;
    }
  }
  return n;
}
