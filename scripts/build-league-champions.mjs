// 리그별 역대 우승팀을 위키데이터 SPARQL 로 수집 → data/league-champions.json
// 실행: node scripts/build-league-champions.mjs [--dry] [--only=KBO,MLB,NPB]
//   --only : 지정한 리그만 재수집하고 나머지는 기존 json 유지(머지). 검증된 리그 재조회로 인한 노이즈 유입 방지.
// 리그 Q번호 = 위키데이터 league 엔티티. 시즌(P3450 of league) → 우승팀(P1346).
// ⚠️ NBA 는 별도 경로로 json 에만 존재(LEAGUE_WD 부재) → 머지 로직이 보존. 전체 재빌드 시 유실 주의.
import { readFileSync, writeFileSync } from "node:fs";

// 위키데이터가 아직 반영하지 않은 우승 기록을 손으로 고정해 둔다.
// SPARQL 결과로 리그를 통째로 덮어쓰기 때문에, 여기에 없으면 재빌드 때 조용히 사라진다.
// 우승 판정은 반드시 우리 DB(Match 결승 결과)로 확인한 뒤 넣을 것 — 짐작 금지.
const MANUAL_CHAMPIONS = {
  // 2026-07-19 결승 스페인 1:0 아르헨티나 (DB Match 확인, 2026-07-30)
  WORLD_CUP: [{ season: "2026", ko: "스페인", en: "Spain men's national football team" }],
  // 2025-10-31 한국시리즈 최종전 LG 4:1 한화 — 시리즈 LG 우세 (DB Match 실측, 2026-08-09)
  KBO: [{ season: "2025", ko: "LG 트윈스", en: "LG Twins" }],
  // 2026-06 스탠리컵 결승 캐롤라이나 4승 2패 vs 베가스 (DB Match 6경기 실측, 2026-08-09)
  // ⚠ 2024-25(플로리다 추정)는 DB 수집 이전 + 위키데이터 공백 — 짐작 금지 원칙으로 비워둠
  NHL: [{ season: "2025-26", ko: "캐롤라이나 허리케인스", en: "Carolina Hurricanes" }],
  // SeasonStandingsArchive 25-26 최종표 1위 (af 백필 정본, 34경기 77점 — 2026-08-09)
  SUPER_LIG: [{ season: "2025-26", ko: "갈라타사라이 SK", en: "Galatasaray S.K." }],
  // SeasonStandingsArchive 25-26 최종표 1위 (42경기 82점 — 2026-08-09)
  LALIGA_2: [{ season: "2025-26", ko: "라싱 산탄데르", en: "Racing de Santander" }],
};

const DRY = process.argv.includes("--dry");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .split("=")[1]
  ?.split(",")
  .filter(Boolean);

// 리그코드 → 위키데이터 Q번호 (association football league / WC 는 대회)
const LEAGUE_WD = {
  // 야구 (2026-07-07 검증 — 시즌 P3450→P1346=한국시리즈/월드시리즈/재팬시리즈 우승)
  KBO: "Q625168", // KBO 리그 (위키 14시즌·부분, 최근 2021 KT 위즈)
  MLB: "Q1163715", // 메이저리그 (119시즌·월드시리즈 챔피언 전량)
  NPB: "Q1146127", // 일본프로야구 (49시즌·재팬시리즈 챔피언)
  WORLD_CUP: "Q19317",
  UCL: "Q18756", // UEFA 챔피언스리그 (시즌 P3450→우승 P1346 — 컵도 동일 구조 작동)
  UEL: "Q18760", // UEFA 유로파리그 (Q18762 아님 — 검증 필수)
  MLS: "Q18543", // 메이저리그사커 (P1346=MLS컵 우승, "MLS is Back" 등 무연도는 parseSeason 자동 제외)
  NHL: "Q1215892", // NHL 리그 — "X NHL season" 의 P1346 = 스탠리컵 우승팀 (Q211872 트로피 아님)
  LOL: "Q12594341", // LoL 월드챔피언십(Worlds) — 일부 연도 위키데이터 공백(부분)
  EPL: "Q9448",
  LALIGA: "Q324867",
  BUNDESLIGA: "Q82595",
  SERIE_A: "Q15804",
  LIGUE_1: "Q13394",
  K_LEAGUE_1: "Q2386334",
  J1_LEAGUE: "Q276445",
  EREDIVISIE: "Q167541",
  PRIMEIRA_LIGA: "Q182994",
  SUPER_LIG: "Q485568",
  SAUDI_PL: "Q255633",
  BRASILEIRAO: "Q206813",
  CHAMPIONSHIP: "Q19510",
  SERIE_B: "Q194052",
  LALIGA_2: "Q35615",
  BUNDESLIGA_2: "Q152665",
  LIGUE_2: "Q217374",
  // 컵 대회 (2026-08-09 검증 — 후보 QID 별 P3450 시즌 수를 실측해 축구 대회만 채택.
  // 동명이의 종목 컵이 많다: Copa del Rey 는 농구 Q1130925·배구, Coppa Italia 는 럭비 Q1088927 등)
  FA_CUP: "Q11151", // 145시즌
  EFL_CUP: "Q11152", // 66
  SCO_LEAGUE_CUP: "Q864672", // 112
  COPA_DEL_REY: "Q483794", // 124
  COPPA_ITALIA: "Q169918", // 77
  DFB_POKAL: "Q150880", // 81
  COUPE_DE_FRANCE: "Q212412", // 108
  KFA_CUP: "Q484571", // 22 (1996~2017, 이후 위키데이터 공백)
  EMPEROR_CUP: "Q609289", // 74
  CONCACAF_CCUP: "Q83335", // 54
  LEVAIN_CUP: "Q601333", // 31
  SUI_CUP: "Q658806", // 28
  SVENSKA_CUPEN: "Q750585", // 70 (남자 — 여자 Q505318 과 구분)
  COPA_DO_BRASIL: "Q843989", // 32
  // AFC컵은 2024 개편으로 위키데이터가 AFC 챔피언스리그 2 와 같은 엔티티를 쓴다.
  // 개편 후 시즌(2024-25 ACL2)이 AFC컵 우승으로 섞이므로 시즌 라벨로 걷어낸다.
  AFC_CUP: { qid: "Q291808", excludeSeason: /Champions League 2/i },
  // 제외: PORTUGAL_SUPER_CUP(Q1127062) — 위키데이터 P3450 연결이 1979·1980 두 건뿐이라
  // 실제 40여 회 중 2건만 노출돼 오히려 사실을 왜곡한다. 데이터가 채워지면 추가할 것.
};

