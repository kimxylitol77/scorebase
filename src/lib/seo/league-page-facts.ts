// 리그 페이지 SEO 용 리그별 데이터 사실(경기 수·다음 경기·선수 기록 유무) — 1시간 캐시.
// 사이트맵(내용 있는 리그만 등록)·/leagues 목록·리그 페이지 메타데이터가 같은 숫자를 쓴다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export interface LeagueFacts {
  /** 최근 365일 경기(예정 포함) */
  matches365: number;
  /** 최근 180일 종료 경기 */
  finished180: number;
  /** 앞으로 예정 경기 */
  upcoming: number;
  /** 선수 리더보드 행 */
  leaders: number;
  /** 다음 경기 시각(ISO) */
  nextMatch: string | null;
  /** 마지막 종료 경기 시각(ISO) */
  lastMatch: string | null;
}

async function compute(): Promise<Record<string, LeagueFacts>> {
  const now = Date.now();
  const [m365, f180, up, leaders, next, last] = await Promise.all([
    prisma.match.groupBy({ by: ["league"], where: { startTime: { gte: new Date(now - 365 * 86400_000) } }, _count: true }),
    prisma.match.groupBy({ by: ["league"], where: { status: "FINISHED", startTime: { gte: new Date(now - 180 * 86400_000) } }, _count: true }),
    prisma.match.groupBy({ by: ["league"], where: { status: "SCHEDULED", startTime: { gte: new Date(now) } }, _count: true }),
    prisma.leagueLeader.groupBy({ by: ["league"], _count: true }),
    prisma.match.groupBy({ by: ["league"], where: { status: "SCHEDULED", startTime: { gte: new Date(now) } }, _min: { startTime: true } }),
    prisma.match.groupBy({ by: ["league"], where: { status: "FINISHED" }, _max: { startTime: true } }),
  ]);
  const out: Record<string, LeagueFacts> = {};
  const get = (l: string) =>
    (out[l] ??= { matches365: 0, finished180: 0, upcoming: 0, leaders: 0, nextMatch: null, lastMatch: null });
  for (const r of m365) get(r.league).matches365 = r._count;
  for (const r of f180) get(r.league).finished180 = r._count;
  for (const r of up) get(r.league).upcoming = r._count;
  for (const r of leaders) get(r.league).leaders = r._count;
  for (const r of next) get(r.league).nextMatch = r._min.startTime?.toISOString() ?? null;
  for (const r of last) get(r.league).lastMatch = r._max.startTime?.toISOString() ?? null;
  return out;
}

export const getLeaguePageFacts = unstable_cache(compute, ["league-page-facts"], { revalidate: 3600 });

export const EMPTY_FACTS: LeagueFacts = { matches365: 0, finished180: 0, upcoming: 0, leaders: 0, nextMatch: null, lastMatch: null };
