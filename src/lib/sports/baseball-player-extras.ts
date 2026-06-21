// KBO·NPB 선수 페이지 강화 — 연도별·스플릿 스크래핑 결과 캐싱 래퍼.
// raw 함수는 kbo-official.ts / npb-official.ts (cron 도 쓰는 파일이라 next/cache 미포함).
// 여기서만 unstable_cache 로 감싼다 (페이지 전용).

import { unstable_cache } from "next/cache";
import {
  fetchKboPitcherYearlyRaw,
  fetchKboHitterYearlyRaw,
  fetchKboSplitsRaw,
} from "./kbo-official";
import { fetchNpbPitcherYearlyRaw, fetchNpbHitterYearlyRaw } from "./npb-official";

export const getKboPitcherYearly = unstable_cache(
  fetchKboPitcherYearlyRaw,
  ["kbo-pitcher-yearly-v3"],
  { revalidate: 3600 },
);
export const getKboHitterYearly = unstable_cache(
  fetchKboHitterYearlyRaw,
  ["kbo-hitter-yearly-v3"],
  { revalidate: 3600 },
);
export const getKboSplits = unstable_cache(fetchKboSplitsRaw, ["kbo-splits-v3"], {
  revalidate: 3600,
});
export const getNpbPitcherYearly = unstable_cache(
  fetchNpbPitcherYearlyRaw,
  ["npb-pitcher-yearly-v3"],
  { revalidate: 3600 },
);
export const getNpbHitterYearly = unstable_cache(
  fetchNpbHitterYearlyRaw,
  ["npb-hitter-yearly-v3"],
  { revalidate: 3600 },
);
