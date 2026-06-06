// Wikidata 보강 → data/player-overrides.json (no db push, /transfers override 적용).
// 영문명 → Wikidata 검색 → 정확한 한글명(P-label) + 국적(P1532‖P27) + 커리어(P54).
//   · 이름: "긴 본명/오역" 교정용으로만 override (shouldOverrideName, 역행 방지)
//   · 국적: P1532(스포츠 국가) 우선, 없으면 P27(시민권). 국기 = ts-countries.json en 매칭
//   · 커리어: P54(소속팀) → 클럽·연도(P580/P582)·출장(P1350)·골(P1351)·임대(P1642=Q2914547)
//             국가대표(라벨 "national"/"국가대표")는 nt:true 로 분리
//   · 정밀도 가드: P54 가 있는 엔티티만 채택 (동명이인 오매칭 방지)
//   · rate-limit: 연락처 포함 UA + 429/Retry-After 대응 + adaptive pace. 리그별 점진저장(merge).
//   npx tsx --env-file=.env.local scripts/enrich-players-wikidata.ts [--league=EPL] [--limit=N] [--pace=150] [--force]
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();
// Wikimedia UA 정책: 연락처(이메일/URL) 필수 — 누락 시 더 공격적 throttle.
const UA = { "User-Agent": "scorebase/1.0 (https://xn--299a8nv7d.kr; player enrichment; kimxylitol77@gmail.com)" };
const LOAN_QID = "Q2914547"; // P1642(취득 거래) 값이 이것이면 임대

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const LEAGUE = arg("league") || "";
const LIMIT = Number(arg("limit") || "0"); // 리그별 상한 (0 = 전부)
const FORCE = process.argv.includes("--force"); // 이미 career 있는 선수도 재조회
let PACE = Number(arg("pace") || "150"); // 검색 호출 간격(ms), 429 시 자동 증가
const LEAGUES = LEAGUE ? [LEAGUE] : ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const PATH = "data/player-overrides.json";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isEnglish = (s: string) => /^[A-Za-z][A-Za-z'.\-\s]+$/.test(s);
const yr = (t?: string): number | null => (t ? parseInt(t.slice(1, 5), 10) || null : null);
const num = (a?: string): number | null => (a != null ? parseInt(a, 10) : null);
const isNT = (en?: string | null, ko?: string | null) => /national/i.test(en || "") || /국가\s*대표/.test(ko || "");

interface CareerEntry { club: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean; nt: boolean }
interface Override { nameKo?: string; country?: string; flag?: string; career?: CareerEntry[] }

// 이름 교정 여부 — 보수적: "긴 본명 축약"만 교정.
//  · 현 nameKo 없음 → Wikidata 사용
//  · Wikidata 가 토큰수가 더 적음(긴 본명 축약: 라민 야말 나스라우이… → 라민 야말) → 사용
// ⚠️ 같은-길이 swap(홀란드↔홀란 등)은 TheSports 공식 한글명을 회귀시킬 수 있어 하지 않음
//    (공식명은 language endpoint + daily 봇이 단일 진실. 이름은 부수 효과일 뿐, 본 작업은 국가/커리어)
function shouldOverrideName(cur: string | null, wiki: string | null): boolean {
  if (!wiki || wiki === cur) return false;
  if (!cur) return true;
  const ct = cur.trim().split(/\s+/).length, wt = wiki.trim().split(/\s+/).length;
  return wt < ct && wt >= 1;
}

// 국가 별칭 (Wikidata en → ts-countries en)
const COUNTRY_ALIAS: Record<string, string> = {
  "South Korea": "Korea Republic", "North Korea": "Korea DPR", "Czech Republic": "Czechia",
  "Ivory Coast": "Cote d'Ivoire", "DR Congo": "Congo DR", "Cape Verde": "Cabo Verde",
  "United States of America": "USA", "United States": "USA",
};

// status-aware fetch + JSON. 429 → Retry-After 존중 + pace 자동 증가. !ok → backoff.
async function getJSON(url: string, tries = 5): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) {
        const ra = Number(r.headers.get("retry-after"));
        PACE = Math.min(PACE + 100, 1200); // 막히면 영구적으로 느리게
        await sleep((ra > 0 ? ra * 1000 : 2000) * (i + 1));
        continue;
      }
      if (!r.ok) { await sleep(700 * (i + 1)); continue; }
      return await r.json();
    } catch { await sleep(700 * (i + 1)); }
  }
  return null;
}

