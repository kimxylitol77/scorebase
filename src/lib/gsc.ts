// Google Search Console — 검색 성과 (노출·클릭·CTR·평균순위) 조회.
// /admin/stats "구글 검색 성과" 섹션용. 구글은 referrer 에 검색어를 안 남기므로
// (2011~ 비공개) 구글 검색어는 GSC API 가 유일한 소스다.
//
// 인증 2종 (OAuth 우선) — googleapis 패키지 대신 REST 직접 호출, 의존성 0:
// 1) GSC_OAUTH_CLIENT_ID / SECRET / REFRESH_TOKEN — 속성 소유자 본인 계정 OAuth.
//    GSC 새 UI 가 서비스 계정 사용자 추가를 "이메일 찾을 수 없음"으로 거부하는
//    경우가 있어(2026-06 실측) 이쪽이 기본 경로. 1회 동의는 scripts/_gsc-oauth-tmp.ts.
// 2) GSC_SERVICE_ACCOUNT_JSON — 서비스 계정 (키 JSON 원문 또는 base64, RS256 JWT).
//    GSC 속성에 서비스 계정 이메일이 사용자로 추가돼 있어야 데이터가 보인다.
//
// 주의: GSC 데이터는 2~3일 지연 확정 — endDate 를 오늘-3일로 잡는다 (PT 기준 집계).

import "server-only";
import crypto from "node:crypto";
import { unstable_cache } from "next/cache";
import { isOpportunity, byPotentialDesc } from "@/lib/search-opportunity";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const FETCH_TIMEOUT_MS = 8000;

/** searchanalytics.query 응답 한 행. keys 는 요청한 dimensions 순서. */
export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number; // 0~1
  position: number;
}

