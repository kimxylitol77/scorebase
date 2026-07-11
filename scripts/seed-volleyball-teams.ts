// 배구 국가대표 팀 시드 — Team + TeamSourceId(thesports) upsert + lightsail mapping json 생성.
//   npx tsx --env-file=.env.local scripts/seed-volleyball-teams.ts [teams.json]
//
// 입력 json: { [tsTeamId]: { name, logo, league } } — league = VNL | AVC_NATIONS_W | EGL_W.
// 생성 방법(2026-06-12): volleyball match/diary?tsp= 일자 sweep(5/23~7/31) → 3개 utid 필터
//   → 팀 uuid 를 team/list 로 해석. utid: VNL=e4wyrn3hexvm86p, AVC_NATIONS_W=y0or58hld26rwzv,
//   EGL_W=jednm9vh901qyox (utid 는 시즌 불변 — season_id 와 달리 안정 식별자).
// V-리그(10월) 추가 시 같은 절차로 json 만들어 재실행 (멱등).
import { readFileSync, writeFileSync } from "fs";
import { prisma } from "@/lib/db";

const INPUT = process.argv[2] || "/tmp/vb-teams-final.json";
const MAPPING_OUT = "lightsail-worker/volleyball-team-id-mapping.json";

interface In { name: string; logo: string | null; league: string }

async function main() {
  const teams = JSON.parse(readFileSync(INPUT, "utf-8")) as Record<string, In>;
  const mapping: Array<{ ourId: number; ourName: string; ourLeague: string; tsId: string; tsName: string }> = [];
  let created = 0, updated = 0;

  for (const [tsId, t] of Object.entries(teams)) {
    if (!t.league) continue;
    // Team upsert — (league, externalId=tsId) 기준
    const existing = await prisma.team.findFirst({ where: { league: t.league, externalId: tsId } });
    let ourId: number;
    if (existing) {
      await prisma.team.update({ where: { id: existing.id }, data: { name: t.name, logoUrl: t.logo } });
      ourId = existing.id;
      updated++;
    } else {
      const row = await prisma.team.create({
        data: { league: t.league, externalId: tsId, name: t.name, logoUrl: t.logo },
      });
      ourId = row.id;
      created++;
    }
    await prisma.teamSourceId.upsert({
      where: { league_source_externalId: { league: t.league, source: "thesports", externalId: tsId } },
      create: { league: t.league, source: "thesports", externalId: tsId, teamId: ourId },
      update: { teamId: ourId },
    });
    mapping.push({ ourId, ourName: t.name, ourLeague: t.league, tsId, tsName: t.name });
  }

  // 기존 매핑 보존 — 이번 입력에 없는 팀(다른 리그)은 유지, 같은 tsId 는 갱신 (멱등 확장).
  let prev: typeof mapping = [];
  try { prev = JSON.parse(readFileSync(MAPPING_OUT, "utf-8")); } catch { /* 최초 실행 */ }
  const merged = [...prev.filter((p) => !mapping.some((m) => m.tsId === p.tsId)), ...mapping];
  merged.sort((a, b) => a.ourLeague.localeCompare(b.ourLeague) || a.ourName.localeCompare(b.ourName));
  writeFileSync(MAPPING_OUT, JSON.stringify(merged, null, 2));
  console.log(`Team 생성 ${created} · 갱신 ${updated} → mapping ${merged.length}건 (기존 ${prev.length} + 신규, ${MAPPING_OUT})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