// 영문명 → qid (footballer 설명 우선)
async function searchQid(name: string): Promise<string | null> {
  const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=5`);
  const arr = d?.search || [];
  return (arr.find((s: any) => /footballer|soccer|football player/i.test(s.description || "")) || arr[0])?.id || null;
}

// 엔티티 → ko라벨 + 국가Qid + P54(원시 클럽Qid·연도·통계·임대)
interface RawCareer { clubQid: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean }
interface Entity { ko: string | null; countryQid: string | null; p54: RawCareer[] }
function parseEntity(e: any): Entity | null {
  const p54: RawCareer[] = (e.claims?.P54 || []).map((c: any) => {
    const clubQid = c.mainsnak?.datavalue?.value?.id;
    const q = c.qualifiers || {};
    return {
      clubQid,
      start: yr(q.P580?.[0]?.datavalue?.value?.time) ?? yr(q.P585?.[0]?.datavalue?.value?.time),
      end: yr(q.P582?.[0]?.datavalue?.value?.time),
      apps: num(q.P1350?.[0]?.datavalue?.value?.amount),
      goals: num(q.P1351?.[0]?.datavalue?.value?.amount),
      loan: (q.P1642 || []).some((x: any) => x.datavalue?.value?.id === LOAN_QID),
    };
  }).filter((c: RawCareer) => c.clubQid);
  if (!p54.length) return null; // P54 없음 = 오매칭/저정보 → 채택 안 함(정밀도 가드)
  const ko = e.labels?.ko?.value || null;
  const countryQid = e.claims?.P1532?.[0]?.mainsnak?.datavalue?.value?.id || e.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id || null;
  return { ko, countryQid, p54 };
}

async function batchLabels(qids: string[]): Promise<Map<string, { ko: string | null; en: string | null }>> {
  const out = new Map<string, { ko: string | null; en: string | null }>();
  for (let i = 0; i < qids.length; i += 45) {
    const batch = qids.slice(i, i + 45);
    const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join("|"))}&props=labels&languages=ko%7Cen&format=json`);
    for (const q of batch) {
      const e = d?.entities?.[q];
      out.set(q, { ko: e?.labels?.ko?.value || null, en: e?.labels?.en?.value || null });
    }
    await sleep(150);
  }
  return out;
}

function loadOverrides(): Record<string, Override> {
  return fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, "utf8")) : {};
}

