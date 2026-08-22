// TheSports 수집 매치의 라운드를 Match.raw 에 백필 — diary 를 날짜별로 훑어 round 를 붙인다.
//
// 워커(football-match-collector)는 2026-08-22 부터 round 를 보내지만 -1~+7일만 쓸기 때문에
// 이미 쌓인 시즌 매치는 이 스크립트로 한 번 채운다. raw 가 비었거나 우리가 쓴
// {"thesports":…} 인 매치만 건드린다 — api-football 원본은 절대 덮지 않는다.
//
//   npx tsx scripts/backfill-ts-rounds.ts [--from=20260701] [--to=20260829] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry");

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function parseYmd(s: string): Date {
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
}

interface DiaryMatch {
  id: string;
  competition_id: string;
  round?: { stage_id?: string; round_num?: number; group_num?: number };
}

const stageNames = new Map<string, string | null>();
async function stageNameOf(stageId: string): Promise<string | null> {
  if (stageNames.has(stageId)) return stageNames.get(stageId)!;
  let name: string | null = null;
  try {
    const r = await thesportsGet<{ code: number; results?: Array<{ name?: string }> }>(
      "/v1/football/stage/list",
      { uuid: stageId },
    );
    name = (r.results?.[0]?.name ?? "").trim() || null;
  } catch {
    name = null;
  }
  stageNames.set(stageId, name);
  return name;
}

async function main() {
  const from = parseYmd(arg("from") ?? "20260701");
  const to = parseYmd(arg("to") ?? ymd(new Date(Date.now() + 7 * 86400_000)));
  const compToCode = new Map<string, string>();
  for (const l of tsLeagueMap as Array<{ tsId: string; code: string }>) {
    if (!compToCode.has(l.tsId)) compToCode.set(l.tsId, l.code);
  }

  let scanned = 0, updated = 0, skippedForeign = 0, noRound = 0;
  const perLeague: Record<string, number> = {};
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400_000)) {
    const date = ymd(d);
    let rows: DiaryMatch[] = [];
    try {
      const r = await thesportsGet<{ code: number; results?: DiaryMatch[] }>("/v1/football/match/diary", { date });
      rows = r.results ?? [];
    } catch (e) {
      console.warn(`[${date}] diary 실패: ${(e as Error).message}`);
      continue;
    }
    const ours = rows.filter((m) => m.id && compToCode.has(m.competition_id) && m.round);
    if (ours.length === 0) continue;

    const existing = await prisma.match.findMany({
      where: { externalId: { in: ours.map((m) => `ts-${m.id}`) } },
      select: { id: true, league: true, externalId: true, raw: true },
    });
    const byExt = new Map(existing.map((m) => [m.externalId, m]));

    const ops: ReturnType<typeof prisma.match.update>[] = [];
    for (const m of ours) {
      const row = byExt.get(`ts-${m.id}`);
      if (!row) continue;
      scanned++;
      if (row.raw && !/^\s*\{\s*"thesports"\s*:/.test(row.raw)) { skippedForeign++; continue; }
      const r = m.round!;
      const roundNum = Number(r.round_num) || 0;
      const stageName = r.stage_id ? await stageNameOf(r.stage_id) : null;
      if (!roundNum && !stageName) { noRound++; continue; }
      const raw = JSON.stringify({
        thesports: { round: { stageId: r.stage_id || null, roundNum, groupNum: Number(r.group_num) || 0, stageName } },
      });
      if (row.raw === raw) continue;
      perLeague[row.league] = (perLeague[row.league] ?? 0) + 1;
      if (!DRY) ops.push(prisma.match.update({ where: { id: row.id }, data: { raw } }));
      updated++;
    }
    for (let i = 0; i < ops.length; i += 100) await prisma.$transaction(ops.slice(i, i + 100));
    console.log(`[${date}] diary ${rows.length} · 대상 ${ours.length} · 갱신 ${ops.length}`);
  }
  console.log(`\n스캔 ${scanned} · 갱신 ${updated}${DRY ? "(dry)" : ""} · af raw 보존 ${skippedForeign} · 라운드 없음 ${noRound}`);
  console.log("리그별:", Object.entries(perLeague).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" "));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
