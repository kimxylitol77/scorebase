// v4 — 매핑 정밀화:
//   (1) MANUAL_OVERRIDES — v4 task 결과 30팀 명시적 매핑 (CSL/UCL/AFC_CL/COPA_LIB)
//   (2) UNMAPPABLE — ts 미추적 확정 (Sichuan Jiuniu, Shenyang Urban, Al-Ahli Jeddah)
//   (3) Normalize 강화 — apostrophe (' ' ') 제거 → Johor Darul Ta'zim 매칭 가능
//   (4) RENAME_ALIASES 확장 — CSL 구단명 변경 (SHANGHAI SIPG→Shanghai Port 등)
//   (5) 컨티넨탈 컵 cross-reference — UCL/AFC_CL 등은 자국 리그 매핑에 이미 같은 ts_id 가 있으면 우선 채택
//   (6) 자동 검수 — exact-amb + ambiguous 도 cross-reference 로 확정 → matchType 분포 향상
//   (7) 변경 diff 출력 — v2 대비 추가/정정 명시

import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { SPORTS } from "../src/lib/sports/sport-leagues";
import { toKoreanTeamName } from "../src/lib/team-names";

interface TSTeam {
  id: string;
  name?: string;
  short_name?: string;
  competition_id?: string;
  country_id?: string;
  national?: number; // 1=국가대표팀, 0=클럽
}
interface Mapping { id: string; en: string; ko: string }
interface OurTeam { id: number; league: string; externalId: string; name: string; shortName: string | null }
interface MatchedRow {
  ourId: number; ourName: string; ourLeague: string; ourExternalId: string;
  tsId: string; tsName: string; tsKo?: string; matchType: string;
}
interface UnmatchedRow { ourId: number; ourName: string; ourLeague: string; ourExternalId: string }
interface LeagueMap { code: string; ourLabel: string; tsId: string; tsEn: string; tsKo: string }

const TR_DIR = "/Users/kimss/scorebase/data/thesports-translations";
const BASE_DIR = path.join(TR_DIR, "base");
const OUT_RUNTIME = "/Users/kimss/scorebase/src/lib/sports/thesports/team-id-mapping.json";
const OUT_DUMP = path.join(TR_DIR, "_team-id-mapping.json");
const OUT_UNMATCHED = path.join(TR_DIR, "_team-id-mapping-unmatched.json");
const OUT_AMBIGUOUS = path.join(TR_DIR, "_team-id-mapping-ambiguous.json");
const OUT_DIFF = path.join(TR_DIR, "_v4-diff.json");