async function enrichLeague(league: string, flagOf: (en: string | null) => string | null, squadEn: Map<string, string>) {
  let rows = await prisma.playerMarketValue.findMany({
    where: { league, currentValue: { not: null } },
    orderBy: { currentValue: "desc" }, select: { id: true },
  });
  if (LIMIT) rows = rows.slice(0, LIMIT);
  const tsp = await prisma.theSportsPlayer.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, name: true, nameKo: true } });
  const tspMap = new Map(tsp.map((p) => [p.id, p]));
  const prev = loadOverrides();

  // 영문명 확보 (squad 1순위 → ts.name 영문)
  const enById = new Map<string, string>();
  for (const r of rows) {
    if (!FORCE && prev[r.id]?.career) continue; // 이미 채워짐 → skip (재실행 incremental)
    const p = tspMap.get(r.id);
    const en = squadEn.get(r.id) || (p && isEnglish(p.name) ? p.name : undefined);
    if (en) enById.set(r.id, en);
  }
  console.log(`[${league}] 대상 ${rows.length} | 신규 영문명 ${enById.size}`);
  if (!enById.size) return;

  // ── phase 1: 검색 → qid ──
  const qidById = new Map<string, string>();
  let done = 0;
  for (const [id, en] of enById) {
    const qid = await searchQid(en);
    if (qid) qidById.set(id, qid);
    if (++done % 100 === 0) console.log(`  [${league}] 검색 ${done}/${enById.size} | qid ${qidById.size} | pace ${PACE}`);
    await sleep(PACE);
  }

  // ── phase 2: 엔티티 배치 (labels + claims) ──
  const qids = [...new Set(qidById.values())];
  const ent = new Map<string, Entity>();
  for (let i = 0; i < qids.length; i += 45) {
    const batch = qids.slice(i, i + 45);
    const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join("|"))}&props=labels%7Cclaims&languages=ko%7Cen&format=json`);
    for (const q of batch) {
      const e = d?.entities?.[q];
      const parsed = e ? parseEntity(e) : null;
      if (parsed) ent.set(q, parsed);
    }
    await sleep(150);
  }

  // ── phase 3: 국가 + 클럽 라벨 배치 ──
  const labelQids = new Set<string>();
  for (const e of ent.values()) {
    if (e.countryQid) labelQids.add(e.countryQid);
    for (const c of e.p54) labelQids.add(c.clubQid);
  }
  const labels = await batchLabels([...labelQids]);

  // ── override 빌드 ──
  const overrides: Record<string, Override> = {};
  let nameFix = 0, countryFix = 0, careerFix = 0;
  for (const [id, qid] of qidById) {
    const e = ent.get(qid); if (!e) continue; // P54 가드 통과 못함
    const cur = tspMap.get(id)?.nameKo || null;
    const o: Override = {};
    if (shouldOverrideName(cur, e.ko)) { o.nameKo = e.ko!; nameFix++; }
    if (e.countryQid) {
      const c = labels.get(e.countryQid);
      const ko = c?.ko || c?.en;
      if (ko) { o.country = ko; const f = flagOf(c?.en || null); if (f) o.flag = f; countryFix++; }
    }
    const career: CareerEntry[] = e.p54.map((c) => {
      const lab = labels.get(c.clubQid);
      return { club: (lab?.ko || lab?.en)!, start: c.start, end: c.end, apps: c.apps, goals: c.goals, loan: c.loan, nt: isNT(lab?.en, lab?.ko) };
    })
      // 클럽은 전부 유지(유스 클럽 포함). 연령별 국가대표(U-16~U-23)는 타임라인 노이즈 → 시니어만.
      .filter((c) => c.club && !(c.nt && /U-?\d{1,2}|under-?\d|youth/i.test(c.club)))
      .sort((a, b) => (a.start ?? a.end ?? 0) - (b.start ?? b.end ?? 0));
    if (career.length) { o.career = career; careerFix++; }
    if (o.nameKo || o.country || o.career) overrides[id] = o;
  }

  // 병합 저장 (다른 리그 + 이전 결과 보존)
  const merged = { ...loadOverrides(), ...overrides };
  fs.writeFileSync(PATH, JSON.stringify(merged));
  console.log(`[${league}] 완료 → 이름 ${nameFix}, 국적 ${countryFix}, 커리어 ${careerFix} | 누적 ${Object.keys(merged).length}`);
}

async function main() {
  console.log(`enrich → ${LEAGUES.join(",")} ${LIMIT ? `limit=${LIMIT}/리그` : "(전부)"} pace=${PACE} ${FORCE ? "force" : ""}`);

  // 국기 맵 (en lower → flag)
  const countries = JSON.parse(fs.readFileSync("data/ts-countries.json", "utf8")) as { name: string; logo: string }[];
  const flagByEn = new Map(countries.map((c) => [c.name.toLowerCase(), c.logo]));
  const flagOf = (en: string | null) => {
    if (!en) return null;
    return flagByEn.get(en.toLowerCase()) || flagByEn.get((COUNTRY_ALIAS[en] || "").toLowerCase()) || null;
  };

  // 영문명 맵: squad
  const squadEn = new Map<string, string>();
  if (fs.existsSync("/tmp/squad-big.json")) {
    for (const s of JSON.parse(fs.readFileSync("/tmp/squad-big.json", "utf8")) as any[]) {
      if (s.id && s.name && isEnglish(s.name)) squadEn.set(s.id, s.name);
    }
  }
  console.log(`squad 영문명 ${squadEn.size}`);

  for (const lg of LEAGUES) await enrichLeague(lg, flagOf, squadEn);

  // 국가 분포 요약
  const all = loadOverrides();
  const dist: Record<string, number> = {};
  let withCareer = 0, withCountry = 0;
  for (const o of Object.values(all)) {
    if (o.country) { dist[o.country] = (dist[o.country] || 0) + 1; withCountry++; }
    if (o.career?.length) withCareer++;
  }
  console.log(`\n총 엔트리 ${Object.keys(all).length} | 국적 ${withCountry} | 커리어 ${withCareer}`);
  console.log("국가 분포 상위:", Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => `${n} ${c}`).join(", "));

  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
