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
type PickChoice = Outcome | "OVER" | "UNDER";
type PickMarket = "1X2" | "HANDICAP" | "OU";

const HOUR = 60 * 60 * 1000;
const MIN_LEAD_HOURS = 3;
const MAX_LEAD_HOURS = 48;
const MARKET_MAX_AGE_HOURS = 48;
const MAX_NEGATIVE_MOVE_PP = -3;
const PICK_MARKETS: PickMarket[] = ["1X2", "HANDICAP", "OU"];
const SEVERE_UNCERTAINTY_RE = /미발표|미정|불확실|확정되지|정보 부족|선발.*없|라인업.*없/i;

const LEAGUE_LABELS: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "UEFA 챔피언스리그",
  WORLD_CUP: "FIFA 월드컵",
  BRASILEIRAO: "브라질 세리에 A",
  K_LEAGUE_1: "K리그 1",
  K_LEAGUE_2: "K리그 2",
  KBO: "KBO",
  NPB: "NPB",
  MLB: "MLB",
  LMB: "멕시칸 리그",
  CPBL: "대만 프로야구",
  NBA: "NBA",
  WNBA: "WNBA",
  NHL: "NHL",
  V_LEAGUE: "V-리그 남자부",
  V_LEAGUE_W: "V-리그 여자부",
  VNL_M: "VNL 남자부",
  VNL_W: "VNL 여자부",
  VNL: "VNL",
  LOL: "LCK",
  LCK_CL: "LCK CL",
  LPL: "LPL",
  LEC: "LEC",
  LCS: "LCS",
  EWC: "EWC",
};

function sportForLeague(league: string) {
  if (["KBO", "NPB", "MLB", "LMB", "CPBL"].includes(league)) return "야구";
  if (["NBA", "WNBA"].includes(league)) return "농구";
  if (league === "NHL") return "아이스하키";
  if (league.startsWith("VNL")) return "배구";
  if (["LOL", "LCK_CL", "LPL", "LEC", "LCS", "EWC"].includes(league)) return "이스포츠";
  return "축구";
}

