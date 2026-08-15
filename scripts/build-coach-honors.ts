// 감독 우승 기록(트로피) 수집 — 영문 Wikipedia "Honours" › Manager(ial) 섹션 파싱
// → data/coach-honors.json { coachTsId: [{ club, comp, compKo, seasons: string[] }] }
//
// Wikidata 에는 감독 트로피 claim 이 없어(P2522/P166 빈 값 — 엔리케 실측) 위키 본문이 유일 경로.
// 흐름: team-coaches.json → Wikidata 검색(qid) → sitelinks.enwiki → wikitext parse.
// 구조: '''클럽''' 볼드 헤더 + "*대회: [[..|시즌]], [[..|시즌]]" 불릿 (Player 섹션은 제외).
//
//   npx tsx --env-file=.env.local scripts/build-coach-honors.ts
import fs from "node:fs";
import path from "node:path";
import type { WikiApiResponse, WbSearchEntity } from "./_external-api-types";

const COACHES_PATH = path.join(__dirname, "..", "data", "team-coaches.json");
const OUT = path.join(__dirname, "..", "data", "coach-honors.json");
const UA = { "User-Agent": "scorebase/1.0 (https://www.scorebase.kr; coach honours; kimxylitol77@gmail.com)" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 주요 대회 한글 표기 (미등재는 영문 유지)
const COMP_KO: Record<string, string> = {
  "UEFA Champions League": "UEFA 챔피언스리그",
  "UEFA Europa League": "UEFA 유로파리그",
  "UEFA Europa Conference League": "UEFA 컨퍼런스리그",
  "UEFA Conference League": "UEFA 컨퍼런스리그",
  "UEFA Super Cup": "UEFA 슈퍼컵",
  "FIFA Club World Cup": "FIFA 클럽 월드컵",
  "FIFA World Cup": "FIFA 월드컵",
  "UEFA European Championship": "UEFA 유로",
  "UEFA Nations League": "UEFA 네이션스리그",
  "Copa América": "코파 아메리카",
  "Copa America": "코파 아메리카",
  "Africa Cup of Nations": "아프리카 네이션스컵",
  "AFC Asian Cup": "AFC 아시안컵",
  "CONCACAF Gold Cup": "CONCACAF 골드컵",
  "Premier League": "프리미어리그",
  "FA Cup": "FA컵",
  "EFL Cup": "EFL컵",
  "League Cup": "리그컵",
  "FA Community Shield": "FA 커뮤니티 실드",
  "La Liga": "라리가",
  "Copa del Rey": "코파 델 레이",
  "Supercopa de España": "수페르코파",
  "Bundesliga": "분데스리가",
  "DFB-Pokal": "DFB 포칼",
  "DFL-Supercup": "DFL 슈퍼컵",
  "Serie A": "세리에 A",
  "Coppa Italia": "코파 이탈리아",
  "Supercoppa Italiana": "수페르코파 이탈리아나",
  "Ligue 1": "리그 1",
  "Coupe de France": "쿠프 드 프랑스",
  "Trophée des Champions": "트로페 데 샹피옹",
  "Eredivisie": "에레디비시",
  "KNVB Cup": "KNVB컵",
  "Primeira Liga": "프리메이라리가",
  "Taça de Portugal": "타사 드 포르투갈",
  "K League 1": "K리그1",
  "Korean FA Cup": "코리아컵",
  "Saudi Pro League": "사우디 프로리그",
  "King Cup": "킹컵",
  "King's Cup": "킹컵",
  "MLS Cup": "MLS컵",
  "Supporters' Shield": "서포터스 실드",
  "AFC Champions League": "AFC 챔피언스리그",
  "AFC Champions League Elite": "AFC 챔피언스리그 엘리트",
  "Copa Libertadores": "코파 리베르타도레스",
  "Championship": "챔피언십",
  "EFL Championship": "EFL 챔피언십",
  "Scottish Premiership": "스코티시 프리미어십",
  "Süper Lig": "쉬페르리그",
  "J1 League": "J1리그",
  "Olympic Games": "올림픽",
};

interface HonorRow { club: string; comp: string; compKo: string | null; seasons: string[] }

async function getJSON(url: string): Promise<WikiApiResponse | null> {
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

async function searchQid(name: string): Promise<string | null> {
  const d = await getJSON(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=7`,
  );
  const arr = d?.search || [];
  // "X head coach" 표기 + 라벨 정확 일치 폴백 (build-coach-careers 와 동일 fix)
  return (
    arr.find((s: WbSearchEntity) => /football (manager|coach)|head coach/i.test(s.description || ""))?.id ||
    arr.find((s: WbSearchEntity) => /footballer|football player/i.test(s.description || ""))?.id ||
    arr.find((s: WbSearchEntity) => (s.label || "").toLowerCase() === name.toLowerCase())?.id ||
    null
  );
}

async function enwikiTitle(qid: string): Promise<string | null> {
  const d = await getJSON(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=sitelinks&sitefilter=enwiki&format=json`,
  );
  return d?.entities?.[qid]?.sitelinks?.enwiki?.title ?? null;
}

// wikitext 정리: <ref.../ref> 제거, {{템플릿}} 제거, [[a|b]]→b, [[a]]→a, ''' 제거
function clean(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[\s\S]*?<\/ref>/g, "")
    .replace(/\{\{[\s\S]*?\}\}/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .trim();
}

async function parseHonours(title: string): Promise<HonorRow[]> {
  const d = await getJSON(
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=wikitext&format=json&formatversion=2&redirects=1`,
  );
  const raw = d?.parse?.wikitext;
  const wt: string | undefined = typeof raw === "string" ? raw : raw?.["*"];
  if (!wt) return [];
  const hon = wt.match(/==\s*Honours\s*==([\s\S]*?)(?=\n==[^=]|\s*$)/);
  if (!hon) return [];
  // Manager(ial)/Coach 하위 섹션 우선 — 없으면(감독 전업, Player 섹션 없음) 전체 사용하되
  // Player/Individual 하위 섹션은 제거
  let sec = hon[1];
  const mgr = sec.match(/===\s*(?:Manager(?:ial)?|Coach|Head coach)\s*===([\s\S]*?)(?=\n===|\s*$)/i);
  if (mgr) sec = mgr[1];
  else {
    if (/===\s*(?:As a |)[Pp]layer\s*===/.test(sec)) return []; // 선수 섹션만 있는 문서 — 감독 트로피 없음
    sec = sec.replace(/===\s*Individual\s*===[\s\S]*?(?=\n===|\s*$)/gi, "");
  }
  sec = sec.replace(/===\s*Individual\s*===[\s\S]*?(?=\n===|\s*$)/gi, "");

  const rows: HonorRow[] = [];
  let curClub: string | null = null;
  for (const lineRaw of sec.split("\n")) {
    const line = lineRaw.trim();
    const clubM = line.match(/^'''([^']+)'''$/) || line.match(/^;\s*(.+)$/);
    if (clubM) { curClub = clean(clubM[1]); continue; }
    if (!line.startsWith("*") || line.startsWith("**")) continue;
    const body = clean(line.replace(/^\*+/, ""));
    const ci = body.indexOf(":");
    if (ci === -1 || !curClub) continue;
    const comp = body.slice(0, ci).trim();
    const seasons = body
      .slice(ci + 1)
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => /\d{4}/.test(s));
    if (!comp || !seasons.length) continue;
    // "runner-up"/"third place" 류 제외 — 우승만
    if (/runner|third|fourth|promotion|play-?off/i.test(comp)) continue;
    rows.push({ club: curClub, comp, compKo: COMP_KO[comp] ?? null, seasons });
  }
  return rows;
}

async function main() {
  const coaches = JSON.parse(fs.readFileSync(COACHES_PATH, "utf8")) as Record<string, { id?: string; name: string }>;
  // 레전드(비현직) 감독 병합 + --only=<id,id> 부분 실행 (careers 와 동일 규칙)
  const legendsPath = path.join(__dirname, "..", "data", "coach-legends.json");
  const legends = fs.existsSync(legendsPath)
    ? (Object.values(JSON.parse(fs.readFileSync(legendsPath, "utf8"))) as Array<{ id?: string; name: string }>)
    : [];
  const only = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",");
  const list = [...Object.values(coaches), ...legends]
    .filter((c) => c.id && c.name)
    .filter((c) => !only || only.includes(c.id!));
  console.log(`감독 ${list.length}명 위키 우승 기록 수집`);

  const out: Record<string, HonorRow[]> = {};
  let done = 0, withHonors = 0;
  for (const c of list) {
    done++;
    const qid = await searchQid(c.name);
    if (!qid) { await sleep(150); continue; }
    await sleep(120);
    const title = await enwikiTitle(qid);
    if (!title) { await sleep(120); continue; }
    await sleep(120);
    const rows = await parseHonours(title);
    if (rows.length) { out[c.id!] = rows; withHonors++; }
    if (done % 25 === 0) console.log(`  ${done}/${list.length} | 우승기록 ${withHonors}`);
    await sleep(200);
  }
  // merge 보존 — 경질된 감독의 우승 기록이 전체 갱신에서 사라지지 않게 기존 항목 유지 (careers 와 동일 원칙)
  let prev: typeof out = {};
  try { prev = JSON.parse(fs.readFileSync(OUT, "utf-8")); } catch { /* 최초 실행 */ }
  const merged = { ...prev, ...out };
  fs.writeFileSync(OUT, JSON.stringify(merged));
  console.log(`✓ coach-honors.json — 총 ${Object.keys(merged).length}명 (이번 갱신 ${withHonors}/${list.length})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
