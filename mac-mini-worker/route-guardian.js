// route-guardian.js — Mac mini 모니터링 봇 G.
// 사이트 전체를 돌며 404 / soft 404 / 5xx 페이지를 찾아냅니다.
//
// 흐름 (24h 주기):
//   1) heartbeat POST
//   2) sitemap.xml 가져와서 등재된 URL 전수 검사
//   3) 홈에서 시작해 내부 링크 BFS (sitemap 누락 라우트 + dead link 발견)
//   4) 응답 분류: 404 / soft 404 ("This page could not be found") / 5xx / OK
//   5) 결과 텔레그램 전체 보고 (404 0건이어도 보고)
//
// 실행 (Mac mini):
//   cd ~/dev/scorebase/mac-mini-worker
//   node route-guardian.js

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-route-guardian";
const POLL_MS = 24 * 60 * 60 * 1000; // 24시간
const REQ_TIMEOUT_MS = 20_000;
const CONCURRENCY = 5;           // 동시 fetch 수 (Vercel function 부하 고려)
const BFS_MAX_URLS = 500;        // BFS 최대 탐색 URL
const BFS_MAX_DEPTH = 3;
const SOFT_404_MARKER = "This page could not be found"; // Next.js 기본 not-found 문구

if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

function tsKst() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SITE}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.warn(`⚠️ heartbeat fail: ${e.message}`);
  }
}

async function notify(payload) {
  try {
    await axios.post(
      `${SITE}/api/internal/notify`,
      { source: WORKER_NAME, ...payload },
      { headers, timeout: 15_000 },
    );
  } catch (e) {
    console.error(`✗ notify fail: ${e.message}`);
  }
}

// ── 1. sitemap.xml 의 URL 수집 ──
async function fetchSitemapUrls() {
  const url = `${SITE}/sitemap.xml`;
  const res = await axios.get(url, {
    timeout: 30_000,
    validateStatus: () => true,
    headers: { "User-Agent": "scorebase-route-guardian/1.0" },
  });
  if (res.status !== 200) {
    console.warn(`⚠️ sitemap fetch ${res.status} — 빈 목록 반환`);
    return [];
  }
  const xml = String(res.data ?? "");
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return [...new Set(matches.map((m) => m[1].trim()))];
}

// ── 2. HTML 에서 internal anchor href 추출 ──
function extractInternalLinks(html, fromUrl) {
  const base = new URL(fromUrl);
  const found = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    const raw = m[1];
    if (!raw || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;
    try {
      const abs = new URL(raw, base);
      if (abs.host !== base.host) continue;       // 외부 호스트 제외
      if (abs.pathname.startsWith("/api/")) continue; // API 제외
      if (abs.pathname.startsWith("/admin")) continue; // admin 제외 (인증 필요)
      // hash/query 제거 — 같은 페이지 중복 방지
      abs.hash = "";
      abs.search = "";
      found.add(abs.toString());
    } catch {
      // invalid URL
    }
  }
  return [...found];
}

// ── 3. 단일 URL 검사 ──
async function checkUrl(url) {
  const t0 = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: REQ_TIMEOUT_MS,
      validateStatus: () => true,
      maxRedirects: 3,
      headers: { "User-Agent": "scorebase-route-guardian/1.0" },
    });
    const dur = Date.now() - t0;
    const status = res.status;
    const body = typeof res.data === "string" ? res.data : "";
    const isSoft404 = status === 200 && body.includes(SOFT_404_MARKER);
    let kind = "ok";
    if (status === 404) kind = "404";
    else if (status >= 500) kind = "5xx";
    else if (status >= 400) kind = "4xx";
    else if (isSoft404) kind = "soft404";
    return { url, status, dur, kind, body };
  } catch (e) {
    return { url, status: 0, dur: Date.now() - t0, kind: "error", error: e.message };
  }
}

