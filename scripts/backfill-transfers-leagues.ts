// 확장 리그(data/transfer-league-teams.json) 이적 백필 — TheSports transfer/list 전량 스캔.
// from/to 팀이 사전에 매칭되는 row 만 keep → FootballTransfer createMany(skipDuplicates).
// 기존 빅5 row 는 PK 충돌 시 보존(skip) — league 태깅 덮어쓰지 않음.
// league 태깅: to_team 우선(도착 리그), 없으면 from_team.
// whitelisted IP 필요(맥북 OK). 멱등 — 재실행 안전.
//
//   npx tsx --env-file=.env.local scripts/backfill-transfers-leagues.ts [startPage] [endPage]
//   (인자 생략 시 1~3500. 전 세계 목록은 id 순(시간순 아님)이라 전 구간 스캔해야 이력 완성)
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const TEAMS: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "transfer-league-teams.json"), "utf8"),
);
const U = process.env.THESPORTS_USER || "", S = process.env.THESPORTS_SECRET || "";
const B = "https://api.thesports.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TRow {
  id: string; player_id: string;
  from_team_id?: string; from_team_name?: string;
  to_team_id?: string; to_team_name?: string;
  transfer_type?: number; transfer_time?: number; transfer_fee?: number; transfer_desc?: string;
}

async function getPage(page: number): Promise<TRow[] | null> {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(
        `${B}/v1/football/transfer/list?user=${U}&secret=${S}&page=${page}`,
        { signal: AbortSignal.timeout(25000) },
      );
      const d = (await r.json()) as { code?: number; results?: TRow[] };
      if (d.code === 0) return d.results ?? [];
    } catch { /* retry */ }
    await sleep(2500);
  }
  return null;
}

type Kept = {
  id: string; playerId: string; fromTeamId: string | null; fromTeamName: string | null;
  toTeamId: string | null; toTeamName: string | null; transferType: number | null;
  transferTime: number | null; transferFee: number | null; transferDesc: string | null; league: string;
};

async function main() {
  console.log(`사전 팀 수: ${Object.keys(TEAMS).length}`);
  let pending: Kept[] = [];
  let inserted = 0;
  let keptTotal = 0;
  // 100 page 마다 DB flush — 중단(kill/timeout)돼도 그 지점까지 저장 (skipDuplicates 멱등)
  const flush = async () => {
    for (let i = 0; i < pending.length; i += 1000) {
      const r = await prisma.footballTransfer.createMany({ data: pending.slice(i, i + 1000), skipDuplicates: true });
      inserted += r.count;
    }
    pending = [];
  };
  const startPage = parseInt(process.argv[2] ?? "1", 10) || 1;
  const endPage = parseInt(process.argv[3] ?? "3500", 10) || 3500;
  let empty = 0;
  for (let page = startPage; page <= endPage; page++) {
    const res = await getPage(page);
    if (res === null) { console.log(`! page ${page} 실패 — skip`); continue; }
    if (res.length === 0) { empty++; if (empty >= 2) break; continue; }
    empty = 0;
    for (const t of res) {
      if (!t.id || !t.player_id) continue;
      const league = (t.to_team_id && TEAMS[t.to_team_id]) || (t.from_team_id && TEAMS[t.from_team_id]) || null;
      if (!league) continue;
      keptTotal++;
      pending.push({
        id: t.id, playerId: t.player_id,
        fromTeamId: t.from_team_id || null, fromTeamName: t.from_team_name || null,
        toTeamId: t.to_team_id || null, toTeamName: t.to_team_name || null,
        transferType: t.transfer_type ?? null, transferTime: t.transfer_time ?? null,
        transferFee: t.transfer_fee ?? null, transferDesc: t.transfer_desc || null, league,
      });
    }
    if (page % 100 === 0) {
      await flush();
      console.log(`  page ${page} — kept ${keptTotal}, inserted ${inserted}`);
    }
    await sleep(500);
  }
  await flush();
  console.log(`✓ 스캔 완료 — kept ${keptTotal}, insert ${inserted} (중복 skip ${keptTotal - inserted})`);
  const byLeague = await prisma.footballTransfer.groupBy({
    by: ["league"], _count: { _all: true },
    where: { league: { in: [...new Set(Object.values(TEAMS))] } },
  });
  for (const b of byLeague) console.log(`  ${b.league}: ${b._count._all}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
