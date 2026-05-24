// SERIE_A 최근 30일 매치 + 예측 + 결과 dump.
// 1X2 35%, BTTS 39% — 무엇이 원인인지.

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      league: "SERIE_A",
      status: "FINISHED",
      startTime: { gte: since },
      homeScore: { not: null },
      awayScore: { not: null },
      predCorrect: { not: null },
    },
    select: {
      id: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      predWinner: true,
      predCorrect: true,
      predBttsProb: true,
      predBttsPick: true,
      predBttsCorrect: true,
      predOverProb: true,
      predOverPick: true,
      predOverCorrect: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      homeTeam: { select: { name: true, eloRating: true } },
      awayTeam: { select: { name: true, eloRating: true } },
    },
    orderBy: { startTime: "desc" },
  });

  console.log(`=== SERIE_A 최근 30일 FINISHED ${matches.length} matches ===\n`);

  const winnerActual = (h: number, a: number) => (h > a ? "HOME" : h < a ? "AWAY" : "DRAW");

  let preCorrect = 0;
  let bttsCorrect = 0;
  let ouCorrect = 0;
  let homeWin = 0, awayWin = 0, draw = 0;
  let homeFavored = 0, awayFavored = 0, drawFavored = 0;
  let underdog = 0, favoriteWon = 0, draws = 0;
  let withOdds = 0;
  let homePctSum = 0, awayPctSum = 0, drawPctSum = 0;

  for (const m of matches) {
    const actual = winnerActual(m.homeScore!, m.awayScore!);
    if (actual === "HOME") homeWin++;
    else if (actual === "AWAY") awayWin++;
    else draw++;

    if (m.predWinner === "HOME") homeFavored++;
    else if (m.predWinner === "AWAY") awayFavored++;
    else if (m.predWinner === "DRAW") drawFavored++;

    if (m.predCorrect) preCorrect++;
    if (m.predBttsCorrect) bttsCorrect++;
    if (m.predOverCorrect) ouCorrect++;

    if (m.predHome != null) homePctSum += m.predHome;
    if (m.predAway != null) awayPctSum += m.predAway;
    if (m.predDraw != null) drawPctSum += m.predDraw;

    if (m.marketHome != null) withOdds++;

    if (actual === "DRAW") draws++;
    else {
      const fav = m.predWinner;
      if (fav === actual) favoriteWon++;
      else underdog++;
    }
  }

  console.log(`적중률: 1X2 ${preCorrect}/${matches.length} (${((preCorrect/matches.length)*100).toFixed(0)}%)`);
  console.log(`        BTTS ${bttsCorrect}/${matches.length} (${((bttsCorrect/matches.length)*100).toFixed(0)}%)`);
  console.log(`        OU   ${ouCorrect}/${matches.length} (${((ouCorrect/matches.length)*100).toFixed(0)}%)`);
  console.log();
  console.log(`실제 결과: 홈승 ${homeWin} · 무승부 ${draw} · 원정승 ${awayWin}`);
  console.log(`모델 예측: 홈승 ${homeFavored} · 무승부 ${drawFavored} · 원정승 ${awayFavored}`);
  console.log(`Odds 데이터 있음: ${withOdds}/${matches.length}`);
  console.log();
  console.log(`평균 예측 확률: 홈 ${(homePctSum/matches.length*100).toFixed(1)}% · 무 ${(drawPctSum/matches.length*100).toFixed(1)}% · 원정 ${(awayPctSum/matches.length*100).toFixed(1)}%`);
  console.log();

  // 매치 한 줄씩
  console.log(`=== 매치 상세 ===`);
  for (const m of matches) {
    const actual = winnerActual(m.homeScore!, m.awayScore!);
    const correct = m.predCorrect ? "✅" : "❌";
    const probs = m.predHome != null
      ? `H${(m.predHome*100).toFixed(0)}/D${(m.predDraw!*100).toFixed(0)}/A${(m.predAway!*100).toFixed(0)}`
      : "no-pred";
    const market = m.marketHome != null
      ? `mkt H${(m.marketHome*100).toFixed(0)}/D${(m.marketDraw!*100).toFixed(0)}/A${(m.marketAway!*100).toFixed(0)}`
      : "no-mkt";
    const elo = `Elo H${m.homeTeam.eloRating.toFixed(0)} A${m.awayTeam.eloRating.toFixed(0)}`;
    console.log(
      `${m.startTime.toISOString().slice(0,10)} ${correct} ${m.homeTeam.name} ${m.homeScore}:${m.awayScore} ${m.awayTeam.name} | pred=${m.predWinner} ${probs} | actual=${actual} | ${market} | ${elo}`,
    );
  }
}

main().catch(console.error).finally(()=>prisma.$disconnect());
