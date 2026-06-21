// 선수 한글명 위키 통일 (리그 지정) — player-season-stats.json 의 해당 리그 선수 대상.
// 위키 ko langlink 정본 → theSportsPlayer.nameKo(DB 즉시) + player-overrides.json(OV 영구). 멱등.
// 실행: node --env-file=.env.local scripts/build-player-names-wiki.mjs [--dry] EPL LALIGA BUNDESLIGA SERIE_A LIGUE_1
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const leagues = new Set(args.filter((a) => !a.startsWith("--")));
if (!leagues.size) { console.error("리그 코드 필요 (예: EPL LALIGA ...)"); process.exit(1); }
const prisma = new PrismaClient();
const UA = "scorebase-bot/1.0 (+https://scorebase.kr)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, label) { for (let i = 0; i < 6; i++) { try { return await fn(); } catch (e) { console.error(`${label} retry ${i + 1}: ${e.code || e.message}`); await sleep(2500); } } throw new Error(`${label} 실패`); }

const season = JSON.parse(readFileSync("data/player-season-stats.json", "utf8"));
const ids = Object.keys(season).filter((k) => leagues.has(season[k]?.lg));
console.log(`대상 ${[...leagues].join(",")} · 선수 ${ids.length}`);
const players = (await retry(async () => {
  const out = [];
  for (let j = 0; j < ids.length; j += 500) out.push(...await prisma.theSportsPlayer.findMany({ where: { id: { in: ids.slice(j, j + 500) } }, select: { id: true, name: true, nameKo: true } }));
  return out;
}, "DB read")).filter((p) => p.name);
console.log(`DB 매칭 ${players.length}`);

const titleToKo = new Map(), resolveMap = new Map();
const names = [...new Set(players.map((p) => p.name))];
for (let i = 0; i < names.length; i += 50) {
  const chunk = names.slice(i, i + 50);
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=langlinks&titles=${encodeURIComponent(chunk.join("|"))}&lllang=ko&format=json&redirects=1&lllimit=50`;
  const q = (await (await fetch(url, { headers: { "User-Agent": UA } })).json()).query || {};
  const norm = new Map((q.normalized || []).map((n) => [n.from, n.to])), redir = new Map((q.redirects || []).map((x) => [x.from, x.to]));
  for (const n of chunk) { let t = norm.get(n) || n; t = redir.get(t) || t; resolveMap.set(n, t); }
  for (const p of Object.values(q.pages || {})) { const ko = p.langlinks?.[0]?.["*"]; if (p.title && ko) titleToKo.set(p.title, ko.replace(/\s*\(.*\)\s*$/, "").trim()); }
  await sleep(220);
}
const fixes = []; let wikiHit = 0;
for (const p of players) {
  const wk = titleToKo.get(resolveMap.get(p.name) || p.name);
  if (!wk) continue; wikiHit++;
  if ((p.nameKo || "").replace(/\s/g, "") !== wk.replace(/\s/g, "")) fixes.push({ id: p.id, from: p.nameKo || "", to: wk });
}
console.log(`위키 ko 보유 ${wikiHit} · 교정 대상 ${fixes.length} (DRY=${DRY})`);
console.log(fixes.slice(0, 30).map((f) => `  ${f.from || "(빈값)"} → ${f.to}`).join("\n"));
if (DRY) { await prisma.$disconnect(); process.exit(0); }
let dbDone = 0;
for (let i = 0; i < fixes.length; i += 20) { const b = fixes.slice(i, i + 20); await retry(() => prisma.$transaction(b.map((f) => prisma.theSportsPlayer.update({ where: { id: f.id }, data: { nameKo: f.to } }))), `DB write@${i}`); dbDone += b.length; }
console.log(`DB nameKo 갱신 ${dbDone}`);
const ov = JSON.parse(readFileSync("data/player-overrides.json", "utf8"));
for (const f of fixes) ov[f.id] = { ...(ov[f.id] || {}), nameKo: f.to };
writeFileSync("data/player-overrides.json", JSON.stringify(ov));
console.log(`OV nameKo 등록 ${fixes.length}`);
await prisma.$disconnect();
