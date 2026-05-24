// 같은 league + 시각(시간 단위) + 팀명 조합의 row 가 2개 이상이면
// 삭제 우선순위:
//   1) ts: prefix (TheSports) row — 가장 흔한 중복 source
//   2) ESPN/api-football 중에서는 stale row 선택 (LIVE 인데 다른 row 가 FINISHED 면 LIVE 가 stale)
//
// 안전장치:
//   - Article 이 link 된 match 는 건드리지 않음
//   - TheSportsMatchCache (FK matchId) 는 cascade 삭제
//   - --apply 없으면 dry-run

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");

async function main() {
  const now = new Date();
  const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const future = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  // status 무관 — collector 전환 (NBA ESPN → API-Sports 등) 이후
  // 한쪽이 LIVE 로 stuck 이고 다른쪽이 FINISHED 인 케이스도 cover.
  const matches = await prisma.match.findMany({
    where: { startTime: { gte: past, lte: future } },
    select: {
      id: true,
      league: true,
      externalId: true,
      status: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const hour = m.startTime.toISOString().slice(0, 13);
    // teamName 기반 — 같은 클럽이라도 BRASILEIRAO Team 과 COPA_LIB Team 이 별도 row 라서
    // teamId 기반으로 묶으면 같은 매치를 다른 그룹으로 분류해 cleanup 누락됨.
    const teamKey = [m.homeTeam.name, m.awayTeam.name].sort().join("|");
    const key = `${m.league}__${hour}__${teamKey}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }

  // ESPN scoreboard 9자리 ID (4xxxxxxxx) — 옛 source (NBA/J1/AFC 등 새 API-Sports/api-football 로 전환됨).
  const isEspnId = (extId: string) => /^4\d{8}$/.test(extId);
  const toDelete: typeof matches = [];
  const keepPreview: { league: string; key: string; kept: string; deleted: string[] }[] = [];
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const tsRows = items.filter((m) => m.externalId.startsWith("ts:"));
    const nonTsRows = items.filter((m) => !m.externalId.startsWith("ts:"));

    // 1) ts: row 우선 삭제
    const deletes: typeof matches = [...tsRows];
    let remaining = nonTsRows;

    // 2) ts: 도 없고 nonTs 가 2개 이상
    if (tsRows.length === 0 && remaining.length >= 2) {
      // 2a) stale LIVE/SCHEDULED row (다른 row 가 FINISHED 인 경우) 삭제
      const hasFinished = remaining.some((m) => m.status === "FINISHED");
      if (hasFinished) {
        const liveStale = remaining.filter((m) => m.status === "LIVE" || m.status === "SCHEDULED");
        deletes.push(...liveStale);
        remaining = remaining.filter((m) => !liveStale.includes(m));
      }
      // 2b) ESPN 옛 source row (9자리 4xxxxxxxx) 가 있고 새 source 도 있으면 ESPN 삭제
      if (remaining.length >= 2) {
        const espnRows = remaining.filter((m) => isEspnId(m.externalId));
        const newRows = remaining.filter((m) => !isEspnId(m.externalId));
        if (espnRows.length > 0 && newRows.length > 0) {
          deletes.push(...espnRows);
          remaining = newRows;
        }
      }
      // 2c) 그래도 2개 이상이면 작은 id 유지
      if (remaining.length >= 2) {
        remaining.sort((a, b) => a.id - b.id);
        deletes.push(...remaining.slice(1));
        remaining = [remaining[0]];
      }
    }

    if (deletes.length === 0) continue;
    // remaining 비면 모두 ts: 라는 뜻 — 1개는 유지해야 데이터 안 사라짐
    if (remaining.length === 0 && tsRows.length >= 1) {
      // ts: 만 있는 그룹 — 1개 유지 (가장 작은 id)
      const keep = tsRows.sort((a, b) => a.id - b.id)[0];
      const idx = deletes.findIndex((m) => m.id === keep.id);
      if (idx >= 0) deletes.splice(idx, 1);
      remaining = [keep];
    }

    toDelete.push(...deletes);
    keepPreview.push({
      league: items[0].league,
      key,
      kept: remaining.length > 0 ? `${remaining[0].externalId} (id=${remaining[0].id} ${remaining[0].status})` : "(none)",
      deleted: deletes.map((m) => `${m.externalId} (id=${m.id} ${m.status})`),
    });
  }

  console.log(`=== Cleanup plan ===`);
  console.log(`총 ${toDelete.length} 개 ts: row 삭제 예정 (${keepPreview.length} 그룹)`);
  console.log("\n샘플 (앞 10 그룹):");
  for (const p of keepPreview.slice(0, 10)) {
    console.log(`  [${p.league}] keep: ${p.kept}`);
    for (const d of p.deleted) console.log(`            delete: ${d}`);
  }

  // 안전장치 1: Article link 검사
  const articles = await prisma.article.findMany({
    where: { matchId: { in: toDelete.map((m) => m.id) } },
    select: { matchId: true, slug: true },
  });
  if (articles.length > 0) {
    console.log(`\n⚠️  ${articles.length} article 이 삭제 대상 match 에 link 되어 있음 — 해당 ts: row 보존:`);
    for (const a of articles) console.log(`  match.id=${a.matchId} → ${a.slug}`);
    const blocked = new Set(articles.map((a) => a.matchId));
    const filtered = toDelete.filter((m) => !blocked.has(m.id));
    console.log(`  → 삭제 대상 ${toDelete.length} → ${filtered.length}`);
    toDelete.length = 0;
    toDelete.push(...filtered);
  }

  // 리그별 카운트
  const byLeague = new Map<string, number>();
  for (const m of toDelete) byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);
  console.log(`\n=== 리그별 삭제 row ===`);
  for (const [lg, n] of [...byLeague.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lg}: ${n}`);
  }

  if (!APPLY) {
    console.log(`\n[dry-run] 실제 삭제하려면 --apply 추가`);
    return;
  }

  console.log(`\n=== Applying ===`);
  const ids = toDelete.map((m) => m.id);

  // TheSportsMatchCache cascade 삭제 (FK)
  const cacheDel = await prisma.theSportsMatchCache.deleteMany({ where: { matchId: { in: ids } } });
  console.log(`TheSportsMatchCache 삭제: ${cacheDel.count} rows`);

  // Match 삭제
  const matchDel = await prisma.match.deleteMany({ where: { id: { in: ids } } });
  console.log(`Match 삭제: ${matchDel.count} rows`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