const UA = { "User-Agent": "scorebase/1.0 (kimxylitol77@gmail.com)", Accept: "application/sparql-results+json" };

async function sparql(qid) {
  const q = `SELECT ?seasonLabel ?winner ?winnerKo ?winnerEn WHERE {
    ?season wdt:P3450 wd:${qid} .
    ?season wdt:P1346 ?winner .
    OPTIONAL { ?season rdfs:label ?seasonLabel . FILTER(LANG(?seasonLabel)="en") }
    OPTIONAL { ?winner rdfs:label ?winnerKo . FILTER(LANG(?winnerKo)="ko") }
    OPTIONAL { ?winner rdfs:label ?winnerEn . FILTER(LANG(?winnerEn)="en") }
  }`;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) { await sleep(3000); continue; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return (await r.json()).results.bindings;
    } catch (e) {
      if (i === 3) throw e;
      await sleep(2000);
    }
  }
  return [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "1997–98 FA Premier League" → "1997-98", "2024 K League 1" → "2024"
function parseSeason(label) {
  if (!label) return null;
  const m = label.match(/^(\d{4})(?:[–\-—](\d{2,4}))?/);
  if (!m) return null;
  const start = m[1];
  if (!m[2]) return { key: start, start: +start };
  return { key: `${start}-${m[2]}`, start: +start };
}

// "아스널 FC" → "아스널", "스페인 축구 국가대표팀" → "스페인"(WC 우승국)
function cleanKo(ko) {
  if (!ko) return null;
  return ko
    .replace(/\s*(축구\s*)?(국가)?대표팀$/, "")
    .replace(/\s+(F\.?C\.?|S\.?C\.?|A\.?F\.?C\.?|C\.?F\.?)$/i, "")
    .trim() || ko;
}

// 기존 json 을 베이스로 로드(머지) — LEAGUE_WD 에 없는 리그(NBA)·--only 미지정 리그 보존.
let out = {};
try {
  out = JSON.parse(readFileSync("data/league-champions.json", "utf8"));
} catch {}
for (const [code, wd] of Object.entries(LEAGUE_WD)) {
  if (ONLY && !ONLY.includes(code)) continue;
  // 값은 QID 문자열, 또는 걸러낼 시즌 라벨 패턴을 함께 가진 객체.
  const qid = typeof wd === "string" ? wd : wd.qid;
  const excludeSeason = typeof wd === "string" ? null : wd.excludeSeason;
  try {
    const rows = await sparql(qid);
    const bySeason = new Map();
    for (const b of rows) {
      if (excludeSeason?.test(b.seasonLabel?.value ?? "")) continue;
      const s = parseSeason(b.seasonLabel?.value);
      if (!s) continue;
      if (bySeason.has(s.key)) continue;
      const en = b.winnerEn?.value ?? "";
      const ko = cleanKo(b.winnerKo?.value) ?? en;
      bySeason.set(s.key, { season: s.key, start: s.start, ko, en });
    }
    let champions = [...bySeason.values()].sort((a, b) => b.start - a.start).map(({ start, ...x }) => x);
    // 손으로 고정한 우승 기록 병합 — 위키데이터에 이미 있으면 그쪽을 신뢰(중복 방지).
    for (const m of MANUAL_CHAMPIONS[code] ?? []) {
      if (!champions.some((c) => c.season === m.season)) champions.unshift(m);
    }
    // 결산글 링크(article)는 SPARQL 이 모르는 손수 붙인 값 — 기존 json 에서 되살린다.
    const prevArticles = new Map(
      (out[code]?.champions ?? []).filter((c) => c.article).map((c) => [c.season, c.article]),
    );
    if (prevArticles.size > 0) {
      champions = champions.map((c) =>
        prevArticles.has(c.season) ? { ...c, article: prevArticles.get(c.season) } : c,
      );
    }
    out[code] = { champions };
    const latest = champions[0];
    console.log(`${code.padEnd(14)} ${String(champions.length).padStart(3)}시즌  최근: ${latest ? latest.season + " " + latest.ko : "없음"}`);
    await sleep(400);
  } catch (e) {
    console.log(`${code.padEnd(14)} 실패: ${e.message}`);
    out[code] = { champions: [] };
  }
}

if (!DRY) {
  const path = "data/league-champions.json";
  writeFileSync(path, JSON.stringify(out, null, 0));
  console.log(`\n저장: ${path} (${Object.keys(out).length}개 리그)`);
} else {
  console.log("\n--dry: 저장 안 함");
}
