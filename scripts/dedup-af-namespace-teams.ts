// api-football 네임스페이스 중복 Team row 병합 — 같은 af externalId 를 리그 라벨만 다르게(UEL·UECL·클럽월드컵·
// 자국컵·U23·친선…) 여러 row 로 들여온 팀을 자국 리그 row 하나로 합친다.
//
// 왜: 컵 row 는 ts 팀 id 가 없어 dedup-cup-domestic-teams(ts 정체 기반)가 못 잡는다. 남겨 두면 같은 경기가
//     소스별로 다른 팀 쌍을 달고 들어와 크로스소스 경기 중복 알림이 라운드마다 재발한다(2026-09-10 Hibernian).
// 판정: (1) 숫자 externalId 동일 (2) 정규화한 이름 완전 일치 (3) 자국 리그 row 가 정확히 1개 + 컵 row 1개 이상.
//       ESPN 숫자 id 와의 우연한 충돌(563 = 하포엘 베어셰바 ↔ 웨스트햄)은 (2) 가 거른다.
// 처리(그룹마다 트랜잭션): Match 홈/원정 → 자국 row, TeamSourceId 이전(같은 (league,source,externalId) 가
//       자국에 이미 있으면 컵 것 삭제), 시즌 스탯 아카이브 이전(시즌 충돌 시 컵 것 삭제), 컵 row 삭제.
//       트랜잭션 밖에서 ts team-id-mapping.json 의 ourId 만 자국 id 로 교체(ourLeague 는 조회 키라 유지).
//
// 사용:
//   npx tsx --env-file=.env.local scripts/dedup-af-namespace-teams.ts            # dry-run
//   npx tsx --env-file=.env.local scripts/dedup-af-namespace-teams.ts --apply    # 실행
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

const APPLY = process.argv.includes("--apply");
const CUP_RE = /CUP|UCL|UEL|UECL|CHAMP|LIB|SUD|SUPER_?CUP|SHIELD|TROPHY|QUAL|FRIENDLY|AFC_CL|CONCACAF|COPA/i;
const MAP_PATH = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(fc|cf|sc|afc|club|de|the)\b/g, "").replace(/[^a-z0-9]/g, "");

interface Row { id: number; name: string; league: string; externalId: string }
interface Group { ext: string; keep: Row; cups: Row[] }

async function collectGroups(): Promise<Group[]> {
  const teams = await prisma.team.findMany({ where: { league: { in: [...SOCCER_LEAGUES] } }, select: { id: true, name: true, league: true, externalId: true } });
  const byExt = new Map<string, Row[]>();
  for (const t of teams) {
    if (!/^\d+$/.test(t.externalId)) continue;
    byExt.set(t.externalId, [...(byExt.get(t.externalId) ?? []), t]);
  }
  const out: Group[] = [];
  for (const [ext, g] of byExt) {
    if (g.length < 2) continue;
    if (new Set(g.map((t) => norm(t.name))).size !== 1) continue;
    const domestic = g.filter((t) => !CUP_RE.test(t.league));
    const cups = g.filter((t) => CUP_RE.test(t.league));
    if (domestic.length !== 1 || cups.length === 0) continue;
    out.push({ ext, keep: domestic[0], cups });
  }
  return out;
}

