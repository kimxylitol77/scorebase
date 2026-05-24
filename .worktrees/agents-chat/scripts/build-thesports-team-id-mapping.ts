// v2 — 매핑 비율 끌어올리기:
//   (1) alias 사전 (Internazionale↔Inter 등)
//   (2) competition_id 매칭 (같은 리그 우선)
//   (3) accent / 특수문자 normalize 강화
//   (4) 한국어 이름 fallback (toKoreanTeamName)

import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { SPORTS } from "../src/lib/sports/sport-leagues";
import { toKoreanTeamName } from "../src/lib/team-names";

interface TSTeam {
  id: string;
  name?: string;
  short_name?: string;
  competition_id?: string;
}

interface Mapping { id: string; en: string; ko: string }

const BASE_DIR = "/Users/kimss/scorebase/data/thesports-translations/base";
const TR_DIR = "/Users/kimss/scorebase/data/thesports-translations";

// 1. TheSports 팀 + 한국어 매핑 로드
const tsTeams: TSTeam[] = [];
for (const f of readdirSync(BASE_DIR).filter((x) => x.startsWith("team_page"))) {
  const d = JSON.parse(readFileSync(path.join(BASE_DIR, f), "utf-8"));
  if (Array.isArray(d.results)) tsTeams.push(...d.results);
}

const tsKoMapping: Mapping[] = JSON.parse(
  readFileSync(path.join(TR_DIR, "_team-mapping.json"), "utf-8"),
);
const tsIdToKo = new Map<string, string>();
for (const m of tsKoMapping) tsIdToKo.set(m.id, m.ko);

// 우리 league → thesports competition_id
interface LeagueMapping { code: string; ourLabel: string; tsId: string; tsEn: string; tsKo: string }
const ourLeagueToTsComp: LeagueMapping[] = JSON.parse(
  readFileSync(path.join(TR_DIR, "_our-leagues-thesports-ids.json"), "utf-8"),
);
const leagueToTsComp = new Map<string, string>();
for (const m of ourLeagueToTsComp) {
  leagueToTsComp.set(m.code, m.tsId);
}

// alias 사전 — 정규화 후 영문 별칭 (key → 정규형 value)
const ALIASES: Array<[string, string]> = [
  ["internazionale", "inter milan"],
  ["inter", "inter milan"],
  ["borussia monchengladbach", "borussia monchengladbach"],
  ["mgladbach", "borussia monchengladbach"],
  ["celta vigo", "celta vigo"],
  ["celta", "celta vigo"],
  ["hamburg", "hamburger"],
  ["hamburg sv", "hamburger"],
  ["man united", "manchester united"],
  ["man utd", "manchester united"],
  ["man city", "manchester city"],
  ["psg", "paris saintgermain"],
  ["paris sg", "paris saintgermain"],
  ["paris saint germain", "paris saintgermain"],
  ["spurs", "tottenham"],
  ["wolves", "wolverhampton"],
  ["leicester", "leicester city"],
  ["west ham", "west ham united"],
  ["newcastle", "newcastle united"],
  ["lafc", "los angeles"],
  ["la galaxy", "los angeles galaxy"],
  ["inter miami", "inter miami"],
  ["inter miami cf", "inter miami"],
  ["austin", "austin"],
  ["charlotte", "charlotte"],
  ["san diego", "san diego"],
  ["cf montreal", "cf montreal"],
  ["nottingham", "nottingham forest"],
  ["brighton hove", "brighton hove albion"],
  ["fc cologne", "1 koln"],
  ["cologne", "1 koln"],
  ["le havre", "le havre"],
  ["bosnia herzegovina", "bosnia and herzegovina"],
  ["ivory coast", "cote divoire"],
];

