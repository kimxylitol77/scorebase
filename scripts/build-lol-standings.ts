// LCK 리그순위 백필 — TheSports table/list → data/lol-standings.json. 로컬 전용(ts IP whitelist).
// 정규시즌 stage 동적 선택(LCK tournament 행 중 팀 최다·경기 최다 stage). 사용: npx tsx scripts/build-lol-standings.ts
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { TS_LOL_TEAMS } from "@/lib/sports/lol-thesports";
import { prisma } from "@/lib/db";
import fs from "fs";

const LCK = "l7oqd9kb6y6m510"; // LCK 2026 본선 tournament

async function g(path: string, params: Record<string, string | number>): Promise<any> {
  try {
    return await thesportsGet(path, params);
  } catch (e) {
    return { err: (e as Error).message };
  }
}

(async () => {
  // table page 순회 → LCK tournament 행 수집
  const lckRows: any[] = [];
  for (let pg = 1; pg <= 12; pg++) {
    const r: any = await g("/v1/lol/tournament/table/list", { page: pg });
    const rs: any[] = r.results ?? [];
    if (!rs.length) break;
    lckRows.push(...rs.filter((x: any) => x.tournament_id === LCK));
  }
  console.log(`LCK table 행: ${lckRows.length}`);

  // stage 별 그룹 → 정규시즌(팀 최다·경기 최다) stage 선택
  const byStage = new Map<string, any[]>();
  for (const r of lckRows) {
    const arr = byStage.get(r.stage_id) ?? [];
    arr.push(r);
    byStage.set(r.stage_id, arr);
  }
  let best: { sid: string; rows: any[]; teams: number; played: number } | null = null;
  for (const [sid, rows] of byStage) {
    const teams = new Set(rows.map((r) => r.team_id)).size;
    const played = rows.reduce((s, r) => s + (Number(r.win) || 0) + (Number(r.lose) || 0), 0);
    if (!best || teams > best.teams || (teams === best.teams && played > best.played)) {
      best = { sid, rows, teams, played };
    }
  }
  if (!best) {
    console.log("정규 stage 못 찾음");
    return;
  }
  console.log(`정규 stage=${best.sid} 팀=${best.teams} 경기합=${best.played}`);

  // stage 내 팀별 1행(중복 제거) + 순위 정렬
  const seen = new Set<string>();
  const standings = best.rows
    .filter((r) => {
      if (seen.has(r.team_id)) return false;
      seen.add(r.team_id);
      return true;
    })
    .sort((a, b) => (Number(a.position) || 99) - (Number(b.position) || 99))
    .map((r, i) => {
      const t = TS_LOL_TEAMS[r.team_id];
      return {
        rank: Number(r.position) || i + 1,
        teamId: r.team_id,
        name: t?.name ?? r.team_id,
        short: t?.short ?? "?",
        logo: t?.logo ?? "",
        win: Number(r.win) || 0,
        lose: Number(r.lose) || 0,
      };
    });

  // DB Team id 조인 (팀 클릭 → /teams/{dbId}). name 매칭(TS_LOL_TEAMS 한글명 = DB Team name).
  const dbTeams = await prisma.team.findMany({
    where: { name: { in: standings.map((s) => s.name) } },
    select: { id: true, name: true },
  });
  const dbIdByName = new Map(dbTeams.map((t) => [t.name, t.id]));
  const withDb = standings.map((s) => ({ ...s, dbId: dbIdByName.get(s.name) ?? null }));

  fs.writeFileSync(
    "data/lol-standings.json",
    JSON.stringify({ league: "LOL", name: "LCK", updatedAt: new Date().toISOString(), standings: withDb }, null, 2),
  );
  console.log(`저장 ${withDb.length}팀:`);
  for (const s of withDb) console.log(`  ${s.rank}. ${s.short} ${s.name} ${s.win}-${s.lose} dbId=${s.dbId}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
