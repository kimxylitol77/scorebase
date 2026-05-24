// DB 운영 중인 축구 팀 vs TheSports 매핑 — 우리 사전에 없는 것만 추출 → team-names.ts 추가 후보 생성
import { readFileSync, writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { SPORTS } from "../src/lib/sports/sport-leagues";

interface Mapping { id: string; en: string; ko: string }

async function main() {
  // 1. DB 운영 축구 팀 (영문 name) 모두 가져오기
  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;
  const teams = await prisma.team.findMany({
    where: { league: { in: soccerLeagues } },
    select: { id: true, name: true, league: true },
  });
  console.log(`DB 운영 축구 팀: ${teams.length}개`);

  // 2. TheSports 매핑 로드 (영문 -> 한국어, key: 영문)
  const tsMap: Mapping[] = JSON.parse(
    readFileSync("/Users/kimss/scorebase/data/thesports-translations/_team-mapping.json", "utf-8"),
  );
  const tsByEn = new Map<string, string>();
  for (const { en, ko } of tsMap) {
    // 중복 시 첫 번째만 (또는 더 짧은 ko 우선 — 일관성 위해)
    const existing = tsByEn.get(en);
    if (!existing || ko.length < existing.length) tsByEn.set(en, ko);
  }
  console.log(`TheSports 매핑 (영문 unique): ${tsByEn.size}개`);

  // 3. 기존 team-names.ts 파싱
  const teamNamesSource = readFileSync("/Users/kimss/scorebase/src/lib/team-names.ts", "utf-8");
  const existingMappings = new Map<string, string>();
  const re = /^\s*"([^"]+)":\s*"([^"]+)",?/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(teamNamesSource)) !== null) {
    existingMappings.set(m[1], m[2]);
  }
  console.log(`기존 team-names.ts: ${existingMappings.size}개`);

  // 4. DB 팀 중 — 사전에 없고 TheSports에 한국어가 있는 것만
  const additions: { league: string; en: string; ko: string }[] = [];
  const missingFromBoth: { league: string; en: string }[] = [];
  let alreadyMapped = 0;

  for (const t of teams) {
    if (existingMappings.has(t.name)) {
      alreadyMapped++;
      continue;
    }
    const ko = tsByEn.get(t.name);
    if (ko) {
      additions.push({ league: t.league, en: t.name, ko });
    } else {
      missingFromBoth.push({ league: t.league, en: t.name });
    }
  }

  console.log(`\n=== 결과 ===`);
  console.log(`이미 사전에 있음: ${alreadyMapped}`);
  console.log(`TheSports로 보강 가능: ${additions.length}`);
  console.log(`둘 다 없음 (수동 필요): ${missingFromBoth.length}`);

  // 5. 리그별 분포
  const byLeague: Record<string, number> = {};
  for (const a of additions) byLeague[a.league] = (byLeague[a.league] ?? 0) + 1;
  console.log("\n[리그별 보강 가능 카운트]");
  for (const [lg, n] of Object.entries(byLeague).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${lg}: ${n}`);
  }

  console.log("\n[샘플 (처음 20개)]");
  for (const a of additions.slice(0, 20)) {
    console.log(`  "${a.en}": "${a.ko}",  // ${a.league}`);
  }

  console.log("\n[수동 필요 샘플 (처음 10개)]");
  for (const m of missingFromBoth.slice(0, 10)) {
    console.log(`  ${m.en} (${m.league})`);
  }

  // 6. 저장
  writeFileSync(
    "/Users/kimss/scorebase/data/thesports-translations/_db-team-additions.json",
    JSON.stringify(additions, null, 2),
  );
  writeFileSync(
    "/Users/kimss/scorebase/data/thesports-translations/_db-team-still-missing.json",
    JSON.stringify(missingFromBoth, null, 2),
  );

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
