// TheSports dump 분석 — 영문 ↔ 한국어 매핑 추출 + 우리 team-names.ts 보강 후보 식별
import { readFileSync, readdirSync, writeFileSync } from "fs";
import path from "path";

interface TSEntry {
  id: string;
  name?: string;
  name_ko?: string;
  [k: string]: unknown;
}

const TR_DIR = "/Users/kimss/scorebase/data/thesports-translations";
const BASE_DIR = path.join(TR_DIR, "base");

function loadPages(dir: string, prefix: string): TSEntry[] {
  const out: TSEntry[] = [];
  const files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  for (const f of files) {
    const d = JSON.parse(readFileSync(path.join(dir, f), "utf-8"));
    if (Array.isArray(d.results)) out.push(...d.results);
  }
  return out;
}

function buildIdToName(entries: TSEntry[], field: "name" | "name_ko"): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of entries) {
    const v = e[field];
    if (typeof v === "string" && v.trim()) m.set(e.id, v.trim());
  }
  return m;
}

function joinByID(
  base: Map<string, string>,
  ko: Map<string, string>,
): Array<{ id: string; en: string; ko: string }> {
  const out: Array<{ id: string; en: string; ko: string }> = [];
  for (const [id, en] of base) {
    const k = ko.get(id);
    if (k) out.push({ id, en, ko: k });
  }
  return out;
}

// 1. team
const teamBase = loadPages(BASE_DIR, "team_page");
const teamKo = loadPages(TR_DIR, "type4_page");
const teamMap = joinByID(buildIdToName(teamBase, "name"), buildIdToName(teamKo, "name_ko"));
console.log(`팀: base=${teamBase.length}, ko=${teamKo.length}, joined=${teamMap.length}`);

// 2. competition
const compBase = loadPages(BASE_DIR, "comp_page");
const compKo = loadPages(TR_DIR, "type3_page");
const compMap = joinByID(buildIdToName(compBase, "name"), buildIdToName(compKo, "name_ko"));
console.log(`리그: base=${compBase.length}, ko=${compKo.length}, joined=${compMap.length}`);

// 3. 기존 team-names.ts 와 비교
const teamNamesPath = "/Users/kimss/scorebase/src/lib/team-names.ts";
const teamNamesSource = readFileSync(teamNamesPath, "utf-8");
const existingMappings = new Map<string, string>();
const re = /^\s*"([^"]+)":\s*"([^"]+)",?/gm;
let match: RegExpExecArray | null;
while ((match = re.exec(teamNamesSource)) !== null) {
  existingMappings.set(match[1], match[2]);
}
console.log(`\n기존 team-names.ts 매핑: ${existingMappings.size}개`);

// 4. TheSports 매핑 중 우리 사전에 없는 영문 키 카운트
const missingInOurs: Array<{ en: string; ko: string }> = [];
const conflicting: Array<{ en: string; ourKo: string; tsKo: string }> = [];
for (const { en, ko } of teamMap) {
  const ours = existingMappings.get(en);
  if (!ours) {
    missingInOurs.push({ en, ko });
  } else if (ours !== ko) {
    conflicting.push({ en, ourKo: ours, tsKo: ko });
  }
}
console.log(`\n=== 팀 비교 ===`);
console.log(`우리 사전에 없는 영문 (TheSports에는 있음): ${missingInOurs.length}`);
console.log(`한국어 다른 매핑: ${conflicting.length}`);

console.log("\n--- 누락 샘플 (처음 20개, 대중적 팀 우선) ---");
const popular = missingInOurs.filter(
  (m) => !/U\d+|Women|Reserves|Academy|II|\bB$|U[12]\d/i.test(m.en) && m.en.length < 35,
);
for (const m of popular.slice(0, 20)) console.log(`  ${m.en} → ${m.ko}`);

console.log("\n--- 충돌 샘플 (처음 10개) ---");
for (const c of conflicting.slice(0, 10)) console.log(`  ${c.en}: ours="${c.ourKo}" / ts="${c.tsKo}"`);

// 5. 결과 저장 (다음 단계 보강 작업용)
writeFileSync(
  "/Users/kimss/scorebase/data/thesports-translations/_team-mapping.json",
  JSON.stringify(teamMap, null, 2),
);
writeFileSync(
  "/Users/kimss/scorebase/data/thesports-translations/_competition-mapping.json",
  JSON.stringify(compMap, null, 2),
);
writeFileSync(
  "/Users/kimss/scorebase/data/thesports-translations/_team-missing-in-ours.json",
  JSON.stringify(missingInOurs, null, 2),
);
writeFileSync(
  "/Users/kimss/scorebase/data/thesports-translations/_team-conflicting.json",
  JSON.stringify(conflicting, null, 2),
);
console.log("\n저장 완료 → data/thesports-translations/_*.json");
