// 해외파 한국 선수 세부 포지션 수집 → data/player-positions-afgrid.json 병합.
//
// 왜 전용 스크립트인가: build-player-positions 는 빅5·UCL·WC 라인업만 훑고, af→ts 매핑도
//   ts-af-player-map 에 의존한다. 해외파는 리그도 매핑도 밖이라 세부 포지션이 13/25 뿐이었다.
//
// 비용 절약: 리그 전 경기가 아니라 **이미 적재된 PlayerMatchLog 에서 선발 출전한 경기만** 골라
//   라인업(1콜/경기)을 받는다. 선수당 최근 N경기면 최빈값이 안정되므로 --recent 로 제한한다.
//
//   npx tsx --env-file=.env.local scripts/collect-korea-abroad-positions.ts
//   npx tsx --env-file=.env.local scripts/collect-korea-abroad-positions.ts --recent=25
//
// 실행 후 derive-detail-position.ts 를 돌려야 player-positions-detail.json 에 반영된다.
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { gridToPosition, type PosCode } from "../src/lib/players/grid-position";

const prisma = new PrismaClient();
const KEY = process.env.API_FOOTBALL_KEY!;
const BASE = "https://v3.football.api-sports.io";
const KA = path.join(__dirname, "..", "data", "korea-abroad.json");
const AFGRID = path.join(__dirname, "..", "data", "player-positions-afgrid.json");
const RECENT = Number(process.argv.find((a) => a.startsWith("--recent="))?.split("=")[1] ?? "20");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function af(pathname: string, params: Record<string, string | number>) {
  for (let a = 0; a < 4; a++) {
    try {
      const u = new URL(BASE + pathname);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
      const r = await fetch(u, { headers: { "x-apisports-key": KEY } });
      return await r.json();
    } catch {
      await sleep(1500 * (a + 1));
    }
  }
  return { response: [] };
}

// build-player-positions 와 같은 집계 규칙 — 결과 파일이 같으니 규칙도 같아야 한다
const PRIORITY = ["ST", "CB", "GK", "CAM", "CDM", "CM", "RW", "LW", "RB", "LB", "RM", "LM", "RWB", "LWB", "CF", "SS"];

async function main() {
  const doc = JSON.parse(fs.readFileSync(KA, "utf8")) as {
    players: Array<{ afId: number; tsId: string | null; nameKo: string }>;
  };
  const players = doc.players.filter((p) => p.tsId);
  const tsByAf = new Map(players.map((p) => [p.afId, p.tsId!]));
  const nameByAf = new Map(players.map((p) => [p.afId, p.nameKo]));

  // 선발 출전 경기만 — 교체 출전은 grid 가 없어 포지션 판정에 못 쓴다
  const fixtureIds = new Set<number>();
  for (const p of players) {
    const logs = await prisma.playerMatchLog.findMany({
      where: { playerId: p.tsId!, started: true },
      orderBy: { date: "desc" },
      take: RECENT,
      select: { fixtureId: true },
    });
    for (const l of logs) fixtureIds.add(l.fixtureId);
  }
  console.log(`대상 선수 ${players.length} · 선발 경기(중복 제거) ${fixtureIds.size} · 최근 ${RECENT}경기/인`);

  const counts = new Map<number, Map<PosCode, number>>();
  let n = 0;
  for (const fid of fixtureIds) {
    const lj = await af("/fixtures/lineups", { fixture: fid });
    for (const t of lj.response ?? []) {
      const form = t.formation as string | null;
      for (const pl of t.startXI ?? []) {
        const pid = pl.player?.id as number | undefined;
        if (!pid || !tsByAf.has(pid)) continue;
        const pos = gridToPosition(form, pl.player?.grid);
        if (!pos) continue;
        let m = counts.get(pid);
        if (!m) {
          m = new Map();
          counts.set(pid, m);
        }
        m.set(pos, (m.get(pos) ?? 0) + 1);
      }
    }
    if (++n % 100 === 0) console.log(`  ...${n}/${fixtureIds.size}`);
    await sleep(230);
  }

  // 기존 afgrid 에 병합 (다른 선수 항목은 그대로 둔다)
  const grid = JSON.parse(fs.readFileSync(AFGRID, "utf8")) as Record<string, { primary: PosCode; others: PosCode[]; apps: number }>;
  let added = 0, thin = 0;
  for (const [pid, m] of counts) {
    const tsId = tsByAf.get(pid)!;
    const total = [...m.values()].reduce((s, c) => s + c, 0);
    if (total < 3) {
      thin++;
      continue;
    }
    const sorted = [...m.entries()].sort((a, b) => b[1] - a[1] || PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]));
    const others = sorted.slice(1).filter(([, c]) => c >= 2 && c / total >= 0.2).slice(0, 3).map(([p]) => p);
    grid[tsId] = { primary: sorted[0][0], others, apps: total };
    added++;
    console.log(`  ${nameByAf.get(pid)} → ${sorted[0][0]}${others.length ? ` [${others.join(",")}]` : ""} (${total}경기)`);
  }
  fs.writeFileSync(AFGRID, JSON.stringify(grid));
  console.log(`\nafgrid 병합 +${added} (표본 부족 ${thin}) · 총 ${Object.keys(grid).length}건`);
  console.log("다음: npx tsx --env-file=.env.local scripts/derive-detail-position.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
