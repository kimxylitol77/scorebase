// Google Search Console — 검색 성과 (노출·클릭·CTR·평균순위) 조회.
// /admin/stats "구글 검색 성과" 섹션용. 구글은 referrer 에 검색어를 안 남기므로
// (2011~ 비공개) 구글 검색어는 GSC API 가 유일한 소스다.
//
// 인증: 서비스 계정 (GSC_SERVICE_ACCOUNT_JSON 환경변수 = 키 JSON 원문 또는 base64).
// googleapis 패키지 대신 node:crypto RS256 JWT + REST 직접 호출 — 의존성 0.
// 서비스 계정 이메일을 GSC 속성에 "제한된 사용자"로 추가해야 데이터가 보인다.
//
// 주의: GSC 데이터는 2~3일 지연 확정 — endDate 를 오늘-3일로 잡는다 (PT 기준 집계).

import "server-only";
import crypto from "node:crypto";
import { unstable_cache } from "next/cache";

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
  /** GSC_SERVICE_ACCOUNT_JSON 환경변수 존재 여부 */
  configured: boolean;
  /** 호출 실패 시 사람이 읽을 한국어 메시지 (configured=true 인데 데이터 없을 때) */
  error: string | null;
  /** 실제 조회에 사용한 GSC 속성 (sc-domain:scorebase.kr 등) */
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

/** 서비스 계정이 접근 가능한 속성 중 scorebase.kr 매칭 — sc-domain 우선.
 *  GSC_SITE_URL 환경변수가 있으면 그 값을 그대로 사용 (속성 타입 수동 지정용). */
async function resolveSiteUrl(token: string): Promise<string> {
  const override = process.env.GSC_SITE_URL?.trim();
  if (override) return override;

  const data = await gscFetch<{
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>;
  }>(token, "/sites");
  const entries = (data.siteEntry ?? []).filter(
    (e) => e.permissionLevel !== "siteUnverifiedUser",
  );
  if (entries.length === 0) {
    throw new Error(
      "서비스 계정에 연결된 GSC 속성이 없습니다 — GSC 속성 [설정 > 사용자 및 권한 > 사용자 추가] 에 서비스 계정 이메일을 '제한된 사용자'로 추가하세요",
    );
  }
  const domainProp = entries.find((e) => e.siteUrl === "sc-domain:scorebase.kr");
  if (domainProp) return domainProp.siteUrl;
  const anyMatch = entries.find((e) => e.siteUrl.includes("scorebase.kr"));
  if (anyMatch) return anyMatch.siteUrl;
  // scorebase.kr 매칭이 없으면 접근 가능한 첫 속성 사용 (단일 속성 계정 가정)
  return entries[0].siteUrl;
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

/** dimensions 없는 호출 → 전체 합계 한 행 (데이터 없으면 null). */
function toTotals(rows: GscRow[]): GscTotals | null {
  const r = rows[0];
  if (!r) return null;
  return { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
}

/** 실제 GSC 조회 — 토큰 발급 + 속성 결정 + 5개 쿼리 병렬.
 *  unstable_cache 1시간 — GSC quota 보호 (시간당 5콜). 실패는 throw → 캐시 안 됨. */
const fetchGscOverviewCached = unstable_cache(
  async (): Promise<Omit<GscOverview, "configured" | "error">> => {
    const sa = parseServiceAccount(process.env.GSC_SERVICE_ACCOUNT_JSON!);
    const token = await getAccessToken(sa);
    const siteUrl = await resolveSiteUrl(token);

    // GSC 확정 데이터는 2~3일 지연 → 오늘(UTC)-3일을 endDate 로
    const end = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const start7 = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
    const start28 = new Date(end.getTime() - 27 * 24 * 60 * 60 * 1000);
    const endDate = dayStr(end);
    const range7 = { start: dayStr(start7), end: endDate };
    const range28 = { start: dayStr(start28), end: endDate };

    const [totals7Rows, totals28Rows, queries7, queries28, pages28] = await Promise.all([
      searchAnalytics(token, siteUrl, { startDate: range7.start, endDate }),
      searchAnalytics(token, siteUrl, { startDate: range28.start, endDate }),
      searchAnalytics(token, siteUrl, {
        startDate: range7.start,
        endDate,
        dimensions: ["query"],
        rowLimit: 20,
      }),
      searchAnalytics(token, siteUrl, {
        startDate: range28.start,
        endDate,
        dimensions: ["query"],
        rowLimit: 20,
      }),
      searchAnalytics(token, siteUrl, {
        startDate: range28.start,
        endDate,
        dimensions: ["page"],
        rowLimit: 10,
      }),
    ]);

    return {
      siteUrl,
      range7,
      range28,
      totals7: toTotals(totals7Rows),
      totals28: toTotals(totals28Rows),
      queries7,
      queries28,
      pages28,
    };
  },
  ["gsc-overview-v1"],
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
};

/** /admin/stats 진입점 — 미설정/실패 모두 throw 없이 상태로 반환 (페이지는 항상 렌더). */
export async function getGscOverview(): Promise<GscOverview> {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON) {
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
