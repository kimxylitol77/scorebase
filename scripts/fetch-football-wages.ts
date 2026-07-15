// 축구 주급/연봉 수집 — Capology 리그 페이지(리그당 1요청)를 파싱해 TS 선수 id 로 매칭,
// data/football-wages.json 생성. 5대리그, 3초 간격. 실행:
//   npx tsx --env-file=.env.local scripts/fetch-football-wages.ts
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 리그 → Capology 리그 연봉 페이지 경로 (2026-07 실측: EPL 확인, 나머지 실행 시 status 로 검증)
const LEAGUES: Array<{ league: string; path: string }> = [
  { league: "EPL", path: "/uk/premier-league/salaries/" },
  { league: "LALIGA", path: "/es/la-liga/salaries/" },
  { league: "BUNDESLIGA", path: "/de/1-bundesliga/salaries/" },
  { league: "SERIE_A", path: "/it/serie-a/salaries/" },
  { league: "LIGUE_1", path: "/fr/ligue-1/salaries/" },
];
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface SquadPlayer { id: string; name: string; position: string | null; number: number | null }
const T_SQUADS: Record<string, { squad: SquadPlayer[] }> = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/team-squads.json"), "utf-8"),
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

interface CapRow { name: string; clubSlug: string; eur: number; gbp: number | null; verified: boolean }

function parseLeaguePage(html: string): CapRow[] {
  const start = html.indexOf("var data");
  if (start < 0) return [];
  let seg = html.slice(start);
  seg = seg.slice(0, seg.indexOf("];"));
  const items = seg.split(/\{\s*'name':/).slice(1);
  const out: CapRow[] = [];
  for (const it of items) {
    const name = it.match(/loading='lazy'>([^<>]+)<\/a>/)?.[1]?.trim();
    const club = it.match(/\/club\/([^'/]+)\//)?.[1];
    const eur = it.match(/'annual_gross_eur':\s*accounting\.formatMoney\("(\d+)"/)?.[1];
    const gbp = it.match(/'annual_gross_gbp':\s*accounting\.formatMoney\("(\d+)"/)?.[1];
    if (!name || !club || !eur) continue;
    out.push({ name, clubSlug: club, eur: Number(eur), gbp: gbp ? Number(gbp) : null, verified: it.includes("verified-green") });
  }
  return out;
}

// 스쿼드 내 이름 매칭 — 완전일치 → 성(마지막 토큰) 유니크 → 부분포함 (transfer-xi 검증 로직).
function matchInSquad(name: string, squad: SquadPlayer[]): SquadPlayer | null {
  const n = norm(name);
  if (!n) return null;
  const exact = squad.find((p) => norm(p.name) === n);
  if (exact) return exact;
  const last = n.split(" ").pop()!;
  const byLast = squad.filter((p) => norm(p.name).split(" ").includes(last));
  if (byLast.length === 1) return byLast[0];
  const incl = squad.filter((p) => { const pn = norm(p.name); return pn.includes(n) || n.includes(pn); });
  return incl.length === 1 ? incl[0] : null;
}

async function main() {
  // 리그별 팀 (Team → TeamSourceId thesports → 스쿼드) — 클럽 슬러그 매칭용 영문명 포함.
  const teams = await prisma.team.findMany({
    where: { league: { in: LEAGUES.map((l) => l.league) } },
    select: { id: true, league: true, name: true, sourceIds: { where: { source: "thesports" }, select: { externalId: true } } },
  });
  interface ClubEntry { league: string; name: string; normName: string; tsId: string; squad: SquadPlayer[] }
  const clubs: ClubEntry[] = [];
  for (const t of teams) {
    const tsId = t.sourceIds[0]?.externalId;
    if (!tsId || !T_SQUADS[tsId]?.squad?.length) continue;
    clubs.push({ league: t.league, name: t.name, normName: norm(t.name), tsId, squad: T_SQUADS[tsId].squad });
  }
  console.log(`스쿼드 보유 클럽: ${clubs.length}`);

  const wages: Record<string, { eur: number; gbp: number | null; v: boolean; club: string; league: string }> = {};
  const stats: Record<string, { rows: number; matched: number }> = {};

  for (const lg of LEAGUES) {
    const url = `https://www.capology.com${lg.path}`;
    let html = "";
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) { console.warn(`[wages] ${lg.league} HTTP ${res.status} — 스킵 (${lg.path})`); await sleep(3000); continue; }
      html = await res.text();
    } catch (e) {
      console.warn(`[wages] ${lg.league} fetch 실패:`, (e as Error).message);
      await sleep(3000);
      continue;
    }
    const rows = parseLeaguePage(html);
    const lgClubs = clubs.filter((c) => c.league === lg.league);
    let matched = 0;
    for (const r of rows) {
      // 클럽 앵커 — 슬러그 토큰("manchester-united")과 팀 영문명 겹침으로 해석.
      const slugNorm = norm(r.clubSlug.replace(/-/g, " "));
      const club =
        lgClubs.find((c) => c.normName === slugNorm) ??
        lgClubs.find((c) => c.normName.includes(slugNorm) || slugNorm.includes(c.normName)) ??
        lgClubs.find((c) => { const st = new Set(slugNorm.split(" ")); return c.normName.split(" ").filter((w) => st.has(w)).length >= 2; });
      // 클럽 스쿼드 내 매칭 → 실패 시 리그 전체 완전일치(유니크)
      let hit = club ? matchInSquad(r.name, club.squad) : null;
      if (!hit) {
        const n = norm(r.name);
        const cands = lgClubs.flatMap((c) => c.squad.filter((p) => norm(p.name) === n));
        if (cands.length === 1) hit = cands[0];
      }
      if (!hit) continue;
      // 이미 있으면(동명 등) 더 높은 연봉 유지 — 임대 중복 방어
      if (!wages[hit.id] || wages[hit.id].eur < r.eur) {
        wages[hit.id] = { eur: r.eur, gbp: r.gbp, v: r.verified, club: r.clubSlug, league: lg.league };
        matched++;
      }
    }
    stats[lg.league] = { rows: rows.length, matched };
    console.log(`[wages] ${lg.league}: 행 ${rows.length} → 매칭 ${matched} (${Math.round((matched / Math.max(1, rows.length)) * 100)}%)`);
    await sleep(3000);
  }

  const out = { fetchedAt: new Date().toISOString(), players: wages };
  writeFileSync(path.join(process.cwd(), "data/football-wages.json"), JSON.stringify(out));
  console.log(`저장: data/football-wages.json — 총 ${Object.keys(wages).length}명`, JSON.stringify(stats));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
