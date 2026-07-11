import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseXg } from "@/lib/tactical/data-gate";
import {
  POSTMORTEM_RULE_VERSION,
  buildPredictionContext,
  classifyPredictionPostmortem,
  type PredictionContextData,
} from "@/lib/predict/postmortem";

const CONTEXT_SELECT = {
  league: true,
  status: true,
  startTime: true,
  marketHome: true,
  marketDraw: true,
  marketAway: true,
  marketUpdatedAt: true,
  marketBookmakers: true,
  openingMarketHome: true,
  openingMarketDraw: true,
  openingMarketAway: true,
  oddsHome: true,
  oddsDraw: true,
  oddsAway: true,
  oddsOver: true,
  oddsUnder: true,
  oddsHcHome: true,
  oddsHcAway: true,
  lineupHome: true,
  lineupAway: true,
  lineupUpdatedAt: true,
  homeStarter: true,
  awayStarter: true,
  startersUpdatedAt: true,
  homeGoalie: true,
  awayGoalie: true,
  goaliesUpdatedAt: true,
} as const;

function isKnownPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * 경기·모델별 최초 예측 시점 컨텍스트를 한 번만 보존한다.
 * 스냅샷 저장 실패가 실제 픽 저장을 막지 않도록 fail-open 으로 동작한다.
 */
export async function capturePredictionContext(matchId: number, model: string): Promise<boolean> {
  try {
    const capturedAt = new Date();
    const [match, existingPrediction] = await Promise.all([
      prisma.match.findUnique({
        where: { id: matchId },
        select: CONTEXT_SELECT,
      }),
      prisma.aiPrediction.findFirst({
        where: { matchId, model },
        orderBy: { predictedAt: "asc" },
        select: { predictedAt: true },
      }),
    ]);
    if (!match || match.status !== "SCHEDULED" || match.startTime <= capturedAt) return false;
    // 배포 전부터 존재한 예측을 현재 경기 정보로 소급 캡처하지 않는다.
    if (existingPrediction && capturedAt.getTime() - existingPrediction.predictedAt.getTime() > 5 * 60_000) {
      return false;
    }

    const context = buildPredictionContext(match, capturedAt);
    await prisma.predictionContextSnapshot.create({
      data: {
        matchId,
        model,
        stage: "PREDICTION",
        capturedAt,
        context: context as unknown as Prisma.InputJsonValue,
      },
    });
    return true;
  } catch (error) {
    if (isKnownPrismaError(error, "P2002")) return false;
    console.warn(
      `[postmortem] 예측 스냅샷 저장 실패 match=${matchId} model=${model}: ${(error as Error).message}`,
    );
    return false;
  }
}

function contextKey(matchId: number, model: string): string {
  return `${matchId}:${model}`;
}

function asPredictionContext(value: Prisma.JsonValue): PredictionContextData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 || typeof row.league !== "string") return null;
  return value as unknown as PredictionContextData;
}

/**
 * 기존 AI 채점이 끝난 뒤 실행되는 내부 후처리다.
 * 정답도 위험 신호를 저장해 향후 PASS 필터의 적중 손실까지 검증할 수 있게 한다.
 */
export async function runPredictionPostmortems(opts?: { limit?: number }) {
  const limit = Math.min(Math.max(opts?.limit ?? 150, 1), 500);
  try {
    const snapshots = await prisma.predictionContextSnapshot.findMany({
      where: {
        stage: "PREDICTION",
        reviewedAt: null,
        match: {
          status: "FINISHED",
          // 종료 직후보다 라인업·카드·xG 보강 작업이 끝난 뒤 분석한다.
          startTime: { lte: new Date(Date.now() - 4 * 3_600_000) },
        },
      },
      orderBy: { capturedAt: "asc" },
      take: limit,
      include: {
        match: {
          select: {
            ...CONTEXT_SELECT,
            homeScore: true,
            awayScore: true,
            fixtureStats: true,
            matchStats: {
              select: { homeRed: true, awayRed: true },
            },
          },
        },
      },
    });
    if (snapshots.length === 0) return { snapshots: 0, analyzed: 0, skipped: 0 };

    const pairs = snapshots.map((snapshot) => ({
      matchId: snapshot.matchId,
      model: snapshot.model,
    }));
    const predictions = await prisma.aiPrediction.findMany({
      where: {
        OR: pairs,
        correct: { not: null },
      },
      select: {
        id: true,
        matchId: true,
        model: true,
        market: true,
        pick: true,
        prob: true,
        line: true,
        correct: true,
        postmortem: { select: { id: true } },
      },
    });

    const snapshotByKey = new Map(
      snapshots.map((snapshot) => [contextKey(snapshot.matchId, snapshot.model), snapshot]),
    );
    const gradedKeys = new Set(predictions.map((p) => contextKey(p.matchId, p.model)));
    const rows: Prisma.PredictionPostmortemCreateManyInput[] = [];
    let skipped = 0;

    for (const prediction of predictions) {
      if (prediction.correct == null || prediction.postmortem) continue;
      const snapshot = snapshotByKey.get(contextKey(prediction.matchId, prediction.model));
      const before = snapshot ? asPredictionContext(snapshot.context) : null;
      if (!snapshot || !before || snapshot.match.homeScore == null || snapshot.match.awayScore == null) {
        skipped++;
        continue;
      }

      const finalContext = buildPredictionContext(snapshot.match, new Date());
      const xg = parseXg(snapshot.match.fixtureStats);
      const result = classifyPredictionPostmortem({
        correct: prediction.correct,
        market: prediction.market,
        pick: prediction.pick,
        prob: prediction.prob,
        line: prediction.line,
        snapshot: before,
        finalContext,
        homeScore: snapshot.match.homeScore,
        awayScore: snapshot.match.awayScore,
        homeRed: snapshot.match.matchStats?.homeRed ?? null,
        awayRed: snapshot.match.matchStats?.awayRed ?? null,
        xgHome: xg.home,
        xgAway: xg.away,
      });

      rows.push({
        predictionId: prediction.id,
        matchId: prediction.matchId,
        model: prediction.model,
        market: prediction.market,
        correct: prediction.correct,
        primaryCause: result.primaryCause,
        actionable: result.actionable,
        severity: result.severity,
        dataQuality: result.dataQuality,
        marketMovePp: result.marketMovePp,
        ruleVersion: POSTMORTEM_RULE_VERSION,
        evidence: result.evidence as Prisma.InputJsonValue,
      });
    }

    const inserted = rows.length > 0
      ? await prisma.predictionPostmortem.createMany({ data: rows, skipDuplicates: true })
      : { count: 0 };
    const reviewedIds = snapshots
      .filter((snapshot) => gradedKeys.has(contextKey(snapshot.matchId, snapshot.model)))
      .map((snapshot) => snapshot.id);
    if (reviewedIds.length > 0) {
      await prisma.predictionContextSnapshot.updateMany({
        where: { id: { in: reviewedIds } },
        data: { reviewedAt: new Date() },
      });
    }

    console.log(
      `[postmortem] 완료 — 스냅샷 ${snapshots.length} / 분석 ${inserted.count} / 스킵 ${skipped}`,
    );
    return { snapshots: snapshots.length, analyzed: inserted.count, skipped };
  } catch (error) {
    console.warn(`[postmortem] 분석 실패: ${(error as Error).message}`);
    return { snapshots: 0, analyzed: 0, skipped: 0, error: (error as Error).message };
  }
}
