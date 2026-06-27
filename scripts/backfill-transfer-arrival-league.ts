// 이적 도착 리그 재태깅 — to_team 이 커버 리그(빅5+확장)면 league 를 도착 리그로 교정.
// 내부 라우트 upsert 가 league 를 sticky 유지해, 사전 추가 전 생성된 행이 출발 리그로 굳은 것 정정.
// (예: 그리즈만 아틀레티코→올랜도 가 LALIGA 로 저장돼 MLS 피드에서 누락.)
// 실행: npx tsx --env-file=.env.local scripts/backfill-transfer-arrival-league.ts
import { prisma } from "@/lib/db";
import expansionTeams from "../data/transfer-league-teams.json";

const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const EXPANSION = expansionTeams as Record<string, string>;

async function main() {
  // teamLeague 맵 = 확장 사전 + 빅5(TeamSourceId thesports) — 내부 라우트와 동일.
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true, team: { select: { league: true } } },
  });
  const teamLeague = new Map<string, string>(Object.entries(EXPANSION));
  for (const r of big5Rows) teamLeague.set(r.externalId, r.team.league);

  const toIds = [...teamLeague.keys()];
  console.log(`커버 팀 ${toIds.length}개 기준 재태깅 검사`);

  let scanned = 0, fixed = 0;
  const byLeague: Record<string, number> = {};
  // 도착팀이 커버 팀인 이적만 — 도착 리그가 정답.
  const rows = await prisma.footballTransfer.findMany({
    where: { toTeamId: { in: toIds } },
    select: { id: true, toTeamId: true, league: true },
  });
  for (const r of rows) {
    scanned++;
    const correct = r.toTeamId ? teamLeague.get(r.toTeamId) : undefined;
    if (correct && correct !== r.league) {
      await prisma.footballTransfer.update({ where: { id: r.id }, data: { league: correct } });
      fixed++;
      byLeague[correct] = (byLeague[correct] ?? 0) + 1;
    }
  }
  console.log(`스캔 ${scanned} / 재태깅 ${fixed}`);
  console.log("리그별:", JSON.stringify(byLeague));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
