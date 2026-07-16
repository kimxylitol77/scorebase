import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import {
  GPT_SCORECARD_ACTIVE_MODEL,
  GPT_SCORECARD_LEGACY_MODELS,
  preferGptScorecardModel,
} from "@/lib/predict/gpt-scorecard-model";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { teamDisplayKo } from "@/lib/team-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Outcome = "HOME" | "DRAW" | "AWAY";

const HOUR = 60 * 60 * 1000;
const MIN_LEAD_HOURS = 3;
const MAX_LEAD_HOURS = 48;
const MARKET_MAX_AGE_HOURS = 48;
const MAX_NEGATIVE_MOVE_PP = -3;
const UNCERTAINTY_RE = /미발표|미정|불확실|접전|박빙|변수|우세하지만|확정되지|정보 부족|선발.*없|라인업.*없/i;

const LEAGUE_LABELS: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "UEFA 챔피언스리그",
  WORLD_CUP: "FIFA 월드컵",
  KBO: "KBO",
  NPB: "NPB",
  MLB: "MLB",
  NBA: "NBA",
  WNBA: "WNBA",
  NHL: "NHL",
  VNL_M: "VNL 남자부",
  VNL_W: "VNL 여자부",
  VNL: "VNL",
};

function sportForLeague(league: string) {
  if (["KBO", "NPB", "MLB"].includes(league)) return "야구";
  if (["NBA", "WNBA"].includes(league)) return "농구";
  if (league === "NHL") return "아이스하키";
  if (league.startsWith("VNL")) return "배구";
  return "축구";
}

function topOutcome(home: number | null, draw: number | null, away: number | null): Outcome | null {
  const rows: Array<[Outcome, number]> = [];
  if (home != null) rows.push(["HOME", home]);
  if (draw != null) rows.push(["DRAW", draw]);
  if (away != null) rows.push(["AWAY", away]);
  if (!rows.length) return null;
  rows.sort((a, b) => b[1] - a[1]);
  return rows[0][0];
}

function selectedValue<T>(pick: Outcome, home: T, draw: T, away: T): T {
  if (pick === "HOME") return home;
  if (pick === "DRAW") return draw;
  return away;
}

