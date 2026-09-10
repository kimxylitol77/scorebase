// 승부예측 투표 채점 — evaluate cron 에 피기백. 종료 매치의 최종 스코어로 시장별(1X2·핸디캡·오버언더) 정답을 내고
// correct 를 채운다. 연기·취소 매치 투표는 null 유지(기록 제외). CLV 는 1X2 만(스냅샷에 hc/ou 배당 없음).
import { prisma } from "@/lib/db";
import { isVoteMarket, resultPick } from "@/lib/vote-markets";
import { EXP_REWARDS, POINT_REWARDS, expToLevel } from "@/lib/user-level";

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
    select: { id: true, homeScore: true, awayScore: true, startTime: true },
  });

  let scored = 0;
  let clvFilled = 0;
  let pushes = 0;
  for (const m of matches) {
    // CLV — 킥오프 직전 마지막 스냅샷(종가) 대비 픽 배당. 스냅샷 없으면 건너뜀(추정 금지). 1X2 표만.
    const close = await prisma.oddsSnapshot.findFirst({
      where: { matchId: m.id, fetchedAt: { lte: m.startTime } },
      orderBy: { fetchedAt: "desc" },
      select: { homeOdds: true, drawOdds: true, awayOdds: true },
    });
    if (close) {
      const votes = await prisma.matchVote.findMany({
        where: { matchId: m.id, market: "1X2", closeOdds: null, pickOdds: { not: null } },
        select: { id: true, pick: true, pickOdds: true },
      });
      for (const v of votes) {
        const c = v.pick === "home" ? close.homeOdds : v.pick === "draw" ? close.drawOdds : close.awayOdds;
        if (c == null || c <= 0 || v.pickOdds == null) continue;
        await prisma.matchVote.update({
          where: { id: v.id },
          data: { closeOdds: c, clv: v.pickOdds / c - 1 },
        });
        clvFilled++;
      }
    }

    // 시장·라인별 정답 — 같은 (market, line) 묶음은 한 번에 updateMany.
    const pending = await prisma.matchVote.findMany({
      where: { matchId: m.id, correct: null },
      select: { market: true, line: true },
      distinct: ["market", "line"],
    });
    for (const p of pending) {
      const market = isVoteMarket(p.market) ? p.market : "1X2";
      const answer = resultPick(market, p.line, m.homeScore!, m.awayScore!);
      if (answer == null) {
        // 라인에 정확히 걸친 핸디/OU(푸시)·라인 없는 표는 채점 불가 — null 로 남겨 기록에서 뺀다.
        pushes++;
        continue;
      }
      const hit = await prisma.matchVote.updateMany({
        where: { matchId: m.id, market: p.market, line: p.line, correct: null, pick: answer },
        data: { correct: true },
      });
      const miss = await prisma.matchVote.updateMany({
        where: { matchId: m.id, market: p.market, line: p.line, correct: null },
        data: { correct: false },
      });
      scored += hit.count + miss.count;
    }
  }
  const rewarded = matches.length > 0 ? await rewardVoteHits(matches.map((m) => m.id)) : 0;
  console.log(`[evaluate/votes] 매치 ${matches.length} · 투표 ${scored} 채점 · CLV ${clvFilled} · 보상 ${rewarded}${pushes ? ` · 푸시/무효 묶음 ${pushes}` : ""}`);
  return { scored, matches: matches.length, clvFilled, rewarded };
}

/**
 * 적중 보상 — 로그인 회원의 적중 표에 exp·포인트. ExpLog reason 에 표 id 를 박아 멱등(점수 정정으로
 * correct 가 리셋됐다 다시 채점돼도, 소급 실행을 몇 번 해도 두 번 주지 않는다). 익명 표는 대상 아님.
 * user-exp.awardExp 와 같은 갱신(exp·points 증가 → level 재계산 → ExpLog)이지만 그 모듈은 server-only 라
 * tsx 로 도는 잡에서 못 부른다 — 여기서 같은 규칙으로 직접 쓴다.
 * @param matchIds 생략하면 전체 적중 표(소급용).
 */
export async function rewardVoteHits(matchIds?: number[]): Promise<number> {
  const hits = await prisma.matchVote.findMany({
    where: { ...(matchIds ? { matchId: { in: matchIds } } : {}), correct: true, userId: { not: null } },
    select: { id: true, userId: true },
  });
  if (hits.length === 0) return 0;
  const done = new Set(
    (await prisma.expLog.findMany({ where: { reason: { in: hits.map((v) => `vote_hit:${v.id}`) } }, select: { reason: true } })).map((r) => r.reason),
  );
  let rewarded = 0;
  for (const v of hits) {
    const reason = `vote_hit:${v.id}`;
    if (done.has(reason)) continue;
    const u = await prisma.user.update({
      where: { id: v.userId! },
      data: { exp: { increment: EXP_REWARDS.voteHit }, points: { increment: POINT_REWARDS.voteHit } },
      select: { exp: true, level: true },
    });
    await prisma.expLog.create({ data: { userId: v.userId!, exp: EXP_REWARDS.voteHit, points: POINT_REWARDS.voteHit, reason } });
    const level = expToLevel(Math.max(u.exp, 0));
    if (level !== u.level) await prisma.user.update({ where: { id: v.userId! }, data: { level } });
    rewarded++;
  }
  return rewarded;
}