async function mergeGroup(g: Group): Promise<{ matches: number; sources: number; archives: number; deleted: number }> {
  const cupIds = g.cups.map((c) => c.id);
  return prisma.$transaction(async (tx) => {
    const h = await tx.match.updateMany({ where: { homeTeamId: { in: cupIds } }, data: { homeTeamId: g.keep.id } });
    const a = await tx.match.updateMany({ where: { awayTeamId: { in: cupIds } }, data: { awayTeamId: g.keep.id } });
    // TeamSourceId — (league, source, externalId) 유니크라 자국 row 에 같은 키가 있으면 컵 것을 지운다.
    const sids = await tx.teamSourceId.findMany({ where: { teamId: { in: cupIds } }, select: { id: true, league: true, source: true, externalId: true } });
    let moved = 0;
    for (const s of sids) {
      const dup = await tx.teamSourceId.findFirst({ where: { teamId: g.keep.id, league: s.league, source: s.source, externalId: s.externalId }, select: { id: true } });
      if (dup) await tx.teamSourceId.delete({ where: { id: s.id } });
      else { await tx.teamSourceId.update({ where: { id: s.id }, data: { teamId: g.keep.id } }); moved++; }
    }
    // 시즌 스탯 아카이브 — (teamId, seasonLabel) 유니크. 충돌하면 자국 것이 정본이라 컵 것을 지운다.
    const arch = await tx.teamSeasonStatArchive.findMany({ where: { teamId: { in: cupIds } }, select: { id: true, seasonLabel: true } });
    let archMoved = 0;
    for (const r of arch) {
      const dup = await tx.teamSeasonStatArchive.findFirst({ where: { teamId: g.keep.id, seasonLabel: r.seasonLabel }, select: { id: true } });
      if (dup) await tx.teamSeasonStatArchive.delete({ where: { id: r.id } });
      else { await tx.teamSeasonStatArchive.update({ where: { id: r.id }, data: { teamId: g.keep.id } }); archMoved++; }
    }
    // FK 없는 참조들도 자국 row 로 — 감독 이력·부상 스냅샷·회원 응원팀.
    await tx.coachTenureArchive.updateMany({ where: { teamId: { in: cupIds } }, data: { teamId: g.keep.id } });
    await tx.injurySnapshot.updateMany({ where: { teamId: { in: cupIds } }, data: { teamId: g.keep.id } });
    await tx.user.updateMany({ where: { favoriteTeamId: { in: cupIds } }, data: { favoriteTeamId: g.keep.id } });
    const del = await tx.team.deleteMany({ where: { id: { in: cupIds } } });
    return { matches: h.count + a.count, sources: moved, archives: archMoved, deleted: del.count };
  }, { timeout: 60_000 });
}

function updateMappingJson(keepOf: Map<number, Row>): number {
  const raw = readFileSync(MAP_PATH, "utf8");
  const list = JSON.parse(raw) as { ourId: number; ourName?: string; ourLeague?: string }[];
  let n = 0;
  for (const e of list) {
    const k = keepOf.get(e.ourId);
    if (!k) continue;
    // ourLeague 는 건드리지 않는다 — 순위표 매핑이 `ourLeague|tsId` 키로 찾는 조회 네임스페이스라
    // 컵 라벨(UCL 등)을 자국 리그로 바꾸면 그 대회 순위에서 팀이 "매핑 누락"이 된다(2026-09-10 실측).
    e.ourId = k.id; n++;
  }
  if (n > 0 && APPLY) writeFileSync(MAP_PATH, JSON.stringify(list, null, 2) + "\n");
  return n;
}

async function main() {
  const groups = await collectGroups();
  const cupRows = groups.reduce((s, g) => s + g.cups.length, 0);
  console.log(`=== af 네임스페이스 Team 중복 병합 [${APPLY ? "APPLY" : "DRY-RUN"}] — ${groups.length}그룹 · 컵 row ${cupRows}개`);
  const keepOf = new Map<number, Row>();
  for (const g of groups) for (const c of g.cups) keepOf.set(c.id, g.keep);
  if (!APPLY) {
    for (const g of groups.slice(0, 15)) console.log(`  ${g.keep.name} (${g.keep.league} #${g.keep.id}) ← ${g.cups.map((c) => `#${c.id} ${c.league}`).join(", ")}`);
    if (groups.length > 15) console.log(`  … 외 ${groups.length - 15}그룹`);
    console.log(`매핑 JSON 갱신 대상: ${updateMappingJson(keepOf)}건 (dry-run, 쓰기 안 함)`);
    return;
  }
  const tot = { matches: 0, sources: 0, archives: 0, deleted: 0, failed: 0 };
  for (const g of groups) {
    try {
      const r = await mergeGroup(g);
      tot.matches += r.matches; tot.sources += r.sources; tot.archives += r.archives; tot.deleted += r.deleted;
    } catch (e) {
      tot.failed++;
      console.error(`  실패 ${g.keep.name}(${g.ext}): ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const mapped = updateMappingJson(keepOf);
  console.log(`완료 — 경기 ${tot.matches} 이전 · 소스 id ${tot.sources} 이전 · 아카이브 ${tot.archives} 이전 · Team ${tot.deleted} 삭제 · 매핑 JSON ${mapped} 갱신 · 실패 ${tot.failed}그룹`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