function normalize(name: string): string {
  let n = name
    .toLowerCase()
    // accent 제거: NFD + diacritic strip
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(fc|cf|sc|afc|ac|club|football club|f\.c\.|s\.c\.|c\.f\.|sv|de|du)\b\.?/g, "")
    .replace(/[^\w가-힣\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // alias 적용 (단방향만)
  for (const [k, v] of ALIASES) {
    if (n === k) n = v;
  }
  return n;
}

// TheSports 영문 lookup: normalized name → 팀 list (competition_id 도 포함)
const tsByNorm = new Map<string, TSTeam[]>();
for (const t of tsTeams) {
  const norms = new Set<string>();
  if (t.name) norms.add(normalize(t.name));
  if (t.short_name) norms.add(normalize(t.short_name));
  for (const n of norms) {
    if (!n) continue;
    const arr = tsByNorm.get(n) ?? [];
    arr.push(t);
    tsByNorm.set(n, arr);
  }
}

// 한국어 lookup: ko → ts team id list (한국어 fallback 용)
const tsKoToIds = new Map<string, string[]>();
for (const m of tsKoMapping) {
  const arr = tsKoToIds.get(m.ko) ?? [];
  arr.push(m.id);
  tsKoToIds.set(m.ko, arr);
}

async function main() {
  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;
  const ourTeams = await prisma.team.findMany({
    where: { league: { in: soccerLeagues } },
    select: { id: true, league: true, externalId: true, name: true, shortName: true },
  });

  const matched: Array<{
    ourId: number; ourName: string; ourLeague: string; ourExternalId: string;
    tsId: string; tsName: string; tsKo?: string; matchType: string;
  }> = [];
  const stillUnmatched: Array<{
    ourId: number; ourName: string; ourLeague: string; ourExternalId: string;
  }> = [];

  for (const t of ourTeams) {
    const targetCompId = leagueToTsComp.get(t.league); // 같은 ts 리그 안 우선
    const tries: string[] = [];
    tries.push(normalize(t.name));
    if (t.shortName) tries.push(normalize(t.shortName));

    let found: TSTeam | undefined;
    let matchType = "exact";

    // 1. 정확 정규화 매칭 (competition_id 일치 우선)
    for (const tryName of tries) {
      const cands = tsByNorm.get(tryName) ?? [];
      if (cands.length === 0) continue;
      const sameLeague = cands.find((c) => c.competition_id === targetCompId);
      if (sameLeague) { found = sameLeague; matchType = "exact+comp"; break; }
      if (cands.length === 1) { found = cands[0]; matchType = "exact"; break; }
      // 충돌 시 첫 번째 (fallback)
      found = cands[0]; matchType = "exact-amb"; break;
    }

    // 2. 한국어 fallback — toKoreanTeamName + ts name_ko 매칭 (같은 competition_id 만 — 노이즈 제거)
    if (!found && targetCompId) {
      const ourKo = toKoreanTeamName(t.name);
      if (ourKo && ourKo !== t.name) {
        const ids = tsKoToIds.get(ourKo) ?? [];
        for (const id of ids) {
          const tt = tsTeams.find((x) => x.id === id);
          if (tt && tt.competition_id === targetCompId) {
            found = tt; matchType = "ko-fallback+comp";
            break;
          }
        }
      }
    }

    if (found) {
      matched.push({
        ourId: t.id,
        ourName: t.name,
        ourLeague: t.league,
        ourExternalId: t.externalId,
        tsId: found.id,
        tsName: found.name ?? "",
        tsKo: tsIdToKo.get(found.id),
        matchType,
      });
    } else {
      stillUnmatched.push({
        ourId: t.id,
        ourName: t.name,
        ourLeague: t.league,
        ourExternalId: t.externalId,
      });
    }
  }

  console.log(`\n=== v2 매핑 결과 ===`);
  console.log(`총 우리 축구 팀: ${ourTeams.length}`);
  console.log(`✅ 매핑됨: ${matched.length}`);
  console.log(`❌ 매핑 못 함: ${stillUnmatched.length}\n`);

  // matchType 분포
  const byType: Record<string, number> = {};
  for (const m of matched) byType[m.matchType] = (byType[m.matchType] ?? 0) + 1;
  console.log("matchType 분포:");
  for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);

  // 리그별 미매핑 분포
  const unmatchedByLeague: Record<string, number> = {};
  for (const u of stillUnmatched) unmatchedByLeague[u.ourLeague] = (unmatchedByLeague[u.ourLeague] ?? 0) + 1;
  console.log("\n[미매핑 리그별]");
  for (const [k, v] of Object.entries(unmatchedByLeague).sort(([, a], [, b]) => b - a).slice(0, 15)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\n[ko-fallback 매핑 샘플 처음 8개]");
  for (const m of matched.filter((m) => m.matchType === "ko-fallback").slice(0, 8)) {
    console.log(`  ${m.ourName} → ${m.tsName} | ko=${m.tsKo}`);
  }

  console.log("\n[exact-amb (충돌, 첫번째 fallback) 샘플 처음 5개]");
  for (const m of matched.filter((m) => m.matchType === "exact-amb").slice(0, 5)) {
    console.log(`  ${m.ourLeague} ${m.ourName} → ${m.tsName} (${m.tsId})`);
  }

  console.log("\n[미매핑 샘플 처음 15개]");
  for (const u of stillUnmatched.slice(0, 15)) console.log(`  ${u.ourLeague} ${u.ourName}`);

  writeFileSync(
    "/Users/kimss/scorebase/data/thesports-translations/_team-id-mapping.json",
    JSON.stringify(matched, null, 2),
  );
  writeFileSync(
    "/Users/kimss/scorebase/data/thesports-translations/_team-id-mapping-unmatched.json",
    JSON.stringify(stillUnmatched, null, 2),
  );
  console.log("\n저장 완료");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
