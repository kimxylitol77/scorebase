// 야구(KBO/NPB/MLB) 미래 POSTPONED 매치를 api-baseball 원본과 재대조해 오분류를 정정한다.
//
// 배경: 시즌 전체 일정을 미리 백필할 때 api-baseball 이 미확정 미래 경기를 일시적으로
// CANC(Cancelled) 로 응답하는 기벽이 있다 (2026-05-10 KBO 90건 / 2026-05-13 NPB 실사고).
// 우리 매핑 CANC→POSTPONED 자체는 정상이고, collect cron 은 today+7일 창만 보므로
// 창 밖 미래 매치는 소스가 NS 로 정정돼도 몇 달간 갱신되지 않고 고착한다.
// 그 결과 monte-carlo(SCHEDULED 만 시뮬)가 잔여 일정을 과소 계산해 순위 확률이 왜곡된다.
//
// 게이트 3중 — (1) DB status=POSTPONED (2) 킥오프가 미래 (3) 소스가 NS 이거나 CANC.
// 미래 CANC 를 정정 대상에 넣는 근거는 baseball-source-cancel.ts 참고. 실제 연기 신호인
// POST·ABD·SUSP 는 그대로 존중한다.
//
// 게이트 (3) 이 원래는 NS 만 봐서 **소스가 계속 CANC 를 주는** 오분류를 못 잡았다.
// 2026-07-29 NPB 9월 71건이 그 케이스였고, 두 갈래로 각각 확인해 소스 오류로 확정했다 —
// TheSports 교차 대조(71건 전부 Not Started·과거 680경기 중 실제 취소 0건)와 NPB 공식
// 일정 대조(경기 수·팀·개시 시각 일치). 그래서 미래 CANC 를 게이트에 넣었다.
// 1순위 소스로 한 번 더 확인하려면 scripts/verify-baseball-postponed-ts.ts — TheSports 는
// IP whitelist 라 Vercel 에서 못 돌리므로 맥미니·맥북에서 실행한다.
import { prisma } from "@/lib/db";
import { isFutureSourceCancel } from "@/lib/sports/baseball-source-cancel";

// api-sports baseball 리그 ID — src/lib/sports/{kbo,npb,mlb}.ts 의 상수와 동일
const LEAGUE_ID: Record<string, number> = { KBO: 5, NPB: 2, MLB: 1 };

export const VERIFY_BASEBALL_LEAGUES = ["KBO", "NPB", "MLB"] as const;

interface SourceGame {
  id: number;
  date: string;
  status: { long: string; short: string };
}

export interface VerifyLeagueResult {
  league: string;
  /** 미래 POSTPONED 총 건수 */
  checked: number;
  /** 소스가 NS 라 정정 대상인 건수 */
  fixed: number;
  /** 정정하지 않고 유지한 건 — 소스 status 별 집계 */
  kept: Record<string, number>;
  fixedIds: number[];
  /** POSTPONED 인데 스코어가 남아 있던 건 — 연기 경기는 스코어가 없어야 정상 (2026-08-09 KBO #2499 0-0 사고).
   *  apply 시 스코어를 null 로 정리. 유입 경로는 db.ts 의 [postponed-score-write] 로그로 특정. */
  scoreCleaned: Array<{ id: number; externalId: string; score: string; updatedAt: string }>;
}

async function fetchSeason(leagueId: number, season: number): Promise<SourceGame[]> {
  const key = process.env.API_BASEBALL_KEY;
  if (!key) throw new Error("API_BASEBALL_KEY 없음");
  const res = await fetch(
    `https://v1.baseball.api-sports.io/games?league=${leagueId}&season=${season}`,
    { headers: { "x-apisports-key": key } },
  );
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    throw new Error(`api-baseball errors: ${JSON.stringify(j.errors)}`);
  }
  return (j.response ?? []) as SourceGame[];
}

export async function runVerifyBaseballPostponed(opts?: {
  /** true 면 실제 DB 정정. 기본 false (dry-run). */
  apply?: boolean;
  leagues?: readonly string[];
  season?: number;
}): Promise<VerifyLeagueResult[]> {
  const apply = opts?.apply ?? false;
  const leagues = opts?.leagues ?? VERIFY_BASEBALL_LEAGUES;
  const season = opts?.season ?? new Date().getFullYear();
  const now = new Date();
  const results: VerifyLeagueResult[] = [];

  for (const league of leagues) {
    const leagueId = LEAGUE_ID[league];
    if (!leagueId) {
      console.warn(`[verify-baseball-postponed] ${league} 리그 ID 미정의 — skip`);
      continue;
    }
    const games = await fetchSeason(leagueId, season);
    const byId = new Map(games.map((g) => [String(g.id), g]));

    const postponed = await prisma.match.findMany({
      where: { league, status: "POSTPONED", startTime: { gt: now } },
      select: { id: true, externalId: true, startTime: true },
      orderBy: { startTime: "asc" },
    });

    const fixable: number[] = [];
    const kept: Record<string, number> = {};
    for (const m of postponed) {
      const src = byId.get(m.externalId);
      const short = src?.status.short;
      if (short === "NS" || isFutureSourceCancel(short, m.startTime, now)) {
        fixable.push(m.id);
      } else {
        const k = src?.status.short ?? "(소스에 없음)";
        kept[k] = (kept[k] ?? 0) + 1;
      }
    }

    if (apply && fixable.length > 0) {
      await prisma.match.updateMany({
        where: { id: { in: fixable } },
        data: { status: "SCHEDULED" },
      });
    }

    // POSTPONED + 스코어 잔존 스캔 — 과거·미래 무관 전 시즌. status 정정과 별개로,
    // 어떤 경로가 연기 매치에 스코어를 쓰면 (표시층은 status 게이트로 안 새지만) 데이터가
    // 더러워지고 적중률 채점 오염 위험이 있다. 발견 시 스코어만 null 로 정리하고 알림.
    const scoreStuck = await prisma.match.findMany({
      where: {
        league,
        status: "POSTPONED",
        // 방금 SCHEDULED 로 정정한 건 제외
        id: { notIn: fixable },
        OR: [{ homeScore: { not: null } }, { awayScore: { not: null } }],
      },
      select: { id: true, externalId: true, homeScore: true, awayScore: true, updatedAt: true },
    });
    if (apply && scoreStuck.length > 0) {
      await prisma.match.updateMany({
        where: { id: { in: scoreStuck.map((m) => m.id) } },
        data: { homeScore: null, awayScore: null },
      });
    }

    console.log(
      `[verify-baseball-postponed] ${league} 미래 POSTPONED ${postponed.length}건 — ` +
        `${apply ? "정정" : "정정대상"} ${fixable.length} / 유지 ${JSON.stringify(kept)}` +
        (scoreStuck.length > 0 ? ` / 스코어 잔존 ${scoreStuck.length}건 ${apply ? "정리" : "발견"}` : ""),
    );
    results.push({
      league,
      checked: postponed.length,
      fixed: fixable.length,
      kept,
      fixedIds: fixable,
      scoreCleaned: scoreStuck.map((m) => ({
        id: m.id,
        externalId: m.externalId,
        score: `${m.homeScore}-${m.awayScore}`,
        updatedAt: m.updatedAt.toISOString(),
      })),
    });
  }
  return results;
}
