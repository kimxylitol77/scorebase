// ts- externalId 팀을 team-id-mapping.json 에 백필 — 이름 매칭 없이 확정 매핑만.
//
//   npm run backfill:ts-team-mapping              # dry-run (기본)
//   npm run backfill:ts-team-mapping -- --write   # 파일 기록
//   npm run backfill:ts-team-mapping -- --league CZECH_2,DENMARK_2
//
// 왜 안전한가.
//   TheSports 매치 수집기가 만든 Team 은 externalId 가 `ts-<tsId>` 다. 즉 ts 팀 id 를
//   이미 알고 있는 상태라 추측이 필요 없다. 기존 v4 빌더(build-thesports-team-id-mapping-v4)
//   의 이름 정규화·유사도 매칭과 달리 오매핑 위험이 0 이다.
//
// 왜 필요한가.
//   시즌 전환 검증의 팀 매핑률 95% 기준을 이 리그들이 0% 로 못 넘겨 새 시즌이 계속
//   DISCOVERED 에 머문다. 매핑만 채우면 자동 통과한다. TheSports 1순위 원칙상
//   매핑 누락은 api-football 로 우회하지 않고 ts 매핑을 채워서 푼다.
//
// 건드리지 않는 것.
//   - 이미 (ourLeague, tsId) 로 매핑된 항목
//   - 같은 ourId 가 그 리그에서 다른 tsId 로 이미 매핑된 경우 (충돌 — 사람이 판단)
//   - 운영 DB (읽기 전용)

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";
import { SOCCER_LEAGUES } from "../src/lib/sports/sport-leagues";

const MAP_FILE = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");

interface Entry {
  ourId: number;
  ourName?: string;
  ourLeague: string;
  ourExternalId?: string;
  tsId: string;
  tsName?: string;
  tsKo?: string;
  matchType?: string;
  tsVenueId?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
}
const has = (n: string) => process.argv.includes(`--${n}`);

async function main() {
  const write = has("write");
  const only = arg("league")
    ? new Set(arg("league")!.split(",").map((s) => s.trim().toUpperCase()))
    : null;

  const entries: Entry[] = JSON.parse(readFileSync(MAP_FILE, "utf-8"));
  const tsByLeague = new Map<string, Set<string>>();
  const ourByLeague = new Map<string, Set<number>>();
  for (const e of entries) {
    if (!tsByLeague.has(e.ourLeague)) {
      tsByLeague.set(e.ourLeague, new Set());
      ourByLeague.set(e.ourLeague, new Set());
    }
    tsByLeague.get(e.ourLeague)!.add(e.tsId);
    ourByLeague.get(e.ourLeague)!.add(e.ourId);
  }

  const teams = await prisma.team.findMany({
    where: { externalId: { startsWith: "ts-" } },
    select: { id: true, league: true, externalId: true, name: true, nameKo: true },
  });

  const added: Entry[] = [];
  const skipped: { reason: string; league: string; name: string }[] = [];

  for (const t of teams) {
    if (!SOCCER_LEAGUES.has(t.league)) {
      skipped.push({ reason: "비축구", league: t.league, name: t.name });
      continue;
    }
    if (only && !only.has(t.league)) continue;
    const tsId = t.externalId.slice(3);
    if (!tsId) continue;
    if (tsByLeague.get(t.league)?.has(tsId)) continue; // 이미 매핑됨
    if (ourByLeague.get(t.league)?.has(t.id)) {
      // 같은 팀이 그 리그에서 다른 ts id 로 이미 매핑됨 — 자동 판단하지 않는다.
      skipped.push({ reason: "ourId 중복 매핑", league: t.league, name: t.name });
      continue;
    }
    added.push({
      ourId: t.id,
      ourName: t.name,
      ourLeague: t.league,
      ourExternalId: t.externalId,
      tsId,
      tsName: t.name,
      ...(t.nameKo ? { tsKo: t.nameKo } : {}),
      matchType: "ts-external-id", // 확정 — 이름 매칭 아님
    });
    if (!tsByLeague.has(t.league)) {
      tsByLeague.set(t.league, new Set());
      ourByLeague.set(t.league, new Set());
    }
    tsByLeague.get(t.league)!.add(tsId);
    ourByLeague.get(t.league)!.add(t.id);
  }

  const byLeague = new Map<string, number>();
  for (const a of added) byLeague.set(a.ourLeague, (byLeague.get(a.ourLeague) ?? 0) + 1);

  console.log(`ts- externalId 팀 ${teams.length}개 스캔 · 추가 대상 ${added.length}개`);
  for (const [lg, n] of [...byLeague.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lg.padEnd(22)} +${n}`);
  }
  if (skipped.length > 0) {
    const bySkip = new Map<string, number>();
    for (const s of skipped) bySkip.set(s.reason, (bySkip.get(s.reason) ?? 0) + 1);
    console.log(`\n건너뜀: ${[...bySkip.entries()].map(([r, n]) => `${r} ${n}`).join(" · ")}`);
  }

  if (added.length === 0) {
    console.log("\n추가할 항목이 없다.");
    return;
  }
  if (!write) {
    console.log(`\n샘플 3건:`);
    for (const a of added.slice(0, 3)) {
      console.log(`  ${a.ourLeague} ${a.ourName} (ourId=${a.ourId}) → ${a.tsId}`);
    }
    console.log(`\nDRY-RUN 이라 파일을 건드리지 않았다. 기록하려면 --write.`);
    return;
  }

  const out = [...entries, ...added];
  writeFileSync(MAP_FILE, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`\n${MAP_FILE} 갱신 — ${entries.length} → ${out.length} 항목`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
