// 베트맨 발매 경기 ↔ 우리 Match 연결 — BetmanOdds.matchId 를 채우는 배치(멱등, 하루 2회 워커 적재 직후).
// 이름 매칭을 새로 만들지 않는다. build-betman-team-map 이 경기 대조로 만든 사전(data/betman-team-map.json)으로
// 양 팀 id 를 얻고 킥오프 ±3h 안의 우리 경기를 찾는다. 홈·원정이 뒤집힌 후보는 받지 않는다.
// 같은 (gmTs, matchSeq) 의 모든 베팅유형 행에 같은 matchId 를 쓴다.
//
//   npx tsx --env-file=.env.local src/jobs/link-betman-matches.ts [--days=45] [--dry-run]

import "@/lib/env";
import { prisma } from "@/lib/db";
import rawTeamMap from "../../data/betman-team-map.json";

const TEAM_MAP = rawTeamMap as Record<string, number>;
const WINDOW_MS = 3 * 3600 * 1000;

export async function runLinkBetmanMatches(opts: { days?: number; dryRun?: boolean } = {}): Promise<{ games: number; linked: number; rows: number }> {
  const days = opts.days ?? 45;
  const since = new Date(Date.now() - days * 86400e3);
  const rows = await prisma.betmanOdds.findMany({
    where: { matchId: null, gameDate: { gte: since } },
    select: { gmTs: true, matchSeq: true, gameDate: true, homeName: true, awayName: true },
  });
  // 경기 단위로 접는다 — 유형별 행이 같은 경기를 가리킨다.
  const games = new Map<string, { gmTs: number; matchSeq: number; gameDate: Date; homeName: string; awayName: string }>();
  for (const r of rows) games.set(`${r.gmTs}-${r.matchSeq}`, r);

  // 경기당 쿼리 하나씩이면 1,800경기에 5분이 넘는다(첫 실행 실측) — 사전에 있는 팀 쌍의 우리 경기를 기간째 한 번에 받아 메모리에서 맞춘다.
  const wanted = [...games.values()].filter((g) => TEAM_MAP[g.homeName] && TEAM_MAP[g.awayName]);
  let linked = 0;
  let touched = 0;
  if (wanted.length === 0) {
    console.log(`[betman-link] 대상 ${games.size}경기 → 사전에 있는 팀 쌍 0`);
    return { games: games.size, linked: 0, rows: 0 };
  }
  const teamIds = [...new Set(wanted.flatMap((g) => [TEAM_MAP[g.homeName], TEAM_MAP[g.awayName]]))];
  const minT = Math.min(...wanted.map((g) => g.gameDate.getTime())) - WINDOW_MS;
  const maxT = Math.max(...wanted.map((g) => g.gameDate.getTime())) + WINDOW_MS;
  const candidates = await prisma.match.findMany({
    where: { homeTeamId: { in: teamIds }, awayTeamId: { in: teamIds }, startTime: { gte: new Date(minT), lte: new Date(maxT) } },
    select: { id: true, homeTeamId: true, awayTeamId: true, startTime: true },
  });
  const byPair = new Map<string, Array<{ id: number; t: number }>>();
  for (const m of candidates) {
    const k = `${m.homeTeamId}-${m.awayTeamId}`;
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push({ id: m.id, t: m.startTime.getTime() });
  }
  // 행 단위 updateMany 는 Neon 왕복 0.5s × 8천 행 = 1시간(첫 실행 실측) — id(=gmTs-matchSeq) 로 VALUES 조인 일괄 UPDATE.
  const pairs: Array<[string, number]> = [];
  for (const g of wanted) {
    const list = byPair.get(`${TEAM_MAP[g.homeName]}-${TEAM_MAP[g.awayName]}`);
    if (!list) continue;
    const t = g.gameDate.getTime();
    const m = list.filter((c) => Math.abs(c.t - t) <= WINDOW_MS).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0];
    if (!m) continue;
    linked++;
    pairs.push([`${g.gmTs}-${g.matchSeq}`, m.id]);
  }
  if (!opts.dryRun) {
    const CHUNK = 500;
    for (let i = 0; i < pairs.length; i += CHUNK) {
      const chunk = pairs.slice(i, i + CHUNK);
      const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::int)`).join(", ");
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "BetmanOdds" b SET "matchId" = v.mid FROM (VALUES ${values}) AS v(id, mid) WHERE b.id = v.id AND b."matchId" IS NULL`,
        ...chunk.flat(),
      );
      touched += n;
    }
  }
  console.log(`[betman-link] 대상 ${games.size}경기 → 연결 ${linked}경기 (${touched}행)${opts.dryRun ? " [dry-run]" : ""}`);
  return { games: games.size, linked, rows: touched };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const daysArg = args.find((a) => a.startsWith("--days="));
  runLinkBetmanMatches({ days: daysArg ? Number(daysArg.split("=")[1]) : undefined, dryRun: args.includes("--dry-run") })
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
