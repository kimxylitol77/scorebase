// 분석 게시판 예측 자동 채점 — 우리만의 차별점.
// 회원이 예정 경기에 건 승/무/패 픽을, 경기 종료(FINISHED) 후 실제 결과와 대조.
// 적중 시 작성자에게 경험치/포인트 지급. cron(/api/cron/score-analysis)에서 호출.

import "server-only";
import { prisma } from "@/lib/db";
import { awardExp } from "@/lib/user-exp";
import { EXP_REWARDS, POINT_REWARDS } from "@/lib/user-level";

/** 종목이 무승부 픽을 허용하는가 (축구만 — 야구·농구·하키는 승패뿐). */
export function sportHasDraw(sport: string | null | undefined): boolean {
  return sport === "soccer";
}

/** 경기 점수 → 실제 결과. 점수 미확정이거나 무승부 없는 종목의 동점이면 null(판정 보류). */
export function matchOutcome(
  homeScore: number | null,
  awayScore: number | null,
  sport: string | null,
): "HOME" | "DRAW" | "AWAY" | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return "HOME";
  if (homeScore < awayScore) return "AWAY";
  return sportHasDraw(sport) ? "DRAW" : null; // 야구/농구/하키 동점 = 데이터 이상 → 보류
}

/**
 * 미정산 예측글 일괄 채점. 대상 = pick 있음 + isCorrect=null + 경기 FINISHED.
 * 적중 시에만 경험치/포인트 지급(미적중은 패널티 없음).
 */
export async function scoreAnalysisPredictions(limit = 500): Promise<{
  scored: number;
  correct: number;
}> {
  const pending = await prisma.post.findMany({
    where: {
      pick: { not: null },
      isCorrect: null,
      matchId: { not: null },
      match: { is: { status: "FINISHED" } },
    },
    select: {
      id: true,
      authorId: true,
      pick: true,
      sport: true,
      match: { select: { homeScore: true, awayScore: true } },
    },
    take: limit,
  });

  let scored = 0;
  let correct = 0;
  for (const p of pending) {
    const outcome = matchOutcome(
      p.match?.homeScore ?? null,
      p.match?.awayScore ?? null,
      p.sport,
    );
    if (outcome == null) continue; // 점수 미확정/보류 — 다음 cron 에서 재시도

    const hit = outcome === p.pick;
    await prisma.post.update({
      where: { id: p.id },
      data: { isCorrect: hit, settledAt: new Date() },
    });
    if (hit) {
      await awardExp(p.authorId, {
        exp: EXP_REWARDS.predictionHit,
        points: POINT_REWARDS.predictionHit,
      });
      correct++;
    }
    scored++;
  }
  return { scored, correct };
}
