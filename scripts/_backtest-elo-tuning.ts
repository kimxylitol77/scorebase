// Mini backtest — calcEloTable + calcWinProbability 만 사용해서 최근 30일 적중률 측정.
// 옛 파라미터 (현재 코드) vs 새 파라미터 비교.

import { PrismaClient } from "@prisma/client";
import { calcEloTable } from "../src/lib/predict/elo";

const prisma = new PrismaClient();

type Variant = {
  name: string;
  homeAdv: number;
  drawWeight: number;
  drawSensitivity: number;
};

const VARIANTS: Variant[] = [
  { name: "baseline (현재)", homeAdv: 100, drawWeight: 0.18, drawSensitivity: 0.18 },
  { name: "v1 (홈 60)", homeAdv: 60, drawWeight: 0.18, drawSensitivity: 0.18 },
  { name: "v2 (홈 60, 무 +0.04)", homeAdv: 60, drawWeight: 0.22, drawSensitivity: 0.22 },
  { name: "v3 (홈 80, 무 +0.04)", homeAdv: 80, drawWeight: 0.22, drawSensitivity: 0.22 },
  { name: "v4 (홈 50, 무 +0.06)", homeAdv: 50, drawWeight: 0.24, drawSensitivity: 0.24 },
];

function winProb(eloHome: number, eloAway: number, v: Variant) {
  const diff = eloAway - (eloHome + v.homeAdv);
  const expHome = 1 / (1 + Math.pow(10, diff / 400));
  const closeness = 1 - Math.abs(expHome - 0.5) * 2;
  const drawProb = v.drawWeight + closeness * v.drawSensitivity;
  const remaining = 1 - drawProb;
  return {
    home: expHome * remaining,
    draw: drawProb,
    away: (1 - expHome) * remaining,
  };
}

async function main() {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const leagues = ["SERIE_A", "EPL", "LALIGA", "BUNDESLIGA", "LIGUE_1"];

  for (const lg of leagues) {
    const allMatches = await prisma.match.findMany({
      where: { league: lg, status: "FINISHED", homeScore: { not: null }, awayScore: { not: null } },
      select: { id: true, league: true, startTime: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
      orderBy: { startTime: "asc" },
    });
    const recent = allMatches.filter((m) => m.startTime >= since);
    if (recent.length === 0) continue;

    console.log(`\n=== ${lg} — 최근 30일 ${recent.length} matches (전체 시즌 input ${allMatches.length}) ===`);

    const results: Record<string, { c: number; n: number; drawPred: number; homePred: number; awayPred: number; avgHome: number; avgDraw: number; avgAway: number; brierSum: number }> = {};
    for (const v of VARIANTS) {
      results[v.name] = { c: 0, n: 0, drawPred: 0, homePred: 0, awayPred: 0, avgHome: 0, avgDraw: 0, avgAway: 0, brierSum: 0 };
    }

    for (const m of recent) {
      // 매치 직전까지 input
      const before = allMatches.filter((mm) => mm.startTime < m.startTime);
      const elo = calcEloTable(before as never);
      const eH = elo.ratings.get(m.homeTeamId) ?? 1500;
      const eA = elo.ratings.get(m.awayTeamId) ?? 1500;

      const actual = m.homeScore! > m.awayScore! ? "HOME" : m.homeScore! < m.awayScore! ? "AWAY" : "DRAW";

      for (const v of VARIANTS) {
        const p = winProb(eH, eA, v);
        const pick = p.home >= p.draw && p.home >= p.away ? "HOME" : p.away >= p.draw ? "AWAY" : "DRAW";
        const r = results[v.name];
        r.n++;
        if (pick === actual) r.c++;
        if (pick === "HOME") r.homePred++;
        else if (pick === "AWAY") r.awayPred++;
        else r.drawPred++;
        r.avgHome += p.home;
        r.avgDraw += p.draw;
        r.avgAway += p.away;
        // Brier score
        const actHome = actual === "HOME" ? 1 : 0;
        const actDraw = actual === "DRAW" ? 1 : 0;
        const actAway = actual === "AWAY" ? 1 : 0;
        r.brierSum += (p.home - actHome) ** 2 + (p.draw - actDraw) ** 2 + (p.away - actAway) ** 2;
      }
    }

    // 실제 분포
    const acH = recent.filter((m) => m.homeScore! > m.awayScore!).length;
    const acD = recent.filter((m) => m.homeScore === m.awayScore).length;
    const acA = recent.filter((m) => m.homeScore! < m.awayScore!).length;
    console.log(`실제 분포: 홈 ${acH} (${((acH/recent.length)*100).toFixed(0)}%) · 무 ${acD} (${((acD/recent.length)*100).toFixed(0)}%) · 원정 ${acA} (${((acA/recent.length)*100).toFixed(0)}%)`);

    console.log(
      `${"variant".padEnd(28)} | acc    | 예측 분포 H/D/A    | 평균 확률 H/D/A      | Brier`,
    );
    for (const v of VARIANTS) {
      const r = results[v.name];
      const acc = ((r.c / r.n) * 100).toFixed(0);
      const dist = `${r.homePred.toString().padStart(2)}/${r.drawPred.toString().padStart(2)}/${r.awayPred.toString().padStart(2)}`;
      const avg = `${(r.avgHome/r.n*100).toFixed(1)}/${(r.avgDraw/r.n*100).toFixed(1)}/${(r.avgAway/r.n*100).toFixed(1)}`;
      const brier = (r.brierSum / r.n).toFixed(3);
      console.log(`${v.name.padEnd(28)} | ${acc}%   | ${dist.padEnd(14)} | ${avg.padEnd(20)} | ${brier}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