function sanitizeReason(reason: string | null) {
  if (!reason) return null;
  return reason
    .replace(/scorebase/gi, "통계 분석")
    .replace(/gpt[-\s]?\d+(?:\.\d+)?(?:[-\s]?(?:sol|soul|terra|luna))?/gi, "AI 분석")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function actualOutcome(homeScore: number | null, awayScore: number | null): Outcome | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return "HOME";
  if (awayScore > homeScore) return "AWAY";
  return "DRAW";
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const candidateFrom = new Date(now.getTime() + MIN_LEAD_HOURS * HOUR);
  const candidateUntil = new Date(now.getTime() + MAX_LEAD_HOURS * HOUR);
  const settlementFrom = new Date(now.getTime() - 10 * 24 * HOUR);
  const gptModels = [GPT_SCORECARD_ACTIVE_MODEL, ...GPT_SCORECARD_LEGACY_MODELS];

  const matches = await prisma.match.findMany({
    where: {
      startTime: { gte: settlementFrom, lte: candidateUntil },
      status: { in: ["SCHEDULED", "FINISHED", "POSTPONED"] },
    },
    include: {
      homeTeam: { select: { name: true, nameKo: true } },
      awayTeam: { select: { name: true, nameKo: true } },
      aiPredictions: {
        where: { market: "1X2", model: { in: ["scorebase", ...gptModels] } },
        select: {
          model: true,
          pick: true,
          prob: true,
          reason: true,
          predictedAt: true,
        },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const settlements = matches
    .filter((match) => match.status !== "SCHEDULED")
    .map((match) => ({
      matchId: match.id,
      status: match.status === "POSTPONED" ? "VOID" : "FINISHED",
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      outcome: actualOutcome(match.homeScore, match.awayScore),
      settledAt: match.updatedAt.toISOString(),
    }));

  const candidates = matches.flatMap((match) => {
    if (match.status !== "SCHEDULED") return [];
    if (match.startTime < candidateFrom || match.startTime > candidateUntil) return [];

    const statistical = match.aiPredictions.find((prediction) => prediction.model === "scorebase");
    let gpt = match.aiPredictions.find((prediction) => prediction.model === GPT_SCORECARD_ACTIVE_MODEL);
    if (!gpt) {
      for (const prediction of match.aiPredictions) {
        if (preferGptScorecardModel(gpt?.model, prediction.model)) gpt = prediction;
      }
    }
    if (!statistical || !gpt) return [];
    if (statistical.pick !== gpt.pick || !["HOME", "AWAY"].includes(gpt.pick)) return [];

    const pick = gpt.pick as Outcome;
    const reason = sanitizeReason(gpt.reason);
    if (reason && UNCERTAINTY_RE.test(reason)) return [];
    if (gpt.prob < 0.65 || statistical.prob < strongPickThreshold(match.league)) return [];
    if (statistical.predictedAt >= match.startTime || gpt.predictedAt >= match.startTime) return [];

    const marketPick = topOutcome(match.marketHome, match.marketDraw, match.marketAway);
    const selectedMarket = selectedValue(pick, match.marketHome, match.marketDraw, match.marketAway);
    const selectedOpening = selectedValue(
      pick,
      match.openingMarketHome,
      match.openingMarketDraw,
      match.openingMarketAway,
    );
    const selectedOdds = selectedValue(pick, match.oddsHome, match.oddsDraw, match.oddsAway);
    const hasMarket = marketPick != null;
    const marketAgeHours = match.marketUpdatedAt
      ? (now.getTime() - match.marketUpdatedAt.getTime()) / HOUR
      : null;
    const movementPp = selectedMarket != null && selectedOpening != null
      ? Math.round((selectedMarket - selectedOpening) * 1000) / 10
      : null;

    if (hasMarket) {
      if (marketPick !== pick || selectedMarket == null || selectedOdds == null) return [];
      if ((match.marketBookmakers ?? 0) < 3) return [];
      if (marketAgeHours == null || marketAgeHours > MARKET_MAX_AGE_HOURS) return [];
      if (movementPp != null && movementPp < MAX_NEGATIVE_MOVE_PP) return [];
    } else if (gpt.prob < 0.74 || statistical.prob < 0.7) {
      return [];
    }

    const confidence = hasMarket && selectedMarket != null
      ? 0.45 * gpt.prob + 0.35 * statistical.prob + 0.2 * selectedMarket
      : 0.55 * gpt.prob + 0.45 * statistical.prob;
    const confidenceScore = Math.max(55, Math.min(92, Math.round(confidence * 100)));
    const homeTeam = teamDisplayKo(match.homeTeam, match.league);
    const awayTeam = teamDisplayKo(match.awayTeam, match.league);
    const pickTeam = pick === "HOME" ? homeTeam : awayTeam;
    const opponent = pick === "HOME" ? awayTeam : homeTeam;
    const evidence = [
      `통계 예측과 경기 맥락 분석이 모두 ${pickTeam} 우세로 일치했습니다.`,
      `두 분석의 선택 확률은 각각 ${Math.round(statistical.prob * 100)}%, ${Math.round(gpt.prob * 100)}%입니다.`,
      hasMarket
        ? `${match.marketBookmakers ?? 0}개 배당사 평균에서도 ${pickTeam} 방향이 가장 낮은 배당을 형성했습니다.`
        : "현재 배당 표본이 없어 독립 예측 일치도와 확률 기준을 더 엄격하게 적용했습니다.",
    ];
    if (movementPp != null) {
      evidence.push(
        movementPp > 0
          ? `오프닝 대비 ${pickTeam} 시장 지지율이 ${movementPp.toFixed(1)}%p 상승했습니다.`
          : `오프닝 대비 시장 변화는 ${Math.abs(movementPp).toFixed(1)}%p 이내로 큰 역행이 없습니다.`,
      );
    }
    if (reason) evidence.push(reason);

    const risks = [
      `${opponent}의 당일 선발·라인업 변화는 경기 전 다시 확인해야 합니다.`,
      hasMarket
        ? "발행 후 배당이 크게 반대로 움직이면 기존 판단의 신뢰도가 낮아질 수 있습니다."
        : "배당 시장 교차 검증이 없는 경기이므로 일반 후보보다 변동 위험이 큽니다.",
    ];

    const persona = movementPp != null && Math.abs(movementPp) >= 1
      ? "ODDS_TRACKER"
      : match.isValueBet && match.valueGap != null && match.valueGap >= 0.05
        ? "VALUE_HUNTER"
        : sportForLeague(match.league) === "축구" && (match.lineupHome || match.lineupAway)
          ? "TACTICAL_ANALYST"
          : hasMarket || (confidenceScore >= 80 && match.id % 2 === 0)
            ? "DATA_ANALYST"
            : "RISK_MANAGER";

    return [{
      matchId: match.id,
      league: match.league,
      leagueLabel: LEAGUE_LABELS[match.league] ?? match.league,
      sport: sportForLeague(match.league),
      startTime: match.startTime.toISOString(),
      homeTeam,
      awayTeam,
      pick,
      pickTeam,
      confidenceScore,
      confidenceLabel: confidenceScore >= 78 ? "매우 높음" : "높음",
      persona,
      odds: selectedOdds,
      marketBookmakers: match.marketBookmakers,
      marketUpdatedAt: match.marketUpdatedAt?.toISOString() ?? null,
      movementPp,
      evidence,
      risks,
    }];
  });

  candidates.sort((a, b) => b.confidenceScore - a.confidenceScore || a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      policy: {
        minimumLeadHours: MIN_LEAD_HOURS,
        maximumLeadHours: MAX_LEAD_HOURS,
        maximumPicksPerArticle: 3,
      },
      candidates,
      settlements,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
