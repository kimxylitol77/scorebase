// 멀티 AI 성적표 수집 — 예정 경기에 우리 통계모델 + GPT-5.6 의 1X2 픽을 경기 전 저장.
// 두 AI 가 "정확히 같은 경기"를 예측하게 해 정면 비교. 채점은 evaluate 가 종료 후 채움.
// /predictions/scorecard 의 데이터 소스. cron: /api/cron/gpt-predictions.
import "@/lib/env";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { buildMatchContext, enrichContextWithApiFootball } from "@/lib/predict/build-context";
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
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import type { PredictMatch } from "@/lib/predict/types";
import { toKoreanTeamName } from "@/lib/team-names";
import { GPT_SCORECARD_ACTIVE_MODEL } from "@/lib/predict/gpt-scorecard-model";
import { activePanelists, PANELISTS, type Panelist, type PanelRuntime } from "@/lib/predict/panelists";
import { trackLlmUsage } from "@/lib/ai/usage-track";
import { capturePredictionContext } from "@/jobs/prediction-postmortems";
import {
  OU_SHADOW_WINDOW_DAYS,
  shouldPublishPick,
  type MatchOddsCtx,
  type OuShadowStat,
} from "@/lib/predict/publish-gate";

// 비교 대상 리그 — 시즌 중인 주요 리그. 경기 없는 리그는 자동으로 0건.
// 배구는 predHome(검증된 배구 Elo+시장 블렌드) 앵커, LoL 은 일반 Elo 파이프라인
// (백테스트 2026-07-11: LCK 70.0%·LPL 65.1%·LEC 58.3% — 2군 LCK_CL·LCS 는 미검증이라 제외).
// 배구·LoL 은 SPORT_PROFILE 없음 → 핸디/OU 없이 1X2(승패)만.
export const MAJOR_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
  "WORLD_CUP", "NBA", "NHL", "MLB", "KBO", "NPB",
  "K_LEAGUE_1", "K_LEAGUE_2",
  "VNL", "VNL_W", "EGL_W", "AVC_NATIONS_W", "V_LEAGUE", "V_LEAGUE_W", "KOVO_CUP", "KOVO_CUP_W",
  "LOL", "LPL", "LEC",
];

// predHome 앵커를 쓰는 배구 리그 (volleyball-predict cron 이 매시간 채움).
const VB_ANCHOR_LEAGUES = new Set(["VNL", "VNL_W", "EGL_W", "AVC_NATIONS_W", "V_LEAGUE", "V_LEAGUE_W", "KOVO_CUP", "KOVO_CUP_W"]);

const LEAGUE_NAME: Record<string, string> = {
  EPL: "프리미어리그", LALIGA: "라리가", BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A", LIGUE_1: "리그 1", MLS: "MLS", UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵", NBA: "NBA", NHL: "NHL", MLB: "MLB",
  KBO: "KBO", NPB: "NPB",
  K_LEAGUE_1: "K리그1", K_LEAGUE_2: "K리그2",
  VNL: "발리볼네이션스리그 남자", VNL_W: "발리볼네이션스리그 여자",
  EGL_W: "유럽 골든리그 여자배구", AVC_NATIONS_W: "AVC 네이션스컵 여자배구",
  LOL: "LoL 챔피언스 코리아(LCK)", LPL: "LoL LPL(중국)", LEC: "LoL LEC(유럽)",
};

const DAILY_CAP = Number(process.env.GPT_PREDICT_CAP ?? 40);
const GPT_MODEL = GPT_SCORECARD_ACTIVE_MODEL;
export const LOOKAHEAD_HOURS = 72; // 향후 3일 예정 경기
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
  starters?: { home: StarterFact | null; away: StarterFact | null };
  goalies?: { home: GoalieFact | null; away: GoalieFact | null };
  // buildMatchContext(PreviewContext)가 이미 채워 보내던 값 — 타입에 없어 프롬프트에만 빠져 있었다.
  // 우리 모델의 winProb·픽·배당은 계속 제외(독립 판단 유지). Elo 는 경기 결과에서 나온 원자료.
  elo?: { home: number; away: number };
  // 축구 부상·핵심선수 — enrichContextWithApiFootball 보강 시에만 존재(축구 외 리그는 없음).
  injuries?: {
    home: Array<{ name: string; reason?: string }>;
    away: Array<{ name: string; reason?: string }>;
  };
  keyPlayers?: {
    home: Array<{ name: string; goals: number; assists: number }>;
    away: Array<{ name: string; goals: number; assists: number }>;
  };
};