// ── 4. 동시성 제한 fetch 풀 ──
async function fetchPool(urls, onResult) {
  let idx = 0;
  const results = [];
  async function worker() {
    while (idx < urls.length) {
      const my = idx++;
      const r = await checkUrl(urls[my]);
      results.push(r);
      if (onResult) onResult(r, my + 1, urls.length);
    }
  }
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── 5. BFS 크롤 ──
async function bfsCrawl(startUrl) {
  const seen = new Set([startUrl]);
  const results = [];
  let frontier = [{ url: startUrl, depth: 0 }];

  while (frontier.length > 0 && seen.size < BFS_MAX_URLS) {
    const batch = frontier.slice(0, CONCURRENCY * 4); // 한 번에 ~20개 처리
    frontier = frontier.slice(batch.length);

    const checked = await fetchPool(
      batch.map((b) => b.url),
      null,
    );

    for (let i = 0; i < checked.length; i++) {
      const r = checked[i];
      const depth = batch[i].depth;
      results.push(r);

      // 다음 depth로 확장 — 정상 응답이고 깊이 제한 안 넘었을 때만
      if (r.kind === "ok" && depth < BFS_MAX_DEPTH && r.body) {
        const links = extractInternalLinks(r.body, r.url);
        for (const l of links) {
          if (seen.has(l) || seen.size >= BFS_MAX_URLS) continue;
          seen.add(l);
          frontier.push({ url: l, depth: depth + 1 });
        }
      }
    }
  }
  return results;
}

// ── 6. 메인 검사 + 보고 ──
async function runOnce() {
  console.log(`\n[${tsKst()}] ▶ route-guardian 시작`);
  await sendHeartbeat();

  // Step A — sitemap 전수
  console.log("  • sitemap.xml 수집...");
  const sitemapUrls = await fetchSitemapUrls();
  console.log(`    → ${sitemapUrls.length}개 URL`);

  console.log(`  • sitemap URL 전수 검사 (동시 ${CONCURRENCY})...`);
  let done = 0;
  const sitemapResults = await fetchPool(sitemapUrls, (r, n, total) => {
    done = n;
    if (n % 100 === 0) console.log(`    ... ${n}/${total}`);
  });
  console.log(`    → ${done}/${sitemapUrls.length} 완료`);

  // Step B — BFS 크롤
  console.log(`  • 홈에서 BFS 크롤 (max=${BFS_MAX_URLS}, depth=${BFS_MAX_DEPTH})...`);
  const bfsResults = await bfsCrawl(`${SITE}/`);
  console.log(`    → ${bfsResults.length}개 URL 탐색`);

  // ── 결과 합치기 (URL 중복 제거, BFS 결과가 더 최신이라 우선) ──
  const merged = new Map();
  for (const r of sitemapResults) merged.set(r.url, { ...r, src: "sitemap" });
  for (const r of bfsResults) {
    const existing = merged.get(r.url);
    if (existing) {
      merged.set(r.url, { ...r, src: `${existing.src}+bfs` });
    } else {
      merged.set(r.url, { ...r, src: "bfs" });
    }
  }
  const all = [...merged.values()];

  // ── 분류 ──
  const bad404 = all.filter((r) => r.kind === "404");
  const softs = all.filter((r) => r.kind === "soft404");
  const errs5xx = all.filter((r) => r.kind === "5xx");
  const errs4xx = all.filter((r) => r.kind === "4xx");
  const errsNet = all.filter((r) => r.kind === "error");
  const oks = all.filter((r) => r.kind === "ok");

  console.log(`\n  결과: OK ${oks.length} / 404 ${bad404.length} / soft404 ${softs.length} / 5xx ${errs5xx.length} / 4xx ${errs4xx.length} / net ${errsNet.length}`);

  // ── 텔레그램 보고 ──
  const totalBad = bad404.length + softs.length + errs5xx.length + errsNet.length;
  const severity = bad404.length + softs.length + errs5xx.length > 0 ? "HIGH" : errs4xx.length > 0 ? "WARN" : "INFO";

  const sampleList = (arr, max = 8) =>
    arr
      .slice(0, max)
      .map((r) => `• ${r.url.replace(SITE, "")} (${r.status || "ERR"}, src=${r.src})`)
      .join("\n");

  const lines = [];
  lines.push(`📊 검사: ${all.length}개 (sitemap ${sitemapResults.length} + BFS ${bfsResults.length})`);
  lines.push(`✅ 정상: ${oks.length}`);
  if (bad404.length) lines.push(`🚨 404: ${bad404.length}건\n${sampleList(bad404)}`);
  if (softs.length) lines.push(`🟡 soft 404: ${softs.length}건\n${sampleList(softs)}`);
  if (errs5xx.length) lines.push(`🔥 5xx: ${errs5xx.length}건\n${sampleList(errs5xx)}`);
  if (errs4xx.length) lines.push(`⚠️ 기타 4xx: ${errs4xx.length}건\n${sampleList(errs4xx, 5)}`);
  if (errsNet.length) lines.push(`📡 네트워크 오류: ${errsNet.length}건\n${sampleList(errsNet, 5)}`);

  await notify({
    severity,
    title: totalBad === 0 ? "라우트 점검 정상" : `라우트 점검 — 문제 ${totalBad}건`,
    what: `sitemap 전수 + 홈 BFS 크롤`,
    when: tsKst(),
    impact: totalBad === 0
      ? "사이트 모든 URL 정상 응답"
      : `방문자/검색엔진이 ${totalBad}개 URL에서 깨진 페이지 만남`,
    cause: totalBad === 0 ? "—" : "스킴 변경/매치 삭제/링크 오타 등 추정",
    action: totalBad === 0 ? "—" : "위 URL 들 직접 확인 후 sitemap 또는 라우트 수정",
    message: lines.join("\n\n"),
    metadata: {
      total: all.length,
      ok: oks.length,
      bad404: bad404.length,
      soft404: softs.length,
      err5xx: errs5xx.length,
      err4xx: errs4xx.length,
      netErr: errsNet.length,
      sample404: bad404.slice(0, 30).map((r) => r.url),
    },
  });

  console.log(`[${tsKst()}] ◀ route-guardian 완료\n`);
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — site=${SITE} poll=${POLL_MS / 1000 / 3600}h`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error("run error:", e.message);
      await notify({
        severity: "WARN",
        title: "라우트 가디언 실행 오류",
        what: "route-guardian.js runOnce()",
        when: tsKst(),
        impact: "이번 회차 404 검사 누락",
        cause: e.message.slice(0, 200),
        action: "Mac mini /tmp/route-guardian.log 확인",
      });
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