export interface GscTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscOverview {
  /** 인증 환경변수(OAuth 3종 또는 서비스 계정 JSON) 존재 여부 */
  configured: boolean;
  /** 호출 실패 시 사람이 읽을 한국어 메시지 (configured=true 인데 데이터 없을 때) */
  error: string | null;
  /** 실제 조회에 사용한 GSC 속성 — 복수 합산 시 " + " 로 연결 (www/non-www 분리 색인 대응) */
  siteUrl: string | null;
  /** 조회 날짜 범위 — UI 표기용 (GSC 는 PT 기준 일자) */
  range7: { start: string; end: string };
  range28: { start: string; end: string };
  totals7: GscTotals | null;
  totals28: GscTotals | null;
  /** 검색어 TOP — 클릭순 (GSC 기본 정렬) */
  queries7: GscRow[];
  queries28: GscRow[];
  /** 클릭 많은 페이지 TOP — 28일 */
  pages28: GscRow[];
  /** 기회 검색어 — 노출 많은데 순위 낮아(4~30위) 클릭 못 받는 것, 잠재 클릭순. 28일. */
  opportunities: GscRow[];
  /** 노출순 검색어 TOP — "구글에 무슨 검색어로 뜨는가". 28일.
   *  색인 초기엔 클릭이 대부분 0이라 클릭순(queries28)만 보면 뭐가 뜨는지 알 수 없고,
   *  기회 검색어(노출 10회+ 조건)도 늘 비어 화면에 아무것도 안 남는다. */
  queriesByImpressions28: GscRow[];
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** 키 JSON 파싱 — 원문 JSON / base64 인코딩 / private_key 이중 이스케이프 모두 수용. */
function parseServiceAccount(raw: string): ServiceAccount {
  let text = raw.trim();
  if (!text.startsWith("{")) {
    // Vercel 등에 base64 로 넣은 경우
    text = Buffer.from(text, "base64").toString("utf-8");
  }
  const json = JSON.parse(text) as Partial<ServiceAccount>;
  if (!json.client_email || !json.private_key) {
    throw new Error("키 JSON 에 client_email / private_key 가 없습니다");
  }
  return {
    client_email: json.client_email,
    // .env 한 줄 등록 과정에서 \n 이 \\n 으로 이중 이스케이프된 경우 복원
    private_key: json.private_key.replace(/\\n/g, "\n"),
  };
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function hasOauthEnv(): boolean {
  return Boolean(
    process.env.GSC_OAUTH_CLIENT_ID &&
      process.env.GSC_OAUTH_CLIENT_SECRET &&
      process.env.GSC_OAUTH_REFRESH_TOKEN,
  );
}

/** OAuth refresh token → access token. 본인 계정 권한 그대로 (속성 소유자). */
async function getAccessTokenViaRefresh(): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GSC_OAUTH_CLIENT_ID!,
      client_secret: process.env.GSC_OAUTH_CLIENT_SECRET!,
      refresh_token: process.env.GSC_OAUTH_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `OAuth 토큰 갱신 실패 (${res.status}) — refresh token 만료·취소 또는 동의 화면 게시 상태(테스트=7일 만료) 확인: ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("토큰 응답에 access_token 없음");
  return data.access_token;
}

/** 서비스 계정 JWT → OAuth2 access token (유효 1시간 — 캐시 주기와 동일해 매번 새로 발급). */
async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key);
  const jwt = `${unsigned}.${b64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`토큰 발급 실패 (${res.status}) — 키 JSON 확인: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("토큰 응답에 access_token 없음");
  return data.access_token;
}

async function gscFetch<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403) {
      throw new Error(
        "권한 없음 (403) — GSC 속성 [설정 > 사용자 및 권한] 에 서비스 계정 이메일이 추가됐는지 확인",
      );
    }
    throw new Error(`GSC API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** 접근 가능한 속성 중 scorebase.kr 매칭 — sc-domain 이 있으면 그것 하나,
 *  없으면 URL prefix 속성 전부(www/non-www 가 따로 있으면 둘 다 → 합산).
 *  GSC_SITE_URL 환경변수로 수동 지정 가능 (쉼표로 복수). */
async function resolveSiteUrls(token: string): Promise<string[]> {
  const override = process.env.GSC_SITE_URL?.trim();
  if (override) return override.split(",").map((s) => s.trim()).filter(Boolean);

  const data = await gscFetch<{
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  }>(token, "/sites");
  const entries = (data.siteEntry ?? []).filter(
    (e) => e.permissionLevel !== "siteUnverifiedUser",
  );
  if (entries.length === 0) {
    throw new Error(
      "접근 가능한 GSC 속성이 없습니다 — OAuth 면 소유자 계정으로 동의했는지, 서비스 계정이면 GSC 속성에 사용자로 추가됐는지 확인",
    );
  }
  const domainProp = entries.find((e) => e.siteUrl === "sc-domain:scorebase.kr");
  if (domainProp) return [domainProp.siteUrl];
  const matches = entries
    .filter((e) => e.siteUrl.includes("scorebase.kr"))
    .map((e) => e.siteUrl)
    .sort(); // non-www 가 사전순으로 앞 — 표기·캐시 안정용
  if (matches.length > 0) return matches;
  // scorebase.kr 매칭이 없으면 접근 가능한 첫 속성 사용 (단일 속성 계정 가정)
  return [entries[0].siteUrl];
}

interface QueryBody {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
}

async function searchAnalytics(
  token: string,
  siteUrl: string,
  body: QueryBody,
): Promise<GscRow[]> {
  const data = await gscFetch<{ rows?: GscRow[] }>(
    token,
    `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { method: "POST", body },
  );
  return data.rows ?? [];
}

function dayStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 속성별 합계 행(dimensions 없는 호출의 rows[0])들을 하나로 합산.
 *  position 은 노출수 가중 평균, ctr 은 합산 후 재계산. */
function mergeTotals(perSite: GscRow[][]): GscTotals | null {
  const rows = perSite.map((r) => r[0]).filter(Boolean);
  if (rows.length === 0) return null;
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const posW = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? posW / impressions : 0,
  };
}

/** 속성별 dimension 행들을 키 기준으로 합산해 클릭순 TOP limit. */
function mergeRows(perSite: GscRow[][], limit: number): GscRow[] {
  const map = new Map<
    string,
    { keys: string[]; clicks: number; impressions: number; posW: number }
  >();
  for (const rows of perSite) {
    for (const r of rows) {
      const k = (r.keys ?? []).join(" ");
      const e = map.get(k) ?? { keys: r.keys ?? [], clicks: 0, impressions: 0, posW: 0 };
      e.clicks += r.clicks;
      e.impressions += r.impressions;
      e.posW += r.position * r.impressions;
      map.set(k, e);
    }
  }
  return Array.from(map.values())
    .map((e) => ({
      keys: e.keys,
      clicks: e.clicks,
      impressions: e.impressions,
      ctr: e.impressions > 0 ? e.clicks / e.impressions : 0,
      position: e.impressions > 0 ? e.posW / e.impressions : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, limit);
}

/** 실제 GSC 조회 — 토큰 발급 + 속성 결정 + 5개 쿼리 병렬.
 *  unstable_cache 1시간 — GSC quota 보호 (시간당 5콜). 실패는 throw → 캐시 안 됨. */
const fetchGscOverviewCached = unstable_cache(
  async (): Promise<Omit<GscOverview, "configured" | "error">> => {
    const token = hasOauthEnv()
      ? await getAccessTokenViaRefresh()
      : await getAccessToken(parseServiceAccount(process.env.GSC_SERVICE_ACCOUNT_JSON!));
    const siteUrls = await resolveSiteUrls(token);

    // GSC 확정 데이터는 2~3일 지연 → 오늘(UTC)-3일을 endDate 로
    const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const start7 = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const start28 = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
    const endDate = dayStr(end);
    const range7 = { start: dayStr(start7), end: endDate };
    const range28 = { start: dayStr(start28), end: endDate };

    // 같은 쿼리를 속성마다 실행해 합산 (www/non-www 분리 색인이라 한쪽만 보면 절반).
    // 속성별 TOP 을 넉넉히(50/25) 받아 합산 후 20/10 으로 자르면 경계 누락이 사실상 없다.
    const run = (body: QueryBody) =>
      Promise.all(siteUrls.map((s) => searchAnalytics(token, s, body)));
    const [totals7, totals28, queries7, queries28, pages28] = await Promise.all([
      run({ startDate: range7.start, endDate }),
      run({ startDate: range28.start, endDate }),
      run({ startDate: range7.start, endDate, dimensions: ["query"], rowLimit: 50 }),
      // 28일 검색어는 넉넉히(1000) 받아 클릭순 TOP20 과 기회 검색어(노출 많고 클릭 적은
      // 것 — 클릭순 상위엔 안 잡힘)를 같은 데이터로 계산.
      run({ startDate: range28.start, endDate, dimensions: ["query"], rowLimit: 1000 }),
      run({ startDate: range28.start, endDate, dimensions: ["page"], rowLimit: 25 }),
    ]);

    // 페이지는 호스트만 다른 같은 path 를 한 행으로 — 키를 path 로 정규화 후 합산
    const pagesByPath = pages28.map((rows) =>
      rows.map((r) => ({ ...r, keys: [gscPageToPath(r.keys?.[0] ?? "")] })),
    );

    // 28일 검색어를 한 번 합산해 클릭순 TOP20 과 기회 검색어(잠재 클릭순) 둘 다 뽑는다.
    const queries28Merged = mergeRows(queries28, 1000);

    return {
      siteUrl: siteUrls.join(" + "),
      range7,
      range28,
      totals7: mergeTotals(totals7),
      totals28: mergeTotals(totals28),
      queries7: mergeRows(queries7, 20),
      queries28: queries28Merged.slice(0, 20),
      pages28: mergeRows(pagesByPath, 10),
      opportunities: queries28Merged
        .filter(isOpportunity)
        .sort(byPotentialDesc)
        .slice(0, 20),
      // 노출순 — 기회 기준(노출 10회+) 미달까지 포함한 "구글에 뜬 검색어" 전부
      queriesByImpressions28: [...queries28Merged]
        .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
        .slice(0, 20),
    };
  },
  ["gsc-overview-v3"], // queriesByImpressions28 추가 — 옛 캐시(v2)에 없는 필드라 키 bump
  { revalidate: 3600 },
);

const EMPTY: Omit<GscOverview, "configured" | "error"> = {
  siteUrl: null,
  range7: { start: "", end: "" },
  range28: { start: "", end: "" },
  totals7: null,
  totals28: null,
  queries7: [],
  queries28: [],
  pages28: [],
  opportunities: [],
  queriesByImpressions28: [],
};

/** /admin/stats 진입점 — 미설정/실패 모두 throw 없이 상태로 반환 (페이지는 항상 렌더). */
export async function getGscOverview(): Promise<GscOverview> {
  if (!hasOauthEnv() && !process.env.GSC_SERVICE_ACCOUNT_JSON) {
    return { configured: false, error: null, ...EMPTY };
  }
  try {
    const data = await fetchGscOverviewCached();
    return { configured: true, error: null, ...data };
  } catch (e) {
    return {
      configured: true,
      error: e instanceof Error ? e.message : String(e),
      ...EMPTY,
    };
  }
}

/** GSC page URL → 표시용 path (origin 제거 — 도메인 속성은 풀 URL 로 내려옴). */
export function gscPageToPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
