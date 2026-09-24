// LoL 대회 사전 — TheSports tournament/list → data/lol-tournaments.json (대회 id → 이름·약어·로고·커버·기간).
// Match.raw.tournament_id 로 경기가 어느 대회(LCK 2026 / LCK Cup / KeSPA Cup …)인지 가려내는 데 쓴다.
// 로컬 전용(ts IP whitelist). 사용: npx tsx --env-file=.env.local scripts/build-lol-tournaments.ts
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import fs from "node:fs";

interface TsTournament {
  id: string; type: number; name?: string; abbr?: string;
  logo?: string; cover?: string;
  start_time?: number; end_time?: number; prize_pool?: string;
}

async function main() {
  const all: TsTournament[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await thesportsGet<{ code: number; results?: TsTournament[] }>("/v1/lol/tournament/list", { page });
    const rows = r.results ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 400));
  }

  const tournaments: Record<string, {
    name: string; abbr?: string; logo?: string; cover?: string;
    start?: number; end?: number; prize?: string;
  }> = {};
  for (const t of all) {
    if (!t.id || !t.name) continue;
    tournaments[t.id] = {
      name: t.name,
      ...(t.abbr ? { abbr: t.abbr } : {}),
      ...(t.logo ? { logo: t.logo } : {}),
      ...(t.cover ? { cover: t.cover } : {}),
      ...(t.start_time ? { start: t.start_time } : {}),
      ...(t.end_time ? { end: t.end_time } : {}),
      // "0" 은 상금 미공개 — 화면에서 0달러로 보이면 오보라 아예 안 싣는다
      ...(t.prize_pool && t.prize_pool !== "0" ? { prize: t.prize_pool } : {}),
    };
  }

  fs.writeFileSync(
    "data/lol-tournaments.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), tournaments }, null, 2),
  );
  const withLogo = Object.values(tournaments).filter((t) => t.logo).length;
  console.log(`저장 ${Object.keys(tournaments).length}개 대회(로고 ${withLogo}) → data/lol-tournaments.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
