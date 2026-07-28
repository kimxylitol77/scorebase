// KBO 가을야구(포스트시즌 5강) 진출 확률 — 순위표·예측 페이지 공용 시뮬 소스.
//
// 몬테카를로는 시드가 없어(monte-carlo.ts:31) 같은 데이터로 두 번 돌리면 확률이 ±1%p 흔들린다.
// /standings/KBO 와 /predictions/KBO 가 각자 돌리면 같은 지표가 페이지마다 다르게 보이므로
// unstable_cache 로 감싼 이 함수 하나를 두 페이지가 함께 호출한다.
//
// KBO 만 다룬다 — MLB(지구 6 + 와일드카드 6, AL/NL 분리)·NPB(CL/PL 각 3위)는 포스트시즌 구조가
// 단일 표 상위 N 위와 달라 runMonteCarlo 의 top5 를 그대로 쓰면 틀린 숫자가 된다.

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { runMonteCarlo, type MonteCarloRow } from "./monte-carlo";
import { currentSeasonStart, previousSeasonStart } from "./season-window";
import type { PredictMatch } from "./types";

export interface KboSeasonSim {
  rows: MonteCarloRow[];
  /** 시뮬 근거 매치 수 — 가드·안내 문구용 */
  finished: number;
  scheduled: number;
}

const MATCH_SELECT = {
  id: true,
  league: true,
  status: true,
  homeTeamId: true,
  awayTeamId: true,
  homeScore: true,
  awayScore: true,
  startTime: true,
} as const;

async function loadKboSeasonSim(): Promise<KboSeasonSim> {
  // 시즌 창 — /predictions/[league] 와 동일한 로직(신 시즌 개막 직후·오프시즌은 직전 시즌 폴백).
  // 두 페이지가 다른 매치 집합을 보면 캐시를 공유하는 의미가 없다.
  const seasonStart = currentSeasonStart("KBO");
  let dbMatches = await prisma.match.findMany({
    where: { league: "KBO", ...(seasonStart ? { startTime: { gte: seasonStart } } : {}) },
    select: MATCH_SELECT,
  });
  if (seasonStart && dbMatches.filter((m) => m.status === "FINISHED").length < 10) {
    dbMatches = await prisma.match.findMany({
      where: { league: "KBO", startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart } },
      select: MATCH_SELECT,
    });
  }

  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));
  const finished = matches.filter((m) => m.status === "FINISHED").length;
  const scheduled = matches.filter((m) => m.status === "SCHEDULED").length;
  if (finished < 20) return { rows: [], finished, scheduled };

  const rows = runMonteCarlo(matches, "KBO", { iterations: 5000, relegationCount: 0 });
  return { rows, finished, scheduled };
}

/** revalidate 600 — /predictions/[league] 의 ISR 주기와 맞춤 */
export const getKboSeasonSim = unstable_cache(loadKboSeasonSim, ["kbo-season-sim"], {
  revalidate: 600,
});

/**
 * teamId → 가을야구 진출 확률(0~1) 맵.
 * 시즌 종료(잔여 경기 0)·데이터 부족이면 null — 호출부가 컬럼 자체를 숨긴다.
 */
export async function getKboPostseasonOdds(): Promise<Map<number, number> | null> {
  const sim = await getKboSeasonSim();
  if (sim.rows.length === 0 || sim.scheduled === 0) return null;
  return new Map(sim.rows.map((r) => [r.teamId, r.top5]));
}
