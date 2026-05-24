// TheSportsDB API 공통 클라이언트.
// 무료 키("123") 사용 시 30 req/min 제한 → 시즌 단위로 캐싱.

import axios from "axios";

const KEY = process.env.THESPORTSDB_KEY ?? "123"; // 미설정 시 공용 무료 키
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

interface SeasonCacheEntry {
  fetchedAt: number;
  events: TheSportsDBEvent[];
}

const seasonCache = new Map<string, SeasonCacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

export interface TheSportsDBEvent {
  idEvent: string;
  strEvent?: string;
  strLeague?: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeamBadge?: string;
  strAwayTeamBadge?: string;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  dateEvent?: string;
  strTimestamp?: string; // 보통 UTC ISO
  strStatus?: string;
  [k: string]: unknown;
}

/**
 * 특정 리그의 시즌 전체 경기를 가져온다 (캐시).
 * 시즌 형식은 리그마다 다름:
 *   - 단일연도: "2026" (KBO 등)
 *   - 두연도:   "2025-2026" (EPL 등)
 */
export async function fetchSeasonEvents(
  leagueId: string,
  season: string,
): Promise<TheSportsDBEvent[]> {
  const cacheKey = `${leagueId}:${season}`;
  const cached = seasonCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.events;
  }

  const { data } = await client.get("/eventsseason.php", {
    params: { id: leagueId, s: season },
  });

  const events: TheSportsDBEvent[] = data?.events ?? [];
  seasonCache.set(cacheKey, { fetchedAt: Date.now(), events });
  return events;
}

/** 캐시 무효화 (테스트나 강제 갱신용) */
export function invalidateSeasonCache(leagueId?: string, season?: string) {
  if (!leagueId || !season) {
    seasonCache.clear();
    return;
  }
  seasonCache.delete(`${leagueId}:${season}`);
}