// ──────────────────────────────────────────────────────────────
// (1) MANUAL_OVERRIDES — task v4 grep + ts API 확인 결과
// 키: ourExternalId (DB rebuild 에도 안정) — league 와 함께 사용
// ──────────────────────────────────────────────────────────────
const MANUAL_OVERRIDES: Record<string, { league: string; tsId: string; note: string }> = {
  // UCL — 자국 리그 comp 만 ts 에 등록, 우리 league=UCL 매핑 강제 풀기
  "139":   { league: "UCL", tsId: "k82rekh3525repz",  note: "Ajax (네덜란드 자국 리그)" },
  "2980":  { league: "UCL", tsId: "l965mkyh9xyr1ge",  note: "Bodo Glimt" },
  "909":   { league: "UCL", tsId: "yl5ergphjl2r8k0",  note: "FC Copenhagen" },
  "5807":  { league: "UCL", tsId: "pxwrxlhg1lxryk0",  note: "Union Saint-Gilloise" },
  "435":   { league: "UCL", tsId: "56ypq3nhywpmd7o",  note: "Olympiacos Piraeus" },
  "10414": { league: "UCL", tsId: "56ypq3nhjnemd7o",  note: "Qarabag" },
  "494":   { league: "UCL", tsId: "vl7oqdehk56r510",  note: "Slavia Praha" },

  // CSL — 9팀 club rename / 정확한 ts 1군
  "837":   { league: "CSL", tsId: "yl5ergphjj6r8k0",  note: "Tianjin Teda → Tianjin Jinmen Tiger" },
  "5648":  { league: "CSL", tsId: "23xmvkhdp60qg8n",  note: "Chengdu Better City → Chengdu Rongcheng" },
  "1431":  { league: "CSL", tsId: "9dn1m1ghd9pmoep",  note: "Qingdao Jonoon → Qingdao Hainiu" },
  "840":   { league: "CSL", tsId: "8y39mp1hnedmojx",  note: "Henan Jianye → Henan FC" },
  "21262": { league: "CSL", tsId: "jw2r09hwn18rz84",  note: "Chongqing Tongliang Long → Chongqing Tonglianglong" },
  "836":   { league: "CSL", tsId: "8yomo4h7401q0j6",  note: "SHANGHAI SIPG → Shanghai Port" },
  "848":   { league: "CSL", tsId: "9k82rekh4jerepz",  note: "Hangzhou Greentown → Zhejiang Professional FC" },
  "844":   { league: "CSL", tsId: "z318q66hd8gqo9j",  note: "Shandong Luneng → Shandong Taishan" },
  "21263": { league: "CSL", tsId: "pxwrxlhz17zryk0",  note: "Dalian Zhixing → Dalian Yingbo" },

  // AFC_CL — 우리 league=AFC_CL 강제 풀기 + apostrophe Johor
  // Chengdu/Shanghai SIPG 는 ourExternalId 가 CSL 와 동일 (같은 팀) — AFC_CL league key 로 별도
  "AFC_CL:5648":  { league: "AFC_CL", tsId: "23xmvkhdp60qg8n", note: "Chengdu Better City (AFC)" },
  "2737":  { league: "AFC_CL", tsId: "l7oqdehn85er510", note: "Tractor Sazi (Iran)" },
  "AFC_CL:836":   { league: "AFC_CL", tsId: "8yomo4h7401q0j6", note: "Shanghai Port (AFC)" },
  "2767":  { league: "AFC_CL", tsId: "9k82rekh49zrepz", note: "Ulsan Hyundai → Ulsan HD FC" },
  "2523":  { league: "AFC_CL", tsId: "y39mp1h3v19mojx", note: "Johor Darul Takzim FC (apostrophe)" },
  "2870":  { league: "AFC_CL", tsId: "l5ergphoevor8k0", note: "Shabab Al Ahli Dubai" },
  "2874":  { league: "AFC_CL", tsId: "jw2r09hljxnrz84", note: "Sharjah → Al-Sharjah" },
  "4215":  { league: "AFC_CL", tsId: "gx7lm7phl2gm2wd", note: "Nasaf → Nasaf Qarshi" },

  // COPA_LIB
  "2840":  { league: "COPA_LIB", tsId: "jw2r09hly30rz84", note: "UCV → Universidad Central de Venezuela" },
  "450":   { league: "COPA_LIB", tsId: "gx7lm7pheg8m2wd", note: "Estudiantes L.P. → Estudiantes La Plata" },
  "1135":  { league: "COPA_LIB", tsId: "965mkyhn892r1ge", note: "Junior → Atletico Junior" },
  "1128":  { league: "COPA_LIB", tsId: "9k82rekhl61repz", note: "Independiente Medellin → Dep.Independiente Medellin" },
  "473":   { league: "COPA_LIB", tsId: "n54qllh2np4qvy9", note: "Independ. Rivadavia → Independiente Rivadavia" },
  "446":   { league: "COPA_LIB", tsId: "kjw2r09hz42rz84", note: "Lanus → Club Atlético Lanús" },
  "2994":  { league: "COPA_LIB", tsId: "y0or5jhldpkqwzv", note: "U. Catolica → CD Universidad Católica" },
};

