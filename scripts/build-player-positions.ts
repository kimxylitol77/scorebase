// api-football 라인업 grid 집계 → data/player-positions-afgrid.json { tsId: {primary, others, apps} }.
// ts 캐시(TheSportsMatchCache)는 빅5 시즌종료로 희박(야말 3경기) → api-football 은 빅5·UCL·WC 전 시즌 라인업 보유(야말 35+).
// derive-detail-position.ts 가 이 파일을 우선 병합해 player-positions-detail.json 생성.
// 사용: npx tsx --env-file=.env.local scripts/build-player-positions.ts
import * as fs from "node:fs";
import { gridToPosition, type PosCode } from "../src/lib/players/grid-position";

const KEY = process.env.API_FOOTBALL_KEY!;
const BASE = "https://v3.football.api-sports.io";

// [afLeagueId, season] — 빅5·UCL 은 직전시즌(2025-26), WC 는 진행중(2026).
const SOURCES: Array<[number, number]> = [
  [39, 2025], [140, 2025], [78, 2025], [135, 2025], [61, 2025], // 빅5
  [2, 2025],  // UCL
  [1, 2026],  // World Cup 2026
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function af(path: string, params: Record<string, string | number>) {
  for (let a = 0; a < 4; a++) {
    try {
      const u = new URL(BASE + path);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
      const r = await fetch(u, { headers: { "x-apisports-key": KEY } });
      return await r.json();
    } catch { await sleep(1500 * (a + 1)); }
  }
  return { response: [] };
}

async function main() {
  const counts = new Map<number, Map<PosCode, number>>();
  const bump = (pid: number, pos: PosCode) => {
    let m = counts.get(pid); if (!m) { m = new Map(); counts.set(pid, m); }
    m.set(pos, (m.get(pos) ?? 0) + 1);
  };

  for (const [lg, season] of SOURCES) {
    const fj = await af("/fixtures", { league: lg, season });
    interface AfFixtureLite { fixture?: { id?: number; status?: { short?: string } } }
    const fixtures = ((fj.response ?? []) as AfFixtureLite[])
      .filter((f) => f.fixture?.status?.short === "FT")
      .flatMap((f) => (f.fixture?.id != null ? [f.fixture.id] : []));
    console.log(`[league ${lg}/${season}] FT: ${fixtures.length}`);
    let n = 0;
    for (const fid of fixtures) {
      const lj = await af("/fixtures/lineups", { fixture: fid });
      for (const t of lj.response ?? []) {
        const form = t.formation as string | null;
        for (const pl of t.startXI ?? []) {
          const pos = gridToPosition(form, pl.player?.grid);
          if (pl.player?.id && pos) bump(pl.player.id, pos);
        }
      }
      if (++n % 60 === 0) console.log(`  ${lg}: ${n}/${fixtures.length}`);
      await sleep(230);
    }
  }

  // af playerId → tsId
  const map = JSON.parse(fs.readFileSync("data/ts-af-player-map.json", "utf8"));
  const afToTs = new Map<number, string>();
  for (const [ts, af] of Object.entries(map.tsToAf ?? {})) afToTs.set(af as number, ts);

  const PRIORITY = ["ST", "CB", "GK", "CAM", "CDM", "CM", "RW", "LW", "RB", "LB", "RM", "LM", "RWB", "LWB", "CF", "SS"];
  const out: Record<string, { primary: PosCode; others: PosCode[]; apps: number }> = {};
  for (const [pid, m] of counts) {
    const tsId = afToTs.get(pid);
    if (!tsId) continue;
    const total = [...m.values()].reduce((s, c) => s + c, 0);
    if (total < 3) continue;
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
    const primary = sorted[0][0];
    const others = sorted.slice(1).filter(([, c]) => c >= 2 && c / total >= 0.2).slice(0, 3).map(([p]) => p);
    out[tsId] = { primary, others, apps: total };
  }
  fs.writeFileSync("data/player-positions-afgrid.json", JSON.stringify(out));
  console.log(`\nafgrid 포지션: ${Object.keys(out).length} | 야말: ${JSON.stringify(out["4jwq2ghxjzkvm0v"])}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
