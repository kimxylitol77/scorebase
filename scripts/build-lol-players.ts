// LOL 선수 프로필 백필 — DB lolGames 의 선수(playerId) → TheSports player/list → data/lol-players.json.
// 로컬 전용(ts IP whitelist). 사진·본명·포지션·생일·소속. 사용: npx tsx scripts/build-lol-players.ts
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import fs from "fs";
import type { TsListResponse, TsPlayerRow } from "./_external-api-types";

async function g<T = TsPlayerRow>(path: string, params: Record<string, string | number>): Promise<TsListResponse<T>> {
  try {
    return (await thesportsGet(path, params)) as TsListResponse<T>;
  } catch (e) {
    return { err: (e as Error).message };
  }
}

(async () => {
  // DB lolGames 에서 등장 선수 playerId 수집
  const matches = await prisma.match.findMany({
    where: { league: "LOL", lolGames: { not: null } },
    select: { lolGames: true },
  });
  const pids = new Set<string>();
  for (const m of matches) {
    const d = JSON.parse(m.lolGames!);
    for (const s of d.sets) for (const p of s.players) if (p.playerId) pids.add(p.playerId);
  }
  console.log(`lolGames 등장 선수: ${pids.size}`);

  // 프로필 fetch (player/list?uuid 단건)
  const players: Record<string, unknown> = {};
  let ok = 0;
  for (const pid of pids) {
    const r = await g("/v1/lol/player/list", { uuid: pid });
    const x = r.results?.[0];
    if (x) {
      players[pid] = {
        name: x.name,
        realName: x.real_name || "",
        photo: x.logo || "",
        position: x.position ?? null,
        birthday: x.birthday || null,
        teamId: x.team_id || "",
        countryId: x.country_id || "",
      };
      ok++;
    }
  }
  fs.writeFileSync(
    "data/lol-players.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), players }, null, 2),
  );
  console.log(`저장 ${ok}/${pids.size}명 → data/lol-players.json`);
  const sample = Object.entries(players).slice(0, 5);
  for (const [pid, p] of sample) {
    const v = p as { name?: string; realName?: string; position?: unknown };
    console.log(`  ${v.name} (${v.realName}) pos=${v.position}`);
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
