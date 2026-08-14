// api-football 호출 계측 — 태그별로 호출 수와 잔량을 (tag, 시간) 버킷에 누적한다.
//
// 왜 필요한가. 2026-08-09 하루 한도 75,000 을 소진했는데 호출 지점이 30여 파일에 흩어져
// 있어 어디가 범인인지 코드만으로는 못 좁혔다(추정으로는 1만도 설명이 안 됐다).
// af 는 응답 헤더로 남은 호출 수를 알려주므로, 태그만 붙이면 정확히 귀속시킬 수 있다.
//
// 설계 원칙.
//  - 계측이 본 기능을 절대 방해하지 않는다. 기록 실패는 조용히 삼킨다.
//  - 호출마다 row 를 쌓지 않는다. (tag, 정시) 버킷에 누적 upsert 라 하루 최대 24행/태그.
//  - edge runtime 라우트에서는 prisma 를 못 쓴다 — 그쪽은 console 로만 남긴다.

import type { AxiosInstance } from "axios";
import { prisma } from "@/lib/db";

/** af 응답 헤더에서 남은 호출 수를 읽는다. 헤더 이름은 af 문서/실측 기준. */
export function afRemainingFromHeaders(h: Headers): number | null {
  const raw =
    h.get("x-ratelimit-requests-remaining") ?? h.get("X-RateLimit-requests-Remaining");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function hourBucket(): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/**
 * 호출 1건 기록. await 하지 않아도 되도록 만들었지만, 서버리스에서 응답 후 작업이 잘리는 걸
 * 피하려면 호출부에서 await 하는 편이 안전하다(비용은 upsert 1회).
 */
export async function afTrack(tag: string, remaining: number | null): Promise<void> {
  try {
    const hour = hourBucket();
    await prisma.afUsageStat.upsert({
      where: { tag_hour: { tag, hour } },
      create: { tag, hour, calls: 1, minRemaining: remaining },
      update: {
        calls: { increment: 1 },
        // 잔량은 줄어들기만 하므로 최솟값만 갱신한다(그 버킷의 끝 상태).
        ...(remaining != null ? { minRemaining: remaining } : {}),
      },
    });
  } catch {
    // 계측 실패가 수집을 막아선 안 된다
  }
}

/**
 * af 호출 래퍼 — fetch 를 그대로 감싸고 헤더에서 잔량을 읽어 기록한다.
 * 기존 호출부의 옵션을 그대로 통과시키므로 `fetch(...)` 를 `afFetch(tag, ...)` 로만 바꾸면 된다.
 */
export async function afFetch(
  tag: string,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  await afTrack(tag, afRemainingFromHeaders(res.headers));
  if (!res.ok) return res;

  // 200 인데 errors 객체인 경우 — 호출부가 "데이터 없음"으로 오해하고, next.revalidate 가
  // 붙어 있으면 그 오류 응답이 캐시에까지 굳는다. 한도면 캐시를 건너뛰고 다시 받아온다.
  const err = await peekApiSportsError(res);
  if (!err) return res;
  if (err.kind === "rateLimit") {
    for (const wait of DEFAULT_RETRY_WAITS_MS) {
      await new Promise((r) => setTimeout(r, wait));
      const retry = await fetch(input, { ...init, cache: "no-store", next: undefined });
      await afTrack(tag, afRemainingFromHeaders(retry.headers));
      if (!retry.ok) return retry;
      const again = await peekApiSportsError(retry);
      if (!again) return retry;
    }
  }
  throw new ApiSportsError(tag, err.kind, err.message);
}

/** 응답 body 를 소비하지 않고(clone) 오류 표시만 훔쳐본다. JSON 이 아니면 무시. */
async function peekApiSportsError(res: Response): Promise<{ kind: string; message: string } | null> {
  try {
    return apiSportsError(await res.clone().json());
  } catch {
    return null;
  }
}

/** axios 등 fetch 가 아닌 클라이언트용 — 응답 헤더 객체를 직접 넘긴다. */
export async function afTrackHeaders(
  tag: string,
  headers: Record<string, unknown> | undefined,
): Promise<void> {
  const raw = headers?.["x-ratelimit-requests-remaining"];
  const n = raw == null ? null : Number(raw);
  await afTrack(tag, Number.isFinite(n as number) ? (n as number) : null);
}

/**
 * api-sports 응답의 오류 표시를 읽는다.
 *
 * 왜 필요한가. api-sports(축구·야구 공통)는 분당 한도 초과·일일 소진·키 오류를
 * HTTP 200 + `errors` **객체**로 답한다(정상 응답의 errors 는 빈 배열/빈 객체).
 * 이걸 감지하지 않으면 호출부가 "데이터 없음"으로 오해해, 시즌이 통째로 빠진
 * 결과를 정상인 양 캐시한다(2026-08-14 선수 경력표 누락 사고).
 */
export function apiSportsError(data: unknown): { kind: string; message: string } | null {
  const e = (data as { errors?: unknown } | undefined)?.errors;
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const rec = e as Record<string, unknown>;
  const kind = Object.keys(rec)[0];
  return kind ? { kind, message: String(rec[kind]) } : null;
}

/** api-sports 가 200 으로 돌려준 오류. 빈 응답으로 위장되지 않도록 예외로 올린다. */
export class ApiSportsError extends Error {
  constructor(readonly tag: string, readonly kind: string, message: string) {
    super(`[${tag}] ${kind}: ${message}`);
    this.name = "ApiSportsError";
  }
}

/** 분당 한도만 재시도 가치가 있다(일일 소진·키 오류는 기다려도 안 풀린다). */
const DEFAULT_RETRY_WAITS_MS = [1500, 5000];

/**
 * axios 인스턴스에 계측 + api-sports 오류 방어를 붙인다.
 * 호출 경로가 여러 개인 파일(api-football-pro 등)은 URL 로 세부 태그를 나눈다.
 *
 * 분당 한도 응답은 대기 후 자동 재시도하고, 끝내 안 풀리면 ApiSportsError 로 던진다 —
 * 조용한 빈 응답이 상위 캐시에 굳는 것을 막는 유일한 지점이다.
 */
export function attachAfTracking<T extends AxiosInstance>(
  client: T,
  baseTag: string,
  opts?: { retryWaitsMs?: number[] },
): T {
  const waits = opts?.retryWaitsMs ?? DEFAULT_RETRY_WAITS_MS;
  client.interceptors.response.use(async (res) => {
    const path = (res.config?.url ?? "").split("?")[0].replace(/^\//, "");
    const tag = path ? `${baseTag}:${path}` : baseTag;
    void afTrackHeaders(tag, res.headers as unknown as Record<string, unknown> | undefined);

    const err = apiSportsError(res.data);
    if (!err) return res;
    if (err.kind === "rateLimit") {
      const cfg = res.config as typeof res.config & { __afRetry?: number };
      const n = cfg.__afRetry ?? 0;
      if (n < waits.length) {
        cfg.__afRetry = n + 1;
        await new Promise((r) => setTimeout(r, waits[n]));
        return client.request(cfg);
      }
    }
    throw new ApiSportsError(tag, err.kind, err.message);
  });
  return client;
}
