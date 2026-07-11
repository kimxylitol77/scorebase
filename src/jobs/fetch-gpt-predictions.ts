// 멀티 AI 성적표 수집 — 예정 경기에 우리 통계모델 + GPT-5.6 의 1X2 픽을 경기 전 저장.
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
import {
  SOCCER_LEAGUES_FOR_MARKETS,
  getSportProfile,
  predictTotalMarket,
  predictHandicapMarket,
  handicapCorrect,
  overActual,
} from "@/lib/predict/markets";
import { parseTsFootballScore } from "@/lib/sports/live-scores";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";
import { GPT_SCORECARD_ACTIVE_MODEL } from "@/lib/predict/gpt-scorecard-model";

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
const GPT_MODEL = GPT_SCORECARD_ACTIVE_MODEL;
const LOOKAHEAD_HOURS = 72; // 향후 3일 예정 경기
const MIN_PRIOR = 5; // 양 팀 모두 5경기 이상 학습 후 (random 픽 방지) — evaluate 와 동일

type Winner = "HOME" | "DRAW" | "AWAY";

type GptMatchFacts = {
  position?: { home: number; away: number; total: number };
  points?: { home: number; away: number };
  homeAway?: {
    home: { wins: number; draws: number; losses: number; ppg: number };
    away: { wins: number; draws: number; losses: number; ppg: number };
  };
  recentForm?: { home: string[]; away: string[] };
  trend?: {
    home: { gf: number; ga: number; ppg: number };
    away: { gf: number; ga: number; ppg: number };
  };
  restDays?: { home: number | null; away: number | null };
  h2h?: { homeWins: number; draws: number; awayWins: number; total: number };
};

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
    wp = blendWithMarket(
      wp,
      {
        home: match.marketHome,
        draw: match.marketDraw,
        away: match.marketAway,
        bookmakers: match.marketBookmakers,
      },
      { league: match.league },
    );
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

/**
 * 우리 모델의 핸디캡·OU 픽 + 기준선 — evaluate 와 동일 markets.ts 파이프라인(시점 기반).
 * 라인은 모델이 정하며, GPT 에 그대로 줘 같은 라인으로 채점한다(공정 비교).
 */
function scorebaseHcOu(
  match: {
    league: string;
    homeTeamId: number;
    awayTeamId: number;
    startTime: Date;
    homeStarter: string | null;
    awayStarter: string | null;
    homeTeam?: { name: string | null } | null;
  },
  leagueMatches: PredictMatch[],
): {
  hc: { pick: "HOME" | "AWAY"; prob: number; line: number } | null;
  ou: { pick: "OVER" | "UNDER"; prob: number; line: number } | null;
} {
  const { league, homeTeamId, awayTeamId, startTime } = match;
  if (!getSportProfile(league)) return { hc: null, ou: null };

  const homeEra = parseJson(match.homeStarter)?.era;
  const awayEra = parseJson(match.awayStarter)?.era;
  const total = predictTotalMarket(leagueMatches, league, homeTeamId, awayTeamId, startTime, {
    homeStarterEra: typeof homeEra === "number" ? homeEra : undefined,
    awayStarterEra: typeof awayEra === "number" ? awayEra : undefined,
    homeTeamName: match.homeTeam?.name ?? undefined,
  });
  const hcRaw = predictHandicapMarket(leagueMatches, league, homeTeamId, awayTeamId, startTime);

  return {
    hc: hcRaw ? { pick: hcRaw.pick, prob: hcRaw.prob, line: hcRaw.line } : null,
    ou: total
      ? { pick: total.pOver >= 0.5 ? "OVER" : "UNDER", prob: Math.max(total.pOver, 1 - total.pOver), line: total.line }
      : null,
  };
}

interface GptMarketPick {
  oneXtwo: { pick: Winner; prob: number } | null;
  handicap: { pick: "HOME" | "AWAY"; prob: number } | null;
  ou: { pick: "OVER" | "UNDER"; prob: number } | null;
  reason: string;
}