// 하키 골리 프롬프트 팩트 — Match.homeGoalie/awayGoalie JSON 에서 추출.
// scorebase 앵커는 computeGoalieAdjustment 로 이미 반영하는데 패널 프롬프트에는 빠져 있었다
// (야구 선발은 주면서 하키 골리는 안 주던 비대칭).
type GoalieFact = {
  name: string;
  gaa: number;
  savePctg?: number;
};

// 야구 선발투수 프롬프트 팩트 — Match.homeStarter/awayStarter JSON 에서 추출.
type StarterFact = {
  name: string;
  era: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
};

/**
 * Match.homeStarter/awayStarter JSON → 패널 프롬프트용 선발 팩트.
 * ERA 없는 쪽은 null(미발표 표기). 양쪽 다 없으면 undefined(팩트 줄 자체 생략).
 * 야구 외 리그는 컬럼이 null 이라 자연히 undefined — 리그 분기 불필요.
 */
export function starterFacts(
  homeRaw: string | null,
  awayRaw: string | null,
): GptMatchFacts["starters"] {
  const one = (raw: string | null): StarterFact | null => {
    const s = parseJson(raw);
    if (!s || typeof s.name !== "string" || typeof s.era !== "number") return null;
    return {
      name: s.name,
      era: s.era,
      whip: typeof s.whip === "number" ? s.whip : undefined,
      k9: typeof s.k9 === "number" ? s.k9 : undefined,
      wins: typeof s.wins === "number" ? s.wins : undefined,
      losses: typeof s.losses === "number" ? s.losses : undefined,
    };
  };
  const home = one(homeRaw);
  const away = one(awayRaw);
  return home || away ? { home, away } : undefined;
}

/**
 * Match.homeGoalie/awayGoalie JSON → 패널 프롬프트용 골리 팩트.
 * starterFacts 와 같은 규약 — 한쪽 없으면 null(미발표), 양쪽 다 없으면 undefined(줄 생략).
 * 하키 외 리그는 컬럼이 null 이라 자연히 undefined.
 */
export function goalieFacts(
  homeRaw: string | null,
  awayRaw: string | null,
): GptMatchFacts["goalies"] {
  const one = (raw: string | null): GoalieFact | null => {
    const g = parseJson(raw);
    if (!g || typeof g.name !== "string" || typeof g.gaa !== "number") return null;
    return {
      name: g.name,
      gaa: g.gaa,
      savePctg: typeof g.savePctg === "number" ? g.savePctg : undefined,
    };
  };
  const home = one(homeRaw);
  const away = one(awayRaw);
  return home || away ? { home, away } : undefined;
}

/**
 * 패널 프롬프트용 경기 팩트 단일 빌더 — runFetchGptPredictions·백필·Qwen 태스크 공용.
 * buildMatchContext(순위·폼·Elo 등)에 축구 부상·핵심선수(api-football, 리그·시즌 캐시)를
 * 보강하고 야구 선발·하키 골리를 붙인다. 비축구 리그는 enrich 가 그대로 통과시킨다.
 * 팀명 매칭은 api-football 영문명 기준이라 enrich 에는 DB 원명을 넘긴다.
 */
export async function buildPanelFacts(
  match: {
    league: string;
    homeTeamId: number;
    awayTeamId: number;
    startTime: Date;
    homeStarter: string | null;
    awayStarter: string | null;
    homeGoalie: string | null;
    awayGoalie: string | null;
    homeTeam?: { name: string | null } | null;
    awayTeam?: { name: string | null } | null;
  },
  leagueMatches: PredictMatch[],
  homeKo: string,
  awayKo: string,
): Promise<GptMatchFacts> {
  const ctx = await enrichContextWithApiFootball(
    buildMatchContext(
      leagueMatches,
      match.league,
      match.homeTeamId,
      match.awayTeamId,
      match.startTime,
      homeKo,
      awayKo,
    ),
    match.league,
    match.homeTeam?.name ?? "",
    match.awayTeam?.name ?? "",
    match.startTime,
  );
  return {
    ...ctx,
    starters: starterFacts(match.homeStarter, match.awayStarter),
    goalies: goalieFacts(match.homeGoalie, match.awayGoalie),
  };
}

