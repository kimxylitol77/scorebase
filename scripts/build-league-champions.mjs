// 리그별 역대 우승팀을 위키데이터 SPARQL 로 수집 → data/league-champions.json
// 실행: node scripts/build-league-champions.mjs [--dry]
// 리그 Q번호 = 위키데이터 league 엔티티. 시즌(P3450 of league) → 우승팀(P1346).
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");

// 리그코드 → 위키데이터 Q번호 (association football league / WC 는 대회)
const LEAGUE_WD = {
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

const out = {};
for (const [code, qid] of Object.entries(LEAGUE_WD)) {
  try {
    const rows = await sparql(qid);
    const bySeason = new Map();
    for (const b of rows) {
      const s = parseSeason(b.seasonLabel?.value);
      if (!s) continue;
      if (bySeason.has(s.key)) continue;
      const en = b.winnerEn?.value ?? "";
      const ko = cleanKo(b.winnerKo?.value) ?? en;
      bySeason.set(s.key, { season: s.key, start: s.start, ko, en });
    }
    const champions = [...bySeason.values()].sort((a, b) => b.start - a.start).map(({ start, ...x }) => x);
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