/**
 * GPT-5.6 에 1X2 + (라인 제공 시) 핸디캡·OU 를 한 번에 묻는다(호출 1회 = 비용 절약).
 * 공정성 위해 우리 모델의 확률은 주지 않고, 채점 기준선(line)만 제공한다.
 */
async function gptMarkets(
  client: OpenAI,
  league: string,
  homeKo: string,
  awayKo: string,
  startTime: Date,
  lines: { hc: number | null; ou: number | null },
  facts: GptMatchFacts,
): Promise<GptMarketPick | null> {
  const allowDraw = drawAllowed(league);
  const picks = allowDraw ? '"HOME"|"DRAW"|"AWAY"' : '"HOME"|"AWAY"';
  const dateStr = startTime.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
  const parts = [
    `1) 1X2 승부: "oneXtwo": {"pick": ${picks} 중 하나, "prob": 0~1}`,
  ];
  if (lines.hc != null) {
    parts.push(
      `2) 핸디캡: 기준선 ${lines.hc} (홈점수-원정점수 > ${lines.hc} 이면 홈 커버, 아니면 원정 커버). "handicap": {"pick":"HOME"|"AWAY","prob":0~1}`,
    );
  }
  if (lines.ou != null) {
    parts.push(
      `3) 오버언더: 총점 기준선 ${lines.ou} (홈+원정 득점 > ${lines.ou} 이면 OVER). "ou": {"pick":"OVER"|"UNDER","prob":0~1}`,
    );
  }
  const factsText = formatGptFacts(facts, homeKo, awayKo);
  const system =
    "당신은 보수적인 스포츠 경기 분석가입니다. 제공된 사실만 사용해 시장별 결과를 예측합니다. " +
    "제공되지 않은 부상, 라인업, 최근 뉴스, 배당 정보는 추정하거나 만들어내지 마세요. " +
    "근거가 엇비슷하거나 데이터가 부족하면 확률을 0.50~0.58 범위로 낮추고, 0.70을 넘기는 확률은 명확한 수치 우위가 있을 때만 사용하세요. " +
    "JSON 외 문장은 답하지 마세요.";
  const user = `${LEAGUE_NAME[league] ?? league} 경기 (${dateStr}).
홈: ${homeKo}
원정: ${awayKo}

검증된 경기 데이터:
${factsText}

아래 시장을 예측하세요.
${parts.join("\n")}
"reason": 한국어 한 문장 근거 (40자 이내)
요청한 키만 포함한 JSON 으로만 답하세요.`;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // 1X2 — 필수
  const oneRaw = String(parsed.oneXtwo?.pick ?? "").toUpperCase();
  let oneXtwo: { pick: Winner; prob: number } | null = null;
  if ((oneRaw === "HOME" || oneRaw === "AWAY" || (oneRaw === "DRAW" && allowDraw))) {
    let p = Number(parsed.oneXtwo?.prob);
    if (!Number.isFinite(p) || p <= 0 || p > 1) p = 0.5;
    oneXtwo = { pick: oneRaw as Winner, prob: p };
  }
  if (!oneXtwo) return null;

  // 핸디캡
  let handicap: { pick: "HOME" | "AWAY"; prob: number } | null = null;
  if (lines.hc != null) {
    const hRaw = String(parsed.handicap?.pick ?? "").toUpperCase();
    if (hRaw === "HOME" || hRaw === "AWAY") {
      let p = Number(parsed.handicap?.prob);
      if (!Number.isFinite(p) || p <= 0 || p > 1) p = 0.5;
      handicap = { pick: hRaw, prob: p };
    }
  }
  // OU
  let ou: { pick: "OVER" | "UNDER"; prob: number } | null = null;
  if (lines.ou != null) {
    const oRaw = String(parsed.ou?.pick ?? "").toUpperCase();
    if (oRaw === "OVER" || oRaw === "UNDER") {
      let p = Number(parsed.ou?.prob);
      if (!Number.isFinite(p) || p <= 0 || p > 1) p = 0.5;
      ou = { pick: oRaw, prob: p };
    }
  }

  const reason = String(parsed.reason ?? "").slice(0, 120);
  return { oneXtwo, handicap, ou, reason };
}

