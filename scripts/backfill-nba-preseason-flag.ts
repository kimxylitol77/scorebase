// NBA 프리시즌 표시 백필 — ts 농구 diary 의 kind=3 경기를 Match.raw {"thesports":{"preseason":true}} 로 표시한다.
// 워커(basketball-match-collector)는 ±5일만 훑어 그 밖의 이미 수집된 경기는 표시가 없다. match/season 은 농구 미인가라 날짜 순회.
// 표시는 lib/predict/preseason.ts 가 읽어 순위·시뮬·Elo·적중률에서 뺀다. ESPN 원본 raw 가 있는 행은 건드리지 않는다(거긴 slug 가 표시).
// 실행: npx tsx --env-file=.env.local scripts/backfill-nba-preseason-flag.ts [--from=2026-09-25] [--to=2026-10-31] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry");
const NBA_COMP = "49vjxm8xt4q6odg";
const from = new Date(`${arg("from") ?? "2026-09-25"}T00:00:00Z`);
const to = new Date(`${arg("to") ?? "2026-10-31"}T00:00:00Z`);

async function main() {
  const kind3 = new Set<string>();
  let kind1 = 0;
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86400_000)) {
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const u = new URL("https://api.thesports.com/v1/basketball/match/diary");
    u.searchParams.set("user", process.env.THESPORTS_USER ?? "");
    u.searchParams.set("secret", process.env.THESPORTS_SECRET ?? "");
    u.searchParams.set("date", ymd);
    const r = (await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json()) as { results?: Array<{ id: string; competition_id: string; kind?: number }> };
    for (const m of r.results ?? []) {
      if (m.competition_id !== NBA_COMP) continue;
      if (m.kind === 3) kind3.add(m.id);
      else kind1++;
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  console.log(`diary ${from.toISOString().slice(0, 10)}~${to.toISOString().slice(0, 10)}: NBA kind3 ${kind3.size} · 그 외 ${kind1}`);

  const rows = await prisma.match.findMany({
    where: { league: "NBA", externalId: { in: [...kind3].map((id) => `ts-${id}`) } },
    select: { id: true, externalId: true, raw: true, startTime: true },
  });
  let updated = 0, skippedForeign = 0, already = 0;
  for (const m of rows) {
    if (m.raw && !/^\s*\{\s*"thesports"\s*:/.test(m.raw)) { skippedForeign++; continue; }
    const cur = m.raw ? (JSON.parse(m.raw) as { thesports?: Record<string, unknown> }) : {};
    if (cur.thesports?.preseason === true) { already++; continue; }
    const next = JSON.stringify({ thesports: { ...(cur.thesports ?? {}), preseason: true } });
    if (!DRY) await prisma.match.update({ where: { id: m.id }, data: { raw: next } });
    updated++;
  }
  console.log(`DB 매칭 ${rows.length} · 표시 ${updated}${DRY ? " (dry)" : ""} · 이미 ${already} · ESPN raw 행 건너뜀 ${skippedForeign}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
