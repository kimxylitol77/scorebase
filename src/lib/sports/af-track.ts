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
  return res;
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
 * axios 인스턴스에 계측을 붙인다 — 그 클라이언트의 모든 호출이 한 번에 잡힌다.
 * 호출 경로가 여러 개인 파일(api-football-pro 등)은 URL 로 세부 태그를 나눈다.
 */
export function attachAfTracking<T extends AxiosInstance>(client: T, baseTag: string): T {
  client.interceptors.response.use((res) => {
    const path = (res.config?.url ?? "").split("?")[0].replace(/^\//, "");
    void afTrackHeaders(
      path ? `${baseTag}:${path}` : baseTag,
      res.headers as unknown as Record<string, unknown> | undefined,
    );
    return res;
  });
  return client;
}
