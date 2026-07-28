// Wikidata 보강 → data/player-overrides.json (no db push, /transfers override 적용).
// 영문명 → Wikidata 검색 → 정확한 한글명(P-label) + 국적(P1532‖P27) + 커리어(P54).
//   · 이름: "긴 본명/오역" 교정용으로만 override (shouldOverrideName, 역행 방지)
//   · 국적: P1532(스포츠 국가) 우선, 없으면 P27(시민권). 국기 = ts-countries.json en 매칭
//   · 커리어: P54(소속팀) → 클럽·연도(P580/P582)·출장(P1350)·골(P1351)·임대(P1642=Q2914547)
//             국가대표(라벨 "national"/"국가대표")는 nt:true 로 분리
//   · 정밀도 가드: P54 가 있는 엔티티만 채택 (직업·커리어 없는 동명이인 오매칭 방지)
//   · QID 핀: P54 가드로도 못 거르는 "둘 다 실재 축구선수인 동명이인"(남↔여 등)은 QID_PIN 으로 검색 우회
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
const IDS = (arg("ids") || "").split(",").map((v) => v.trim()).filter(Boolean);
const LIMIT = Number(arg("limit") || "0"); // 리그별 상한 (0 = 전부)
const FORCE = process.argv.includes("--force"); // 이미 career 있는 선수도 재조회
const DRY = process.argv.includes("--dry"); // Wikidata ko vs DB nameKo 차이만 출력(적용·저장 X)
let PACE = Number(arg("pace") || "150"); // 검색 호출 간격(ms), 429 시 자동 증가
const LEAGUES = LEAGUE ? LEAGUE.split(",").filter(Boolean) : ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const PATH = "data/player-overrides.json";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Latin 스크립트 전체 허용 — 악센트(Mbappé é, Vinícius í, Ørjan Ø, Škriniar Š) 포함.
// 한글/키릴 등 비-Latin nameKo 는 제외(검색 불가). (구 [A-Za-z] 는 악센트 거부 → 135명 누락 버그)
const isEnglish = (s: string) => /^[\p{Script=Latin}][\p{Script=Latin}'.\-\s]+$/u.test(s);

// 수동 이름 큐레이션 — Wikidata/공식명과 다르게 사용자가 지정한 표기. 매 실행 끝에 강제 적용(보존).
const NAME_CURATION: Record<string, string> = {
  pxwrxlhze0dryk0: "킬리안 음바페", // Mbappé — 사용자 지정(엠바페→음바페)
  y0or5jh4d2yjqwz: "브라이언 음뵈모", // Mbeumo — DB "브르얀 음보이모" 오역
  zp5rzgh2ylnq82w: "마테우스 쿠냐", // Cunha — DB "쿤하" 오역(쿠냐가 맞음)
  y0or5jh3yl8gqwz: "패트릭 도르구", // Dorgu — DB 긴본명 → 짧은명(중복 dedup 매칭용)
  // audit 확정 오역 교정 (2026-06-06, DB nameKo vs Wikidata 대조)
  "3glrw7hygyyqdyj": "조나탕 이코네", // Ikoné — DB "나니타모 이콘"
  ednm9whz7z5yryo: "피에로 인카피에", // Hincapié — DB "마틴 힌카피"(이름 자체 오류)
  "4wyrn4hej2vq86p": "마이크 메냥", // Maignan — DB "미크 마이낭"
  y0or5jhe6zx2qwz: "미카엘 올리세", // Olise — DB "미가엘 올리스"
  "23xmvkhd064vqg8": "닉 볼테마데", // Woltemade — DB "닉 월트메이드"
  "3glrw7hyg2kqdyj": "도니엘 말렌", // Malen — DB "돈옐 마렌"
  "4jwq2gh6pdlm0ve": "앙투안 세메뇨", // Semenyo — DB "안토니 세메니오"
  ednm9whgg9x7ryo: "에스테방", // Estêvão — DB "에스테바오 공칼베스"(통용 모노님)
  pxwrxlhj354wryk: "케난 일디즈", // Yıldız — DB "케난 예르디즈"
  // 사용자 표기 교정 (2026-06-16)
  "4jwq2ghxjoym0ve": "빅토르 요케레스", // Gyökeres — DB "빅토르 게요케레스"
  "318q66hvxe77qo9": "라스무스 호일룬", // Højlund — DB "라스무스 훌룬드"
  dj2ryohg2z8xq1z: "주앙 페드루 레지날도", // João Pedro — DB "조아오 페드로"
  n54qllheyly3qvy: "라이언 흐라벤베르흐", // Gravenberch — DB "라이언 그레이븐버그"
  l5ergphvlzwor8k: "누누 멘데스", // Nuno Mendes — DB "누노 멘데스"
  pxwrxlhv2peryk0: "오렐리앙 추아메니", // Tchouaméni — DB "오렐리앙 쇼아메니"
  l5ergphv83e2r8k: "마르틴 수비멘디", // Zubimendi — DB "마르틴 주비멘디"
  l5ergphe8wokr8k: "페르민 로페스", // Fermín López(바르셀로나) — DB "페르민 마린" 오역
  "318q66hvngwvqo9": "훌리안 알바레스", // Julián Álvarez(아틀레티코) — DB "후리안 알바레스"
  l7oqdehe9j7r510: "흐비차 크바라츠헬리아", // Khvicha Kvaratskhelia(PSG) — DB "크바라츠크헬리아"(이름 누락)
  n54qllhxl41yqvy: "모건 로저스", // Morgan Rogers(아스톤 빌라) — DB "모건 엘리엇 로저스"(미들네임)
  // 이름 '자체' 오류(성·이름 다름) 교정 — 국적으로 신원 확인
  l7oqdehleg1r510: "알렉산더 이사크", // Isak — DB "안드레아 이사크"(이름 완전 오류)
  pxwrxlh93y1oryk: "데스티니 우도기에", // Udogie — DB "이에노마 우도기에"(미들네임)
  "1l4rjnhxgkgym7v": "후니오르 디아스", // Junior Diaz — DB "미셸 디아즈"
  pxwrxlh9zk74ryk: "윌리안 파초", // Pacho — DB "윌리엄 테노리오"(성씨 오류)
  dn1m1ghnkovvmoe: "실라스 카톰파 음붐파", // Silas — DB "실라스 와망기투카"(실명 변경)
  "2y8m4zhzp01ql07": "아르나우트 단주마", // Danjuma — ts.name 오기(흐루네벨트), PMV·커리어는 Danjuma
};

// 정확한 QID 핀 — searchQid 가 영문명으로 동명이인(둘 다 실재 축구선수라 P54 가드도 통과)을 매칭하는 케이스 우회.
// ts player id → 정확한 Wikidata QID. 여기 있으면 검색을 건너뛰고 이 엔티티로 국적·커리어를 채워 재실행(--force 포함)에도 보존.
const QID_PIN: Record<string, string> = {
  n54qllhxl41yqvy: "Q61598452",  // 모건 로저스(아스톤 빌라·잉글랜드) — searchQid 가 웨일스 여자선수(Q98087876) 오매칭
  k82rekho9k97rep: "Q106778648", // 앨릭스 스콧(본머스·잉글랜드, 2003년생) — searchQid 가 여자 레전드 앨릭스 스콧(Q434354) 오매칭
};

// 국적 수동 교정 맵 — career 시니어 대표팀(FIFA 국가) 기준으로 country/국기를 덮어쓴다.
// data/player-country-fix.json (ts id → {ko, flag}, 57명) — Wikidata P1532[0]/P27 이 유스국가·시민권을
// 줘서 시니어 대표팀과 어긋나는 이중국적·귀화·국적변경 케이스(무시알라·라이스·그릴리시·발로건 등). 재빌드 회귀 방지.
const COUNTRY_FIX: Record<string, { ko: string; flag: string }> = JSON.parse(
  fs.readFileSync("data/player-country-fix.json", "utf8"),
);
const yr = (t?: string): number | null => (t ? parseInt(t.slice(1, 5), 10) || null : null);
const num = (a?: string): number | null => (a != null ? parseInt(a, 10) : null);
const isNT = (en?: string | null, ko?: string | null) => /national/i.test(en || "") || /국가\s*대표/.test(ko || "");

interface CareerEntry { club: string; start: number | null; end: number | null; apps: number | null; goals: number | null; loan: boolean; nt: boolean }
interface Override { nameKo?: string; country?: string; flag?: string; career?: CareerEntry[]; pos?: string; qid?: string }

// P413(주 포지션) 영문 라벨 → 세부 POS 코드. 순서 중요 — wing-back 이 winger 보다 먼저.
// generic(defender/midfielder/forward 단독)은 세부 확정 불가 → 미기록(coarse 유지).
function posCodeOfLabel(label: string | null): string | null {
  if (!label) return null;
  const s = label.toLowerCase();
  if (/goalkeeper/.test(s)) return "GK";
  if (/centre[- ]back|center[- ]back/.test(s)) return "CB";
  if (/full[- ]back|wing[- ]back|left[- ]back|right[- ]back/.test(s)) return "FB";
  if (/defensive midfield/.test(s)) return "DM";
  if (/attacking midfield/.test(s)) return "AM";
  if (/central midfield|centre midfield|center midfield/.test(s)) return "CM";
  if (/winger|left wing|right wing/.test(s)) return "W";
  if (/centre[- ]forward|center[- ]forward|striker/.test(s)) return "ST";
  return null;
}

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
interface Entity { ko: string | null; countryQid: string | null; p54: RawCareer[]; p413: string[] }
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
  // 정밀도 가드: 커리어(P54) 또는 축구선수 직업(P106=Q937857) 중 하나는 있어야 채택(동명이인 오매칭 방지).
  //  P54 없는 어린 선수(예: 도르구 2004년생)도 footballer 직업이면 국적/이름은 채움(커리어만 빔).
  const isFootballer = (e.claims?.P106 || []).some((c: any) => c.mainsnak?.datavalue?.value?.id === "Q937857");
  if (!p54.length && !isFootballer) return null;
  const ko = e.labels?.ko?.value || null;
  const countryQid = e.claims?.P1532?.[0]?.mainsnak?.datavalue?.value?.id || e.claims?.P27?.[0]?.mainsnak?.datavalue?.value?.id || null;
  // P413 주 포지션 — rank preferred 우선, 없으면 선언 순서 (첫 매핑 가능 라벨 채택)
  const p413raw = (e.claims?.P413 || []) as any[];
  const p413 = [...p413raw.filter((c) => c.rank === "preferred"), ...p413raw.filter((c) => c.rank !== "preferred")]
    .map((c) => c.mainsnak?.datavalue?.value?.id)
    .filter(Boolean);
  return { ko, countryQid, p54, p413 };
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

async function enrichLeague(league: string, flagOf: (en: string | null) => string | null, squadEn: Map<string, string>, idList?: string[]) {
  // idList 주입 시 PlayerMarketValue 유니버스를 건너뛴다 — 해외 하위리그 선수는 몸값 데이터가 없어
  //   리그 기준으론 안 잡힌다(해외파 허브 25명 중 PMV 8명, 2026-07-28 실측).
  let rows = idList
    ? idList.map((id) => ({ id }))
    : await prisma.playerMarketValue.findMany({
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
    if (!FORCE && !DRY && prev[r.id]?.career) continue; // 이미 채워짐 → skip (재실행 incremental)
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
    const qid = QID_PIN[id] || await searchQid(en); // 핀 우선 — 동명이인 오매칭 우회
    if (qid) qidById.set(id, qid);
    if (++done % 100 === 0) console.log(`  [${league}] 검색 ${done}/${enById.size} | qid ${qidById.size} | pace ${PACE}`);
    if (!QID_PIN[id]) await sleep(PACE); // 핀은 API 미호출 → throttle 불필요
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
    for (const q of e.p413) labelQids.add(q);
  }
  const labels = DRY ? new Map<string, { ko: string | null; en: string | null }>() : await batchLabels([...labelQids]);

  // ── override 빌드 ──
  const overrides: Record<string, Override> = {};
  let nameFix = 0, countryFix = 0, careerFix = 0, posFix = 0;
  for (const [id, qid] of qidById) {
    const e = ent.get(qid); if (!e) continue; // P54 가드 통과 못함
    const cur = tspMap.get(id)?.nameKo || null;
    if (DRY) {
      if (e.ko && e.ko !== cur) {
        const ct = cur ? cur.trim().split(/\s+/).length : 0, wt = e.ko.trim().split(/\s+/).length;
        const tag = !cur ? "신규" : wt < ct ? "축약" : wt === ct ? "음역" : "확장";
        console.log(`[${tag}] ${tspMap.get(id)?.name} | "${cur}" → "${e.ko}"`);
      }
      continue;
    }
    const o: Override = {};
    o.qid = qid; // 위키데이터 엔티티 — 선수 페이지 JSON-LD sameAs(위키데이터·위키피디아 링크)용
    if (shouldOverrideName(cur, e.ko)) { o.nameKo = e.ko!; nameFix++; }
    if (e.countryQid) {
      const c = labels.get(e.countryQid);
      const ko = c?.ko || c?.en;
      if (ko) { o.country = ko; const f = flagOf(c?.en || null); if (f) o.flag = f; countryFix++; }
    }
    // 국적 수동 교정 — Wikidata 산출을 덮어씀 (시니어 대표팀 기준)
    const cf = COUNTRY_FIX[id];
    if (cf) { o.country = cf.ko; o.flag = cf.flag; }
    // P413 주 포지션 — 첫 매핑 가능 라벨 (preferred rank 우선 정렬됨)
    for (const pq of e.p413) {
      const code = posCodeOfLabel(labels.get(pq)?.en ?? null);
      if (code) { o.pos = code; posFix++; break; }
    }
    const career: CareerEntry[] = e.p54.map((c) => {
      const lab = labels.get(c.clubQid);
      return { club: (lab?.ko || lab?.en)!, start: c.start, end: c.end, apps: c.apps, goals: c.goals, loan: c.loan, nt: isNT(lab?.en, lab?.ko) };
    })
      // 클럽은 전부 유지(유스 클럽 포함). 연령별 국가대표(U-16~U-23)는 타임라인 노이즈 → 시니어만.
      .filter((c) => c.club && !(c.nt && /U-?\d{1,2}|under-?\d|youth/i.test(c.club)))
      .sort((a, b) => (a.start ?? a.end ?? 0) - (b.start ?? b.end ?? 0));
    if (career.length) { o.career = career; careerFix++; }
    if (o.nameKo || o.country || o.career || o.pos || o.qid) overrides[id] = o;
  }

  // 병합 저장 (다른 리그 + 이전 결과 보존) — 같은 id 는 필드 단위 merge (flag-only 항목 보존)
  const merged = loadOverrides();
  for (const [id, o] of Object.entries(overrides)) merged[id] = { ...merged[id], ...o };
  if (!DRY) {
    fs.writeFileSync(PATH, JSON.stringify(merged));
    console.log(`[${league}] 완료 → 이름 ${nameFix}, 국적 ${countryFix}, 커리어 ${careerFix}, 포지션 ${posFix} | 누적 ${Object.keys(merged).length}`);
  }
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

  if (IDS.length) {
    console.log(`--ids 지정 — ${IDS.length}명 대상 (리그 유니버스 무시)`);
    await enrichLeague("IDS", flagOf, squadEn, IDS);
  } else {
    for (const lg of LEAGUES) await enrichLeague(lg, flagOf, squadEn);
  }

  // 수동 이름 큐레이션 강제 적용 (enrich 결과를 덮어씀, 재실행에도 보존)
  if (!DRY) {
    const cur = loadOverrides();
    for (const [id, ko] of Object.entries(NAME_CURATION)) cur[id] = { ...(cur[id] || {}), nameKo: ko };
    fs.writeFileSync(PATH, JSON.stringify(cur));
    console.log(`이름 큐레이션 적용: ${Object.keys(NAME_CURATION).length}`);
  }

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
