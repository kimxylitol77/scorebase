// scripts/enrich-baseball-team-mapping.ts
// 9개 야구 리그 (CPBL / WBC / WBSC_PREMIER_12 / ASIAN_GAMES_BB / OLYMPICS_BB /
// KBO_FUTURES / NPB_MINOR / CARIBBEAN_SERIES / LMB) 의 TheSports 팀을
// DB Team + TeamSourceId + baseball-team-id-mapping.json 에 enrichment.
//
// 흐름:
//   1) 9개 unique_tournament_id 의 baseball/match/diary ±30일 sweep → ts team id 수집
//   2) 각 tsTeamId 별 baseball/team/list?uuid={X} → name/short_name/abbr/country/logo
//   3) DB Team auto-create (league=리그 코드) + TeamSourceId (source='thesports')
//      + src/lib/sports/thesports/baseball-team-id-mapping.json append + sync
//
// 사용:
//   npx tsx scripts/enrich-baseball-team-mapping.ts            # dry-run (출력만)
//   npx tsx scripts/enrich-baseball-team-mapping.ts --apply    # 실제 DB upsert + JSON 저장
//
// IP whitelist 필수 (THESPORTS_USER + SECRET).

import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { TS_BASEBALL_TOURNAMENT_ID } from "../src/lib/sports/thesports/types";

const APPLY = process.argv.includes("--apply");
const SWEEP_DAYS_BACK = 30;
const SWEEP_DAYS_FWD = 30;

