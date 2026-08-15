// 8리그 팀 공식 스쿼드 수집 — TheSports team/squad/list (인가 endpoint) → data/team-squads.json
// { tsTeamId: { updatedAt, squad: [{ id, name, position(G|D|M|F), number }] } }
//
// 용도: /transfers view=team 스쿼드 명단·등번호 + coarse 포지션 공식값 보정(TheSportsPlayer).
// whitelisted IP 필요(맥북 OK). 멱등 — 재실행 시 응답 온 팀만 덮어쓰고 나머지는 기존 값 유지.
// 이적시장 후·시즌 개막 전 재실행 권장.
//
//   npx tsx --env-file=.env.local scripts/build-team-squads.ts
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

interface SquadEntry { id: string; name: string; position: string | null; number: number | null }
type SquadFile = Record<string, { updatedAt: string; squad: SquadEntry[] }>;
interface SquadResp {
  code: number;
  results?: Array<{ squad?: Array<{ player?: { id?: string; name?: string }; position?: string; shirt_number?: number }> }>;
}

async function main() {
  // 대상 ts 팀: 빅5(TeamSourceId) + 확장 사전
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true, team: { select: { name: true, league: true } } },
  });
  const nameOf = new Map(big5Rows.map((r) => [r.externalId, `${r.team?.league} ${r.team?.name}`]));
  const tsIds = [...new Set([...big5Rows.map((r) => r.externalId), ...Object.keys(EXPANSION)])];
  console.log(`대상 팀 ${tsIds.length} (빅5 ${big5Rows.length} + 확장 ${Object.keys(EXPANSION).length})`);

  // 기존 파일을 베이스로 병합 — ts 가 간헐적으로 빈 응답을 주는데(실측 2팀/159),
  // 통째로 덮어쓰면 그 팀이 파일에서 사라져 소속 판정이 통째로 흔들린다.
  const out: SquadFile = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const before = Object.keys(out).length;
  console.log(`기존 파일 ${before}팀`);

  const updated: string[] = [];
  const stale: string[] = [];   // 갱신 실패 — 기존 항목 유지
  const missing: string[] = []; // 갱신 실패 + 기존 항목도 없음
  for (const tid of tsIds) {
    let squad: SquadEntry[] = [];
    for (let attempt = 0; attempt < 2 && squad.length === 0; attempt++) {
      try {
        const res = await thesportsGet<SquadResp>("/v1/football/team/squad/list", { uuid: tid });
        squad = (res.results?.[0]?.squad ?? [])
          .filter((s) => s.player?.id && s.player?.name)
          .map((s) => ({
            id: s.player!.id!,
            name: s.player!.name!,
            position: s.position || null,
            number: typeof s.shirt_number === "number" ? s.shirt_number : null,
          }));
      } catch {
        // 재시도 대상
      }
      if (squad.length === 0) await new Promise((r) => setTimeout(r, 500));
    }
    if (squad.length) {
      out[tid] = { updatedAt: new Date().toISOString().slice(0, 10), squad };
      updated.push(tid);
    } else (out[tid] ? stale : missing).push(tid);
    await new Promise((r) => setTimeout(r, 500));
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  const totalPlayers = Object.values(out).reduce((a, t) => a + t.squad.length, 0);
  console.log(`✓ wrote team-squads.json — 갱신 ${updated.length}팀 / 총 ${Object.keys(out).length}팀 (기존 ${before}) / 선수 ${totalPlayers}`);
  if (stale.length) {
    console.log(`· 갱신 실패, 기존 스쿼드 유지 ${stale.length}팀`);
    for (const tid of stale) console.log(`    ${nameOf.get(tid) || EXPANSION[tid] || tid} (${out[tid].updatedAt} 수집분)`);
  }
  if (missing.length) {
    console.log(`! 갱신 실패, 스쿼드 없음 ${missing.length}팀`);
    for (const tid of missing) console.log(`    ${nameOf.get(tid) || EXPANSION[tid] || tid}`);
  }

  // coarse 포지션 공식값 보정 — 이번에 받은 팀만. Best XI 배치는 TheSportsPlayer.position 을 본다.
  // 행이 없으면 만들고(승격팀은 절반이 미등록), 있으면 포지션만 맞춘다. 이름은 손대지 않는다.
  let created = 0, posFixed = 0;
  for (const tid of updated) {
    for (const s of out[tid].squad) {
      if (!s.position) continue;
      const cur = await prisma.theSportsPlayer.findUnique({ where: { id: s.id }, select: { position: true } });
      if (!cur) {
        await prisma.theSportsPlayer.create({
          data: { id: s.id, name: s.name, position: s.position, teamId: tid, sport: "FOOTBALL" },
        });
        created++;
      } else if (cur.position !== s.position) {
        await prisma.theSportsPlayer.update({ where: { id: s.id }, data: { position: s.position } });
        posFixed++;
      }
    }
  }
  console.log(`✓ TheSportsPlayer — 신규 ${created}행 · coarse 포지션 보정 ${posFixed}건 (${updated.length}팀)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