/** 우리 모델의 확률·픽·배당은 제외하고, GPT가 독립 판단할 수 있는 경기 사실만 전달한다. */
function formatGptFacts(facts: GptMatchFacts, home: string, away: string): string {
  const lines: string[] = [];
  if (facts.position && facts.points) {
    lines.push(`순위/승점: ${home} ${facts.position.home}/${facts.position.total}위 (${facts.points.home}점), ${away} ${facts.position.away}/${facts.position.total}위 (${facts.points.away}점)`);
  }
  if (facts.homeAway) {
    const { home: h, away: a } = facts.homeAway;
    lines.push(`홈-원정 성적: ${home} 홈 ${h.wins}승 ${h.draws}무 ${h.losses}패, 경기당 승점 ${h.ppg.toFixed(2)} / ${away} 원정 ${a.wins}승 ${a.draws}무 ${a.losses}패, 경기당 승점 ${a.ppg.toFixed(2)}`);
  }
  if (facts.recentForm) {
    lines.push(`최근 5경기: ${home} ${facts.recentForm.home.join("-")} / ${away} ${facts.recentForm.away.join("-")}`);
  }
  if (facts.trend) {
    const { home: h, away: a } = facts.trend;
    lines.push(`최근 평균: ${home} 득점 ${h.gf.toFixed(2)}, 실점 ${h.ga.toFixed(2)}, 승점 ${h.ppg.toFixed(2)} / ${away} 득점 ${a.gf.toFixed(2)}, 실점 ${a.ga.toFixed(2)}, 승점 ${a.ppg.toFixed(2)}`);
  }
  if (facts.restDays?.home != null && facts.restDays.away != null) {
    lines.push(`휴식일: ${home} ${facts.restDays.home}일 / ${away} ${facts.restDays.away}일`);
  }
  if (facts.h2h && facts.h2h.total > 0) {
    lines.push(`최근 상대전적 ${facts.h2h.total}경기: ${home} ${facts.h2h.homeWins}승, 무승부 ${facts.h2h.draws}, ${away} ${facts.h2h.awayWins}승`);
  }
  return lines.length > 0 ? lines.join("\n") : "검증된 추가 통계 없음. 팀 명성과 추측에 의존하지 말고 보수적으로 판단하세요.";
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

  let stored = 0, storedMarkets = 0, skipped = 0, failed = 0;
  for (const m of targets) {
    const pool = poolByLeague.get(m.league)!;
    const ours = scorebasePick(m, pool);
    if (!ours) {
      skipped++; // 학습 부족 — GPT 호출도 안 해 비용 절약 (같은 경기 집합 유지)
      continue;
    }

    const homeKo = toKoreanTeamName(m.homeTeam?.name, m.league) || m.homeTeam?.name || "홈";
    const awayKo = toKoreanTeamName(m.awayTeam?.name, m.league) || m.awayTeam?.name || "원정";
    const oursHcOu = scorebaseHcOu(m, pool);
    const gptFacts = buildMatchContext(
      pool,
      m.league,
      m.homeTeamId,
      m.awayTeamId,
      m.startTime,
      homeKo,
      awayKo,
    );

    let gpt: GptMarketPick | null = null;
    try {
      gpt = await gptMarkets(client, m.league, homeKo, awayKo, m.startTime, {
        hc: oursHcOu.hc?.line ?? null,
        ou: oursHcOu.ou?.line ?? null,
      }, gptFacts);
    } catch (e) {
      console.warn(`[gpt-pred] GPT 호출 실패 match=${m.id}: ${(e as Error).message}`);
    }
    if (!gpt) {
      failed++;
      continue; // GPT 실패 시 우리 모델만 저장하면 비교 불공정 → 둘 다 스킵
    }

    const n = await storeMarkets(m.id, ours, oursHcOu, gpt);
    stored += n > 0 ? 1 : 0;
    storedMarkets += n;
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(
    `[gpt-pred] 완료 — 대상 ${targets.length} / 경기 ${stored}(시장 ${storedMarkets}) / 스킵(학습부족) ${skipped} / GPT실패 ${failed}`,
  );
  return { targeted: targets.length, stored, storedMarkets, skipped, failed };
}

/**
 * 한 경기의 시장별 픽을 양 모델 모두 저장 — 양쪽이 모두 픽한 시장만 저장(공정 비교 유지).
 * 반환: 저장한 시장 수.
 */
async function storeMarkets(
  matchId: number,
  ours1x2: { pick: Winner; prob: number },
  oursHcOu: ReturnType<typeof scorebaseHcOu>,
  gpt: GptMarketPick,
): Promise<number> {
  let count = 0;
  const upsert = (
    model: string,
    market: string,
    pick: string,
    prob: number,
    line: number | null,
    reason: string | null,
  ) =>
    prisma.aiPrediction.upsert({
      where: { matchId_model_market: { matchId, model, market } },
      create: { matchId, model, market, pick, prob, line, reason },
      update: { pick, prob, line, reason },
    });

  // 1X2 — 양쪽 모두 있음(gpt.oneXtwo 는 필수)
  if (gpt.oneXtwo) {
    await upsert("scorebase", "1X2", ours1x2.pick, ours1x2.prob, null, null);
    await upsert(GPT_MODEL, "1X2", gpt.oneXtwo.pick, gpt.oneXtwo.prob, null, gpt.reason);
    count++;
  }
  // 핸디캡 — 양쪽 모두 픽했을 때만
  if (oursHcOu.hc && gpt.handicap) {
    await upsert("scorebase", "HANDICAP", oursHcOu.hc.pick, oursHcOu.hc.prob, oursHcOu.hc.line, null);
    await upsert(GPT_MODEL, "HANDICAP", gpt.handicap.pick, gpt.handicap.prob, oursHcOu.hc.line, null);
    count++;
  }
  // OU — 양쪽 모두 픽했을 때만
  if (oursHcOu.ou && gpt.ou) {
    await upsert("scorebase", "OU", oursHcOu.ou.pick, oursHcOu.ou.prob, oursHcOu.ou.line, null);
    await upsert(GPT_MODEL, "OU", gpt.ou.pick, gpt.ou.prob, oursHcOu.ou.line, null);
    count++;
  }
  return count;
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
      market: true,
      line: true,
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
    // 시장별 채점 — 핸디/OU 는 저장된 line 으로(양 모델 동일 라인). line 없으면 스킵.
    let correct: boolean;
    if (p.market === "HANDICAP") {
      if (p.line == null || (p.pick !== "HOME" && p.pick !== "AWAY")) continue;
      correct = handicapCorrect(p.pick, p.line, home, away);
    } else if (p.market === "OU") {
      if (p.line == null) continue;
      correct = overActual(home, away, p.line) === p.pick;
    } else {
      correct = p.pick === actualWinner(home, away);
    }
    await prisma.aiPrediction.update({
      where: { id: p.id },
      data: { correct },
    });
    graded++;
  }
  console.log(`[gpt-pred] 채점 완료 — ${graded}건`);
  return { graded };
}