const TS_BASE = "https://api.thesports.com";
const env: Record<string, string> = {};
for (const line of readFileSync("/Users/kimss/scorebase/.env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const USER = env.THESPORTS_USER;
const SECRET = env.THESPORTS_SECRET;
if (!USER || !SECRET) throw new Error("THESPORTS env missing");

// 9개 새 리그만 — 기존 KBO/NPB/MLB 는 build-thesports-baseball-team-mapping.ts 가 담당.
const NEW_LEAGUES: Array<[string, string]> = [
  ["CPBL", TS_BASEBALL_TOURNAMENT_ID.CPBL],
  ["WBC", TS_BASEBALL_TOURNAMENT_ID.WBC],
  ["WBSC_PREMIER_12", TS_BASEBALL_TOURNAMENT_ID.WBSC_PREMIER_12],
  ["ASIAN_GAMES_BB", TS_BASEBALL_TOURNAMENT_ID.ASIAN_GAMES_BB],
  ["OLYMPICS_BB", TS_BASEBALL_TOURNAMENT_ID.OLYMPICS_BB],
  ["KBO_FUTURES", TS_BASEBALL_TOURNAMENT_ID.KBO_FUTURES],
  ["NPB_MINOR", TS_BASEBALL_TOURNAMENT_ID.NPB_MINOR],
  ["CARIBBEAN_SERIES", TS_BASEBALL_TOURNAMENT_ID.CARIBBEAN_SERIES],
  ["LMB", TS_BASEBALL_TOURNAMENT_ID.LMB],
];
const UTI_TO_LEAGUE: Record<string, string> = Object.fromEntries(
  NEW_LEAGUES.map(([lg, uti]) => [uti, lg]),
);

async function tsGet<T>(p: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(TS_BASE + p);
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<T>;
}

interface TsTeamMeta {
  id: string;
  name?: string;
  short_name?: string;
  abbr?: string;
  logo?: string;
  country_id?: string;
  national?: number;
}

interface ExistingMapping {
  ourId: number;
  ourName: string;
  ourLeague: string;
  ourExternalId: string;
  tsId: string;
  tsName: string;
  matchType?: string;
}

async function sweep(uti: string, league: string): Promise<Map<string, number>> {
  // tsTeamId → 매치 등장 횟수 (디버그용)
  const teams = new Map<string, number>();
  const now = Math.floor(Date.now() / 1000);
  let hits = 0;
  let total = 0;
  for (let d = -SWEEP_DAYS_BACK; d <= SWEEP_DAYS_FWD; d++) {
    const tsp = now + d * 86400;
    try {
      const data = await tsGet<{ code: number; results: Array<Record<string, unknown>> }>(
        "/v1/baseball/match/diary",
        { tsp },
      );
      for (const m of data.results ?? []) {
        total++;
        const matchUti = (m.unique_tournament_id as string | undefined) ?? "";
        if (matchUti !== uti) continue;
        hits++;
        const h = m.home_team_id as string | undefined;
        const a = m.away_team_id as string | undefined;
        if (h) teams.set(h, (teams.get(h) ?? 0) + 1);
        if (a) teams.set(a, (teams.get(a) ?? 0) + 1);
      }
    } catch (e) {
      console.warn(`  [${league}] diary d=${d}: ${(e as Error).message}`);
    }
    // rate-limit: 약 150ms per call → 61 calls per league * 9 = ~83s
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  [${league}] diary ${total} matches scanned, ${hits} matched UTI, ${teams.size} unique teams`);
  return teams;
}

async function fetchTeamMeta(tsId: string): Promise<TsTeamMeta | null> {
  try {
    const d = await tsGet<{ code: number; results: TsTeamMeta[] }>("/v1/baseball/team/list", { uuid: tsId });
    return d.results?.[0] ?? null;
  } catch (e) {
    console.warn(`    team ${tsId}: ${(e as Error).message}`);
    return null;
  }
}

async function main() {
  console.log(`🎯 enrich-baseball-team-mapping — ${APPLY ? "APPLY" : "DRY-RUN"} mode`);
  console.log(`   sweep ±${SWEEP_DAYS_BACK}/${SWEEP_DAYS_FWD} days × ${NEW_LEAGUES.length} leagues\n`);

  // 1. Sweep each league
  const collected: Array<{ league: string; tsId: string; matchCount: number }> = [];
  for (const [league, uti] of NEW_LEAGUES) {
    const teams = await sweep(uti, league);
    for (const [tsId, cnt] of teams) {
      collected.push({ league, tsId, matchCount: cnt });
    }
  }
  console.log(`\n총 ${collected.length} (league, tsTeamId) pair 수집`);

  // 2. Fetch team meta (병렬은 rate-limit risk → 순차 + 100ms gap)
  console.log(`\n📡 team meta fetch...`);
  const teamsByKey = new Map<string, { league: string; tsId: string; meta: TsTeamMeta; matchCount: number }>();
  for (const c of collected) {
    const key = `${c.league}|${c.tsId}`;
    if (teamsByKey.has(key)) continue;
    const meta = await fetchTeamMeta(c.tsId);
    if (!meta || !meta.name) continue;
    teamsByKey.set(key, { league: c.league, tsId: c.tsId, meta, matchCount: c.matchCount });
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(`   meta fetch 완료: ${teamsByKey.size}팀\n`);

  // 3. Summary by league
  const byLeague = new Map<string, number>();
  for (const { league } of teamsByKey.values()) {
    byLeague.set(league, (byLeague.get(league) ?? 0) + 1);
  }
  console.log(`📊 리그별 팀 수:`);
  for (const [lg] of NEW_LEAGUES) {
    console.log(`   ${lg.padEnd(20)} ${byLeague.get(lg) ?? 0}팀`);
  }

  // 4. 기존 DB Team + TeamSourceId 조회 (중복 방지)
  const allLeagues = NEW_LEAGUES.map(([lg]) => lg);
  const existingTeams = await prisma.team.findMany({
    where: { league: { in: allLeagues } },
    select: { id: true, league: true, externalId: true, name: true },
  });
  const existingByLgExt = new Map<string, { id: number; name: string }>();
  for (const t of existingTeams) {
    existingByLgExt.set(`${t.league}|${t.externalId}`, { id: t.id, name: t.name });
  }
  const existingSourceIds = await prisma.teamSourceId.findMany({
    where: { league: { in: allLeagues }, source: "thesports" },
    select: { league: true, externalId: true, teamId: true },
  });
  const existingTsByLgExt = new Map<string, number>();
  for (const s of existingSourceIds) {
    existingTsByLgExt.set(`${s.league}|${s.externalId}`, s.teamId);
  }
  console.log(`\n💾 기존 DB:`);
  console.log(`   Team (9 리그): ${existingTeams.length}`);
  console.log(`   TeamSourceId (thesports): ${existingSourceIds.length}`);

  // 5. 분류 — 신규 vs 이미 매핑됨
  const toCreate: Array<{ league: string; tsId: string; meta: TsTeamMeta; matchCount: number }> = [];
  const alreadyMapped: Array<{ league: string; tsId: string; teamId: number; meta: TsTeamMeta }> = [];
  for (const t of teamsByKey.values()) {
    const tsKey = `${t.league}|${t.tsId}`;
    if (existingTsByLgExt.has(tsKey)) {
      alreadyMapped.push({ ...t, teamId: existingTsByLgExt.get(tsKey)! });
    } else {
      toCreate.push(t);
    }
  }
  console.log(`\n🆕 신규 생성 대상: ${toCreate.length}`);
  console.log(`✅ 이미 매핑됨: ${alreadyMapped.length}\n`);

  // 6. Sample 출력 (dry-run 검증용)
  for (const [lg] of NEW_LEAGUES) {
    const samples = toCreate.filter((t) => t.league === lg).slice(0, 5);
    if (samples.length === 0) continue;
    console.log(`  [${lg}] 신규 sample (${samples.length}/${toCreate.filter((t) => t.league === lg).length}):`);
    for (const s of samples) {
      console.log(`    - ${s.meta.name?.padEnd(35)} ts=${s.tsId} (matches=${s.matchCount}, country=${s.meta.country_id ?? "?"}, national=${s.meta.national ?? 0})`);
    }
  }

  if (!APPLY) {
    console.log(`\n✋ dry-run 모드 — --apply 플래그로 실제 DB upsert + JSON 저장 진행.`);
    await prisma.$disconnect();
    return;
  }

  // 7. APPLY: Team + TeamSourceId upsert
  console.log(`\n🚀 APPLY: Team + TeamSourceId upsert 시작...`);
  let created = 0;
  let skipped = 0;
  const newMappings: ExistingMapping[] = [];

  for (const t of toCreate) {
    try {
      // Team upsert by (league, externalId=tsId)
      // 새 리그 (DB row 0개) 라서 충돌 위험 낮음. externalId 는 tsId 그대로 (api-sports 없음).
      const ext = t.tsId;
      const team = await prisma.team.upsert({
        where: { league_externalId: { league: t.league, externalId: ext } },
        update: {
          name: t.meta.name!,
          shortName: t.meta.short_name ?? t.meta.abbr ?? null,
          logoUrl: t.meta.logo ?? null,
          country: t.meta.country_id ?? null,
        },
        create: {
          league: t.league,
          externalId: ext,
          name: t.meta.name!,
          shortName: t.meta.short_name ?? t.meta.abbr ?? null,
          logoUrl: t.meta.logo ?? null,
          country: t.meta.country_id ?? null,
        },
      });
      // TeamSourceId upsert (league + source + externalId unique)
      await prisma.teamSourceId.upsert({
        where: {
          league_source_externalId: {
            league: t.league,
            source: "thesports",
            externalId: t.tsId,
          },
        },
        update: { teamId: team.id },
        create: {
          league: t.league,
          source: "thesports",
          externalId: t.tsId,
          teamId: team.id,
        },
      });
      newMappings.push({
        ourId: team.id,
        ourName: team.name,
        ourLeague: team.league,
        ourExternalId: team.externalId,
        tsId: t.tsId,
        tsName: t.meta.name!,
        matchType: "ts-only",
      });
      created++;
    } catch (e) {
      console.warn(`   ✗ ${t.league}/${t.tsId} (${t.meta.name}): ${(e as Error).message}`);
      skipped++;
    }
  }
  console.log(`\n   Team+TeamSourceId 생성: ${created}, 실패: ${skipped}`);

  // 8. JSON 두 파일 동기 갱신
  // baseball-team-id-mapping.json 은 runtime (src/lib) 만 존재 — football 처럼 data/ 사본은 없음.
  // 단일 파일이지만 KBO/NPB/MLB 기존 entry 와 merge 필수.
  const mappingFile = path.join(process.cwd(), "src/lib/sports/thesports/baseball-team-id-mapping.json");
  const existingMappings: ExistingMapping[] = existsSync(mappingFile)
    ? JSON.parse(readFileSync(mappingFile, "utf-8"))
    : [];
  // 신규 9개 리그 entry 만 새로 추가 (KBO/NPB/MLB 기존 entry 보존)
  const existingTsIds = new Set(existingMappings.map((m) => m.tsId));
  const toAppend = newMappings.filter((m) => !existingTsIds.has(m.tsId));
  // alreadyMapped 도 JSON 에 있어야 — DB 만 있고 JSON 빠진 케이스
  for (const am of alreadyMapped) {
    if (existingTsIds.has(am.tsId)) continue;
    const team = existingTeams.find((t) => t.id === am.teamId);
    if (!team) continue;
    toAppend.push({
      ourId: am.teamId,
      ourName: team.name,
      ourLeague: am.league,
      ourExternalId: team.externalId,
      tsId: am.tsId,
      tsName: am.meta.name ?? team.name,
      matchType: "ts-only",
    });
  }
  if (toAppend.length > 0) {
    const merged = [...existingMappings, ...toAppend];
    writeFileSync(mappingFile, JSON.stringify(merged, null, 2));
    console.log(`   ✏️  ${mappingFile} 에 ${toAppend.length} entry append (총 ${merged.length})`);
  } else {
    console.log(`   📄 JSON 신규 entry 없음 — 변경 skip`);
  }

  await prisma.$disconnect();
  console.log(`\n✅ enrichment 완료.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
