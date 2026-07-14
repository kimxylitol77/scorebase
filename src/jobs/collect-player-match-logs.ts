// 선수 경기별 출전 로그 수집 — API-Football /fixtures/players 를 fixture 중심으로 훑어 PlayerMatchLog 적재.
// 경기당 1콜로 그 경기 전 선수 스탯 → af→ts 매핑된 선수만 저장. 근황 잡과 같은 멱등(id=match:{ts}:{fixture}).
// cron: /api/cron/player-match-logs (주간). backfill=현 시즌 전체, 아니면 최근 10일.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { fetchFixturesByLeagueId, fetchFixturePlayerStats, getApiFootballSeason } from "@/lib/sports/api-football-pro";

// af 리그 id — 빅5 리그 + 유럽대항전 + 빅5 국내컵. mapped 선수는 대부분 이 대회에서 뜀.
const COMPETITIONS: number[] = [39, 140, 135, 78, 61, 2, 3, 848, 45, 48, 143, 81, 137, 66];
const FETCH_CONCURRENCY = 6;

// 레이트리밋 — api-football Ultra 분당 ~450. 안전하게 400/min(150ms 간격)으로 스로틀.
//  (이걸 안 하면 429가 조용히 빈 응답 처리돼 라리가·세리에A 등 리그가 통째로 누락됨)
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 150;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

// 동시성 제한 풀 — fixtures 수천 개 /fixtures/players 호출.
async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

interface MatchLogRow {
  id: string; playerId: string; fixtureId: number; date: Date;
  leagueName: string; leagueFlag: string | null;
  homeName: string; homeLogo: string | null; awayName: string; awayLogo: string | null;
  homeScore: number | null; awayScore: number | null; playerSide: string;
  rating: number | null; minutes: number | null; goals: number; assists: number; yellow: number; red: number; started: boolean;
}

export async function runCollectPlayerMatchLogs({ backfill = false }: { backfill?: boolean } = {}) {
  const season = getApiFootballSeason(new Date(), "EPL");
  const from = backfill ? undefined : new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);

  // 1) 대회별 완료 fixtures 수집
  const fixtures = (
    await Promise.all(COMPETITIONS.map((lid) => fetchFixturesByLeagueId(lid, season, from ? { from } : {})))
  ).flat();
  if (!fixtures.length) return { fixtures: 0, rows: 0, created: 0 };

  // 2) fixture 별 선수 스탯 → af→ts 매핑된 선수만 로그 행
  const rowsNested = await mapPool(fixtures, FETCH_CONCURRENCY, async (fx) => {
    await throttle();
    const stats = await fetchFixturePlayerStats(fx.id);
    const rows: MatchLogRow[] = [];
    for (const s of stats) {
      const tsId = afPlayerToTs(s.playerId);
      if (!tsId) continue;
      rows.push({
        id: `match:${tsId}:${fx.id}`,
        playerId: tsId,
        fixtureId: fx.id,
        date: new Date(fx.dateMs),
        leagueName: fx.leagueName,
        leagueFlag: fx.leagueFlag ?? null,
        homeName: fx.homeName,
        homeLogo: fx.homeLogo ?? null,
        awayName: fx.awayName,
        awayLogo: fx.awayLogo ?? null,
        homeScore: fx.homeScore,
        awayScore: fx.awayScore,
        playerSide: s.teamId === fx.homeId ? "H" : "A",
        rating: s.rating,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        yellow: s.yellow,
        red: s.red,
        started: s.started,
      });
    }
    return rows;
  });

  // 3) 멱등 dedup + 적재
  const byId = new Map<string, MatchLogRow>();
  for (const r of rowsNested.flat()) if (!byId.has(r.id)) byId.set(r.id, r);
  const unique = [...byId.values()];
  let created = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const r = await prisma.playerMatchLog.createMany({ data: unique.slice(i, i + 1000), skipDuplicates: true });
    created += r.count;
  }
  return { fixtures: fixtures.length, rows: unique.length, created };
}
