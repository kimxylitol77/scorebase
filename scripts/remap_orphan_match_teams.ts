/**
 * Orphan match teamId 재매핑.
 *
 * 문제: league=EPL 매치의 homeTeamId 가 league=UCL Newcastle row 를 가리키는 식.
 *       teamKoNameById.get() 실패로 'Team 11189' 같은 fallback 표시.
 *
 * 해결: 각 orphan teamId 의 name 으로 같은 league 의 Team row 를 찾아 update.
 *       match 가 카운트 0 인 cross-league row 는 그대로 둠 (UCL/UEL 매치용).
 *
 * Usage:
 *   npx tsx scripts/remap_orphan_match_teams.ts          # dry-run
 *   npx tsx scripts/remap_orphan_match_teams.ts --apply  # 실제 적용
 */
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

// 같은 팀이 source 별로 표기 다른 케이스 — orphan name → target name 별칭.
// 양방향 매칭하므로 한쪽만 등록해도 됨.
const NAME_ALIASES: Record<string, string> = {
  "Manchester City": "Man City",
  "Newcastle United": "Newcastle",
  "Tottenham Hotspur": "Tottenham",
  "Manchester United": "Man United",
  "Brighton & Hove Albion": "Brighton Hove",
  "Wolverhampton Wanderers": "Wolverhampton",
  "Nottingham Forest": "Nottingham",
  "Union St.-Gilloise": "Union St. Gilloise",
  "U. Catolica": "Universidad Catolica",
  "Sao Paulo": "São Paulo",
  "Cienciano": "Cienciano del Cusco",
  "Bolívar": "Club Bolivar",
  "Club Nacional": "Nacional",
};

function resolveTarget(
  orphanName: string,
  matchLeague: string,
  teamByNameLeague: Map<string, { id: number; externalId: string }>,
): { id: number; externalId: string } | null {
  // 1) exact
  const exact = teamByNameLeague.get(`${orphanName}|${matchLeague}`);
  if (exact) return exact;
  // 2) alias
  const alias = NAME_ALIASES[orphanName];
  if (alias) {
    const v = teamByNameLeague.get(`${alias}|${matchLeague}`);
    if (v) return v;
  }
  // 3) reverse alias (orphan 이 alias 값일 때)
  for (const [k, v] of Object.entries(NAME_ALIASES)) {
    if (v === orphanName) {
      const r = teamByNameLeague.get(`${k}|${matchLeague}`);
      if (r) return r;
    }
  }
  return null;
}

async function main() {
  const teams = await prisma.team.findMany({
    select: { id: true, league: true, name: true, externalId: true },
  });
  const teamsByLeague = new Map<string, Set<number>>();
  for (const t of teams) {
    if (!teamsByLeague.has(t.league)) teamsByLeague.set(t.league, new Set());
    teamsByLeague.get(t.league)!.add(t.id);
  }
  // (name, league) → Team row.  name 동일한 row 가 같은 league 에 1 개 있다고 가정.
  const teamByNameLeague = new Map<string, { id: number; externalId: string }>();
  for (const t of teams) {
    teamByNameLeague.set(`${t.name}|${t.league}`, { id: t.id, externalId: t.externalId });
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const matches = await prisma.match.findMany({
    select: { id: true, league: true, homeTeamId: true, awayTeamId: true },
  });

  let remapHome = 0;
  let remapAway = 0;
  const unresolved: Array<{ matchId: number; league: string; side: "home" | "away"; orphanId: number; orphanName: string; orphanLeague: string }> = [];
  const updates: Array<{ matchId: number; data: { homeTeamId?: number; awayTeamId?: number } }> = [];

  for (const m of matches) {
    const teamSet = teamsByLeague.get(m.league);
    if (!teamSet) continue;
    const homeOrphan = !teamSet.has(m.homeTeamId);
    const awayOrphan = !teamSet.has(m.awayTeamId);
    if (!homeOrphan && !awayOrphan) continue;

    const data: { homeTeamId?: number; awayTeamId?: number } = {};
    if (homeOrphan) {
      const orphan = teamById.get(m.homeTeamId);
      if (orphan) {
        const target = resolveTarget(orphan.name, m.league, teamByNameLeague);
        if (target) {
          data.homeTeamId = target.id;
          remapHome += 1;
        } else {
          unresolved.push({ matchId: m.id, league: m.league, side: "home", orphanId: orphan.id, orphanName: orphan.name, orphanLeague: orphan.league });
        }
      }
    }
    if (awayOrphan) {
      const orphan = teamById.get(m.awayTeamId);
      if (orphan) {
        const target = resolveTarget(orphan.name, m.league, teamByNameLeague);
        if (target) {
          data.awayTeamId = target.id;
          remapAway += 1;
        } else {
          unresolved.push({ matchId: m.id, league: m.league, side: "away", orphanId: orphan.id, orphanName: orphan.name, orphanLeague: orphan.league });
        }
      }
    }
    if (Object.keys(data).length > 0) {
      updates.push({ matchId: m.id, data });
    }
  }

  console.log(`=== ${APPLY ? "APPLY" : "DRY-RUN"} ===`);
  console.log(`재매핑 가능: home=${remapHome}, away=${remapAway} (총 ${updates.length} 매치)`);
  console.log(`해결 불가 (target Team 없음): ${unresolved.length} 건`);
  if (unresolved.length > 0) {
    console.log("--- 해결 불가 sample (최대 20) ---");
    for (const u of unresolved.slice(0, 20)) {
      console.log(`  match=${u.matchId} league=${u.league} side=${u.side} orphan=${u.orphanId}(${u.orphanName}, ${u.orphanLeague})`);
    }
  }

  if (!APPLY) {
    console.log("\n--- 재매핑 sample (최대 20) ---");
    for (const u of updates.slice(0, 20)) {
      console.log(`  match=${u.matchId}`, u.data);
    }
    console.log("\n--apply 붙여서 다시 실행.");
    return;
  }

  console.log("\n--- APPLY 진행 ---");
  let done = 0;
  for (const u of updates) {
    await prisma.match.update({ where: { id: u.matchId }, data: u.data });
    done += 1;
    if (done % 10 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`완료: ${done} 매치 update.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
