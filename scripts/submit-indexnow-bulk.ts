// sitemap 의 특정 경로 URL 을 IndexNow 로 일괄 제출 — 빙·얀덱스 색인 가속.
// 일일 cron(api/cron/indexnow)은 "최근 26h 변경분"만 보내므로, 이미 쌓여 있는데 노출이
// 안 붙는 대량 페이지(예: 선수 5,207개 중 노출 발생 17개)를 한 번 밀어넣을 때 쓴다.
//   npx tsx scripts/submit-indexnow-bulk.ts /transfers/          # 미리보기(제출 안 함)
//   npx tsx scripts/submit-indexnow-bulk.ts /transfers/ --apply  # 실제 제출
// 키·엔드포인트는 src/lib/indexnow.ts 와 동일(그쪽은 server-only 라 스크립트에서 못 import).
const KEY = "6de5e8d98f8bf81744ff343915e01024";
const HOST = "www.scorebase.kr";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const BATCH = 5000; // IndexNow 1회 상한은 10,000 — 절반으로 잡아 여유를 둔다

const prefix = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!prefix || prefix.startsWith("--")) {
  console.error("경로 접두사가 필요합니다. 예: npx tsx scripts/submit-indexnow-bulk.ts /transfers/ --apply");
  process.exit(1);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const xml = await (await fetch(`https://${HOST}/sitemap.xml`, { signal: AbortSignal.timeout(60000) })).text();
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [...new Set(all.filter((u) => u.includes(prefix)))];
  console.log(`sitemap 총 ${all.length} · "${prefix}" 매칭 ${urls.length}`);
  if (urls.length === 0) return;
  console.log("샘플:", urls.slice(0, 3).join("  "));

  if (!APPLY) {
    console.log(`\nDRY-RUN — 실제 제출하려면 --apply (배치 ${Math.ceil(urls.length / BATCH)}회)`);
    return;
  }

  for (let i = 0; i < urls.length; i += BATCH) {
    const urlList = urls.slice(i, i + BATCH);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(30000),
    });
    // 200/202 = 접수. 4xx 는 키·호스트 불일치라 본문을 봐야 원인이 나온다.
    const body = res.ok ? "" : ` — ${(await res.text()).slice(0, 200)}`;
    console.log(`배치 ${i / BATCH + 1}: ${urlList.length}건 → HTTP ${res.status}${body}`);
    await sleep(2000);
  }
  console.log(`완료 — ${urls.length}건 제출`);
}

main();
