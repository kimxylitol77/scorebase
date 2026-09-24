// LOL 선수 프로필 사전 — DB lolGames 의 선수(playerId) → TheSports player/list → data/lol-players.json.
// 사진·본명·포지션·생일·소속. 로컬 전용(ts IP whitelist).
// 사용: npx tsx --env-file=.env.local scripts/build-lol-players.ts
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import fs from "node:fs";
import type { TsPlayerRow } from "./_external-api-types";
// 리그 목록은 정본(SPORTS.esports.leagues)을 쓴다 — 손으로 적으면 LCK_CL·EWC 가 빠진다(실측 사고).
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

interface StoredPlayer {
  name: string; realName: string; photo: string;
  position: number | null; birthday: number | null;
  teamId: string; countryId: string;
}

async function page(p: number): Promise<TsPlayerRow[] | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = (await thesportsGet("/v1/lol/player/list", { page: p })) as { results?: TsPlayerRow[] };
      return r.results ?? [];
    } catch {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  return null;
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || v === "" || Number.isNaN(n) || n === 0 ? null : n;
};

function toStored(x: TsPlayerRow): StoredPlayer {
  return {
    name: x.name ?? "",
    realName: x.real_name || "",
    photo: x.logo || "",
    // ts 타입 선언은 string 이지만 실제 응답은 숫자다(position 2, birthday 844704000) — 안전하게 강제 변환
    position: num(x.position),
    birthday: num(x.birthday),
    teamId: x.team_id || "",
    countryId: x.country_id || "",
  };
}

(async () => {
  const matches = await prisma.match.findMany({
    where: { league: { in: [...LOL_LEAGUES] }, lolGames: { not: null } },
    select: { lolGames: true },
  });
  const pids = new Set<string>();
  for (const m of matches) {
    try {
      const d = JSON.parse(m.lolGames!) as { sets?: Array<{ players?: Array<{ playerId?: string }> }> };
      for (const s of d.sets ?? []) for (const p of s.players ?? []) if (p.playerId) pids.add(p.playerId);
    } catch { /* 깨진 행은 건너뛴다 */ }
  }
  console.log(`lolGames 등장 선수: ${pids.size}명 (리그 ${[...LOL_LEAGUES].join("/")})`);

  // 전량 순회 1회로 색인 — uuid 단건 호출은 선수 수만큼 왕복이라 느리고 끊기기 쉽다.
  const index = new Map<string, TsPlayerRow>();
  for (let p = 1; p <= 15; p++) {
    const rows = await page(p);
    if (rows === null) { console.warn(`  page=${p} 재시도 실패 — 색인 ${index.size}명에서 중단`); break; }
    for (const x of rows) if (x.id) index.set(String(x.id), x);
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 400));
  }
  console.log(`ts player/list 색인: ${index.size}명`);

  // 기존 사전은 보존하고 덮어쓰기만 — 이번 실행에서 못 찾은 선수의 사진을 잃지 않는다.
  let prev: Record<string, StoredPlayer> = {};
  try {
    prev = (JSON.parse(fs.readFileSync("data/lol-players.json", "utf8")) as { players?: Record<string, StoredPlayer> }).players ?? {};
  } catch { /* 첫 실행 */ }

  const players: Record<string, StoredPlayer> = { ...prev };
  let fromIndex = 0;
  const missing: string[] = [];
  for (const pid of pids) {
    const x = index.get(pid);
    if (x) { players[pid] = toStored(x); fromIndex++; }
    else if (!players[pid]) missing.push(pid);
  }

  // 색인에 없던 선수만 uuid 단건으로 보충
  let fromUuid = 0;
  for (const pid of missing) {
    try {
      const r = (await thesportsGet("/v1/lol/player/list", { uuid: pid })) as { results?: TsPlayerRow[] };
      const x = r.results?.[0];
      if (x) { players[pid] = toStored(x); fromUuid++; }
    } catch { /* 없으면 그대로 둔다 */ }
    await new Promise((res) => setTimeout(res, 250));
  }

  fs.writeFileSync(
    "data/lol-players.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), players }, null, 2),
  );
  const covered = [...pids].filter((p) => players[p]).length;
  const withPhoto = [...pids].filter((p) => players[p]?.photo).length;
  console.log(`저장 ${Object.keys(players).length}명 → data/lol-players.json`);
  console.log(`  등장 선수 ${pids.size} 중 프로필 ${covered} · 사진 ${withPhoto} (색인 ${fromIndex} · uuid 보충 ${fromUuid})`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
