// 멀티 AI 성적표 수집 — 예정 경기에 우리 통계모델 + GPT-5.5 의 1X2 픽을 경기 전 저장.
// 두 AI 가 "정확히 같은 경기"를 예측하게 해 정면 비교. 채점은 evaluate 가 종료 후 채움.
// /predictions/scorecard 의 데이터 소스. cron: /api/cron/gpt-predictions.
import "@/lib/env";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { buildMatchContext } from "@/lib/predict/build-context";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "@/lib/predict/starter-adjust";
import {
  computeGoalieAdjustment,
  applyGoalieToWinProb,
} from "@/lib/predict/goalie-adjust";
import { blendWithMarket } from "@/lib/predict/market-blend";
import {
  calibrateHomeWinProb,
  hasHomeCalibration,
} from "@/lib/predict/home-calibration";
import { SOCCER_LEAGUES_FOR_MARKETS } from "@/lib/predict/markets";
import { parseTsFootballScore } from "@/lib/sports/live-scores";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";

// 비교 대상 리그 — 시즌 중인 주요 리그. 경기 없는 리그는 자동으로 0건.
const MAJOR_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
  "WORLD_CUP", "NBA", "NHL", "MLB", "KBO", "NPB",
];

const LEAGUE_NAME: Record<string, string> = {
  EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A", LIGUE_1: "리그 1", MLS: "MLS", UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵", NBA: "NBA", NHL: "NHL", MLB: "MLB",
  KBO: "KBO", NPB: "NPB",
};

const DAILY_CAP = Number(process.env.GPT_PREDICT_CAP ?? 40);
const GPT_MODEL = process.env.GPT_PREDICT_MODEL ?? "gpt-5.5";
const LOOKAHEAD_HOURS = 72; // 향후 3일 예정 경기
const MIN_PRIOR = 5; // 양 팀 모두 5경기 이상 학습 후 (random 픽 방지) — evaluate 와 동일

type Winner = "HOME" | "DRAW" | "AWAY";

