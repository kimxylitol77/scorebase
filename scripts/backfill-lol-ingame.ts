// 과거 LCK 인게임 백필 — TheSports 세트·선수보드 조립 → DB Match.lolGames/lolTsMatchId.
// 로컬 전용(ts IP whitelist). 사용: npx tsx scripts/backfill-lol-ingame.ts
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { TS_LOL_TOURNAMENTS, TS_LOL_TEAMS } from "@/lib/sports/lol-thesports";
import { buildLolGames } from "@/lib/sports/lol-ingame";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

// LEC Spring(3/28~)·LCS Spring(4/3~)·LCK 본선(4/1~) 커버. 시즌 전체 인게임 백필.
const SINCE = Math.floor(new Date("2026-03-20T00:00:00Z").getTime() / 1000);

async function g(path: string, params: Record<string, string | number>): Promise<any> {
  try {
    return await thesportsGet(path, params);
  } catch (e) {
    return { err: (e as Error).message };
  }
}

// time 증분 슬라이딩 — 1000건 초과 시 마지막 updated_at 으로 다음 윈도우. dedup by id.
async function fetchAllSince(path: string, since: number): Promise<any[]> {
  const out: any[] = [];
  let t = since;
  for (let i = 0; i < 40; i++) {
    const r = await g(path, { time: t });
    const rs: any[] = r.results ?? [];
    if (!rs.length) break;
    out.push(...rs);
    if (rs.length < 1000) break;
    const maxU = Math.max(...rs.map((x) => Number(x.updated_at) || 0));
    if (maxU <= t) break;
    t = maxU;
  }
  const seen = new Set<string>();
  const dedup: any[] = [];
  for (const x of out) {
    const id = String(x.id);
    if (!seen.has(id)) {
      seen.add(id);
      dedup.push(x);
    }
  }
  return dedup;
}

(async () => {
  // 1. LCK 계열 ts 매치 (mlive=1, SINCE 이후)
  const tsMatches: any[] = [];
  for (const uuid of Object.keys(TS_LOL_TOURNAMENTS)) {
    const r = await g("/v1/lol/match/tournament", { uuid });
    for (const m of r.results ?? []) {
      if ((Number(m.match_time) || 0) >= SINCE && m.coverage?.mlive === 1) tsMatches.push(m);
    }
  }
  console.log(`LCK mlive=1 매치(${new Date(SINCE * 1000).toISOString().slice(0, 10)}~): ${tsMatches.length}`);

  // 2. 인게임 raw (슬라이딩)
  const rawSets = await fetchAllSince("/v1/lol/match/single/list", SINCE);
  const rawPlayers = await fetchAllSince("/v1/lol/match/single/player/stat/list", SINCE);
  console.log(`raw 세트 ${rawSets.length} / 선수레코드 ${rawPlayers.length}`);

  // 3. LCK 매치 한정 필터 (사전·선수명 최소화)
  const lckMatchIds = new Set(tsMatches.map((m) => String(m.id)));
  const lckSets = rawSets.filter((s) => lckMatchIds.has(String(s.match_id)));
  const lckSetIds = new Set(lckSets.map((s) => String(s.id)));
  const lckPlayers = rawPlayers.filter((p) => lckSetIds.has(String(p.match_single_id)));
  console.log(`LCK 세트 ${lckSets.length} / 선수 ${lckPlayers.length}`);

  // 4. 사전 + 선수명
  const heroR = await g("/v1/lol/hero/list", { page: 1 });
  const heroMap = new Map<string, { name: string; logo: string }>(
    (heroR.results ?? []).map((h: any) => [String(h.id), { name: h.name, logo: h.logo }]),
  );
  const eqR = await g("/v1/lol/equipment/list", { page: 1 });
  const eqMap = new Map<string, { name: string; logo: string }>(
    (eqR.results ?? []).map((e: any) => [String(e.id), { name: e.name, logo: e.logo }]),
  );
  const pids = [...new Set(lckPlayers.map((p) => String(p.player_id)))];
  const nameMap = new Map<string, string>();
  for (const pid of pids) {
    const r = await g("/v1/lol/player/list", { uuid: pid });
    const x = r.results?.[0];
    if (x?.name) nameMap.set(pid, x.name);
  }
  console.log(`사전 hero ${heroMap.size} / equip ${eqMap.size} / 선수명 ${nameMap.size}`);

  // 5. 조립
  const teamMap = new Map(
    Object.entries(TS_LOL_TEAMS).map(([id, v]) => [id, { name: v.name, short: v.short }]),
  );
  const games = buildLolGames(lckSets, lckPlayers, heroMap, eqMap, nameMap, teamMap);
  console.log(`조립 매치: ${games.size}`);

  // 6. DB 매칭(ts match_time ±30분, league LOL/LCK_CL) + 저장
  let saved = 0;
  let missed = 0;
  for (const m of tsMatches) {
    const data = games.get(String(m.id));
    if (!data || !data.sets.length) continue;
    const st = new Date((Number(m.match_time) || 0) * 1000);
    const lo = new Date(st.getTime() - 30 * 60000);
    const hi = new Date(st.getTime() + 30 * 60000);
    const dbm = await prisma.match.findFirst({
      where: { league: { in: [...LOL_LEAGUES] }, startTime: { gte: lo, lte: hi } },
      select: { id: true, externalId: true },
    });
    if (!dbm) {
      missed++;
      console.log(`  매칭X ts=${m.id} ${st.toISOString().slice(0, 16)} (${data.sets.length}세트)`);
      continue;
    }
    await prisma.match.update({
      where: { id: dbm.id },
      data: { lolGames: JSON.stringify(data), lolTsMatchId: String(m.id) },
    });
    saved++;
  }
  console.log(`\n저장 ${saved}건 / 매칭실패 ${missed}건`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
