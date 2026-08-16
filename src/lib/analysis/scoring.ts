// 분석 게시판 예측 자동 채점 — 우리만의 차별점.
// 회원이 예정 경기에 건 픽(승무패/핸디캡/오버언더)을 경기 종료(FINISHED) 후 실제
// 결과와 대조. 적중 시 작성자에게 경험치/포인트 지급. cron(/api/cron/score-analysis)에서 호출.

import "server-only";
import { prisma } from "@/lib/db";
import { awardExp } from "@/lib/user-exp";
import { EXP_REWARDS, POINT_REWARDS } from "@/lib/user-level";

/** 종목이 무승부 픽을 허용하는가 (축구만 — 야구·농구·하키는 승패뿐). */
export function sportHasDraw(sport: string | null | undefined): boolean {
  return sport === "soccer";
}

/**
 * 무승부(동점 종료)가 발생할 수 있는 야구 리그인가.
 * MLB 는 연장 무제한이라 무승부가 없지만, KBO·NPB 등은 연장 제한이 있어
 * 동점 무승부가 나온다. 이런 무승부 승무패(1X2) 픽은 적특(적중특례) —
 * 연기·취소 경기처럼 적중/실패 어디에도 넣지 않고 무효 처리한다.
 */
export function baseballCanDraw(
  sport: string | null,
  league: string | null,
): boolean {
  return sport === "baseball" && league !== "MLB";
}

/** 승무패(1X2) 결과. 점수 미확정이거나 무승부 없는 종목의 동점이면 null(보류). */
export function matchOutcome(
  homeScore: number | null,
  awayScore: number | null,
  sport: string | null,
): "HOME" | "DRAW" | "AWAY" | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return "HOME";
  if (homeScore < awayScore) return "AWAY";
  return sportHasDraw(sport) ? "DRAW" : null;
}

/**
 * 마켓별 픽 판정. true=적중, false=미적중, null=판정 보류(점수 미확정/동점/푸시).
 * - 1X2: 승무패
 * - HANDICAP: line(홈팀 기준) 적용 후 승패. (home + line) vs away
 * - OU: 총득점 vs line
 */
export function settlePick(
  market: string | null,
  pick: string | null,
  line: number | null,
  homeScore: number | null,
  awayScore: number | null,
  sport: string | null,
): boolean | null {
  if (!market || !pick || homeScore == null || awayScore == null) return null;

  if (market === "1X2") {
    const o = matchOutcome(homeScore, awayScore, sport);
    return o == null ? null : o === pick;
  }
  if (market === "HANDICAP") {
    if (line == null) return null;
    const adj = homeScore + line; // line: 홈팀 기준 핸디캡 (예: 홈 -1.5)
    if (adj === awayScore) return null; // 푸시 → 보류
    const winner = adj > awayScore ? "HOME" : "AWAY";
    return winner === pick;
  }
  if (market === "OU") {
    if (line == null) return null;
    const total = homeScore + awayScore;
    if (total === line) return null; // 푸시 → 보류
    return total > line === (pick === "OVER");
  }
  return null;
}

/**
 * 미정산 예측글 일괄 채점 + 무효(취소) 처리.
 * - 채점: pick 있음 + isCorrect=null + 경기 FINISHED → 결과 대조, 적중 시 경험치/포인트 지급.
 * - 무효: POSTPONED(연기·취소) 경기 + 시작 24h↑ 지난 죽은 경기(SCHEDULED/LIVE) 픽 →
 *   채점 불가라 settledAt 만 찍어 종결(isCorrect=null 유지 → 적중률 제외·통계 무영향).
 *   FINISHED 만 처리하던 과거엔 연기 경기 픽이 영원히 미정산으로 쌓였음 → 자동 해소.
 */
export async function scoreAnalysisPredictions(limit = 500): Promise<{
  scored: number;
  correct: number;
  voided: number;
}> {
  const pending = await prisma.post.findMany({
    where: {
      category: "ANALYSIS",
      pick: { not: null },
      isCorrect: null,
      settledAt: null, // 무효 종결된 픽은 재조회 제외 (적특 1회 처리 후 정착)
      matchId: { not: null },
      match: { is: { status: "FINISHED" } },
    },
    select: {
      id: true,
      authorId: true,
      market: true,
      pick: true,
      line: true,
      sport: true,
      match: { select: { homeScore: true, awayScore: true, league: true } },
    },
    take: limit,
  });

  let scored = 0;
  let correct = 0;
  let voided = 0;
  for (const p of pending) {
    const h = p.match?.homeScore ?? null;
    const a = p.match?.awayScore ?? null;

    // 적특(무효): 무승부 가능 야구 리그(KBO/NPB 등)의 승무패 픽이 동점으로 끝나면
    // 연기·취소 경기처럼 적중/실패에 넣지 않고 통계 제외 — settledAt 만 찍어 종결.
    // (isCorrect=null 유지 → 화면 배지 없음 + 적중률 분모에서 빠짐)
    if (
      p.market === "1X2" &&
      h != null &&
      a != null &&
      h === a &&
      baseballCanDraw(p.sport, p.match?.league ?? null)
    ) {
      await prisma.post.update({
        where: { id: p.id },
        data: { settledAt: new Date() },
      });
      voided++;
      continue;
    }

    const verdict = settlePick(p.market, p.pick, p.line, h, a, p.sport);
    if (verdict == null) continue; // 보류 — 다음 cron 에서 재시도

    await prisma.post.update({
      where: { id: p.id },
      data: { isCorrect: verdict, settledAt: new Date() },
    });

    // 작성자 적중 통계 갱신 (predTotal/Hit/Streak/Best)
    const author = await prisma.user.findUnique({
      where: { id: p.authorId },
      select: { predStreak: true, predBest: true },
    });
    const newStreak = verdict ? (author?.predStreak ?? 0) + 1 : 0;
    const newBest = Math.max(author?.predBest ?? 0, newStreak);
    await prisma.user.update({
      where: { id: p.authorId },
      data: {
        predTotal: { increment: 1 },
        ...(verdict ? { predHit: { increment: 1 } } : {}),
        predStreak: newStreak,
        predBest: newBest,
      },
    });

    if (verdict) {
      await awardExp(
        p.authorId,
        { exp: EXP_REWARDS.predictionHit, points: POINT_REWARDS.predictionHit },
        "prediction_hit",
      );
      correct++;
    }
    scored++;
  }

  // 연기·취소(POSTPONED) 경기 + 죽은 경기(시작 +VOID_STALE_HOURS↑ 지났는데 미종료) 픽은
  // 채점 자체가 불가 → 자동 무효. settledAt 만 찍어 종결(isCorrect=null 유지 → 적중률 분모
  // 제외·배지 없음·통계 무영향). 적중과 달리 per-user 처리 불필요해 updateMany 한 번으로 끝.
  const VOID_STALE_HOURS = 24;
  const voidStaleCutoff = new Date(Date.now() - VOID_STALE_HOURS * 3600 * 1000);
  const voidResult = await prisma.post.updateMany({
    where: {
      category: "ANALYSIS",
      pick: { not: null },
      isCorrect: null,
      settledAt: null,
      matchId: { not: null },
      OR: [
        { match: { is: { status: "POSTPONED" } } },
        {
          match: {
            is: { status: { in: ["SCHEDULED", "LIVE"] }, startTime: { lt: voidStaleCutoff } },
          },
        },
      ],
    },
    data: { settledAt: new Date() },
  });
  voided += voidResult.count;

  return { scored, correct, voided };
}