function drawAllowed(league: string): boolean {
  return SOCCER_LEAGUES_FOR_MARKETS.has(league) || league === "WORLD_CUP";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJson(s: string | null): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * 우리 통계모델의 1X2 — evaluate 백테스트와 동일 파이프라인(Elo/Dixon-Coles + 선발/골리 +
 * 시장 블렌드 + home calibration). 학습 부족(MIN_PRIOR 미달, WC 제외)이면 null 반환해 스킵.
 */
function scorebasePick(
  match: {
    id: number;
    league: string;
    homeTeamId: number;
    awayTeamId: number;
    startTime: Date;
    marketHome: number | null;
    marketDraw: number | null;
    marketAway: number | null;
    marketBookmakers: number | null;
    homeStarter: string | null;
    awayStarter: string | null;
    homeGoalie: string | null;
    awayGoalie: string | null;
  },
  leagueMatches: PredictMatch[],
): { pick: Winner; prob: number } | null {
  const { league, homeTeamId, awayTeamId, startTime } = match;

  if (league !== "WORLD_CUP") {
    const homePrior = leagueMatches.filter(
      (p) =>
        (p.homeTeamId === homeTeamId || p.awayTeamId === homeTeamId) &&
        p.status === "FINISHED" &&
        p.startTime.getTime() < startTime.getTime(),
    ).length;
    const awayPrior = leagueMatches.filter(
      (p) =>
        (p.homeTeamId === awayTeamId || p.awayTeamId === awayTeamId) &&
        p.status === "FINISHED" &&
        p.startTime.getTime() < startTime.getTime(),
    ).length;
    if (Math.min(homePrior, awayPrior) < MIN_PRIOR) return null;
  }

  const ctx = buildMatchContext(
    leagueMatches,
    league,
    homeTeamId,
    awayTeamId,
    startTime,
  );
  let wp = ctx.winProb;
  if (!wp) return null;

  const sAdj = computeStarterAdjustment(
    parseJson(match.homeStarter),
    parseJson(match.awayStarter),
    league,
  );
  const gAdj = computeGoalieAdjustment(
    parseJson(match.homeGoalie),
    parseJson(match.awayGoalie),
  );
  if (sAdj.applied) wp = applyStarterToWinProb(wp, sAdj);
  if (gAdj.applied) wp = applyGoalieToWinProb(wp, gAdj);

  if (match.marketHome != null && match.marketAway != null) {
    wp = blendWithMarket(wp, {
      home: match.marketHome,
      draw: match.marketDraw,
      away: match.marketAway,
      bookmakers: match.marketBookmakers,
    });
  }

  if (hasHomeCalibration(league)) {
    const calHome = calibrateHomeWinProb(wp.home, league);
    wp = { home: calHome, draw: 0, away: 1 - calHome };
  }

  const pick: Winner =
    wp.home >= wp.away && wp.home >= wp.draw
      ? "HOME"
      : wp.away >= wp.draw
        ? "AWAY"
        : "DRAW";
  const prob = pick === "HOME" ? wp.home : pick === "AWAY" ? wp.away : wp.draw;
  return { pick, prob };
}

/** GPT-5.5 에 1X2 픽을 묻는다. 공정성 위해 우리 모델 수치는 주지 않는다. */
async function gptPick(
  client: OpenAI,
  league: string,
  homeKo: string,
  awayKo: string,
  startTime: Date,
): Promise<{ pick: Winner; prob: number; reason: string } | null> {
  const allowDraw = drawAllowed(league);
  const picks = allowDraw ? '"HOME"(홈승) | "DRAW"(무승부) | "AWAY"(원정승)' : '"HOME"(홈승) | "AWAY"(원정승)';
  const dateStr = startTime.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
  const system =
    "당신은 스포츠 베팅 분석가입니다. 주어진 경기의 승부 결과를 예측해 JSON 으로만 답합니다. 설명 문장 금지.";
  const user = `${LEAGUE_NAME[league] ?? league} 경기 (${dateStr}).
홈: ${homeKo}
원정: ${awayKo}

이 경기의 1X2(승부) 결과를 예측하세요.
- pick: ${picks} 중 하나
- prob: 그 픽이 맞을 확률 (0.0~1.0)
- reason: 한국어 한 문장 근거 (40자 이내)
JSON 형식: {"pick":"...","prob":0.0,"reason":"..."}`;

  const res = await client.chat.completions.create({
    model: GPT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 3000,
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) return null;
  let parsed: { pick?: string; prob?: number; reason?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const pickRaw = String(parsed.pick ?? "").toUpperCase();
  if (pickRaw !== "HOME" && pickRaw !== "AWAY" && pickRaw !== "DRAW") return null;
  if (pickRaw === "DRAW" && !allowDraw) return null;
  let prob = Number(parsed.prob);
  if (!Number.isFinite(prob) || prob <= 0 || prob > 1) prob = 0.5;
  const reason = String(parsed.reason ?? "").slice(0, 120);
  return { pick: pickRaw as Winner, prob, reason };
}

export async function runFetchGptPredictions(opts?: { cap?: number }) {
  const cap = opts?.cap ?? DAILY_CAP;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[gpt-pred] OPENAI_API_KEY 없음 — 스킵");
    return { targeted: 0, stored: 0, skipped: 0, failed: 0 };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  // 대상 — 예정 경기 중 GPT 픽이 아직 없는 것 (이미 픽한 경기는 재호출 안 함 = 비용 절약).
  const done = await prisma.aiPrediction.findMany({
    where: { model: GPT_MODEL, market: "1X2" },
    select: { matchId: true },
  });
  const doneIds = new Set(done.map((d) => d.matchId));

  const candidates = await prisma.match.findMany({
    where: {
      league: { in: MAJOR_LEAGUES },
      status: "SCHEDULED",
      startTime: { gte: now, lte: until },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true, league: true, homeTeamId: true, awayTeamId: true, startTime: true,
      marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true,
      homeStarter: true, awayStarter: true, homeGoalie: true, awayGoalie: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const targets = candidates.filter((m) => !doneIds.has(m.id)).slice(0, cap);

  // 관련 리그의 매치 풀 1회 로드 (우리 모델 컨텍스트용).
  const leagues = [...new Set(targets.map((t) => t.league))];
  const poolByLeague = new Map<string, PredictMatch[]>();
  for (const lg of leagues) {
    const pool = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
        homeScore: true, awayScore: true, startTime: true,
      },
    });
    poolByLeague.set(lg, pool as PredictMatch[]);
  }

  let stored = 0, skipped = 0, failed = 0;
  for (const m of targets) {
    const pool = poolByLeague.get(m.league)!;
    const ours = scorebasePick(m, pool);
    if (!ours) {
      skipped++; // 학습 부족 — GPT 호출도 안 해 비용 절약 (같은 경기 집합 유지)
      continue;
    }

    const homeKo = toKoreanTeamName(m.homeTeam?.name, m.league) || m.homeTeam?.name || "홈";
    const awayKo = toKoreanTeamName(m.awayTeam?.name, m.league) || m.awayTeam?.name || "원정";

    let gpt: Awaited<ReturnType<typeof gptPick>> = null;
    try {
      gpt = await gptPick(client, m.league, homeKo, awayKo, m.startTime);
    } catch (e) {
      console.warn(`[gpt-pred] GPT 호출 실패 match=${m.id}: ${(e as Error).message}`);
    }
    if (!gpt) {
      failed++;
      continue; // GPT 실패 시 우리 모델만 저장하면 비교 불공정 → 둘 다 스킵
    }

    await prisma.aiPrediction.upsert({
      where: { matchId_model_market: { matchId: m.id, model: "scorebase", market: "1X2" } },
      create: { matchId: m.id, model: "scorebase", market: "1X2", pick: ours.pick, prob: ours.prob },
      update: { pick: ours.pick, prob: ours.prob },
    });
    await prisma.aiPrediction.upsert({
      where: { matchId_model_market: { matchId: m.id, model: GPT_MODEL, market: "1X2" } },
      create: { matchId: m.id, model: GPT_MODEL, market: "1X2", pick: gpt.pick, prob: gpt.prob, reason: gpt.reason },
      update: { pick: gpt.pick, prob: gpt.prob, reason: gpt.reason },
    });
    stored++;
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(
    `[gpt-pred] 완료 — 대상 ${targets.length} / 저장 ${stored} / 스킵(학습부족) ${skipped} / GPT실패 ${failed}`,
  );
  return { targeted: targets.length, stored, skipped, failed };
}

function actualWinner(home: number, away: number): Winner {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

/**
 * 종료된 경기의 AiPrediction(우리 모델·GPT 양쪽)을 채점 — pick == 실제 승자면 correct.
 * 축구는 정규시간 점수로 채점(승부차기·연장 오염 제거) — evaluate 와 동일 기준.
 */
export async function runEvaluateAiPredictions() {
  const pending = await prisma.aiPrediction.findMany({
    where: {
      correct: null,
      match: {
        status: "FINISHED",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    select: {
      id: true,
      pick: true,
      match: {
        select: {
          league: true,
          homeScore: true,
          awayScore: true,
          theSportsCache: { select: { detailLive: true } },
        },
      },
    },
  });

  let graded = 0;
  for (const p of pending) {
    const m = p.match;
    let home = m.homeScore!;
    let away = m.awayScore!;
    if (SOCCER_LEAGUES_FOR_MARKETS.has(m.league) || m.league === "WORLD_CUP") {
      const fs = parseTsFootballScore(m.theSportsCache?.detailLive);
      if (fs) {
        home = fs.regHome;
        away = fs.regAway;
      }
    }
    const correct = p.pick === actualWinner(home, away);
    await prisma.aiPrediction.update({
      where: { id: p.id },
      data: { correct },
    });
    graded++;
  }
  console.log(`[gpt-pred] 채점 완료 — ${graded}건`);
  return { graded };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchGptPredictions()
    .then(() => runEvaluateAiPredictions())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
