// 야구 시즌 잔여 일정 선적재 — collect cron 의 ±7일 창 밖 매치를 채운다.
//
// 배경: collect cron 은 pastDays=2/futureDays=7 창만 본다. 축구는
// scripts/backfill-season-fixtures.ts 로 시즌 전량을 미리 넣지만 야구에는 그 경로가
// 없어서, KBO/NPB 는 2026-05 에 수동 백필된 반면 MLB 는 8~9월 일정이 통째로 비어 있었다.
// monte-carlo 는 status=SCHEDULED 매치만 시뮬하므로 /predictions/MLB 우승·PS 확률이
// 잔여 일정을 심하게 과소 계산한다.
//
// 소스는 반드시 각 리그의 primary 를 쓴다 (getPrimarySource 참조).
//   MLB      → ESPN scoreboard (여기서 처리). Match.externalId 가 ESPN game id 이므로
//              api-baseball 로 넣으면 다른 id 공간의 row 가 생겨 dedup 가드에 의존하게 된다.
//              커버리지도 ESPN 이 넓다 (2026-09 실측 — ESPN 361건 vs api-baseball 164건).
//   KBO/NPB  → api-baseball games?league&season 1회. 이미 2026-05 에 적재됨. 재실행 시
//              미래 CANC 기벽(미확정 경기를 일시적으로 Cancelled 로 응답)을 조심할 것.
//
// 미래 POSTPONED 는 적재하지 않는다. 소스가 미확정 미래 경기를 일시적으로 취소로 주는
// 기벽이 있어(2026-05 KBO 90건 고착 사고) 잘못 넣으면 시뮬에서 통째로 빠진다.
// 창 안으로 들어오면 collect cron 이 실제 연기를 정상 기록한다.
//
// 실행: npx tsx scripts/backfill-baseball-season.ts [--apply] [--from=2026-07-29] [--to=2026-09-27]
import "dotenv/config";
import { fetchEspnMlbRange } from "../src/lib/sports/espn-mlb";
import { upsertMatch } from "../src/jobs/collect";
import type { NormalizedMatch } from "../src/lib/sports/types";

const APPLY = process.argv.includes("--apply");
const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];

function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(d: string, n: number): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
/** [from, to] 를 달 경계로 쪼갠다 — ESPN 범위 호출 1회당 한 달. */
function monthChunks(from: string, to: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let cur = from;
  while (cur <= to) {
    const d = new Date(cur + "T00:00:00Z");
    const monthEnd = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    )
      .toISOString()
      .slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    out.push([cur, end]);
    cur = addDays(end, 1);
  }
  return out;
}

async function main() {
  const from = arg("from") ?? todayKST();
  const to = arg("to") ?? addDays(from, 90);
  console.log(
    `[backfill-baseball] MLB ${from} ~ ${to} (${APPLY ? "APPLY" : "dry-run"})`,
  );

  const fetched: NormalizedMatch[] = [];
  for (const [a, b] of monthChunks(from, to)) {
    const games = await fetchEspnMlbRange(a, b);
    console.log(`  ESPN ${a}~${b}: ${games.length}건`);
    fetched.push(...games);
    await new Promise((r) => setTimeout(r, 300));
  }

  const now = new Date();
  const futurePostponed = fetched.filter(
    (m) => m.status === "POSTPONED" && m.startTime > now,
  );
  const target = fetched.filter((m) => !futurePostponed.includes(m));
  console.log(
    `  총 ${fetched.length}건 — 적재대상 ${target.length} / 미래 POSTPONED skip ${futurePostponed.length}`,
  );
  for (const m of futurePostponed) {
    console.log(
      `    skip ${m.externalId} ${m.startTime.toISOString().slice(0, 16)} ${m.awayTeam.name} @ ${m.homeTeam.name}`,
    );
  }

  if (!APPLY) {
    console.log("  → dry-run (적용하려면 --apply)");
    return;
  }

  let up = 0;
  let fail = 0;
  for (const m of target) {
    // source 명시 — 리그 primary 와 다른 라벨로 resolve 하면 팀 매핑이 오염된다 (2026-07-09 EPL 사고).
    try {
      await upsertMatch(m, { source: "espn" });
      up++;
    } catch (e) {
      fail++;
      if (fail <= 3) {
        console.log(
          `    ✗ ${m.externalId}: ${(e as Error).message.slice(0, 100)}`,
        );
      }
    }
  }
  console.log(`  → upserted ${up}, failed ${fail}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
