// 승부예측 투표 채점 — FINISHED 매치의 미채점 투표(correct null)를 최종 스코어로 채움.
// evaluate cron(22:00 KST) 에서 predCorrect 채점과 함께 호출.
import { prisma } from "@/lib/db";

export async function runScoreMatchVotes() {
  // 미채점 투표가 있는 매치만 수집 (연기·취소 매치 투표는 null 유지 — 기록에서 제외됨)
  const rows = await prisma.matchVote.findMany({
    where: { correct: null },
    select: { matchId: true },
    distinct: ["matchId"],
    take: 300,
  });
  if (rows.length === 0) return { scored: 0, matches: 0 };

  const matches = await prisma.match.findMany({
    where: {
      id: { in: rows.map((r) => r.matchId) },
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { id: true, homeScore: true, awayScore: true },
  });

  let scored = 0;
  for (const m of matches) {
    const result = m.homeScore! > m.awayScore! ? "home" : m.homeScore! < m.awayScore! ? "away" : "draw";
    const hit = await prisma.matchVote.updateMany({
      where: { matchId: m.id, correct: null, pick: result },
      data: { correct: true },
    });
    const miss = await prisma.matchVote.updateMany({
      where: { matchId: m.id, correct: null },
      data: { correct: false },
    });
    scored += hit.count + miss.count;
  }
  console.log(`[evaluate/votes] 매치 ${matches.length} · 투표 ${scored} 채점`);
  return { scored, matches: matches.length };
}
