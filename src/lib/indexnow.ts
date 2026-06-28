// IndexNow — 신규/갱신 URL 을 빙·얀덱스에 즉시 색인 요청. ChatGPT 검색·Copilot 이 빙 인덱스를 공유해
// 빙 색인 가속이 곧 AI 검색 노출 가속이다(GEO). 키는 공개 설계 — public/{KEY}.txt 에 동일 값 호스팅.
import "server-only";

const KEY = "6de5e8d98f8bf81744ff343915e01024";
const HOST = "www.scorebase.kr";
const ENDPOINT = "https://api.indexnow.org/indexnow";

/** URL 목록을 IndexNow 에 제출. 실패해도 throw 안 함(색인 신호는 best-effort). */
export async function submitIndexNow(
  urls: string[],
): Promise<{ ok: boolean; status: number; count: number }> {
  const urlList = [...new Set(urls)].filter(Boolean).slice(0, 10000);
  if (urlList.length === 0) return { ok: true, status: 0, count: 0 };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    return { ok: res.ok, status: res.status, count: urlList.length };
  } catch {
    return { ok: false, status: 0, count: urlList.length };
  }
}
