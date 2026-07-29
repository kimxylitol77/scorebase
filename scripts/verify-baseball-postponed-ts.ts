// 야구 미래 POSTPONED 재대조 — TheSports 교차 소스판.
//
// src/jobs/verify-baseball-postponed.ts (Vercel 데일리 cron) 는 api-baseball 한 소스만
// 본다. 게이트가 "소스 현재 status=NS" 라, **소스가 계속 CANC 를 주는** 오분류는 영원히
// 못 잡는다 — 2026-07-29 NPB 9월 71건이 그 케이스였다(과거 680경기 중 실제 취소 0건,
// 9/10부터 하루 전 슬레이트가 통째로, 킥오프가 전부 09:00 플레이스홀더).
//
// 그래서 1순위 소스인 TheSports 로 교차 대조한다. ts 가 Not Started(status_id 0·1) 로
// 주면 api-baseball 의 CANC 는 오분류로 확정한다.
//
// ⚠️ Vercel 에서 못 돌린다 — TheSports 는 IP whitelist 필수(동적 IP 불가). 맥미니·맥북·
// 워커에서만 실행할 것. 그래서 cron 이 아니라 스크립트다.
//
// 매칭은 ts 토너먼트 id 상수를 안 쓴다. baseball-team-id-mapping.json 의 팀 매핑으로
// 시즌을 역추적해 날짜(±1일) + 팀쌍으로 대조한다 — 같은 이름의 토너먼트가 둘 있는
// 케이스(NPB) 를 피하려는 것.
//
// 실행: npx tsx scripts/verify-baseball-postponed-ts.ts [--apply] [--leagues=NPB,KBO,MLB]
import "../src/lib/env";
import { PrismaClient } from "@prisma/client";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import mapping from "../src/lib/sports/thesports/baseball-team-id-mapping.json";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="));
const LEAGUES = leaguesArg ? leaguesArg.split("=")[1].split(",") : ["KBO", "NPB", "MLB"];

/** TheSports status_id 0·1 = Not Started (status-codes.ts 참조) */
const TS_NOT_STARTED = new Set([0, 1]);

interface TsMatch {
  id: string;
  season_id: string;
  home_team_id: string;
  away_team_id: string;
  status_id: number;
  match_time: number;
}

function kstDate(epochSec: number): string {
  return new Date((epochSec + 9 * 3600) * 1000).toISOString().slice(0, 10);
}

/** 우리 팀 매핑에 있는 ts 팀이 뛰는 매치를 diary 에서 찾아 season_id 를 역추적. */
async function resolveSeasonId(tsTeamIds: Set<string>): Promise<string | null> {
  // diary 는 미래 +32일쯤에서 code=405 로 막힌다(2026-07-29 실측) → 가까운 날짜로 조회.
  for (const offsetDays of [1, 3, 7, 14]) {
    const tsp = Math.floor(Date.now() / 1000) + offsetDays * 86400;
    let rows: TsMatch[] = [];
    try {
      const r = await thesportsGet<any>("/v1/baseball/match/diary", { tsp });
      rows = (r.results ?? []) as TsMatch[];
    } catch {
      continue;
    }
    const hit = rows.find(
      (m) => tsTeamIds.has(String(m.home_team_id)) && tsTeamIds.has(String(m.away_team_id)),
    );
    if (hit?.season_id) return hit.season_id;
  }
  return null;
}

async function main() {
  const now = new Date();
  console.log(`[verify-ts] ${APPLY ? "APPLY" : "dry-run"} — leagues=${LEAGUES.join(",")}`);

  for (const league of LEAGUES) {
    const tsByOurId = new Map<number, string>();
    for (const e of mapping as Array<{ ourId: number; ourLeague: string; tsId: string }>) {
      if (e.ourLeague === league) tsByOurId.set(e.ourId, e.tsId);
    }
    if (tsByOurId.size === 0) {
      console.log(`\n=== ${league}: ts 팀 매핑 없음 — skip`);
      continue;
    }

    const postponed = await prisma.match.findMany({
      where: { league, status: "POSTPONED", startTime: { gt: now } },
      select: {
        id: true, externalId: true, startTime: true,
        homeTeamId: true, awayTeamId: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    });
    console.log(`\n=== ${league}: 미래 POSTPONED ${postponed.length}건 (ts 팀매핑 ${tsByOurId.size})`);
    if (postponed.length === 0) continue;

    const seasonId = await resolveSeasonId(new Set(tsByOurId.values()));
    if (!seasonId) {
      console.log(`  ts 시즌 역추적 실패 (오프시즌이거나 diary 미커버) — skip`);
      continue;
    }
    const ms = await thesportsGet<any>("/v1/baseball/match/season", { uuid: seasonId });
    const tsRows = (ms.results ?? []) as TsMatch[];
    const tsIndex = new Map<string, TsMatch>();
    for (const m of tsRows) {
      tsIndex.set(`${kstDate(m.match_time)}|${m.home_team_id}|${m.away_team_id}`, m);
    }
    console.log(`  ts season=${seasonId} ${tsRows.length}건 로드`);

    const fixable: number[] = [];
    let unmapped = 0, nomatch = 0;
    const keptByStatus: Record<string, number> = {};
    for (const m of postponed) {
      const h = tsByOurId.get(m.homeTeamId);
      const a = tsByOurId.get(m.awayTeamId);
      if (!h || !a) { unmapped++; continue; }
      const base = kstDate(Math.floor(m.startTime.getTime() / 1000));
      let hit: TsMatch | undefined;
      // ±1일 — KST 경계·소스 간 킥오프 시각 오차 흡수
      for (const off of [0, -1, 1]) {
        const d = new Date(new Date(base + "T00:00:00Z").getTime() + off * 86400e3)
          .toISOString().slice(0, 10);
        hit = tsIndex.get(`${d}|${h}|${a}`) ?? tsIndex.get(`${d}|${a}|${h}`);
        if (hit) break;
      }
      if (!hit) { nomatch++; continue; }
      if (TS_NOT_STARTED.has(hit.status_id)) fixable.push(m.id);
      else keptByStatus[String(hit.status_id)] = (keptByStatus[String(hit.status_id)] ?? 0) + 1;
    }

    console.log(
      `  ts Not Started ${fixable.length} / ts 다른 status ${JSON.stringify(keptByStatus)} / ` +
        `ts 미대응 ${nomatch} / 팀매핑 없음 ${unmapped}`,
    );
    if (nomatch > 0 || unmapped > 0) {
      console.log(`  ⚠️ 대조 못한 건이 있다 — 매핑·시즌 커버리지 확인 필요`);
    }
    if (fixable.length === 0) continue;

    if (APPLY) {
      const r = await prisma.match.updateMany({
        where: { id: { in: fixable } },
        data: { status: "SCHEDULED" },
      });
      console.log(`  → SCHEDULED 정정 ${r.count}건 적용`);
    } else {
      console.log(`  → dry-run (적용하려면 --apply)`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
