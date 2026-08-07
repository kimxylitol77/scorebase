// 야구 스쿼드 sync — ts /v1/baseball/team/squad/list → TheSportsPlayer position·shirtNumber.
// ⚠️ ts 야구 스쿼드는 MLB 30팀만 제공 — KBO·NPB 팀 uuid 는 total 0 (2026-08-07 실측, NC·한신 확인).
//   KBO·NPB position 결손은 이 소스로 못 채운다. 기존 row 만 갱신(스쿼드엔 이름이 없어 신규 생성 불가).
// ⚠️ ts API 는 IP whitelist — 맥미니/집에서만 실행 가능. 주간: weekly-static-refresh.sh.
//   npx tsx --env-file=.env.local scripts/sync-baseball-squads.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const USER = process.env.THESPORTS_USER ?? "";
const SECRET = process.env.THESPORTS_SECRET ?? "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SquadEntry { player_id?: string; position?: string; shirt_number?: number }
interface TeamRow { id?: string; squad?: SquadEntry[] }

async function fetchSquadPage(params: string): Promise<TeamRow[]> {
  try {
    const r = await fetch(`https://api.thesports.com/v1/baseball/team/squad/list?user=${USER}&secret=${SECRET}&${params}`);
    const d = (await r.json()) as { results?: TeamRow[] };
    return d.results ?? [];
  } catch (e) {
    console.warn(`squad ${params} 실패:`, (e as Error).message);
    return [];
  }
}

async function main() {
  const byPlayer = new Map<string, { position: string | null; shirtNumber: number | null }>();
  const collect = (rows: TeamRow[]) => {
    for (const t of rows) {
      for (const s of t.squad ?? []) {
        if (!s.player_id) continue;
        byPlayer.set(s.player_id, {
          position: s.position || null,
          shirtNumber: typeof s.shirt_number === "number" && s.shirt_number > 0 ? s.shirt_number : null,
        });
      }
    }
  };

  // paged 스윕 — 현재 ts 가 주는 전부(MLB 30팀 + α)
  for (let page = 1; page <= 50; page++) {
    const rows = await fetchSquadPage(`page=${page}`);
    if (!rows.length) break;
    collect(rows);
    await sleep(300);
  }
  console.log("스쿼드 선수:", byPlayer.size);

  // 2) 기존 TheSportsPlayer(야구)와 교집합만 갱신 — 10개 병렬 청크
  const existing = await prisma.theSportsPlayer.findMany({
    where: { sport: { in: ["KBO", "NPB", "MLB", "LMB"] } },
    select: { id: true, position: true, shirtNumber: true },
  });
  const targets = existing
    .map((e) => ({ e, s: byPlayer.get(e.id) }))
    .filter((x): x is { e: (typeof existing)[number]; s: { position: string | null; shirtNumber: number | null } } => !!x.s)
    .filter(({ e, s }) => (s.position && s.position !== e.position) || (s.shirtNumber != null && s.shirtNumber !== e.shirtNumber));
  console.log("야구 선수 row:", existing.length, "| 갱신 대상:", targets.length);

  let updated = 0;
  for (let i = 0; i < targets.length; i += 10) {
    await Promise.all(
      targets.slice(i, i + 10).map(({ e, s }) =>
        prisma.theSportsPlayer.update({
          where: { id: e.id },
          data: {
            ...(s.position ? { position: s.position } : {}),
            ...(s.shirtNumber != null ? { shirtNumber: s.shirtNumber } : {}),
          },
        }),
      ),
    );
    updated += Math.min(10, targets.length - i);
  }
  console.log("갱신 완료:", updated);
  await prisma.$disconnect();
}

main();
