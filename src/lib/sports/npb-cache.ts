// NPB 페이지 path 전용 cached wrapper.
// next/cache 의 unstable_cache 는 Next.js request context 안에서만 작동.
// cron 잡 / tsx CLI 에서는 사용 불가 → raw 함수 (npb-injuries.ts, npb-official.ts) 와 분리.
//
// /injuries/NPB, /players/{pid}?league=NPB 같은 페이지 path 에서만 import 할 것.

import { unstable_cache } from "next/cache";
import {
  fetchNpbPitcherProfile as fetchNpbPitcherProfileRaw,
  fetchNpbPitcherStats as fetchNpbPitcherStatsRaw,
} from "./npb-official";
import {
  buildRosterUrlForDay,
  fetchNpbRosterForDate,
  activeNpbInjuries,
  fetchKanaKoreanForPid,
  type NpbInjuryEntry,
} from "./npb-injuries";

/**
 * 선수 프로필 1일 캐시. /players/{pid}?league=NPB + 부상자 카나 보강에서 hit.
 */
export const fetchNpbPitcherProfileCached = unstable_cache(
  fetchNpbPitcherProfileRaw,
  ["npb-pitcher-profile"],
  { revalidate: 86400, tags: ["npb-pitcher"] },
);

/**
 * 선수 시즌 stats 1시간 캐시.
 */
export const fetchNpbPitcherStatsCached = unstable_cache(
  fetchNpbPitcherStatsRaw,
  ["npb-pitcher-stats"],
  { revalidate: 3600, tags: ["npb-pitcher"] },
);

/**
 * pid 별 카나 음역 1일 캐시.
 */
export const fetchKanaKoreanForPidCached = unstable_cache(
  fetchKanaKoreanForPid,
  ["npb-kana-by-pid"],
  { revalidate: 86400, tags: ["npb-kana"] },
);

/**
 * NPB roster 일자별 페이지 1시간 캐시.
 * 과거 일자도 1시간 (TTL 절약). cold 시 일자 31개 병렬 fetch.
 */
const fetchRosterForDateCached = unstable_cache(
  fetchNpbRosterForDate,
  ["npb-roster-by-date"],
  { revalidate: 3600, tags: ["npb-roster"] },
);

/**
 * 지난 N일 active NPB 1군 엔트리 제외 명단 (페이지 path 전용 cached 버전).
 * 일자별 페이지가 모두 캐시되어 콜드 ~2초, warm ~50ms.
 */
export async function fetchActiveNpbInjuriesCached(
  daysBack: number = 30,
): Promise<NpbInjuryEntry[]> {
  const tasks: Promise<NpbInjuryEntry[]>[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const { url, dateStr } = buildRosterUrlForDay(i);
    tasks.push(fetchRosterForDateCached(url, dateStr));
  }
  const arrays = await Promise.all(tasks);
  const raw = arrays.flat();
  return activeNpbInjuries(raw);
}

/**
 * Active 부상자 list 의 한자 이름을 한글 음역으로 교체 (캐시 hit).
 */
export async function enrichNpbInjuriesWithKoreanCached(
  active: NpbInjuryEntry[],
): Promise<NpbInjuryEntry[]> {
  if (active.length === 0) return active;
  const results = await Promise.all(
    active.map(async (e) => {
      if (!e.pid) return e;
      const ko = await fetchKanaKoreanForPidCached(e.pid);
      return ko ? { ...e, playerName: ko } : e;
    }),
  );
  return results;
}
