// LoL 팀 사전 — TheSports team/list → data/lol-teams.json (ts 팀 id → 영문명·약어·로고).
// 영어판이 쓰는 정본. 경기 기록(lolGames)의 red/blue.name 은 한국어라 /en 화면에 한글이 새어 나온다.
// 로컬 전용(ts IP whitelist). 사용: npx tsx --env-file=.env.local scripts/build-lol-teams.ts
import "@/lib/env";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { prisma } from "@/lib/db";
import fs from "node:fs";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

interface TsTeam { id?: string; name?: string; abbr?: string; logo?: string }

async function page(p: number): Promise<TsTeam[] | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = (await thesportsGet("/v1/lol/team/list", { page: p })) as { results?: TsTeam[] };
      return r.results ?? [];
    } catch {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  return null;
}

(async () => {
  // 우리 경기 기록에 실제로 등장하는 ts 팀 id 만 담는다 — 1,800팀 전량은 번들 낭비다.
  const matches = await prisma.match.findMany({
    where: { league: { in: [...LOL_LEAGUES] }, lolGames: { not: null } },
    select: { lolGames: true },
  });
  const wanted = new Set<string>();
  for (const m of matches) {
    try {
      const d = JSON.parse(m.lolGames!) as { sets?: Array<{ red?: { id?: string }; blue?: { id?: string } }> };
      for (const s of d.sets ?? []) for (const side of [s.red, s.blue]) if (side?.id) wanted.add(side.id);
    } catch { /* 깨진 행은 건너뛴다 */ }
  }
  // 순위 JSON 도 같은 ts 팀 id 를 쓴다. LPL 은 lolGames 미수집이라 여기서만 잡힌다
  // (LPL 순위 팀명이 영어판에 한글로 남던 원인). LPL 만 그룹(part_stage) 중첩이라 한 겹 더 들어간다.
  type Row = { teamId?: string };
  for (const f of ["data/lol-standings.json", "data/lol-standings-LEC.json", "data/lol-standings-LCS.json", "data/lol-standings-LPL.json"]) {
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, "utf8")) as { standings?: Row[]; groups?: Array<{ standings?: Row[] }> };
    for (const t of [...(d.standings ?? []), ...(d.groups ?? []).flatMap((g) => g.standings ?? [])]) {
      if (t.teamId) wanted.add(t.teamId);
    }
  }
  console.log(`경기 기록·순위 등장 팀: ${wanted.size}개`);

  const teams: Record<string, { name: string; abbr?: string; logo?: string }> = {};
  for (let p = 1; p <= 15; p++) {
    const rows = await page(p);
    if (rows === null) { console.warn(`  page=${p} 재시도 실패 — ${Object.keys(teams).length}개에서 중단`); break; }
    for (const t of rows) {
      if (!t.id || !t.name || !wanted.has(t.id)) continue;
      teams[t.id] = { name: t.name, ...(t.abbr ? { abbr: t.abbr } : {}), ...(t.logo ? { logo: t.logo } : {}) };
    }
    if (rows.length < 1000) break;
    await new Promise((res) => setTimeout(res, 400));
  }

  fs.writeFileSync(
    "data/lol-teams.json",
    JSON.stringify({ updatedAt: new Date().toISOString(), teams }, null, 2),
  );
  const miss = [...wanted].filter((id) => !teams[id]);
  console.log(`저장 ${Object.keys(teams).length}/${wanted.size}개 → data/lol-teams.json`);
  if (miss.length) console.log(`  미해석 ${miss.length}개: ${miss.slice(0, 5).join(", ")}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
