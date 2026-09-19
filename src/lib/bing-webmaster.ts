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
  /** 검색어 TOP — 노출순. 클릭순 목록이 못 보여주는 "수요는 큰데 클릭이 안 붙는" 검색어를 드러낸다. */
  topImpressions: BingQueryRow[];
  /** 기회 검색어 — 노출은 많은데 순위가 낮아(4위 밖) 클릭을 못 받는 것, 노출순.
   *  콘텐츠/타이틀 보강으로 순위를 끌어올릴 타겟. */
  opportunities: BingQueryRow[];
  /** 최근 4주 합계 (TOP 외 포함) */
  totals: { clicks: number; impressions: number } | null;
  /** 직전 4주 합계 — 증감 비교용. 데이터가 8주 미만이면 null. */
  prevTotals: { clicks: number; impressions: number } | null;
  /** 최근 4주 창 — 빙 주간 버킷 기준(start = 첫 버킷 주의 시작일, end = 마지막 버킷 날짜). weeks = 실제 담긴 주 수. */
  window: { start: string; end: string; weeks: number } | null;
}

// GetQueryStats 응답 한 행 — 검색어 × 주간 버킷. Date 는 ASP.NET /Date(ms)/ 형식이고 그 주의 마지막 날
// (2026-09-15 실측: 일별 데이터가 9/13 까지인데 9/11 버킷 존재 → 9/5~9/11). 검색어 하나가 주마다 한 행.
interface RawQueryStat {
  Query: string;
  Date?: string;
  Clicks: number;
  Impressions: number;
  AvgImpressionPosition: number;
}

/** ASP.NET "/Date(1789694062979-0700)/" → "YYYY-MM-DD" (UTC). 못 읽으면 null. */
function parseBingDate(s: string | undefined): string | null {
  const m = /\/Date\((-?\d+)/.exec(s ?? "");
  return m ? new Date(Number(m[1])).toISOString().slice(0, 10) : null;
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
  return aggregateBingQueries(await fetchBingQueryRows());
}

/** GetQueryStats 원시 행(검색어 × 주간 버킷). 전 기간(연동 후 ~12주)이 한 번에 온다. */
async function fetchBingQueryRows(): Promise<RawQueryStat[]> {
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
  return data.d ?? [];
}

/** 검색어 기준 합산(position 은 노출 가중 평균), 노출 내림차순. */
function aggregateBingQueries(rows: RawQueryStat[]): BingQueryRow[] {
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

/** 최근 N 주 버킷 / 그 직전 N 주 버킷으로 가른다. 버킷 날짜 = 그 주의 마지막 날. */
export function splitBingWeeks(rows: RawQueryStat[], weeks = 4) {
  const dated = rows.map((r) => ({ r, day: parseBingDate(r.Date) })).filter((x): x is { r: RawQueryStat; day: string } => !!x.day);
  const buckets = [...new Set(dated.map((x) => x.day))].sort().reverse();
  const recentDays = new Set(buckets.slice(0, weeks));
  const prevDays = new Set(buckets.slice(weeks, weeks * 2));
  const recent = dated.filter((x) => recentDays.has(x.day)).map((x) => x.r);
  const prev = dated.filter((x) => prevDays.has(x.day)).map((x) => x.r);
  const last = buckets[0];
  const first = buckets[Math.min(weeks, buckets.length) - 1];
  const start = first ? new Date(new Date(first + "T00:00:00Z").getTime() - 6 * 86400000).toISOString().slice(0, 10) : null;
  return {
    recent,
    prev: prevDays.size === weeks ? prev : null,
    window: last && start ? { start, end: last, weeks: recentDays.size } : null,
  };
}

const fetchBingOverviewCached = unstable_cache(
  async (): Promise<Omit<BingOverview, "configured" | "error">> => {
    // 전 기간 누적으로 보여주던 것을 최근 4주로 바꿨다(2026-09-19). 빙은 주 단위 버킷을 2~6일 늦게 주므로
    // 12주 누적이면 새 주가 얹혀도 순위·숫자가 안 움직여 "매일 똑같은 화면"이 됐다. 직전 4주와 비교해 증감을 보인다.
    const split = splitBingWeeks(await fetchBingQueryRows(), 4);
    const all = aggregateBingQueries(split.recent);
    const prevAll = split.prev ? aggregateBingQueries(split.prev) : null;
    const queries = [...all]
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 30);
    // 노출순 — fetchAllBingQueries 가 이미 노출 내림차순이라 자르기만 하면 된다.
    const topImpressions = all.slice(0, 30);
    // 기회 검색어 — 노출 충분한데 순위가 낮아(4~30위) 클릭을 못 받는 것. 잠재 클릭순.
    const opportunities = all.filter(isOpportunity).sort(byPotentialDesc).slice(0, 20);
    return {
      siteUrl: bingSiteUrl(),
      queries,
      topImpressions,
      opportunities,
      totals: {
        clicks: all.reduce((s, r) => s + r.clicks, 0),
        impressions: all.reduce((s, r) => s + r.impressions, 0),
      },
      prevTotals: prevAll
        ? { clicks: prevAll.reduce((s, r) => s + r.clicks, 0), impressions: prevAll.reduce((s, r) => s + r.impressions, 0) }
        : null,
      window: split.window,
    };
  },
  ["bing-overview-v4"],
  { revalidate: 3600 }, // 1시간 캐시 — quota 보호
);

/** /admin/stats 진입점 — 미설정/실패 모두 throw 없이 상태로 반환. */
export async function getBingOverview(): Promise<BingOverview> {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    return { configured: false, error: null, siteUrl: null, queries: [], topImpressions: [], opportunities: [], totals: null, prevTotals: null, window: null };
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
      topImpressions: [],
      opportunities: [],
      totals: null,
      prevTotals: null,
      window: null,
    };
  }
}
