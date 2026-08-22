// 로고 없는 팀에 TheSports 로고 백필 — diary 의 results_extra.team 이 id→logo 를 준다.
//
// thesports-matches 라우트가 만든 팀은 id 만 받아 logoUrl 이 비어 있었다(카코넨·DFB 포칼
// 하부리그·천황배 등 144팀, 2026-08-22). team/list?uuid= 는 프록시 경로에서 미인가라
// 날짜별 diary 를 훑어 모은다. 이미 로고가 있는 팀은 건드리지 않는다.
//
//   npx tsx scripts/backfill-ts-team-logos.ts [--days=30] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";

const DRY = process.argv.includes("--dry");
const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);

type Diary = { code: number; results_extra?: { team?: Array<{ id: string; logo?: string }> } };

async function main() {
  const targets = await prisma.team.findMany({
    where: { OR: [{ logoUrl: null }, { logoUrl: "" }], sourceIds: { some: { source: "thesports" } } },
    select: { id: true, name: true, league: true, sourceIds: { where: { source: "thesports" }, select: { externalId: true } } },
  });
  const byTs = new Map<string, (typeof targets)[number]>();
  for (const t of targets) for (const s of t.sourceIds) byTs.set(s.externalId, t);
  console.log(`로고 없는 ts 매핑 팀 ${targets.length}`);
  if (targets.length === 0) return;

  const logos = new Map<string, string>();
  const today = new Date();
  for (let off = -DAYS; off <= DAYS; off++) {
    const d = new Date(today.getTime() + off * 86400_000);
    const date = d.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const r = await thesportsGet<Diary>("/v1/football/match/diary", { date });
      for (const t of r.results_extra?.team ?? []) {
        if (t.logo && byTs.has(t.id) && !logos.has(t.id)) logos.set(t.id, t.logo);
      }
    } catch (e) {
      console.warn(`[${date}] diary 실패: ${(e as Error).message}`);
    }
    if (logos.size === byTs.size) break;
  }

  let updated = 0;
  const perLeague: Record<string, number> = {};
  for (const [tsId, logo] of logos) {
    const t = byTs.get(tsId)!;
    perLeague[t.league] = (perLeague[t.league] ?? 0) + 1;
    if (!DRY) await prisma.team.update({ where: { id: t.id }, data: { logoUrl: logo } });
    updated++;
  }
  const missing = [...byTs.values()].filter((t) => !t.sourceIds.some((s) => logos.has(s.externalId)));
  console.log(`갱신 ${updated}${DRY ? "(dry)" : ""} · 여전히 없음 ${missing.length}`);
  console.log("리그별:", Object.entries(perLeague).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  if (missing.length) console.log("미해결:", missing.slice(0, 20).map((t) => `${t.league}/${t.name}`).join(" · "));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
