// Bing Webmaster Tools — 검색어 성과 (구글 GSC 의 빙 버전).
// 빙도 구글처럼 referrer 에 검색어를 안 남기므로(origin 만 전송, 2026-06 실측) 빙 검색어는
// Bing Webmaster Tools API(GetQueryStats) 가 유일한 소스다. GSC 와 달리 OAuth 없이 apikey 1개.
//
// 셋업: bing.com/webmasters 사이트 등록·인증 → 설정 > API 액세스 > API 키 생성 → BING_WEBMASTER_API_KEY.
//   siteUrl 은 등록된 형태와 정확히 일치해야 함 (BING_SITE_URL 로 override, 기본 https://www.scorebase.kr).

import "server-only";
import { unstable_cache } from "next/cache";
import {
  OPP_MIN_IMPRESSIONS,
  OPP_MIN_POSITION,
  isOpportunity,
  byPotentialDesc,
} from "@/lib/search-opportunity";

const API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const FETCH_TIMEOUT_MS = 8000;

export interface BingQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0~1
  position: number; // AvgImpressionPosition (평균 노출 순위)
}

export interface BingOverview {
  /** BING_WEBMASTER_API_KEY 존재 여부 */
  configured: boolean;
  /** 호출 실패 시 사람이 읽을 메시지 (configured=true 인데 데이터 없을 때) */
  error: string | null;
  siteUrl: string | null;
  /** 검색어 TOP — 클릭순 */
  queries: BingQueryRow[];
  /** 기회 검색어 — 노출은 많은데 순위가 낮아(4위 밖) 클릭을 못 받는 것, 노출순.
   *  콘텐츠/타이틀 보강으로 순위를 끌어올릴 타겟. */
  opportunities: BingQueryRow[];
  /** 전체 합계 (TOP 외 포함) */
  totals: { clicks: number; impressions: number } | null;
}

// GetQueryStats 응답 한 행 — 검색어 × 날짜 단위 (Date 는 ASP.NET /Date(ms)/ 형식, 합산만 하므로 무시).
interface RawQueryStat {
  Query: string;
  Clicks: number;
  Impressions: number;
  AvgImpressionPosition: number;
}

function bingSiteUrl(): string {
  return process.env.BING_SITE_URL?.trim() || "https://www.scorebase.kr/";
}

// 기회 검색어 기준 — 공용 판정 로직(search-opportunity)을 그대로 재노출 (기존 import 하위호환).
export const BING_OPP_MIN_IMPRESSIONS = OPP_MIN_IMPRESSIONS;
export const BING_OPP_MIN_POSITION = OPP_MIN_POSITION;

/** 경로 접두사별 노출 커버리지 — "노출이 붙은 페이지가 몇 개인가".
 *  ⚠️ GetPageStats 는 노출이 발생한 페이지만 돌려준다. 색인 수가 아니라 "검색에 뜬 페이지 수"다
 *  (2026-08-14: /transfers/ 는 sitemap 5,206개 중 17개만 노출). 색인 총량은 GetCrawlStats.InIndex. */
export async function fetchBingPathCoverage(
  prefixes: string[],
): Promise<Record<string, { pages: number; impressions: number; clicks: number }>> {
  const key = process.env.BING_WEBMASTER_API_KEY!;
  const site = bingSiteUrl();
  const url = `${API_BASE}/GetPageStats?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(key)}`;
  // 페이지 통계는 응답이 커서 UI용 8초로는 못 받는다(실측 8초 초과). 주간 job 전용이라 넉넉히.
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`Bing GetPageStats ${res.status}`);
  const data = (await res.json()) as { d?: Array<{ Query?: string; Url?: string; Clicks?: number; Impressions?: number }> };
  // 같은 URL 이 날짜별로 여러 행 — URL 기준으로 먼저 합산해야 페이지 수가 부풀지 않는다.
  const byUrl = new Map<string, { i: number; c: number }>();
  for (const r of data.d ?? []) {
    const u = r.Query ?? r.Url ?? "";
    if (!u) continue;
    const e = byUrl.get(u) ?? { i: 0, c: 0 };
    e.i += r.Impressions ?? 0;
    e.c += r.Clicks ?? 0;
    byUrl.set(u, e);
  }
  const out: Record<string, { pages: number; impressions: number; clicks: number }> = {};
  for (const p of prefixes) out[p] = { pages: 0, impressions: 0, clicks: 0 };
  for (const [u, e] of byUrl) {
    for (const p of prefixes) {
      if (!u.includes(p)) continue;
      out[p].pages++;
      out[p].impressions += e.i;
      out[p].clicks += e.c;
      break; // 접두사는 서로 겹치지 않게 넘긴다 — 한 URL 이 두 그룹에 세어지면 합계가 틀어진다
    }
  }
  return out;
}

/** 빙 전체 검색어(검색어별 집계, 노출순). 캐시 없음 — 호출부(UI 캐시·주간 job)에서 관리.
 *  GetQueryStats 행은 검색어×날짜라 검색어 기준 합산(position 은 노출 가중 평균). */
export async function fetchAllBingQueries(): Promise<BingQueryRow[]> {
  const key = process.env.BING_WEBMASTER_API_KEY!;
  const site = bingSiteUrl();
  const url = `${API_BASE}/GetQueryStats?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error("권한 없음 — API 키가 올바른지, 그 키 계정에 이 사이트가 등록·인증됐는지 확인");
    }
    throw new Error(`Bing API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { d?: RawQueryStat[] };
  const rows = data.d ?? [];
  const map = new Map<string, { clicks: number; impressions: number; posW: number }>();
  for (const r of rows) {
    const q = (r.Query ?? "").trim();
    if (!q) continue;
    const e = map.get(q) ?? { clicks: 0, impressions: 0, posW: 0 };
    e.clicks += r.Clicks ?? 0;
    e.impressions += r.Impressions ?? 0;
    e.posW += (r.AvgImpressionPosition ?? 0) * (r.Impressions ?? 0);
    map.set(q, e);
  }
  return Array.from(map.entries())
    .map(([query, e]) => ({
      query,
      clicks: e.clicks,
      impressions: e.impressions,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : 0,
      position: e.impressions > 0 ? e.posW / e.impressions : 0,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

const fetchBingOverviewCached = unstable_cache(
  async (): Promise<Omit<BingOverview, "configured" | "error">> => {
    const all = await fetchAllBingQueries();
    const queries = [...all]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 20);
    // 기회 검색어 — 노출 충분한데 순위가 낮아(4~30위) 클릭을 못 받는 것. 잠재 클릭순.
    const opportunities = all.filter(isOpportunity).sort(byPotentialDesc).slice(0, 20);
    return {
      siteUrl: bingSiteUrl(),
      queries,
      opportunities,
      totals: {
        clicks: all.reduce((s, r) => s + r.clicks, 0),
        impressions: all.reduce((s, r) => s + r.impressions, 0),
      },
    };
  },
  ["bing-overview-v2"],
  { revalidate: 3600 }, // 1시간 캐시 — quota 보호
);

/** /admin/stats 진입점 — 미설정/실패 모두 throw 없이 상태로 반환. */
export async function getBingOverview(): Promise<BingOverview> {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    return { configured: false, error: null, siteUrl: null, queries: [], opportunities: [], totals: null };
  }
  try {
    const data = await fetchBingOverviewCached();
    return { configured: true, error: null, ...data };
  } catch (e) {
    return {
      configured: true,
      error: e instanceof Error ? e.message : String(e),
      siteUrl: null,
      queries: [],
      opportunities: [],
      totals: null,
    };
  }
}
