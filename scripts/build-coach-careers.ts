// 감독 경력 보강 — Wikidata P6087(감독을 맡은 팀) + P54(선수 시절) + 국적·한글명
// → data/coach-careers.json { coachTsId: { nameKo, country, flag, coachCareer[], playerCareer[] } }
//
// 입력: data/team-coaches.json (build-team-coaches.ts — coach ts id 포함 버전).
// 검증 가드: P6087 또는 감독 직업(P106=Q628099 association football manager) 있는 엔티티만
// (동명이인 선수 오매칭 방지). 국기 = ts country-list en 매칭(player flags 와 동일 방식).
//
//   npx tsx --env-file=.env.local scripts/build-coach-careers.ts
import fs from "node:fs";
import path from "node:path";
import rawCountries from "../src/lib/sports/thesports/country-list.json";

const COACHES_PATH = path.join(__dirname, "..", "data", "team-coaches.json");
const OUT = path.join(__dirname, "..", "data", "coach-careers.json");
const UA = { "User-Agent": "scorebase/1.0 (https://www.scorebase.kr; coach enrichment; kimxylitol77@gmail.com)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CareerRow { club: string; start: number | null; end: number | null }
interface Out { nameKo: string | null; country: string | null; flag: string | null; coachCareer: CareerRow[]; playerCareer: CareerRow[] }

async function getJSON(url: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await sleep(1200);
  }
  return null;
}

const yr = (t?: string | null) => {
  const m = t?.match(/([+-]?\d{4})/);
  return m ? parseInt(m[1], 10) : null;
};

