// 스쿼드 JSON 에 아예 없는 팀만 채우는 백필 — data/team-squads.json 병합 갱신.
//
// build-team-squads.ts 는 전체 재수집(결과를 통째로 덮어씀)이라 승격팀 하나 때문에 돌리기엔
// 무겁고, 중간에 실패한 팀이 파일에서 사라진다. 이 스크립트는 누락된 팀만 받아 기존 항목 위에
// 얹기만 한다 — 실패해도 기존 데이터는 그대로.
//
// 필요한 이유: /transfers view=team 의 Best XI 는 TheSportsPlayer.position 이 있어야 선수를
// 배치한다. 승격팀은 스쿼드 수집 대상에 없어 포지션이 비고, 배치 가능 인원이 7명 미만이면
// 전술판이 통째로 숨는다 (2026-08-15 코번트리 제보).
//
// TheSportsPlayer 행이 아예 없는 선수도 만든다 — 승격팀은 절반 가까이 행이 없어(코번트리 28명 중
// 14명) updateMany 만으로는 포지션이 채워지지 않는다. 이름은 건드리지 않고 포지션만 맞춘다.
//
//   npx tsx --env-file=.env.local scripts/backfill-missing-team-squads.ts [--dry]
//   npx tsx --env-file=.env.local scripts/backfill-missing-team-squads.ts --teams=<tsId,tsId>
//     └ 이미 JSON 에 있는 팀의 선수 행만 다시 맞추고 싶을 때
import { PrismaClient } from "@prisma/client";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "team-squads.json");
const EXPANSION: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "transfer-league-teams.json"), "utf8"),
);
const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const DRY = process.argv.includes("--dry");
const ONLY = (process.argv.find((a) => a.startsWith("--teams="))?.slice(8) ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

interface SquadEntry { id: string; name: string; position: string | null; number: number | null }
type SquadFile = Record<string, { updatedAt: string; squad: SquadEntry[] }>;
interface SquadResp {
  code: number;
  results?: Array<{ squad?: Array<{ player?: { id?: string; name?: string }; position?: string; shirt_number?: number }> }>;
}

async function main() {
  const existing: SquadFile = JSON.parse(fs.readFileSync(OUT, "utf8"));

  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true, team: { select: { name: true, league: true } } },
  });
  const nameOf = new Map(big5Rows.map((r) => [r.externalId, `${r.team?.league} ${r.team?.name}`]));
  const all = [...new Set([...big5Rows.map((r) => r.externalId), ...Object.keys(EXPANSION)])];
  const missing = ONLY.length ? ONLY.filter((id) => !existing[id]) : all.filter((id) => !existing[id]);
  console.log(`대상 ${ONLY.length || all.length}팀 · 기존 ${Object.keys(existing).length}팀 · 스쿼드 누락 ${missing.length}팀`);

  const added: string[] = [];
  let failed = 0;
  for (const tid of missing) {
    const label = nameOf.get(tid) || EXPANSION[tid] || tid;
    try {
      const res = await thesportsGet<SquadResp>("/v1/football/team/squad/list", { uuid: tid });
      const squad: SquadEntry[] = (res.results?.[0]?.squad ?? [])
        .filter((s) => s.player?.id && s.player?.name)
        .map((s) => ({
          id: s.player!.id!,
          name: s.player!.name!,
          position: s.position || null,
          number: typeof s.shirt_number === "number" ? s.shirt_number : null,
        }));
      if (squad.length) {
        existing[tid] = { updatedAt: new Date().toISOString().slice(0, 10), squad };
        added.push(tid);
        console.log(`  + ${label} — ${squad.length}명 (포지션 ${squad.filter((s) => s.position).length})`);
      } else {
        failed++;
        console.log(`  · ${label} — 빈 응답, 건너뜀`);
      }
    } catch (e) {
      failed++;
      console.log(`  ! ${label} — 실패: ${(e as Error).message.slice(0, 80)}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 선수 행 동기화 대상 — 이번에 받은 팀 + --teams 로 지정한 팀.
  const syncTargets = [...new Set([...added, ...ONLY.filter((id) => existing[id])])];

  if (DRY) {
    console.log(`\n[dry] 스쿼드 추가 ${added.length}팀 · 실패 ${failed}팀 · 선수행 동기화 대상 ${syncTargets.length}팀 — 파일·DB 미변경`);
    return;
  }
  if (added.length) {
    fs.writeFileSync(OUT, JSON.stringify(existing));
    console.log(`\n✓ team-squads.json 갱신 — 추가 ${added.length}팀 (실패 ${failed}) · 총 ${Object.keys(existing).length}팀`);
  }

  // coarse 포지션 동기화 — Best XI 배치는 TheSportsPlayer.position 을 본다.
  // 행이 없으면 만들고(승격팀은 절반이 미등록), 있으면 포지션만 맞춘다. 이름은 손대지 않는다.
  let created = 0, fixed = 0;
  for (const tid of syncTargets) {
    for (const s of existing[tid].squad) {
      if (!s.position) continue;
      const cur = await prisma.theSportsPlayer.findUnique({ where: { id: s.id }, select: { position: true } });
      if (!cur) {
        await prisma.theSportsPlayer.create({
          data: { id: s.id, name: s.name, position: s.position, teamId: tid, sport: "FOOTBALL" },
        });
        created++;
      } else if (cur.position !== s.position) {
        await prisma.theSportsPlayer.update({ where: { id: s.id }, data: { position: s.position } });
        fixed++;
      }
    }
  }
  console.log(`✓ TheSportsPlayer — 신규 ${created}행 · 포지션 보정 ${fixed}건 (${syncTargets.length}팀)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
