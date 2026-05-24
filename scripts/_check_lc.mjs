import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

console.log("=== BotHeartbeat (recent) ===");
const hb = await prisma.botHeartbeat.findMany({
  orderBy: { lastAt: "desc" },
  take: 15,
});
const now = Date.now();
for (const r of hb) {
  const age = Math.round((now - r.lastAt.getTime()) / 60000);
  console.log(`${r.name.padEnd(28)} ${age.toString().padStart(5)}분 전  lastAt=${r.lastAt.toISOString()}`);
}

console.log("\n=== LiveCommentary (any) ===");
const lc = await prisma.liveCommentary.findMany({
  orderBy: { updatedAt: "desc" },
  take: 10,
});
console.log("total rows:", lc.length);
for (const r of lc) {
  console.log(`matchId=${r.matchId} updatedAt=${r.updatedAt.toISOString()} summaryAt=${r.summaryAt?.toISOString() ?? "none"} hasSummary=${!!r.matchSummary}`);
}

console.log("\n=== 현재 LIVE 매치 (KBO/NPB/MLB) ===");
const live = await prisma.match.findMany({
  where: { league: { in: ["KBO", "NPB", "MLB"] }, status: "LIVE" },
  include: { homeTeam: true, awayTeam: true, liveCommentary: true },
  orderBy: { startTime: "desc" },
});
for (const m of live) {
  console.log(`[${m.league}] ${m.homeTeam.name} ${m.homeScore}-${m.awayScore} ${m.awayTeam.name} start=${m.startTime.toISOString()} commentary=${m.liveCommentary ? "YES" : "no"}`);
}

await prisma.$disconnect();