// (2) ts 미추적 — 의도적 unmappable 표시 (재시도 안 함)
const UNMAPPABLE: Record<string, string> = {
  "CSL:5686":  "Sichuan Jiuniu — ts 미추적 (1군 없음, CSL 2부 의심)",
  "CSL:5684":  "Shenyang Urban — ts 미추적 (1군 없음)",
  "AFC_CL:2929": "Al-Ahli Jeddah — ts 1군 dump 누락 (Youth/Women 만 존재)",
};

// (3) Normalize — apostrophe 제거 추가
function normalize(name: string): string {
  let n = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[''`’´]/g, "") // 아포스트로피 모든 변형 제거 (v4 신규)
    .replace(/\s+/g, " ")
    .replace(/\b(fc|cf|sc|afc|ac|club|football club|f\.c\.|s\.c\.|c\.f\.|sv|de|du)\b\.?/g, "")
    .replace(/[^\w가-힣\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [k, v] of ALIASES) {
    if (n === k) n = v;
  }
  return n;
}

// (4) RENAME_ALIASES — v2 기본 + v4 확장 (자동 매핑 시 사용)
const ALIASES: Array<[string, string]> = [
  // v2 유지
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

// ts 팀 dump 로드
const tsTeams: TSTeam[] = [];
for (const f of readdirSync(BASE_DIR).filter((x) => x.startsWith("team_page"))) {
  const d = JSON.parse(readFileSync(path.join(BASE_DIR, f), "utf-8"));
  if (Array.isArray(d.results)) tsTeams.push(...d.results);
}
const tsById = new Map(tsTeams.map((t) => [t.id, t]));

const tsKoMapping: Mapping[] = JSON.parse(readFileSync(path.join(TR_DIR, "_team-mapping.json"), "utf-8"));
const tsIdToKo = new Map<string, string>();
for (const m of tsKoMapping) tsIdToKo.set(m.id, m.ko);
const tsKoToIds = new Map<string, string[]>();
for (const m of tsKoMapping) {
  const arr = tsKoToIds.get(m.ko) ?? [];
  arr.push(m.id);
  tsKoToIds.set(m.ko, arr);
}

const ourLeagueToTsComp: LeagueMap[] = JSON.parse(readFileSync(path.join(TR_DIR, "_our-leagues-thesports-ids.json"), "utf-8"));
const leagueToTsComp = new Map<string, string>();
for (const m of ourLeagueToTsComp) leagueToTsComp.set(m.code, m.tsId);

// ts 영문 lookup
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

// (5) 컨티넨탈 컵 — 자국 comp 매칭 강제 풀기
const CONTINENTAL_LEAGUES = new Set([
  "UCL", "UEL", "UECL", "AFC_CL", "AFC_CL_TWO", "AFC_U23",
  "COPA_LIB", "COPA_SUD", "CLUB_WORLD_CUP", "WORLD_CUP",
]);

// 국가대표팀 리그 (cross-ref 시 ts.national 일치 강제)
const NATIONAL_LEAGUES = new Set(["WORLD_CUP", "AFC_U23"]);

function lookupOverride(t: OurTeam): { tsId: string; matchType: string; note: string } | null {
  const composite = `${t.league}:${t.externalId}`;
  if (UNMAPPABLE[composite]) return null; // unmappable 명시
  const direct = MANUAL_OVERRIDES[composite] ?? MANUAL_OVERRIDES[t.externalId];
  if (direct && (direct.league === t.league)) {
    return { tsId: direct.tsId, matchType: "override", note: direct.note };
  }
  return null;
}

async function main() {
  const soccerLeagues = SPORTS.find((s) => s.code === "soccer")!.leagues;
  const ourTeams: OurTeam[] = await prisma.team.findMany({
    where: { league: { in: soccerLeagues } },
    select: { id: true, league: true, externalId: true, name: true, shortName: true },
  });

  // v2 결과 로드 (diff 계산용)
  const v2Map = new Map<number, MatchedRow>();
  if (existsSync(OUT_RUNTIME)) {
    const v2: MatchedRow[] = JSON.parse(readFileSync(OUT_RUNTIME, "utf-8"));
    for (const m of v2) v2Map.set(m.ourId, m);
  }

  const matched: MatchedRow[] = [];
  const stillUnmatched: UnmatchedRow[] = [];
  const ambiguous: { ourId: number; ourName: string; ourLeague: string; candidates: { tsId: string; tsName: string; reason?: string }[] }[] = [];

  // pass 1: override + 자동 매핑
  for (const t of ourTeams) {
    // (a) override 우선
    const ovr = lookupOverride(t);
    if (ovr) {
      matched.push({
        ourId: t.id, ourName: t.name, ourLeague: t.league, ourExternalId: t.externalId,
        tsId: ovr.tsId, tsName: tsById.get(ovr.tsId)?.name ?? "?",
        tsKo: tsIdToKo.get(ovr.tsId), matchType: ovr.matchType,
      });
      continue;
    }
    if (UNMAPPABLE[`${t.league}:${t.externalId}`]) {
      stillUnmatched.push({ ourId: t.id, ourName: t.name, ourLeague: t.league, ourExternalId: t.externalId });
      continue;
    }

    const targetCompId = leagueToTsComp.get(t.league);
    const isContinental = CONTINENTAL_LEAGUES.has(t.league);
    const tries: string[] = [normalize(t.name)];
    if (t.shortName) tries.push(normalize(t.shortName));

    let found: TSTeam | undefined;
    let matchType = "exact";

    for (const tryName of tries) {
      const cands = tsByNorm.get(tryName) ?? [];
      if (cands.length === 0) continue;

      // 컨티넨탈 컵: comp 강제 풀고 country/uniqueness 로 판단
      if (isContinental) {
        if (cands.length === 1) {
          found = cands[0]; matchType = "exact"; break;
        }
        // 여러 후보 — ambiguous 표시 (cross-reference 는 pass 2 에서)
        ambiguous.push({
          ourId: t.id, ourName: t.name, ourLeague: t.league,
          candidates: cands.map((c) => ({ tsId: c.id, tsName: c.name ?? "?", reason: `comp=${c.competition_id?.slice(0,8) ?? "-"}` })),
        });
        continue;
      }

      const sameLeague = cands.find((c) => c.competition_id === targetCompId);
      if (sameLeague) { found = sameLeague; matchType = "exact+comp"; break; }
      if (cands.length === 1) { found = cands[0]; matchType = "exact"; break; }
      // 같은 league 후보 없는 다중 — ambiguous 저장
      ambiguous.push({
        ourId: t.id, ourName: t.name, ourLeague: t.league,
        candidates: cands.map((c) => ({ tsId: c.id, tsName: c.name ?? "?", reason: `comp=${c.competition_id?.slice(0,8) ?? "-"}` })),
      });
      found = cands[0]; matchType = "exact-amb"; break;
    }

    if (!found && targetCompId) {
      const ourKo = toKoreanTeamName(t.name);
      if (ourKo && ourKo !== t.name) {
        const ids = tsKoToIds.get(ourKo) ?? [];
        for (const id of ids) {
          const tt = tsById.get(id);
          if (tt && tt.competition_id === targetCompId) {
            found = tt; matchType = "ko-fallback+comp";
            break;
          }
        }
      }
    }

    if (found) {
      matched.push({
        ourId: t.id, ourName: t.name, ourLeague: t.league, ourExternalId: t.externalId,
        tsId: found.id, tsName: found.name ?? "",
        tsKo: tsIdToKo.get(found.id), matchType,
      });
    } else {
      stillUnmatched.push({
        ourId: t.id, ourName: t.name, ourLeague: t.league, ourExternalId: t.externalId,
      });
    }
  }

  // (6) pass 2: 컨티넨탈 컵 ambiguous 자동 검수 — cross-reference 로 확정
  // 우리 다른 리그 매핑에 같은 ts_id 가 이미 있고 같은 ourName 이면 그 ts_id 채택
  const tsIdByName = new Map<string, Map<string, string>>(); // norm(ourName) → league → tsId
  for (const m of matched) {
    const key = normalize(m.ourName);
    if (!tsIdByName.has(key)) tsIdByName.set(key, new Map());
    tsIdByName.get(key)!.set(m.ourLeague, m.tsId);
  }

  // ambiguous 다시 돌면서 cross-ref 가능한 것 matched 로 옮기기
  const ambResolved: typeof ambiguous = [];
  const ambUnresolved: typeof ambiguous = [];
  for (const amb of ambiguous) {
    const key = normalize(amb.ourName);
    const byLeague = tsIdByName.get(key);
    const knownTsIds = byLeague ? new Set(byLeague.values()) : new Set<string>();
    const wantNational = NATIONAL_LEAGUES.has(amb.ourLeague);

    // cross-ref 시 ts.national flag mismatch 차단 (Qatar 국가팀 ↔ Qatar SC 클럽 분리)
    const hit = amb.candidates.find((c) => {
      if (!knownTsIds.has(c.tsId)) return false;
      const ts = tsById.get(c.tsId);
      if (!ts) return false;
      const isNational = ts.national === 1;
      if (wantNational !== isNational) return false;
      return true;
    });

    if (hit) {
      ambResolved.push(amb);
      const existing = matched.find((m) => m.ourId === amb.ourId);
      if (existing) {
        if (existing.tsId !== hit.tsId || existing.matchType === "exact-amb") {
          existing.tsId = hit.tsId;
          existing.tsName = tsById.get(hit.tsId)?.name ?? existing.tsName;
          existing.tsKo = tsIdToKo.get(hit.tsId);
          existing.matchType = "cross-ref";
        }
      } else {
        matched.push({
          ourId: amb.ourId, ourName: amb.ourName, ourLeague: amb.ourLeague,
          ourExternalId: ourTeams.find((t) => t.id === amb.ourId)!.externalId,
          tsId: hit.tsId, tsName: tsById.get(hit.tsId)?.name ?? hit.tsName,
          tsKo: tsIdToKo.get(hit.tsId), matchType: "cross-ref",
        });
        const ui = stillUnmatched.findIndex((u) => u.ourId === amb.ourId);
        if (ui >= 0) stillUnmatched.splice(ui, 1);
      }
    } else {
      // cross-ref 실패 — v2 동작 보존: 첫 후보로 fallback 매핑 (matchType=exact-amb)
      // 단 컨티넨탈+국가팀 mismatch 인 경우 national 후보가 있으면 우선
      const existing = matched.find((m) => m.ourId === amb.ourId);
      let fallback = amb.candidates[0];
      if (wantNational) {
        const nat = amb.candidates.find((c) => tsById.get(c.tsId)?.national === 1);
        if (nat) fallback = nat;
      } else {
        const club = amb.candidates.find((c) => tsById.get(c.tsId)?.national !== 1);
        if (club) fallback = club;
      }
      if (!existing) {
        // 컨티넨탈 케이스에서 아직 matched 에 없는 것 — v2 동작 (첫 후보 fallback)
        matched.push({
          ourId: amb.ourId, ourName: amb.ourName, ourLeague: amb.ourLeague,
          ourExternalId: ourTeams.find((t) => t.id === amb.ourId)!.externalId,
          tsId: fallback.tsId, tsName: tsById.get(fallback.tsId)?.name ?? fallback.tsName,
          tsKo: tsIdToKo.get(fallback.tsId), matchType: "exact-amb",
        });
        const ui = stillUnmatched.findIndex((u) => u.ourId === amb.ourId);
        if (ui >= 0) stillUnmatched.splice(ui, 1);
      }
      ambUnresolved.push(amb);
    }
  }

  // diff 계산
  const diff = {
    added: matched.filter((m) => !v2Map.has(m.ourId)).map((m) => ({ ourId: m.ourId, ourLeague: m.ourLeague, ourName: m.ourName, tsId: m.tsId, tsName: m.tsName, matchType: m.matchType })),
    changed: matched.filter((m) => {
      const v = v2Map.get(m.ourId);
      return v && v.tsId !== m.tsId;
    }).map((m) => ({ ourId: m.ourId, ourLeague: m.ourLeague, ourName: m.ourName, v2_tsId: v2Map.get(m.ourId)!.tsId, v4_tsId: m.tsId, matchType: m.matchType })),
    removed: [...v2Map.keys()].filter((id) => !matched.some((m) => m.ourId === id)).map((id) => v2Map.get(id)!),
  };

  console.log(`\n=== v4 매핑 결과 ===`);
  console.log(`총 우리 축구 팀: ${ourTeams.length}`);
  console.log(`✅ 매핑됨: ${matched.length}`);
  console.log(`❌ 미매핑: ${stillUnmatched.length}`);

  const byType: Record<string, number> = {};
  for (const m of matched) byType[m.matchType] = (byType[m.matchType] ?? 0) + 1;
  console.log("\n[matchType 분포]");
  for (const [k, v] of Object.entries(byType).sort(([, a], [, b]) => b - a)) console.log(`  ${k}: ${v}`);

  console.log(`\n[v2 → v4 diff]`);
  console.log(`  추가: ${diff.added.length}`);
  console.log(`  정정: ${diff.changed.length}`);
  console.log(`  제거: ${diff.removed.length}`);

  if (diff.added.length > 0) {
    console.log(`\n[추가된 매핑 처음 20개]`);
    for (const a of diff.added.slice(0, 20)) {
      console.log(`  ${a.ourLeague.padEnd(12)} ${a.ourName.padEnd(35)} → ${a.tsName}  [${a.matchType}]`);
    }
  }
  if (diff.changed.length > 0) {
    console.log(`\n[정정된 매핑 (cross-ref 등)]`);
    for (const c of diff.changed.slice(0, 20)) {
      console.log(`  ${c.ourLeague.padEnd(12)} ${c.ourName.padEnd(35)} ${c.v2_tsId} → ${c.v4_tsId}  [${c.matchType}]`);
    }
  }

  // 남은 unmappable 리포트
  const unmappableSeen = new Set(Object.keys(UNMAPPABLE));
  const unmapHit = stillUnmatched.filter((u) => unmappableSeen.has(`${u.ourLeague}:${u.ourExternalId}`));
  console.log(`\n[unmappable 표시 적용됨: ${unmapHit.length}건]`);
  for (const u of unmapHit) {
    console.log(`  ${u.ourLeague} ${u.ourName} — ${UNMAPPABLE[`${u.ourLeague}:${u.ourExternalId}`]}`);
  }

  console.log(`\n[자동 검수 후 남은 ambiguous: ${ambUnresolved.length}건]`);
  for (const a of ambUnresolved.slice(0, 10)) {
    console.log(`  ${a.ourLeague} ${a.ourName} — ${a.candidates.length} candidates`);
  }

  // 저장
  writeFileSync(OUT_RUNTIME, JSON.stringify(matched, null, 2));
  writeFileSync(OUT_DUMP, JSON.stringify(matched, null, 2));
  writeFileSync(OUT_UNMATCHED, JSON.stringify(stillUnmatched, null, 2));
  writeFileSync(OUT_AMBIGUOUS, JSON.stringify(ambUnresolved, null, 2));
  writeFileSync(OUT_DIFF, JSON.stringify(diff, null, 2));
  console.log(`\n저장 완료:`);
  console.log(`  runtime: ${OUT_RUNTIME}`);
  console.log(`  diff: ${OUT_DIFF}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