// 무승부가 존재하는 축구 리그 — SOCCER_LEAGUES_FOR_MARKETS(핸디/OU 프로파일 스코프)와
// 별개로, K리그처럼 프로파일 없이 1X2만 도는 리그도 무승부 픽은 허용해야 한다.
const EXTRA_DRAW_LEAGUES = new Set(["WORLD_CUP", "K_LEAGUE_1", "K_LEAGUE_2"]);
function drawAllowed(league: string): boolean {
  return SOCCER_LEAGUES_FOR_MARKETS.has(league) || EXTRA_DRAW_LEAGUES.has(league);
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
 * 계측에 쓸 모델 키. **runtime 접두사가 핵심이다** — 패널은 OpenAI 호환 SDK 로
 * openrouter·ollama 도 부르므로, 모델명만 넘기면 openrouter 의 claude 가 Anthropic
 * 직접 단가로, 무료인 로컬 ollama 가 유료로 환산되는 오적용이 난다.
 * openai 런타임만 실제 서빙 모델명(스냅샷 포함)을 그대로 쓴다.
 */
function usageModelKey(runtime: PanelRuntime, modelId: string, resModel?: string): string {
  return runtime === "openai" ? resModel || modelId : `${runtime}:${modelId}`;
}

// 패널 하나에 대한 OpenAI 호환 클라이언트. openai/openrouter/ollama 모두 같은 SDK.
function panelClient(p: Panelist): OpenAI {
  return new OpenAI({
    apiKey: p.apiKeyEnv ? process.env[p.apiKeyEnv] : "ollama", // ollama 는 키 불필요
    baseURL: p.baseURL, // openai 는 undefined = 기본 endpoint
    ...(p.runtime === "openrouter"
      ? { defaultHeaders: { "HTTP-Referer": "https://www.scorebase.kr", "X-Title": "Scorebase" } }
      : {}),
  });
}

/** 발행 게이트용 매치 배당 컨텍스트 1회 조회 — storeAnchor/storePanel 공용. */
async function loadOddsCtx(matchId: number): Promise<MatchOddsCtx | null> {
  return prisma.match.findUnique({
    where: { id: matchId },
    select: {
      league: true, marketHome: true, marketDraw: true, marketAway: true,
      oddsHome: true, oddsDraw: true, oddsAway: true,
    },
  });
}

// ── OU 그림자 실측 로더 — 게이트 ③(실측 통과제)의 데이터 공급 ──
// 미발행 픽도 채점되므로(runEvaluateAiPredictions 는 전 행 대상) 최근 창의 성적이 곧
// out-of-sample 실측이다. 잡 프로세스당 사실상 1회 조회 — 10분 캐시.
// 조회 실패 시 null 반환 → 게이트가 fail-closed(기존 일괄 차단)로 동작한다.
const OU_STATS_TTL_MS = 10 * 60 * 1000;
let ouStatsCache: { at: number; map: Map<string, OuShadowStat> | null } | null = null;

async function loadOuShadowStats(): Promise<Map<string, OuShadowStat> | null> {
  const now = Date.now();
  if (ouStatsCache && now - ouStatsCache.at < OU_STATS_TTL_MS) return ouStatsCache.map;
  let map: Map<string, OuShadowStat> | null = null;
  try {
    const since = new Date(now - OU_SHADOW_WINDOW_DAYS * 86400_000);
    const [tot, hit] = await Promise.all([
      prisma.aiPrediction.groupBy({
        by: ["model"],
        where: { market: "OU", correct: { not: null }, predictedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.aiPrediction.groupBy({
        by: ["model"],
        where: { market: "OU", correct: true, predictedAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const hitBy = new Map(hit.map((r) => [r.model, r._count._all]));
    map = new Map(
      tot.map((r) => [
        r.model,
        { n: r._count._all, acc: r._count._all > 0 ? (hitBy.get(r.model) ?? 0) / r._count._all : 0 },
      ]),
    );
  } catch (e) {
    console.warn(`[gate] OU 실측 조회 실패 — 일괄 차단으로 폴백: ${(e as Error).message}`);
  }
  ouStatsCache = { at: now, map };
  return map;
}

/**
 * AiPrediction 한 행 upsert — 모든 패널·scorebase 공용. 발행 게이트 차단 픽도
 * published=false 로 저장한다(재호출 방지 + 채점 유지로 게이트 유효성 계속 측정).
 * 반환 true=발행. 차단 사유는 1X2/핸디만 로그(OU_WEAK_MODEL 은 정책상 결정적이라 소음).
 */
async function gatedUpsert(
  matchId: number,
  model: string,
  market: string,
  pick: string,
  prob: number,
  line: number | null,
  reason: string | null,
  ctx: MatchOddsCtx | null,
): Promise<boolean> {
  let published = true;
  if (ctx) {
    // OU 만 실측이 필요 — 다른 시장에서 불필요한 조회를 만들지 않는다(캐시가 있어도 첫 호출은 쿼리).
    const ouStats = market === "OU" ? await loadOuShadowStats() : null;
    const gate = shouldPublishPick(model, market, pick, prob, line, ctx, ouStats);
    if (!gate.ok) {
      published = false;
      if (gate.reason !== "OU_WEAK_MODEL") {
        console.log(`[gate] 미발행 ${gate.reason} — match=${matchId} ${model} ${market} ${pick} ${(prob * 100).toFixed(0)}%`);
      }
    }
  }
  await prisma.aiPrediction.upsert({
    where: { matchId_model_market: { matchId, model, market } },
    create: { matchId, model, market, pick, prob, line, reason, published },
    update: { pick, prob, line, reason, published },
  });
  return published;
}

/**
 * 우리 통계모델의 1X2 — evaluate 백테스트와 동일 파이프라인(Elo/Dixon-Coles + 선발/골리 +
 * 시장 블렌드 + home calibration). 학습 부족(MIN_PRIOR 미달, WC 제외)이면 null 반환해 스킵.
 */
export function scorebasePick(
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
    predHome?: number | null;
    predAway?: number | null;
  },
  leagueMatches: PredictMatch[],
): { pick: Winner; prob: number } | null {
  const { league, homeTeamId, awayTeamId, startTime } = match;

  // 배구 — volleyball-predict cron 이 채운 predHome(배구 Elo+시장 블렌드, 백테스트 83.3%)을
  // 앵커로 재사용. 아직 안 채워졌으면 스킵(다음 실행에서 잡힘).
  if (VB_ANCHOR_LEAGUES.has(league)) {
    const ph = match.predHome, pa = match.predAway;
    if (ph == null || pa == null) return null;
    return ph >= pa ? { pick: "HOME", prob: ph } : { pick: "AWAY", prob: pa };
  }

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
export function scorebaseHcOu(
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

export type MarketLines = { hc: number | null; ou: number | null };

/**
 * 단일 패널 진단 — 더미 경기로 1콜 실행해 성공/에러·원문·파싱결과를 반환.
 * cron 전체 안 돌리고 특정 모델(claude 등) 호출 문제를 격리 확인.
 */
export async function testPanel(
  key: string,
): Promise<{ ok: boolean; model?: string; content?: string; parsed?: GptMarketPick | null; error?: string }> {
  const p = PANELISTS.find((x) => x.key === key);
  if (!p) return { ok: false, error: "unknown panel" };
  if (p.location !== "vercel") return { ok: false, error: "not a vercel panel (macmini worker 로 테스트)" };
  if (p.apiKeyEnv && !process.env[p.apiKeyEnv]) return { ok: false, error: `${p.apiKeyEnv} 없음` };
  const client = panelClient(p);
  const lines: MarketLines = { hc: null, ou: null };
  const { system, user } = buildMarketsPrompt("MLB", "홈팀", "원정팀", new Date(), lines, {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = { model: p.modelId, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  if (p.jsonMode ?? true) params.response_format = { type: "json_object" };
  if (p.reasoningEffort) params.reasoning_effort = p.reasoningEffort;
  // 상한은 본 호출과 같은 3000 — 생각 과정을 토큰에 포함하는 모델(Kimi 등)은
  // 500 이면 생각만으로 소진돼 본문이 빈 채 잘린다. 진단은 수동 1콜이라 비용 영향 없음.
  if (p.runtime === "openai") params.max_completion_tokens = 3000;
  else params.max_tokens = 3000;
  try {
    const res = await client.chat.completions.create(params);
    if (res.usage) {
      await trackLlmUsage(
        usageModelKey(p.runtime, p.modelId, res.model),
        res.usage.prompt_tokens,
        res.usage.completion_tokens,
      );
    }
    const content = res.choices[0]?.message?.content ?? "";
    return { ok: true, model: p.modelId, content: content.slice(0, 300), parsed: parseMarketsResponse(content, "MLB", lines) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return { ok: false, model: p.modelId, error: `${e?.status ?? ""} ${e?.message ?? e}`.slice(0, 400) };
  }
}

/**
 * 시장 예측 프롬프트(system+user)를 만든다 — 전 패널·전 실행위치 단일 소스.
 * 공정성 위해 우리 모델의 확률은 주지 않고 채점 기준선(line)만 제공한다.
 * 맥미니 Qwen 워커도 이 프롬프트를 그대로 받아 Ollama 에 전달한다(프롬프트 드리프트 방지).
 */
export function buildMarketsPrompt(
  league: string,
  homeKo: string,
  awayKo: string,
  startTime: Date,
  lines: MarketLines,
  facts: GptMatchFacts,
): { system: string; user: string } {
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
  return { system, user };
}

/**
 * LLM 이 낸 JSON 텍스트를 검증·정규화 — 전 패널 동일 파싱(GPT·Qwen 공용).
 * 1X2 는 필수, 핸디/OU 는 라인이 있을 때만. 실패 시 null.
 */
export function parseMarketsResponse(
  text: string | null | undefined,
  league: string,
  lines: MarketLines,
): GptMarketPick | null {
  if (!text) return null;
  const allowDraw = drawAllowed(league);
  // 마크다운 펜스(```json)나 앞뒤 설명을 감싸도 첫 { … } 블록만 추출 —
  // json 모드 미지원 모델(Anthropic 등)이 프로즈로 감싸도 파싱되게.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }

  // 1X2 — 필수
  const oneRaw = String(parsed.oneXtwo?.pick ?? "").toUpperCase();
  let oneXtwo: { pick: Winner; prob: number } | null = null;
  if (oneRaw === "HOME" || oneRaw === "AWAY" || (oneRaw === "DRAW" && allowDraw)) {
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

/**
 * 한 LLM 패널에 1X2 + (라인 제공 시) 핸디캡·OU 를 한 번에 묻는다(호출 1회 = 비용 절약).
 * modelId 만 바꾸면 GPT·Claude·Grok·Gemini 동일 함수로 호출된다(OpenAI 호환).
 * Qwen 은 Vercel 에서 Ollama 에 못 닿아 맥미니 워커가 buildMarketsPrompt→parseMarketsResponse 를 따로 탄다.
 */
async function llmMarkets(
  client: OpenAI,
  modelId: string,
  runtime: PanelRuntime,
  league: string,
  homeKo: string,
  awayKo: string,
  startTime: Date,
  lines: MarketLines,
  facts: GptMatchFacts,
  jsonMode = true,
  reasoningEffort?: Panelist["reasoningEffort"],
): Promise<GptMarketPick | null> {
  const { system, user } = buildMarketsPrompt(league, homeKo, awayKo, startTime, lines, facts);
  // 토큰 상한 파라미터 이름이 provider 마다 다름 — 신형 OpenAI 는 max_completion_tokens,
  // xAI·OpenRouter 등은 max_tokens. 잘못 보내면 400 이므로 런타임별 분기.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  // response_format:json_object 미지원 모델(Anthropic 등)은 생략 — 프롬프트+견고한 파싱으로 처리.
  if (jsonMode) params.response_format = { type: "json_object" };
  if (reasoningEffort) params.reasoning_effort = reasoningEffort;
  if (runtime === "openai") params.max_completion_tokens = 3000;
  else params.max_tokens = 3000;
  const res = await client.chat.completions.create(params);
  if (res.usage) {
    await trackLlmUsage(
      usageModelKey(runtime, modelId, res.model),
      res.usage.prompt_tokens,
      res.usage.completion_tokens,
    );
  }
  return parseMarketsResponse(res.choices[0]?.message?.content, league, lines);
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
  if (facts.starters) {
    const one = (s: { name: string; era: number; whip?: number; k9?: number; wins?: number; losses?: number } | null) =>
      s
        ? `${s.name} (ERA ${s.era.toFixed(2)}` +
          (s.whip != null ? `, WHIP ${s.whip.toFixed(2)}` : "") +
          (s.k9 != null ? `, K/9 ${s.k9.toFixed(1)}` : "") +
          (s.wins != null && s.losses != null ? `, ${s.wins}승 ${s.losses}패` : "") +
          ")"
        : "미발표";
    lines.push(`선발투수: ${home} ${one(facts.starters.home)} / ${away} ${one(facts.starters.away)}`);
  }
  if (facts.goalies) {
    const one = (g: GoalieFact | null) =>
      g
        ? `${g.name} (GAA ${g.gaa.toFixed(2)}` +
          (g.savePctg != null ? `, 세이브율 ${g.savePctg.toFixed(3)}` : "") +
          ")"
        : "미발표";
    lines.push(`선발 골리: ${home} ${one(facts.goalies.home)} / ${away} ${one(facts.goalies.away)}`);
  }
  if (facts.elo) {
    lines.push(`Elo 레이팅: ${home} ${Math.round(facts.elo.home)} / ${away} ${Math.round(facts.elo.away)} (차이 ${Math.round(facts.elo.home - facts.elo.away)})`);
  }
  if (facts.injuries && (facts.injuries.home.length > 0 || facts.injuries.away.length > 0)) {
    const fmt = (arr: Array<{ name: string; reason?: string }>) =>
      arr.length > 0
        ? arr.map((i) => `${i.name}${i.reason ? `(${i.reason})` : ""}`).join(", ")
        : "없음";
    lines.push(`부상·결장: ${home} ${fmt(facts.injuries.home)} / ${away} ${fmt(facts.injuries.away)}`);
  }
  if (facts.keyPlayers && (facts.keyPlayers.home.length > 0 || facts.keyPlayers.away.length > 0)) {
    const fmt = (arr: Array<{ name: string; goals: number; assists: number }>) =>
      arr.map((p) => `${p.name}(${p.goals}골 ${p.assists}도움)`).join(", ");
    lines.push(`시즌 핵심 선수: ${home} ${fmt(facts.keyPlayers.home)} / ${away} ${fmt(facts.keyPlayers.away)}`);
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

  // 이 실행 위치(Vercel)에서 활성화된 LLM 패널 — 게이트 OFF·키 없음은 제외.
  // Qwen 은 location=macmini 라 여기 안 잡힘(맥미니 워커가 담당).
  const panels = activePanelists("vercel");
  if (panels.length === 0) {
    console.warn("[llm-pred] 활성 패널 없음(게이트 OFF 또는 키 없음) — 스킵");
    return { targeted: 0, stored: 0, storedMarkets: 0, skipped: 0, failed: 0 };
  }
  const clients = new Map(panels.map((p) => [p.key, panelClient(p)]));

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 3600 * 1000);

  // 패널별 이미 1X2 픽한 매치 집합 — 재호출 방지(비용 절약). 패널마다 진행도가 다르므로 개별 추적.
  const doneByPanel = new Map<string, Set<number>>();
  for (const p of panels) {
    const done = await prisma.aiPrediction.findMany({
      where: { model: p.key, market: "1X2" },
      select: { matchId: true },
    });
    doneByPanel.set(p.key, new Set(done.map((d) => d.matchId)));
  }

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
      predHome: true, predAway: true, // 배구 앵커
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  // 아직 픽 필요한 패널이 하나라도 있는 매치만, cap 만큼.
  // 야구는 양 팀 선발이 공개된 뒤에만 픽을 낸다 — 선발이 승부에 미치는 비중이 커서
  // 미공개 상태의 픽은 정보가 빠진 채 찍는 것에 가깝다. 실측(2026-07-21) KBO·NPB 는
  // 킥오프 6시간 이내에 100% 공개(24h 전 0%), MLB 는 12~24h 전 80%. 예측 cron 이
  // 13:30·01:30 KST 라 각각 저녁 KBO·NPB 와 새벽 MLB 를 공개 후 시점에 잡는다.
  // 대상 선정 단계에서 걸러야 cap 을 미공개 경기가 차지하지 않는다.
  let awaitingStarter = 0;
  const targets = candidates
    .filter((m) => panels.some((p) => !doneByPanel.get(p.key)!.has(m.id)))
    .filter((m) => {
      if (!BASEBALL_LEAGUES.has(m.league)) return true;
      const f = starterFacts(m.homeStarter, m.awayStarter);
      if (f?.home && f?.away) return true;
      awaitingStarter++; // 다음 실행으로 미룸 — 스킵이 아니라 대기
      return false;
    })
    .slice(0, cap);

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
  let deadlineHit = 0;
  // 좌석별 성패 집계 — "특정 패널만 조용히 굶는" 상태(gpt-5.6 07-21~25 닷새 0건, 사후에야
  // 발견)를 다음번엔 당일 cron 로그에서 바로 보이게 한다. ok=0 & fail>0 이면 그 좌석이 죽은 것.
  const okByPanel = new Map<string, number>(panels.map((p) => [p.key, 0]));
  const failByPanel = new Map<string, number>(panels.map((p) => [p.key, 0]));
  // 시간 예산 가드 (2026-07-17) — cron 라우트 maxDuration=300s. 매치당 패널 4개를 순차
  // 호출해 ~15~20s 씩 걸리므로 cap(기본 40)이면 480s+ 로 **구조적으로 완주 불가**.
  // 타임아웃은 JS 예외가 아니라 catch 도 안 타서 recordCronRun 이 아예 안 불렸고, 그 결과
  // 레지스트리가 07-14 에 멈춰 "71h째 미실행" 알림이 떴다(실제로는 매일 돌고 있었음).
  // → 남은 예산이 부족하면 루프를 끊고 정상 반환. 못 채운 매치는 "이미 픽한 매치 재호출
  //   안 함" 가드 덕에 다음 실행이 이어받는다. 완주 신호(recordCronRun)를 되찾는 게 핵심.
  const JOB_DEADLINE_MS = Number(process.env.GPT_PREDICT_DEADLINE_MS ?? 230_000);
  const startedAt = Date.now();
  let matchIdx = -1;
  for (const m of targets) {
    matchIdx++;
    if (Date.now() - startedAt > JOB_DEADLINE_MS) {
      deadlineHit = targets.length - stored - skipped - failed;
      console.warn(
        `[llm-pred] 시간 예산(${JOB_DEADLINE_MS}ms) 초과 — 남은 ${deadlineHit}건은 다음 실행으로 이월`,
      );
      break;
    }
    // 킥오프 가드 — 잡 실행 중 경기가 시작되면(순차 LLM 호출로 수십 초 소요) 픽 무결성이
    // 깨지므로 매치 처리 직전 재확인. "경기 시작 전 예측" 원칙의 방어선.
    if (m.startTime.getTime() <= Date.now()) {
      skipped++;
      continue;
    }
    const pool = poolByLeague.get(m.league)!;
    const ours = scorebasePick(m, pool);
    if (!ours) {
      skipped++; // 학습 부족 — 패널 호출도 안 해 비용 절약 (같은 경기 집합 유지)
      continue;
    }

    const homeKo = toKoreanTeamName(m.homeTeam?.name, m.league) || m.homeTeam?.name || "홈";
    const awayKo = toKoreanTeamName(m.awayTeam?.name, m.league) || m.awayTeam?.name || "원정";
    const oursHcOu = scorebaseHcOu(m, pool);
    const facts = await buildPanelFacts(m, pool, homeKo, awayKo);

    // scorebase 앵커는 패널 성패와 무관하게 1회 저장(독립). 채점 기준선(line)의 출처.
    await storeAnchor(m.id, ours, oursHcOu);
    let matchStored = false;

    // 좌석 회전 — 순서가 고정이면 킥오프 가드(아래 break)·시간 예산이 항상 뒤쪽 좌석부터
    // 자른다. 매치마다 시작 좌석을 한 칸씩 돌려 잘림이 전 좌석에 고르게 분배되게 한다.
    const rotation = panels.length > 0 ? matchIdx % panels.length : 0;
    const seatOrder = [...panels.slice(rotation), ...panels.slice(0, rotation)];
    for (const p of seatOrder) {
      if (doneByPanel.get(p.key)!.has(m.id)) continue; // 이미 픽함 → 재호출 안 함
      if (m.startTime.getTime() <= Date.now()) break; // 패널 순회 중 킥오프 지나면 잔여 패널 중단
      let res: GptMarketPick | null = null;
      try {
        res = await llmMarkets(clients.get(p.key)!, p.modelId, p.runtime, m.league, homeKo, awayKo, m.startTime, {
          hc: oursHcOu.hc?.line ?? null,
          ou: oursHcOu.ou?.line ?? null,
        }, facts, p.jsonMode ?? true, p.reasoningEffort);
      } catch (e) {
        console.warn(`[llm-pred] ${p.key} 호출 실패 match=${m.id}: ${(e as Error).message}`);
      }
      if (!res) {
        failed++; // 이 패널만 스킵 — 다른 패널·scorebase 는 그대로 저장(독립)
        failByPanel.set(p.key, (failByPanel.get(p.key) ?? 0) + 1);
        continue;
      }
      const n = await storePanel(m.id, p.key, { hc: oursHcOu.hc?.line ?? null, ou: oursHcOu.ou?.line ?? null }, res);
      storedMarkets += n;
      matchStored = true;
      okByPanel.set(p.key, (okByPanel.get(p.key) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 50));
    }
    if (matchStored) stored++;
  }

  // 좌석별 성패 — ok=0 & fail>0 인 좌석은 죽은 것(키 만료·모델명 변경 등). 로그에서 즉시 식별.
  const seatSummary = panels
    .map((p) => `${p.key} ${okByPanel.get(p.key) ?? 0}/${failByPanel.get(p.key) ?? 0}`)
    .join(", ");
  console.log(
    `[llm-pred] 완료 — 패널 ${panels.map((p) => p.key).join(",")} / 대상 ${targets.length} / 경기 ${stored}(시장 ${storedMarkets}) / 스킵(학습부족) ${skipped} / 야구 선발대기 ${awaitingStarter} / 패널실패 ${failed} / 좌석별 ok/fail: ${seatSummary}`,
  );
  // deferred > 0 = 시간 예산에 걸려 다음 실행으로 이월된 건수 (완주 자체는 정상).
  return {
    targeted: targets.length,
    stored,
    storedMarkets,
    skipped,
    failed,
    deferred: deadlineHit,
    // cron 응답에서도 좌석 생사가 보이게 — {panel: [ok, fail]}
    seats: Object.fromEntries(
      panels.map((p) => [p.key, [okByPanel.get(p.key) ?? 0, failByPanel.get(p.key) ?? 0]]),
    ),
  };
}

/** scorebase 정량 앵커 저장 — 1X2 는 항상, 핸디/OU 는 라인이 있을 때. 패널과 독립. */
export async function storeAnchor(
  matchId: number,
  ours1x2: { pick: Winner; prob: number },
  oursHcOu: ReturnType<typeof scorebaseHcOu>,
): Promise<void> {
  await capturePredictionContext(matchId, "scorebase");
  const ctx = await loadOddsCtx(matchId);
  await gatedUpsert(matchId, "scorebase", "1X2", ours1x2.pick, ours1x2.prob, null, null, ctx);
  if (oursHcOu.hc) {
    await gatedUpsert(matchId, "scorebase", "HANDICAP", oursHcOu.hc.pick, oursHcOu.hc.prob, oursHcOu.hc.line, null, ctx);
  }
  if (oursHcOu.ou) {
    await gatedUpsert(matchId, "scorebase", "OU", oursHcOu.ou.pick, oursHcOu.ou.prob, oursHcOu.ou.line, null, ctx);
  }
}

/**
 * 한 패널의 시장별 픽 저장 — 1X2 는 필수, 핸디/OU 는 scorebase 라인이 있고 패널도 픽했을 때만
 * (양 모델 동일 라인으로 채점하는 공정성 유지). 반환: 저장한 시장 수.
 * lines 는 scorebase 가 정한 채점 기준선(Vercel 잡은 scorebaseHcOu, 맥미니 워커는 저장된 라인).
 */
export async function storePanel(
  matchId: number,
  model: string,
  lines: MarketLines,
  res: GptMarketPick,
): Promise<number> {
  await capturePredictionContext(matchId, model);
  const ctx = await loadOddsCtx(matchId);
  let count = 0;
  if (res.oneXtwo) {
    if (await gatedUpsert(matchId, model, "1X2", res.oneXtwo.pick, res.oneXtwo.prob, null, res.reason, ctx)) count++;
  }
  if (lines.hc != null && res.handicap) {
    if (await gatedUpsert(matchId, model, "HANDICAP", res.handicap.pick, res.handicap.prob, lines.hc, null, ctx)) count++;
  }
  if (lines.ou != null && res.ou) {
    if (await gatedUpsert(matchId, model, "OU", res.ou.pick, res.ou.prob, lines.ou, null, ctx)) count++;
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
  // 자가치유 — 잠깐 FINISHED 로 잡혀 채점된 뒤 POSTPONED·재편성으로 되돌아간 경기(야구 우천 취소 패턴)의
  // 채점값을 되돌린다. 남겨두면 성적표 피드에 "-:-" 경기가 채점된 것으로 뜬다(2026-09-05 실측 43행).
  // 다시 FINISHED 되면 아래 pending 루프가 정상 재채점한다.
  const healed = await prisma.aiPrediction.updateMany({
    where: {
      correct: { not: null },
      match: { OR: [{ status: { not: "FINISHED" } }, { homeScore: null }, { awayScore: null }] },
    },
    data: { correct: null },
  });
  if (healed.count > 0) console.log(`[gpt-pred] 종료 아닌 경기의 채점값 리셋 — ${healed.count}건`);

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
      homeStarter: true, awayStarter: true, homeGoalie: true, awayGoalie: true,
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
    const gptFacts = await buildPanelFacts(m, pool, homeKo, awayKo);

    let gpt: GptMarketPick | null = null;
    try {
      gpt = await llmMarkets(client, GPT_MODEL, "openai", m.league, homeKo, awayKo, m.startTime, {
        hc: oursHcOu.hc?.line ?? null,
        ou: oursHcOu.ou?.line ?? null,
      }, gptFacts);
    } catch (e) {
      console.warn(`[gpt-pred] 백필 GPT 실패 match=${m.id}: ${(e as Error).message}`);
    }
    if (!gpt) continue;

    const ctx = await loadOddsCtx(m.id);
    if (oursHcOu.hc && gpt.handicap) {
      const a = await gatedUpsert(m.id, "scorebase", "HANDICAP", oursHcOu.hc.pick, oursHcOu.hc.prob, oursHcOu.hc.line, null, ctx);
      const b = await gatedUpsert(m.id, GPT_MODEL, "HANDICAP", gpt.handicap.pick, gpt.handicap.prob, oursHcOu.hc.line, null, ctx);
      if (a || b) added++;
    }
    if (oursHcOu.ou && gpt.ou) {
      const a = await gatedUpsert(m.id, "scorebase", "OU", oursHcOu.ou.pick, oursHcOu.ou.prob, oursHcOu.ou.line, null, ctx);
      const b = await gatedUpsert(m.id, GPT_MODEL, "OU", gpt.ou.pick, gpt.ou.prob, oursHcOu.ou.line, null, ctx);
      if (a || b) added++;
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
