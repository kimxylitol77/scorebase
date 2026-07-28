// Wikipedia 시즌별 커리어 통계 수집 → data/player-wiki-seasons.json
//  ts player(빅5 PMV) → Wikidata 검색(qid) → enwiki sitelink → 기사 Career statistics 표 파싱.
//  과거 시즌(2024-25, 2023-24…) 진짜 시즌별 출장/골. (TheSports 는 현 시즌만 권한)
//   npx tsx --env-file=.env.local scripts/collect-wiki-seasons.ts [--league=EPL] [--limit=N] [--force]
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();
const UA = { "User-Agent": "scorebase/1.0 (https://xn--299a8nv7d.kr; player season stats; kimxylitol77@gmail.com)" };
const WD = "https://www.wikidata.org/w/api.php";
const WP = "https://en.wikipedia.org/w/api.php";
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const LEAGUE = arg("league") || "";
const IDS = (arg("ids") || "").split(",").map((v) => v.trim()).filter(Boolean);
const LIMIT = Number(arg("limit") || "0");
const FORCE = process.argv.includes("--force");
const LEAGUES = LEAGUE ? [LEAGUE] : ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const PATH = "data/player-wiki-seasons.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isEnglish = (s: string) => /^[\p{Script=Latin}][\p{Script=Latin}'.\-\s]+$/u.test(s);

async function getJSON(url: string, tries = 4): Promise<any> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
      if (!r.ok) { await sleep(600 * (i + 1)); continue; }
      return await r.json();
    } catch { await sleep(600 * (i + 1)); }
  }
  return null;
}
async function searchQid(name: string): Promise<string | null> {
  const d = await getJSON(`${WD}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&type=item&limit=5`);
  const a = d?.search || [];
  return (a.find((s: any) => /footballer|soccer|football/i.test(s.description || "")) || a[0])?.id || null;
}
const clean = (s: string) => s.replace(/<sup[\s\S]*?<\/sup>/g, "").replace(/<[^>]+>/g, "")
  .replace(/&#91;[\s\S]*?&#93;/g, "").replace(/&#0?160;|&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
interface SeasonRow { season: string; club: string; division: string; lApps: number; lGoals: number; tApps: number; tGoals: number }
function parseCareer(html: string): SeasonRow[] {
  const t = html.match(/<table[^>]*wikitable[^>]*>[\s\S]*?<\/table>/);
  if (!t) return [];
  const rows = t[0].split(/<tr[ >]/).slice(1).map((r) => r.split("</tr>")[0]);
  const out: SeasonRow[] = [];
  let curClub: string | null = null;
  for (const r of rows) {
    const cells = [...r.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/g)].map((m) => clean(m[2]));
    if (!cells.length) continue;
    if (cells.some((c) => /^Total$|Career total/i.test(c))) continue;
    if (cells.some((c) => /^(Apps|Goals|Division|Club|Season)$/.test(c))) continue;
    let club: string | null, data: string[];
    if (/^\d{4}/.test(cells[0])) { club = curClub; data = cells; }
    else { curClub = cells[0]; club = curClub; data = cells.slice(1); }
    if (!club || !data.length || !/^\d{4}/.test(data[0])) continue;
    const last2 = data.slice(-2);
    out.push({
      season: data[0], club, division: data[1] || "",
      lApps: parseInt(data[2]) || 0, lGoals: parseInt(data[3]) || 0,
      tApps: parseInt(last2[0]) || 0, tGoals: parseInt(last2[1]) || 0,
    });
  }
  return out;
}
async function fetchSeasons(title: string): Promise<SeasonRow[]> {
  const sec = await getJSON(`${WP}?action=parse&page=${encodeURIComponent(title)}&prop=sections&format=json`);
  const sections = sec?.parse?.sections || [];
  const cs = sections.find((s: any) => /^career statistics$/i.test(s.line)) || sections.find((s: any) => /statistics/i.test(s.line));
  if (!cs) return [];
  const d = await getJSON(`${WP}?action=parse&page=${encodeURIComponent(title)}&section=${cs.index}&prop=text&format=json`);
  return parseCareer(d?.parse?.text?.["*"] || "");
}

async function main() {
  console.log(`wiki seasons → ${LEAGUES.join(",")} ${LIMIT ? `limit=${LIMIT}/리그` : "(전부)"} ${FORCE ? "force" : ""}`);
  const squad = fs.existsSync("/tmp/squad-big.json") ? (JSON.parse(fs.readFileSync("/tmp/squad-big.json", "utf8")) as any[]) : [];
  const squadEn = new Map<string, string>();
  for (const s of squad) if (s.id && s.name && isEnglish(s.name)) squadEn.set(s.id, s.name);
  const prev: Record<string, SeasonRow[]> = fs.existsSync(PATH) ? JSON.parse(fs.readFileSync(PATH, "utf8")) : {};

  for (const league of IDS.length ? ["IDS"] : LEAGUES) {
    // --ids 주입 시 몸값 유니버스를 건너뛴다 — 해외 하위리그 선수는 PlayerMarketValue 가 없다.
    let rows = IDS.length
      ? IDS.map((id) => ({ id }))
      : await prisma.playerMarketValue.findMany({ where: { league, currentValue: { not: null } }, orderBy: { currentValue: "desc" }, select: { id: true } });
    if (LIMIT) rows = rows.slice(0, LIMIT);
    const tsp = await prisma.theSportsPlayer.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, name: true } });
    const tspMap = new Map(tsp.map((p) => [p.id, p]));
    const targets = rows.map((r) => ({ id: r.id, en: squadEn.get(r.id) || (isEnglish(tspMap.get(r.id)?.name || "") ? tspMap.get(r.id)!.name : "") })).filter((t) => t.en && (FORCE || !prev[t.id]));
    console.log(`[${league}] 대상 ${rows.length} | 신규 ${targets.length}`);

    let done = 0, hit = 0;
    for (const t of targets) {
      const qid = await searchQid(t.en);
      let title = "";
      if (qid) {
        const sl = await getJSON(`${WD}?action=wbgetentities&ids=${qid}&props=sitelinks&format=json`);
        title = sl?.entities?.[qid]?.sitelinks?.enwiki?.title || "";
      }
      if (!title && isEnglish(t.en)) title = t.en; // sitelink 없으면 en명 직접 시도
      if (title) {
        try { const seasons = await fetchSeasons(title); if (seasons.length) { prev[t.id] = seasons; hit++; } }
        catch { /* skip */ }
      }
      if (++done % 50 === 0) { console.log(`  [${league}] ${done}/${targets.length} | hit ${hit}`); fs.writeFileSync(PATH, JSON.stringify(prev)); }
      await sleep(150);
    }
    fs.writeFileSync(PATH, JSON.stringify(prev));
    console.log(`[${league}] 완료 | hit ${hit} | 누적 ${Object.keys(prev).length}`);
  }
  console.log(`\n총 ${Object.keys(prev).length} 선수 시즌데이터`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
