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

// 좌우 구체 포지션(헤더 "선호/뛸 수 있는"용). x<50=오른쪽, x>50=왼쪽 (실측 검증: 야말·사카·살라 RW=저x / 레앙·크바라 LW=고x).
function classifyDetail(pos: string, x: number, y: number): string | null {
  if (!(x > 0)) return null;
  const lat = Math.abs(x - 50);
  const R = x < 50; // 낮은 x = 오른쪽
  if (pos === "G") return "GK";
  if (pos === "D") { if (lat < 22) return "CB"; return R ? "RB" : "LB"; }
  if (pos === "F") { if (lat < 22) return "ST"; return R ? "RW" : "LW"; }
  if (pos === "M") {
    if (lat >= 30) return R ? "RW" : "LW";
    if (y < 60) return "CDM";
    if (y < 70) return "CM";
    return "CAM";
  }
  return null;
}

// 출장 경기마다 push — 단일 경기 좌표는 임시 포지션(백3 좌CB·임시 LB 등) 노이즈가 커서
// 전 경기 분류 후 최빈값을 채택한다 (예: 반 데 벤이 마지막 경기 좌표로 FB 오분류되던 버그).
function collectCache(lu: unknown, m: Map<string, Array<{ pos: string; x: number; y: number }>>) {
  const root = lu as Record<string, any> | null;
  const lineup = root?.lineup ?? root;
  for (const k of ["home", "away"]) {
    const side = lineup?.[k];
    const players = Array.isArray(side) ? side : side?.players ?? [];
    if (Array.isArray(players)) for (const p of players) {
      if (p?.id && ["G", "D", "M", "F"].includes(p.position) && typeof p.x === "number" && p.x > 0) {
        const arr = m.get(p.id) ?? [];
        arr.push({ pos: p.position, x: p.x, y: typeof p.y === "number" ? p.y : 50 });
        m.set(p.id, arr);
      }
    }
  }
}

async function main() {
  const xy = new Map<string, Array<{ pos: string; x: number; y: number }>>();
  const caches = await prisma.theSportsMatchCache.findMany({ select: { lineup: true } });
  for (const c of caches) if (c.lineup) collectCache(c.lineup, xy);
  console.log("캐시 x/y 선수:", xy.size);
  if (fs.existsSync("/tmp/lineup-xy.json")) {
    const coll: { id: string; position: string; x: number; y: number }[] = JSON.parse(fs.readFileSync("/tmp/lineup-xy.json", "utf8"));
    for (const r of coll) if (["G", "D", "M", "F"].includes(r.position) && r.x > 0) {
      const arr = xy.get(r.id) ?? [];
      arr.push({ pos: r.position, x: r.x, y: typeof r.y === "number" ? r.y : 50 });
      xy.set(r.id, arr);
    }
    console.log("union(+worker):", xy.size);
  }

  // 출장별 분류 → 최빈 코드 채택. 동률이면 중앙 해석 우선(CB>FB, ST>W) —
  // 좌표 노이즈는 빌드업 치우침 등으로 측면으로 튀는 경우가 대부분(예: 반 데 벤 CB·FB 1:1 동률).
  // 그 외 동률은 최근 출장 코드 (push 가 시간순이라 뒤쪽이 최신).
  const CENTRAL_FIRST = ["CB", "ST", "GK", "DM", "CM", "AM", "FB", "W"];
  const map: Record<string, string> = {};
  let multi = 0;
  for (const [id, apps] of xy) {
    const codes = apps.map((a) => classify(a.pos, a.x, a.y)).filter((c): c is string => !!c);
    if (!codes.length) continue;
    const cnt = new Map<string, number>();
    for (const c of codes) cnt.set(c, (cnt.get(c) || 0) + 1);
    if (cnt.size > 1) multi++;
    const maxN = Math.max(...cnt.values());
    const tied = [...cnt.entries()].filter(([, n]) => n === maxN).map(([c]) => c);
    if (tied.length === 1) { map[id] = tied[0]; continue; }
    const central = tied.filter((c) => ["CB", "ST"].includes(c));
    if (central.length === 1) { map[id] = central[0]; continue; }
    const tiedSet = new Set(tied);
    map[id] = [...codes].reverse().find((c) => tiedSet.has(c)) ?? tied.sort((a, b) => CENTRAL_FIRST.indexOf(a) - CENTRAL_FIRST.indexOf(b))[0];
  }
  console.log(`복수 포지션 관측 선수: ${multi}`);
  fs.writeFileSync("data/player-positions.json", JSON.stringify(map));
  console.log("세부 포지션 도출:", Object.keys(map).length);

  const dist: Record<string, number> = {};
  for (const v of Object.values(map)) dist[v] = (dist[v] || 0) + 1;
  console.log("분포:", JSON.stringify(dist));

  // 좌우 구체 포지션 + 다중(선호/뛸 수 있는) — 헤더 바이오 패널용. player-positions-detail.json.
  // 선호 = 최빈, 뛸 수 있는 = 그 외 코드 중 2회+ & 20%+ (최대 3). 표본<3 제외.
  const DETAIL_PRIORITY = ["ST", "CB", "GK", "CAM", "CDM", "CM", "RW", "LW", "RB", "LB"];
  const detail: Record<string, { primary: string; others: string[]; apps: number }> = {};
  for (const [id, apps] of xy) {
    const codes = apps.map((a) => classifyDetail(a.pos, a.x, a.y)).filter((c): c is string => !!c);
    if (codes.length < 3) continue;
    const cnt = new Map<string, number>();
    for (const c of codes) cnt.set(c, (cnt.get(c) || 0) + 1);
    const total = codes.length;
    const sorted = [...cnt.entries()].sort((a, b) => b[1] - a[1] || DETAIL_PRIORITY.indexOf(a[0]) - DETAIL_PRIORITY.indexOf(b[0]));
    const primary = sorted[0][0];
    const others = sorted.slice(1)
      .filter(([, n]) => n >= 2 && n / total >= 0.2)
      .slice(0, 3)
      .map(([c]) => c);
    detail[id] = { primary, others, apps: total };
  }
  fs.writeFileSync("data/player-positions-detail.json", JSON.stringify(detail));
  console.log("좌우 구체 포지션:", Object.keys(detail).length, "| 야말:", JSON.stringify(detail["4jwq2ghxjzkvm0v"]));

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
