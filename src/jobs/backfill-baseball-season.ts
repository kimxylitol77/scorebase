// 야구 시즌 잔여 일정 선적재 — collect cron 의 ±7일 창 밖 매치를 채운다.
//
// 배경: collect cron 은 pastDays=2/futureDays=7 창만 본다. 축구는
// scripts/backfill-season-fixtures.ts 로 시즌 전량을 미리 넣지만 야구에는 그 경로가
// 없어서, KBO/NPB 는 2026-05 에 수동 백필된 반면 MLB 는 8~9월 일정이 통째로 비어 있었다
// (2026-07-29 실측 818건 누락). monte-carlo 는 status=SCHEDULED 매치만 시뮬하므로
// /predictions/MLB 우승·포스트시즌 확률이 잔여 일정을 심하게 과소 계산한다.
//
// 소스는 각 리그의 primary 를 쓴다 (getPrimarySource 참조).
//   MLB      → ESPN scoreboard (여기서 처리). Match.externalId 가 ESPN game id 이므로
//              api-baseball 로 넣으면 다른 id 공간의 row 가 생겨 dedup 가드에 의존하게 된다.
//              커버리지도 ESPN 이 넓다 (2026-09 실측 — ESPN 361건 vs api-baseball 164건).
//   KBO/NPB  → api-baseball games?league&season 1회. 이미 2026-05 에 적재됨. 재실행 시
//              미래 CANC 기벽(미확정 경기를 일시적으로 Cancelled 로 응답)을 조심할 것.
//
// 미래 POSTPONED 는 적재하지 않는다. 소스가 미확정 미래 경기를 일시적으로 취소로 주는
// 기벽이 있어(2026-05 KBO 90건 고착 사고) 잘못 넣으면 시뮬에서 통째로 빠진다.
// 창 안으로 들어오면 collect cron 이 실제 연기를 정상 기록한다.

import { prisma } from "@/lib/db";
import { fetchEspnMlbRange } from "@/lib/sports/espn-mlb";
import { upsertMatch } from "@/jobs/collect";
import type { NormalizedMatch } from "@/lib/sports/types";

export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addDays(d: string, n: number): string {
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
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    out.push([cur, end]);
    cur = addDays(end, 1);
  }
  return out;
}

export interface BackfillResult {
  fetched: number;
  /** 미래 POSTPONED — 소스 기벽 방어로 적재 skip */
  skippedPostponed: number;
  /** DB 와 완전히 동일해 쓰기 생략 */
  unchanged: number;
  upserted: number;
  failed: number;
}

/**
 * MLB 잔여 일정을 ESPN 범위 조회로 채운다.
 *
 * 이미 DB 와 동일한 매치는 upsert 를 건너뛴다 — 매치당 5회 왕복이라 818건 전량 쓰기는
 * 20분이 걸려 서버리스 실행 한도를 넘는다. 정상 상태에서는 신규·변경분만 남아 수초에 끝난다.
 */
export async function runBaseballSeasonBackfill(opts?: {
  from?: string;
  to?: string;
  /** false 면 조회·비교만 하고 쓰지 않는다 */
  apply?: boolean;
}): Promise<BackfillResult> {
  const from = opts?.from ?? todayKST();
  const to = opts?.to ?? addDays(from, 90);
  const apply = opts?.apply ?? true;

  const fetched: NormalizedMatch[] = [];
  for (const [a, b] of monthChunks(from, to)) {
    const games = await fetchEspnMlbRange(a, b);
    console.log(`[backfill-baseball/MLB] ESPN ${a}~${b}: ${games.length}건`);
    fetched.push(...games);
  }

  const now = new Date();
  const target: NormalizedMatch[] = [];
  let skippedPostponed = 0;
  for (const m of fetched) {
    if (m.status === "POSTPONED" && m.startTime > now) {
      skippedPostponed++;
      continue;
    }
    target.push(m);
  }

  // 기존 row 를 한 번에 읽어 변경분만 추린다.
  const existing = await prisma.match.findMany({
    where: {
      league: "MLB",
      startTime: {
        gte: new Date(from + "T00:00:00Z"),
        lte: new Date(addDays(to, 1) + "T00:00:00Z"),
      },
    },
    select: {
      externalId: true,
      startTime: true,
      status: true,
      homeScore: true,
      awayScore: true,
    },
  });
  const byExt = new Map(existing.map((r) => [r.externalId, r]));

  const changed = target.filter((m) => {
    const cur = byExt.get(m.externalId);
    if (!cur) return true;
    return (
      cur.status !== m.status ||
      cur.startTime.getTime() !== m.startTime.getTime() ||
      cur.homeScore !== (m.homeScore ?? null) ||
      cur.awayScore !== (m.awayScore ?? null)
    );
  });

  const result: BackfillResult = {
    fetched: fetched.length,
    skippedPostponed,
    unchanged: target.length - changed.length,
    upserted: 0,
    failed: 0,
  };
  console.log(
    `[backfill-baseball/MLB] ${from}~${to} 총 ${result.fetched}건 — 변경 ${changed.length} / 동일 ${result.unchanged} / 미래POSTPONED skip ${skippedPostponed}`,
  );
  if (!apply) return result;

  for (const m of changed) {
    // source 명시 — 리그 primary 와 다른 라벨로 resolve 하면 팀 매핑이 오염된다 (2026-07-09 EPL 사고).
    try {
      await upsertMatch(m, { source: "espn" });
      result.upserted++;
    } catch (e) {
      result.failed++;
      if (result.failed <= 3) {
        console.log(`  ✗ ${m.externalId}: ${(e as Error).message.slice(0, 100)}`);
      }
    }
  }
  console.log(
    `[backfill-baseball/MLB] upserted ${result.upserted}, failed ${result.failed}`,
  );
  return result;
}
