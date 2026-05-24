// TheSports multi-language endpoint helper.
//   GET /v1/football/team/additional/list?type=N
//     type=1: category, 2: country/region, 3: competition, 4: team, 5: player, 6: injury
//   GET /v1/baseball/team/additional/list?type=N  (확인 필요)
//
// 응답 필드: name_ko, name_zh, name_ja, ... (언어별)
//
// 2026-05-18 trial 시점: 비활성화 상태. 영업에 활성화 요청 중.
// 활성화 후 page=1, 2, ... 루프 fetch → Neon DB 캐시 → match 응답 매핑 시 한글 적용.

import { thesportsGet } from "./client";

/** type=N 의미 */
export const TS_TRANSLATION_TYPE = {
  CATEGORY: 1,
  COUNTRY: 2,
  COMPETITION: 3,
  TEAM: 4,
  PLAYER: 5,
  INJURY: 6,
} as const;

export type TSTranslationType =
  (typeof TS_TRANSLATION_TYPE)[keyof typeof TS_TRANSLATION_TYPE];

/** Multi-language 응답 항목 */
export interface TSTranslationEntry {
  id: string;
  /** name_ko, name_zh, name_ja, ... */
  [nameLang: `name_${string}`]: string | undefined;
  updated_at: number;
}

export interface TSTranslationResponse {
  code: number;
  query: {
    total: number;
    type: "page" | "time" | "uuid";
    page?: number;
    time?: number;
  };
  results: TSTranslationEntry[];
}

/** Football multi-language list */
export function fetchFootballTranslations(
  type: TSTranslationType,
  opts: { page?: number; time?: number; uuid?: string } = {},
): Promise<TSTranslationResponse> {
  const params: Record<string, number | string> = { type };
  if (opts.page != null) params.page = opts.page;
  if (opts.time != null) params.time = opts.time;
  if (opts.uuid) params.uuid = opts.uuid;
  return thesportsGet<TSTranslationResponse>(
    "/v1/football/team/additional/list",
    params,
  );
}

/** Baseball multi-language list (endpoint 존재 여부 영업 확인 필요) */
export function fetchBaseballTranslations(
  type: TSTranslationType,
  opts: { page?: number; time?: number; uuid?: string } = {},
): Promise<TSTranslationResponse> {
  const params: Record<string, number | string> = { type };
  if (opts.page != null) params.page = opts.page;
  if (opts.time != null) params.time = opts.time;
  if (opts.uuid) params.uuid = opts.uuid;
  return thesportsGet<TSTranslationResponse>(
    "/v1/baseball/team/additional/list",
    params,
  );
}

/**
 * 한국어 이름 추출 helper.
 * @returns name_ko 값 또는 undefined (한국어 번역 없음)
 */
export function getKoreanName(entry: TSTranslationEntry): string | undefined {
  return entry.name_ko;
}

/**
 * 전체 페이지 루프 + Map<id, korean_name> 빌드.
 * Production 에서는 1회 fetch 후 Neon DB 캐시 권장.
 */
export async function buildKoreanNameMap(opts: {
  sport: "football" | "baseball";
  type: TSTranslationType;
  pageLimit?: number;
}): Promise<Map<string, string>> {
  const fetcher =
    opts.sport === "football"
      ? fetchFootballTranslations
      : fetchBaseballTranslations;
  const limit = opts.pageLimit ?? 50;
  const map = new Map<string, string>();
  for (let page = 1; page <= limit; page++) {
    const resp = await fetcher(opts.type, { page });
    if (resp.results.length === 0) break;
    for (const e of resp.results) {
      const ko = getKoreanName(e);
      if (ko) map.set(e.id, ko);
    }
    // pagesize default 1000 미만이면 마지막 페이지
    if (resp.results.length < 1000) break;
  }
  return map;
}
