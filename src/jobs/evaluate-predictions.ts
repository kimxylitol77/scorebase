// PREVIEW 글 적중률 평가 잡.
// 종료된 매치 + PREVIEW 글이 있고 아직 평가 안 된 것을 찾아
// 실제 결과와 predWinner 를 비교해 correct 필드 채움.
//
// 사용:
//   npm run job:evaluate

import "@/lib/env";
import { prisma } from "@/lib/db";

function actualWinnerOf(home: number, away: number): "HOME" | "DRAW" | "AWAY" {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

export async function runEvaluate(opts?: { limit?: number }) {
  const limit = opts?.limit ?? 500;
  console.log("[evaluate] 시작");

  // PREVIEW 글 + 매치 종료 + predWinner 있고 아직 평가 안 됨
  const articles = await prisma.article.findMany({
    where: {
      type: "PREVIEW",
      predWinner: { not: null },
      evaluatedAt: null,
      match: {
        status: "FINISHED",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    include: {
      match: {
        select: { homeScore: true, awayScore: true, league: true },
      },
    },
    take: limit,
  });

  console.log(`[evaluate] 평가 대상: ${articles.length}건`);
  if (articles.length === 0) return { evaluated: 0, correct: 0 };

  let correctCount = 0;
  for (const a of articles) {
    if (!a.match || a.match.homeScore == null || a.match.awayScore == null) continue;
    const actual = actualWinnerOf(a.match.homeScore, a.match.awayScore);
    const isCorrect = a.predWinner === actual;
    await prisma.article.update({
      where: { id: a.id },
      data: { evaluatedAt: new Date(), correct: isCorrect },
    });
    if (isCorrect) correctCount++;
  }

  console.log(
    `[evaluate] 완료: ${correctCount}/${articles.length} 적중 (${Math.round((correctCount / articles.length) * 100)}%)`,
  );
  return { evaluated: articles.length, correct: correctCount };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEvaluate()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
