// LCK Team 메타 시드 — Leaguepedia Teams 테이블에서 로고·축약명 가져와 DB 갱신.
// 일회성 또는 가끔 (시즌 시작 시) 호출. 시즌 중 거의 안 변함.
//
// 사용: npx tsx src/jobs/seed-lol-teams.ts

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchLckTeams,
  lpTeamNameByExternalId,
  type LckTeamMeta,
} from "@/lib/sports/leaguepedia";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

/**
 * Leaguepedia 호출 실패 (rate limit 등) 시 fallback — LCK 10팀 hardcoded.
 * Special:FilePath URL 패턴은 Leaguepedia convention 추측. 일부 404 가능.
 */
const FALLBACK_LCK_TEAMS: LckTeamMeta[] = [
  { name: "T1", short: "T1", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/T1logo_square.png" },
  { name: "Gen.G", short: "GEN", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/Gen.Glogo_square.png" },
  { name: "Hanwha Life Esports", short: "HLE", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/Hanwha_Life_Esportslogo_square.png" },
  { name: "KT Rolster", short: "KT", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/KT_Rolsterlogo_square.png" },
  { name: "Dplus KIA", short: "DK", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/Dplus_KIAlogo_square.png" },
  { name: "DRX", short: "DRX", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/DRXlogo_square.png" },
  { name: "BNK FearX", short: "BFX", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/BNK_FEARXlogo_square.png" },
  { name: "Nongshim RedForce", short: "NS", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/Nongshim_RedForcelogo_square.png" },
  { name: "OKSavingsBank BRION", short: "BRO", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/OKSavingsBank_BRIONlogo_square.png" },
  { name: "DN Freecs", short: "DNS", region: "Korea", league: "LCK", imageUrl: "https://lol.fandom.com/wiki/Special:FilePath/DN_Freecslogo_square.png" },
];

export async function runSeedLolTeams(): Promise<{
  updated: number;
  unmatched: string[];
  fetched: number;
}> {
  console.log("[seed-lol-teams] Leaguepedia 호출…");
  let lpTeams: LckTeamMeta[] = [];
  let source = "leaguepedia";
  try {
    lpTeams = await fetchLckTeams();
    if (lpTeams.length === 0) throw new Error("empty");
  } catch (err) {
    console.warn(
      `[seed-lol-teams] Leaguepedia 실패 (${(err as Error).message}) — hardcoded fallback 사용`,
    );
    lpTeams = FALLBACK_LCK_TEAMS;
    source = "hardcoded";
  }
  console.log(`[seed-lol-teams] LCK Teams ${lpTeams.length}개 (source=${source})`);

  const dbTeams = await prisma.team.findMany({ where: { league: "LOL" } });
  let updated = 0;
  const unmatched: string[] = [];

  for (const t of dbTeams) {
    // 1) externalId 기반 hardcoded 매핑으로 직접 매치
    const lpName = lpTeamNameByExternalId(t.externalId);
    let lp = lpName
      ? lpTeams.find((x) => x.name === lpName)
      : undefined;

    // 2) fallback — 영문명 normalize 비교
    if (!lp) {
      const n = normalize(t.name);
      lp = lpTeams.find(
        (x) =>
          normalize(x.name).includes(n) ||
          n.includes(normalize(x.name)) ||
          normalize(x.short).includes(n) ||
          n.includes(normalize(x.short)),
      );
    }

    if (!lp) {
      unmatched.push(`${t.name} (externalId=${t.externalId})`);
      continue;
    }

    const newShort = lp.short || t.shortName;
    const newLogo = lp.imageUrl ?? t.logoUrl;
    if (newShort === t.shortName && newLogo === t.logoUrl) continue;

    await prisma.team.update({
      where: { id: t.id },
      data: {
        shortName: newShort,
        logoUrl: newLogo ?? undefined,
      },
    });
    console.log(
      `[seed-lol-teams] ✅ ${t.name} → short=${newShort}, logo=${newLogo?.slice(0, 60)}…`,
    );
    updated++;
  }

  if (unmatched.length > 0) {
    console.warn(`[seed-lol-teams] 매칭 실패: ${unmatched.join(", ")}`);
  }
  return { updated, unmatched, fetched: lpTeams.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSeedLolTeams()
    .then((r) =>
      console.log(
        `[seed-lol-teams] 완료 — fetched=${r.fetched} updated=${r.updated} unmatched=${r.unmatched.length}`,
      ),
    )
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
