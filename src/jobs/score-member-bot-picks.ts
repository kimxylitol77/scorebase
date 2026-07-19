// 회원 봇 픽 채점 — FINISHED 매치의 미채점 픽(correct null)을 최종 스코어로 채움.
// evaluate cron(22:00 KST)에서 predCorrect 채점과 함께 호출 (score-match-votes 전례 패턴).
import { prisma } from "@/lib/db";

export async function runScoreMemberBotPicks() {
  // 미채점 픽이 있는 매치만 수집 (연기·취소 매치 픽은 null 유지 — 기록에서 제외됨)
  const rows = await prisma.memberBotPick.findMany({
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
    // 백테스트(buildLeagueFeatures res)와 동일하게 DB 점수 기준 — 픽은 "HOME"|"DRAW"|"AWAY"
    const result =
      m.homeScore! > m.awayScore! ? "HOME" : m.homeScore! < m.awayScore! ? "AWAY" : "DRAW";
    const hit = await prisma.memberBotPick.updateMany({
      where: { matchId: m.id, correct: null, pick: result },
      data: { correct: true },
    });
    const miss = await prisma.memberBotPick.updateMany({
      where: { matchId: m.id, correct: null },
      data: { correct: false },
    });
    scored += hit.count + miss.count;
  }
  console.log(`[evaluate/member-bot] 매치 ${matches.length} · 픽 ${scored} 채점`);
  return { scored, matches: matches.length };
}