/**
 * 백필 — 1X2 가 있는데 핸디/OU 가 빠진 경기(종료·예정 모두)에 핸디/OU 픽을 소급 추가.
 * 1X2 만 저장됐던 기존 예정 경기는 runFetchGptPredictions 가 doneIds 로 스킵하므로 여기서 메운다.
 * GPT 에는 팀·라인만 주고 결과는 주지 않으므로(점수 누설 없음) 사후 수집이어도 공정하다.
 * 우리 모델 핸디/OU 는 시점 기반(startTime asOf)으로 live 계산해 라인 일관성 유지.
 */
export async function runBackfillMarkets(opts?: { cap?: number }) {
  const cap = opts?.cap ?? 200;
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[gpt-pred] OPENAI_API_KEY 없음 — 백필 스킵");
    return { targeted: 0, added: 0 };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 1X2 가 있는 경기(종료·예정 무관) 중, 핸디 또는 OU 가 아직 없는 경기.
  const oneX = await prisma.aiPrediction.findMany({
    where: { model: GPT_MODEL, market: "1X2" },
    select: { matchId: true },
  });
  const haveHcOu = await prisma.aiPrediction.findMany({
    where: { model: GPT_MODEL, market: { in: ["HANDICAP", "OU"] } },
    select: { matchId: true },
  });
  const doneSet = new Set(haveHcOu.map((d) => d.matchId));
  const targetIds = [...new Set(oneX.map((d) => d.matchId))].filter((id) => !doneSet.has(id)).slice(0, cap);
  if (targetIds.length === 0) return { targeted: 0, added: 0 };

  const matches = await prisma.match.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true, league: true, homeTeamId: true, awayTeamId: true, startTime: true,
      homeStarter: true, awayStarter: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const leagues = [...new Set(matches.map((m) => m.league))];
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

  let added = 0;
  for (const m of matches) {
    const pool = poolByLeague.get(m.league)!;
    const oursHcOu = scorebaseHcOu(m, pool);
    if (!oursHcOu.hc && !oursHcOu.ou) continue; // 우리 모델이 줄 라인이 없으면 비교 불가
    const homeKo = toKoreanTeamName(m.homeTeam?.name, m.league) || m.homeTeam?.name || "홈";
    const awayKo = toKoreanTeamName(m.awayTeam?.name, m.league) || m.awayTeam?.name || "원정";
    const gptFacts = buildMatchContext(
      pool,
      m.league,
      m.homeTeamId,
      m.awayTeamId,
      m.startTime,
      homeKo,
      awayKo,
    );

    let gpt: GptMarketPick | null = null;
    try {
      gpt = await gptMarkets(client, m.league, homeKo, awayKo, m.startTime, {
        hc: oursHcOu.hc?.line ?? null,
        ou: oursHcOu.ou?.line ?? null,
      }, gptFacts);
    } catch (e) {
      console.warn(`[gpt-pred] 백필 GPT 실패 match=${m.id}: ${(e as Error).message}`);
    }
    if (!gpt) continue;

    if (oursHcOu.hc && gpt.handicap) {
      await prisma.aiPrediction.upsert({
        where: { matchId_model_market: { matchId: m.id, model: "scorebase", market: "HANDICAP" } },
        create: { matchId: m.id, model: "scorebase", market: "HANDICAP", pick: oursHcOu.hc.pick, prob: oursHcOu.hc.prob, line: oursHcOu.hc.line },
        update: { pick: oursHcOu.hc.pick, prob: oursHcOu.hc.prob, line: oursHcOu.hc.line },
      });
      await prisma.aiPrediction.upsert({
        where: { matchId_model_market: { matchId: m.id, model: GPT_MODEL, market: "HANDICAP" } },
        create: { matchId: m.id, model: GPT_MODEL, market: "HANDICAP", pick: gpt.handicap.pick, prob: gpt.handicap.prob, line: oursHcOu.hc.line },
        update: { pick: gpt.handicap.pick, prob: gpt.handicap.prob, line: oursHcOu.hc.line },
      });
      added++;
    }
    if (oursHcOu.ou && gpt.ou) {
      await prisma.aiPrediction.upsert({
        where: { matchId_model_market: { matchId: m.id, model: "scorebase", market: "OU" } },
        create: { matchId: m.id, model: "scorebase", market: "OU", pick: oursHcOu.ou.pick, prob: oursHcOu.ou.prob, line: oursHcOu.ou.line },
        update: { pick: oursHcOu.ou.pick, prob: oursHcOu.ou.prob, line: oursHcOu.ou.line },
      });
      await prisma.aiPrediction.upsert({
        where: { matchId_model_market: { matchId: m.id, model: GPT_MODEL, market: "OU" } },
        create: { matchId: m.id, model: GPT_MODEL, market: "OU", pick: gpt.ou.pick, prob: gpt.ou.prob, line: oursHcOu.ou.line },
        update: { pick: gpt.ou.pick, prob: gpt.ou.prob, line: oursHcOu.ou.line },
      });
      added++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  console.log(`[gpt-pred] 백필 완료 — 대상 ${matches.length} / 시장 추가 ${added}`);
  return { targeted: matches.length, added };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const backfill = process.argv.includes("--backfill");
  (backfill ? runBackfillMarkets() : runFetchGptPredictions())
    .then(() => runEvaluateAiPredictions())
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
