// MLB 선수 페이지 path 전용 cached wrapper. (npb-cache.ts 와 같은 패턴)
//
// mlb-stats-api 는 axios 로 statsapi.mlb.com 을 호출한다 — Next.js fetch 캐시가 걸리지 않아
// /players/{pid} 가 매 요청 외부 API 를 4회까지 때렸다(generateMetadata 1 + 본문 3).
// statsapi 응답이 1회 1.3초대라 페이지가 2~3초 걸렸다 (2026-08-01 route-guardian 느림 43건).
//
// unstable_cache 는 Next.js request context 안에서만 작동 → cron 잡 / tsx CLI 는 raw 함수를
// 그대로 쓸 것. 페이지 path 에서만 import 한다.

import { unstable_cache } from "next/cache";
import {
  fetchPitcherProfile as fetchPitcherProfileRaw,
  fetchPitcherRecent as fetchPitcherRecentRaw,
  fetchHitterProfile as fetchHitterProfileRaw,
  fetchHitterRecent as fetchHitterRecentRaw,
} from "./mlb-stats-api";

// 프로필은 시즌 누적 성적을 hydrate 로 함께 받는다. 경기가 끝나야 바뀌므로 1시간.
const PROFILE_TTL = 3600;
// 최근 등판·타석은 경기 직후 보는 수요가 있어 더 짧게.
const RECENT_TTL = 1800;

export const fetchPitcherProfileCached = unstable_cache(
  fetchPitcherProfileRaw,
  ["mlb-pitcher-profile"],
  { revalidate: PROFILE_TTL, tags: ["mlb-player"] },
);

export const fetchPitcherRecentCached = unstable_cache(
  fetchPitcherRecentRaw,
  ["mlb-pitcher-recent"],
  { revalidate: RECENT_TTL, tags: ["mlb-player"] },
);

export const fetchHitterProfileCached = unstable_cache(
  fetchHitterProfileRaw,
  ["mlb-hitter-profile"],
  { revalidate: PROFILE_TTL, tags: ["mlb-player"] },
);

export const fetchHitterRecentCached = unstable_cache(
  fetchHitterRecentRaw,
  ["mlb-hitter-recent"],
  { revalidate: RECENT_TTL, tags: ["mlb-player"] },
);