function subjectParticle(value: string) {
  const last = Array.from(value.trim()).at(-1);
  if (!last) return "가";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "가";
  return (code - 0xac00) % 28 === 0 ? "가" : "이";
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

function linesMatch(first: number | null, second: number | null) {
  return first != null && second != null && Math.abs(first - second) < 0.01;
}

function marketLabel(market: PickMarket) {
  if (market === "HANDICAP") return "핸디캡";
  if (market === "OU") return "오버·언더";
  return "승패";
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
        where: { market: { in: PICK_MARKETS }, model: { in: ["scorebase", ...gptModels] } },
        select: {
          model: true,
          market: true,
          pick: true,
          prob: true,
          line: true,
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
    const sport = sportForLeague(match.league);
    const homeTeam = teamDisplayKo(match.homeTeam, match.league);
    const awayTeam = teamDisplayKo(match.awayTeam, match.league);
    const marketAgeHours = match.marketUpdatedAt
      ? (now.getTime() - match.marketUpdatedAt.getTime()) / HOUR
      : null;
    const freshMarket = (match.marketBookmakers ?? 0) >= 3
      && marketAgeHours != null
      && marketAgeHours <= MARKET_MAX_AGE_HOURS;

    const statisticalByMarket = new Map<PickMarket, (typeof match.aiPredictions)[number]>();
    const gptByMarket = new Map<PickMarket, (typeof match.aiPredictions)[number]>();
    for (const prediction of match.aiPredictions) {
      const market = prediction.market as PickMarket;
      if (!PICK_MARKETS.includes(market)) continue;
      if (prediction.model === "scorebase") {
        statisticalByMarket.set(market, prediction);
        continue;
      }
      const current = gptByMarket.get(market);
      if (preferGptScorecardModel(current?.model, prediction.model)) {
        gptByMarket.set(market, prediction);
      }
    }

    const contextReason = sanitizeReason(gptByMarket.get("1X2")?.reason ?? null);
    const matchCandidates = [];

    for (const market of PICK_MARKETS) {
      const statistical = statisticalByMarket.get(market);
      const gpt = gptByMarket.get(market);
      if (!statistical || !gpt || statistical.pick !== gpt.pick) continue;
      if (statistical.predictedAt >= match.startTime || gpt.predictedAt >= match.startTime) continue;

      const pick = gpt.pick as PickChoice;
      if (market === "1X2" && !["HOME", "DRAW", "AWAY"].includes(pick)) continue;
      if (market === "HANDICAP" && !["HOME", "AWAY"].includes(pick)) continue;
      if (market === "OU" && !["OVER", "UNDER"].includes(pick)) continue;

      const line = market === "1X2" ? null : (gpt.line ?? statistical.line);
      if (market !== "1X2") {
        if (!["축구", "야구"].includes(sport) || line == null) continue;
        if (gpt.line != null && statistical.line != null && !linesMatch(gpt.line, statistical.line)) continue;
      }

      const reason = sanitizeReason(gpt.reason) ?? contextReason;
      if (market === "1X2" && reason && SEVERE_UNCERTAINTY_RE.test(reason)) continue;

      let selectedOdds: number | null = null;
      let selectedMarket: number | null = null;
      let movementPp: number | null = null;
      let valueEdgePp: number | null = null;
      let hasComparableMarket = false;
      const consensusProb = 0.55 * gpt.prob + 0.45 * statistical.prob;

      if (market === "1X2") {
        const outcome = pick as Outcome;
        const marketPick = topOutcome(match.marketHome, match.marketDraw, match.marketAway);
        selectedMarket = selectedValue(outcome, match.marketHome, match.marketDraw, match.marketAway);
        const selectedOpening = selectedValue(
          outcome,
          match.openingMarketHome,
          match.openingMarketDraw,
          match.openingMarketAway,
        );
        selectedOdds = selectedValue(outcome, match.oddsHome, match.oddsDraw, match.oddsAway);
        movementPp = selectedMarket != null && selectedOpening != null
          ? Math.round((selectedMarket - selectedOpening) * 1000) / 10
          : null;
        valueEdgePp = selectedMarket != null
          ? Math.round((consensusProb - selectedMarket) * 1000) / 10
          : null;
        hasComparableMarket = freshMarket && marketPick != null && selectedMarket != null && selectedOdds != null;

        const thresholdPassed = sport === "야구"
          ? gpt.prob >= 0.65 && statistical.prob >= strongPickThreshold(match.league)
          : sport === "축구"
            ? gpt.prob >= 0.62 && statistical.prob >= 0.56
            : gpt.prob >= 0.65 && statistical.prob >= strongPickThreshold(match.league);
        if (!thresholdPassed) continue;

        if (hasComparableMarket) {
          if (selectedOdds! < 1.45) continue;
          if (marketPick !== outcome && (valueEdgePp ?? 0) < 5) continue;
          if (movementPp != null && movementPp < MAX_NEGATIVE_MOVE_PP && (valueEdgePp ?? 0) < 8) continue;
        } else {
          const noMarketPassed = sport === "축구"
            ? gpt.prob >= 0.72 && statistical.prob >= 0.62
            : sport === "야구"
              ? gpt.prob >= 0.68 && statistical.prob >= 0.58
              : gpt.prob >= 0.74 && statistical.prob >= 0.7;
          if (!noMarketPassed) continue;
          selectedOdds = null;
        }
      } else {
        const thresholdPassed = market === "HANDICAP"
          ? sport === "야구"
            ? statistical.prob >= 0.56 && gpt.prob >= 0.62
            : statistical.prob >= 0.54 && gpt.prob >= 0.6
          : sport === "야구"
            ? statistical.prob >= 0.52 && gpt.prob >= 0.58
            : statistical.prob >= 0.62 && gpt.prob >= 0.57;
        if (!thresholdPassed) continue;

        const currentLine = market === "HANDICAP" ? match.oddsHcLine : match.oddsTotalLine;
        const lineOdds = market === "HANDICAP"
          ? pick === "HOME" ? match.oddsHcHome : match.oddsHcAway
          : pick === "OVER" ? match.oddsOver : match.oddsUnder;
        if (freshMarket && linesMatch(line, currentLine) && lineOdds != null) {
          selectedOdds = lineOdds;
          hasComparableMarket = true;
        }
      }

      const pickTeam = pick === "HOME"
        ? homeTeam
        : pick === "AWAY"
          ? awayTeam
          : pick === "DRAW"
            ? "무승부"
            : `${line} ${pick === "OVER" ? "오버" : "언더"}`;
      const opponent = pick === "HOME" ? awayTeam : homeTeam;
      const evidence = [
        `통계 예측과 경기 맥락 분석이 ${marketLabel(market)} 시장에서 같은 선택을 냈습니다.`,
        `두 분석의 선택 확률은 각각 ${Math.round(statistical.prob * 100)}%, ${Math.round(gpt.prob * 100)}%입니다.`,
      ];

      if (market === "1X2") {
        evidence.push(
          hasComparableMarket
            ? `${match.marketBookmakers ?? 0}개 배당사의 현재 시장과 비교해 ${valueEdgePp != null && valueEdgePp >= 3 ? `${valueEdgePp.toFixed(1)}%p의 확률 차이` : "같은 방향의 지지"}를 확인했습니다.`
            : "현재 비교 가능한 배당이 없어 두 예측의 확률 기준을 더 엄격하게 적용했습니다.",
        );
      } else if (market === "HANDICAP") {
        evidence.push(`${pickTeam} ${pick === "HOME" ? "-" : "+"}${line} 핸디캡 기준의 커버 가능성을 비교했습니다.`);
      } else {
        evidence.push(`양 팀 합계 ${line}점 기준 ${pick === "OVER" ? "오버" : "언더"} 가능성을 비교했습니다.`);
      }
      if (hasComparableMarket && selectedOdds != null) {
        evidence.push(`같은 기준점의 ${match.marketBookmakers ?? 0}개 배당사 평균 배당은 ${selectedOdds.toFixed(2)}입니다.`);
      }
      if (movementPp != null) {
        evidence.push(
          movementPp > 0
            ? `오프닝 대비 선택 방향의 시장 지지율이 ${movementPp.toFixed(1)}%p 상승했습니다.`
            : `오프닝 이후 역행 폭은 ${Math.abs(movementPp).toFixed(1)}%p입니다.`,
        );
      }
      if (sport === "이스포츠") {
        evidence.push(`최근 경기 흐름과 매치업 수치를 함께 비교해 ${pickTeam} 쪽을 우세로 봤습니다.`);
      } else if (reason && !SEVERE_UNCERTAINTY_RE.test(reason)) {
        evidence.push(reason);
      }

      const risks = market === "1X2"
        ? sport === "이스포츠"
          ? [
              `${opponent}${subjectParticle(opponent)} 초반 밴픽에서 주도권을 잡으면 예상과 다른 흐름이 나올 수 있습니다.`,
              "패치 적응과 당일 선수 컨디션은 경기 전까지 확인할 변수입니다.",
            ]
          : sport === "야구"
            ? [
                `${opponent}의 선발 투수와 당일 타순은 경기 전에 다시 확인해야 합니다.`,
                hasComparableMarket
                  ? "발행 후 배당이 크게 반대로 움직이면 기존 판단의 신뢰도가 낮아질 수 있습니다."
                  : "배당 시장 교차 검증이 없는 경기이므로 일반 후보보다 변동 위험이 큽니다.",
              ]
            : sport === "축구"
              ? [
                  `${opponent}의 선발 명단과 포메이션 변화는 경기 전에 다시 확인해야 합니다.`,
                  hasComparableMarket
                    ? "발행 후 배당이 크게 반대로 움직이면 기존 판단의 신뢰도가 낮아질 수 있습니다."
                    : "배당 시장 교차 검증이 없는 경기이므로 일반 후보보다 변동 위험이 큽니다.",
                ]
              : [
                  `${opponent}의 부상자와 로테이션 변화는 경기 전에 다시 확인해야 합니다.`,
                  "경기 직전 전력 변화가 크면 기존 판단의 신뢰도가 낮아질 수 있습니다.",
                ]
        : [
            market === "HANDICAP"
              ? `기준은 ${line}점 핸디캡이며 라인이 바뀌면 같은 선택으로 볼 수 없습니다.`
              : `기준은 합계 ${line}점이며 기준점 변화 시 기대값이 달라집니다.`,
            "선발·라인업과 경기 직전 시장 변화를 함께 확인해야 합니다.",
          ];

      const confidence = market === "1X2" && selectedMarket != null
        ? 0.5 * gpt.prob + 0.35 * statistical.prob + 0.15 * selectedMarket
        : consensusProb + (hasComparableMarket ? 0.01 : 0);
      const confidenceScore = Math.max(60, Math.min(90, Math.round(confidence * 100)));
      const persona = (valueEdgePp ?? 0) >= 5 || (selectedOdds ?? 0) >= 2
        ? "VALUE_HUNTER"
        : movementPp != null && Math.abs(movementPp) >= 1
          ? "ODDS_TRACKER"
          : sport === "축구" && market !== "1X2"
            ? "TACTICAL_ANALYST"
            : hasComparableMarket || confidenceScore >= 75
              ? "DATA_ANALYST"
              : "RISK_MANAGER";

      matchCandidates.push({
        matchId: match.id,
        league: match.league,
        leagueLabel: LEAGUE_LABELS[match.league] ?? match.league,
        sport,
        startTime: match.startTime.toISOString(),
        homeTeam,
        awayTeam,
        market,
        pick,
        line,
        pickTeam,
        confidenceScore,
        confidenceLabel: confidenceScore >= 78 ? "매우 높음" : confidenceScore >= 68 ? "높음" : "선별 통과",
        persona,
        odds: selectedOdds,
        marketBookmakers: hasComparableMarket ? match.marketBookmakers : null,
        marketUpdatedAt: hasComparableMarket ? match.marketUpdatedAt?.toISOString() ?? null : null,
        movementPp,
        valueEdgePp,
        evidence,
        risks,
      });
    }

    return matchCandidates;
  });

  const selectionScore = (candidate: (typeof candidates)[number]) => candidate.confidenceScore
    + (candidate.market === "1X2" ? 0 : 3)
    + (["축구", "야구"].includes(candidate.sport) ? 2 : 0)
    + ((candidate.odds ?? 0) >= 1.8 ? 1 : 0);
  candidates.sort((a, b) => selectionScore(b) - selectionScore(a) || a.startTime.localeCompare(b.startTime));

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      policy: {
        minimumLeadHours: MIN_LEAD_HOURS,
        maximumLeadHours: MAX_LEAD_HOURS,
        maximumPicksPerArticle: 5,
        markets: PICK_MARKETS,
      },
      candidates,
      settlements,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
