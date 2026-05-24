import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // CSL 매치 다음 7일 (혹은 최근 30일) 조회 — 중복 의심 확인
  const now = new Date();
  const future = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const past = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      league: "CSL",
      startTime: { gte: past, lte: future },
    },
    select: {
      id: true,
      externalId: true,
      status: true,
      startTime: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { name: true, externalId: true } },
      awayTeam: { select: { name: true, externalId: true } },
      raw: false,
    },
    orderBy: { startTime: "asc" },
  });

  console.log(`=== CSL 매치 ${past.toISOString().slice(0, 10)} ~ ${future.toISOString().slice(0, 10)} (${matches.length}건) ===\n`);
  for (const m of matches) {
    console.log(
      `id=${m.id} extId=${m.externalId} ${m.status} ${m.startTime.toISOString()} | ${m.homeTeam.name} (teamExt=${m.homeTeam.externalId}) vs ${m.awayTeam.name} (teamExt=${m.awayTeam.externalId})`,
    );
  }

  // 중복 감지: 같은 league + 같은 날 + 같은 home/away 팀 이름
  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const day = m.startTime.toISOString().slice(0, 10);
    const teamKey = [m.homeTeam.name, m.awayTeam.name].sort().join("|");
    const key = `${day}__${teamKey}`;
    const arr = groups.get(key) ?? [];
    arr.push(m);
    groups.set(key, arr);
  }
  const dups = [...groups.entries()].filter(([, items]) => items.length > 1);
  console.log(`\n=== 중복 그룹 ${dups.length}건 ===`);
  for (const [key, items] of dups) {
    console.log(`\n▼ ${key} — ${items.length} rows`);
    for (const m of items) {
      console.log(`  id=${m.id} extId=${m.externalId} ${m.status} ${m.startTime.toISOString()}`);
    }
  }

  // Team 중복도 체크 (같은 league + 같은 이름인데 row 2개)
  const teams = await prisma.team.findMany({
    where: { league: "CSL" },
    select: { id: true, externalId: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n=== CSL Team ${teams.length}개 ===`);
  const teamByName = new Map<string, typeof teams>();
  for (const t of teams) {
    const arr = teamByName.get(t.name) ?? [];
    arr.push(t);
    teamByName.set(t.name, arr);
  }
  for (const [name, items] of teamByName) {
    if (items.length > 1) {
      console.log(`\n⚠️ 같은 이름 Team 중복: "${name}"`);
      for (const t of items) console.log(`  id=${t.id} extId=${t.externalId}`);
    }
  }

  // 모든 리그에서 중복 매치 (sample)
  console.log(`\n=== 전체 리그 중복 매치 (다음 7일 SCHEDULED) ===`);
  const all = await prisma.match.findMany({
    where: { startTime: { gte: now, lte: future }, status: "SCHEDULED" },
    select: {
      id: true,
      externalId: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const allGroups = new Map<string, typeof all>();
  for (const m of all) {
    const day = m.startTime.toISOString().slice(0, 13); // 시간 단위
    const teamKey = [m.homeTeam.name, m.awayTeam.name].sort().join("|");
    const key = `${m.league}__${day}__${teamKey}`;
    const arr = allGroups.get(key) ?? [];
    arr.push(m);
    allGroups.set(key, arr);
  }
  const allDups = [...allGroups.entries()].filter(([, items]) => items.length > 1);
  console.log(`총 ${allDups.length}개 중복 그룹\n`);
  for (const [key, items] of allDups.slice(0, 20)) {
    console.log(`▼ ${key} — ${items.length} rows`);
    for (const m of items) {
      console.log(`  id=${m.id} extId=${m.externalId}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