async function searchQid(name: string): Promise<string | null> {
  const d = await getJSON(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=7`,
  );
  const arr = d?.search || [];
  // 감독/선수 출신 감독 우선 — description 에 manager/coach, 없으면 footballer.
  // "Liverpool head coach"처럼 클럽명+head coach 표기도 잡아야 함 (이라올라 실측 누락 fix).
  // 마지막 폴백: 라벨 정확 일치 — phase 2 의 P6087/P106 감독 가드가 동명이인을 거름.
  return (
    arr.find((s: any) => /football (manager|coach)|head coach/i.test(s.description || ""))?.id ||
    arr.find((s: any) => /footballer|football player/i.test(s.description || ""))?.id ||
    arr.find((s: any) => (s.label || "").toLowerCase() === name.toLowerCase())?.id ||
    null
  );
}

function parseCareerClaims(claims: any[]): Array<{ qid: string; start: number | null; end: number | null }> {
  return (claims || [])
    .map((c: any) => ({
      qid: c.mainsnak?.datavalue?.value?.id,
      start: yr(c.qualifiers?.P580?.[0]?.datavalue?.value?.time) ?? yr(c.qualifiers?.P585?.[0]?.datavalue?.value?.time),
      end: yr(c.qualifiers?.P582?.[0]?.datavalue?.value?.time),
    }))
    .filter((c) => c.qid);
}

async function main() {
  const coaches = JSON.parse(fs.readFileSync(COACHES_PATH, "utf8")) as Record<
    string,
    { id?: string; name: string; nameKo: string | null; nationality: string | null }
  >;
  const list = Object.values(coaches).filter((c) => c.id && c.name);
  console.log(`감독 ${list.length}명 Wikidata 조회`);

  // 국기 매핑 (ts country-list en 이름 기준)
  const countries = (rawCountries as { results: Array<{ name: string; logo?: string }> }).results || [];
  const flagByEn = new Map(countries.filter((c) => c.logo).map((c) => [c.name.toLowerCase(), c.logo!]));

  // phase 1: 검색
  const qidByCoach = new Map<string, string>();
  let done = 0;
  for (const c of list) {
    const qid = await searchQid(c.name);
    if (qid) qidByCoach.set(c.id!, qid);
    if (++done % 25 === 0) console.log(`  검색 ${done}/${list.length} | qid ${qidByCoach.size}`);
    await sleep(180);
  }
  console.log(`qid 확보 ${qidByCoach.size}/${list.length}`);

  // phase 2: 엔티티 (P6087 감독경력, P54 선수경력, P27/P1532 국적, ko 라벨)
  interface Ent { ko: string | null; countryQid: string | null; coach: ReturnType<typeof parseCareerClaims>; play: ReturnType<typeof parseCareerClaims> }
  const ents = new Map<string, Ent>();
  const qids = [...new Set(qidByCoach.values())];
  for (let i = 0; i < qids.length; i += 45) {
    const batch = qids.slice(i, i + 45);
    const d = await getJSON(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join("|"))}&props=labels%7Cclaims&languages=ko%7Cen&format=json`,
    );
    for (const q of batch) {
      const e = d?.entities?.[q];
      if (!e) continue;
      const coach = parseCareerClaims(e.claims?.P6087);
      const isManager = (e.claims?.P106 || []).some((c: any) => c.mainsnak?.datavalue?.value?.id === "Q628099");
      if (!coach.length && !isManager) continue; // 동명이인 가드
      ents.set(q, {
        ko: e.labels?.ko?.value || null,
        countryQid: e.claims?.P1532?.[0]?.mainsnak?.datavalue?.value?.id || e.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id || null,
        coach,
        play: parseCareerClaims(e.claims?.P54),
      });
    }
    await sleep(200);
  }
  console.log(`엔티티(감독 가드 통과) ${ents.size}`);

  // phase 3: 라벨 (클럽 + 국가)
  const labelQids = new Set<string>();
  for (const e of ents.values()) {
    if (e.countryQid) labelQids.add(e.countryQid);
    for (const c of [...e.coach, ...e.play]) labelQids.add(c.qid);
  }
  const labels = new Map<string, { ko: string | null; en: string | null }>();
  const lq = [...labelQids];
  for (let i = 0; i < lq.length; i += 45) {
    const batch = lq.slice(i, i + 45);
    const d = await getJSON(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(batch.join("|"))}&props=labels&languages=ko%7Cen&format=json`,
    );
    for (const q of batch) {
      const e = d?.entities?.[q];
      labels.set(q, { ko: e?.labels?.ko?.value || null, en: e?.labels?.en?.value || null });
    }
    await sleep(200);
  }

  // 빌드
  const isNT = (en: string | null, ko: string | null) =>
    /national|국가대표/i.test(en || "") || /국가대표|대표팀/.test(ko || "");
  const toRows = (cs: ReturnType<typeof parseCareerClaims>, dropYouthNT: boolean): CareerRow[] => {
    const rows: CareerRow[] = [];
    for (const c of cs) {
      const l = labels.get(c.qid);
      const club = l?.ko || l?.en;
      if (!club) continue;
      if (dropYouthNT && isNT(l?.en ?? null, l?.ko ?? null) && /U-?\d{1,2}|under-?\d|youth/i.test(club)) continue;
      rows.push({ club, start: c.start, end: c.end });
    }
    return rows.sort((a, b) => (a.start ?? a.end ?? 0) - (b.start ?? b.end ?? 0));
  };

  const out: Record<string, Out> = {};
  for (const [cid, qid] of qidByCoach) {
    const e = ents.get(qid);
    if (!e) continue;
    const cl = e.countryQid ? labels.get(e.countryQid) : null;
    out[cid] = {
      nameKo: e.ko,
      country: cl?.ko || cl?.en || null,
      flag: cl?.en ? flagByEn.get(cl.en.toLowerCase()) ?? null : null,
      coachCareer: toRows(e.coach, false),
      playerCareer: toRows(e.play, true),
    };
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  const withCareer = Object.values(out).filter((o) => o.coachCareer.length).length;
  console.log(`✓ coach-careers.json — ${Object.keys(out).length}명 (감독경력 보유 ${withCareer})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
