// 세부 포지션 도출 → data/player-positions.json.
// 소스 union: TheSportsMatchCache.lineup(x/y) + /tmp/lineup-xy.json(worker 수집, 있으면).
// 분류(|x-50|): GK / CB(중앙수비)·FB(윙백) / MF / W(윙어)·ST(스트라이커). db push 없음.
//   npx tsx --env-file=.env.local scripts/derive-detail-position.ts
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();

// y 는 팀 정규화 좌표(GK=12 → F=90, 수비→공격). x 는 측면(|x-50| 큼).
function classify(pos: string, x: number, y: number): string | null {
  if (!(x > 0)) return null; // x=0 = 미배치(교체 등)
  const lat = Math.abs(x - 50);
  if (pos === "G") return "GK";
  if (pos === "D") return lat >= 22 ? "FB" : "CB";       // 윙백 / 중앙수비
  if (pos === "F") return lat >= 22 ? "W" : "ST";        // 윙어 / 스트라이커
  if (pos === "M") {
    if (lat >= 30) return "W";                            // 측면 미드 = 윙어
    if (y < 60) return "DM";                              // 수비형
    if (y < 70) return "CM";                              // 중앙
    return "AM";                                          // 공격형
  }
  return null;
}

function collectCache(lu: unknown, m: Map<string, { pos: string; x: number; y: number }>) {
  const root = lu as Record<string, any> | null;
  const lineup = root?.lineup ?? root;
  for (const k of ["home", "away"]) {
    const side = lineup?.[k];
    const players = Array.isArray(side) ? side : side?.players ?? [];
    if (Array.isArray(players)) for (const p of players) {
      if (p?.id && ["G", "D", "M", "F"].includes(p.position) && typeof p.x === "number" && p.x > 0) {
        m.set(p.id, { pos: p.position, x: p.x, y: typeof p.y === "number" ? p.y : 50 });
      }
    }
  }
}

async function main() {
  const xy = new Map<string, { pos: string; x: number; y: number }>();
  const caches = await prisma.theSportsMatchCache.findMany({ select: { lineup: true } });
  for (const c of caches) if (c.lineup) collectCache(c.lineup, xy);
  console.log("캐시 x/y:", xy.size);
  if (fs.existsSync("/tmp/lineup-xy.json")) {
    const coll: { id: string; position: string; x: number; y: number }[] = JSON.parse(fs.readFileSync("/tmp/lineup-xy.json", "utf8"));
    for (const r of coll) if (["G", "D", "M", "F"].includes(r.position) && r.x > 0 && !xy.has(r.id)) xy.set(r.id, { pos: r.position, x: r.x, y: typeof r.y === "number" ? r.y : 50 });
    console.log("union(+신규):", xy.size);
  }

  const map: Record<string, string> = {};
  for (const [id, e] of xy) { const c = classify(e.pos, e.x, e.y); if (c) map[id] = c; }
  fs.writeFileSync("data/player-positions.json", JSON.stringify(map));
  console.log("세부 포지션 도출:", Object.keys(map).length);

  const dist: Record<string, number> = {};
  for (const v of Object.values(map)) dist[v] = (dist[v] || 0) + 1;
  console.log("분포:", JSON.stringify(dist));

  const rows = await prisma.playerMarketValue.findMany({
    where: { league: { in: ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] }, currentValue: { not: null } },
    orderBy: { currentValue: "desc" }, select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  const covAt = (n: number) => { const s = ids.slice(0, n); return Math.round(s.filter((id) => map[id]).length / s.length * 100); };
  console.log(`빅5 커버리지: 전체 ${covAt(ids.length)}% | 상위500 ${covAt(500)}% | 상위1000 ${covAt(1000)}%`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
