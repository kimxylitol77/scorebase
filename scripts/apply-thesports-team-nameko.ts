// TheSports language type=4 공식 한글 → Team.nameKo 적재 (축구 팀 대상).
// worker 가 fetch 한 /tmp/lang-team-ko.jsonl ({id, ko} JSONL) 을 읽어 우리 Team 과 매칭.
// ts id → Team 매핑 두 경로: TeamSourceId(source='thesports') + Team.externalId='ts-<id>' 직행.
// 표시 우선순위는 team-names.ts 사전 > Team.nameKo 라서 잠금 불필요 — 봇이 매일 공식명으로 덮어씀(멱등).
// 팀명은 선수와 달리 "SC 브레겐츠" 처럼 라틴 접두가 정상이라 한글 포함 여부만 검사.
//   dry-run: npx tsx --env-file=.env.local scripts/apply-thesports-team-nameko.ts
//   apply:   ... --apply
// mac mini 공식 한글 봇(daily-official-korean)이 매일 새벽 호출.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const JSONL = process.env.LANG_TEAM_JSONL || "/tmp/lang-team-ko.jsonl";

function normalize(raw: string): string | null {
  const s = raw.trim();
  if (!s || !/[가-힣]/.test(s)) return null; // 한글이 전혀 없으면 거부 (영문 그대로 온 항목)
  return s;
}

async function main() {
  const langMap = new Map<string, string>();
  for (const ln of readFileSync(JSONL, "utf8").split("\n")) {
    if (!ln.trim()) continue;
    const o = JSON.parse(ln) as { id: string; ko: string };
    const ko = o.ko && normalize(o.ko);
    if (ko) langMap.set(o.id, ko);
  }
  console.log(`공식 ko 팀 항목=${langMap.size}`);

  // 경로 1: TeamSourceId(source='thesports') — externalId 가 raw ts id
  const srcRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports" },
    select: { teamId: true, externalId: true },
  });
  // 경로 2: Team.externalId='ts-<id>' 직행 (standings-only 마이너 리그)
  const tsTeams = await prisma.team.findMany({
    where: { externalId: { startsWith: "ts-" } },
    select: { id: true, externalId: true },
  });

  // teamId → ts id (경로 1 우선, 한 팀에 ts id 여러 개면 첫 것 유지)
  const teamToTs = new Map<number, string>();
  for (const r of srcRows) if (!teamToTs.has(r.teamId)) teamToTs.set(r.teamId, r.externalId);
  for (const t of tsTeams) if (!teamToTs.has(t.id)) teamToTs.set(t.id, t.externalId.slice(3));

  const teams = await prisma.team.findMany({
    where: { id: { in: [...teamToTs.keys()] } },
    select: { id: true, name: true, nameKo: true },
  });

  let same = 0, diff = 0, newly = 0, unmatched = 0;
  const updates: Array<{ id: number; ko: string }> = [];
  for (const t of teams) {
    const tsId = teamToTs.get(t.id)!;
    const ko = langMap.get(tsId);
    if (!ko) { unmatched++; continue; }
    if (t.nameKo === ko) { same++; continue; }
    if (!t.nameKo) newly++; else diff++;
    updates.push({ id: t.id, ko });
  }
  console.log(`매핑 팀=${teams.length} | 동일=${same} 교체=${diff} 신규=${newly} 공식ko없음=${unmatched}`);
  console.log(`업데이트 대상=${updates.length}`);
  for (const u of updates.slice(0, 15)) {
    const t = teams.find((x) => x.id === u.id)!;
    console.log(`  ${t.name} → ${u.ko}${t.nameKo ? ` (기존 ${t.nameKo})` : ""}`);
  }

  if (!APPLY) { console.log("dry-run — --apply 로 실제 적용"); return; }
  let done = 0;
  for (let i = 0; i < updates.length; i += 200) {
    const batch = updates.slice(i, i + 200);
    await prisma.$transaction(batch.map((u) => prisma.team.update({ where: { id: u.id }, data: { nameKo: u.ko } })));
    done += batch.length;
  }
  console.log(`적용 완료=${done}`);
}
main().finally(() => prisma.$disconnect());
