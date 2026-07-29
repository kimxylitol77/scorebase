// 야구(KBO/NPB/MLB) 미래 POSTPONED 매치를 api-baseball 원본과 재대조해 오분류를 정정한다.
//
// 배경: 시즌 전체 일정을 미리 백필할 때 api-baseball 이 미확정 미래 경기를 일시적으로
// CANC(Cancelled) 로 응답하는 기벽이 있다 (2026-05-10 KBO 90건 / 2026-05-13 NPB 실사고).
// 우리 매핑 CANC→POSTPONED 자체는 정상이고, collect cron 은 today+7일 창만 보므로
// 창 밖 미래 매치는 소스가 NS 로 정정돼도 몇 달간 갱신되지 않고 고착한다.
// 그 결과 monte-carlo(SCHEDULED 만 시뮬)가 잔여 일정을 과소 계산해 순위 확률이 왜곡된다.
//
// 게이트 3중 — (1) DB status=POSTPONED (2) 킥오프가 미래 (3) 소스 현재 status=NS.
// 실제 연기·취소(POST/CANC/ABD)는 소스가 그대로 주므로 건드리지 않는다.
import { prisma } from "@/lib/db";

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
      if (src?.status.short === "NS") fixable.push(m.id);
      else {
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
    console.log(
      `[verify-baseball-postponed] ${league} 미래 POSTPONED ${postponed.length}건 — ` +
        `${apply ? "정정" : "정정대상"} ${fixable.length} / 유지 ${JSON.stringify(kept)}`,
    );
    results.push({
      league,
      checked: postponed.length,
      fixed: fixable.length,
      kept,
      fixedIds: fixable,
    });
  }
  return results;
}
