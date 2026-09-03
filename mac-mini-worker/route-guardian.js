// route-guardian.js — Mac mini 모니터링 봇 G.
// 사이트 전체를 돌며 404 / soft 404 / 5xx 페이지를 찾아냅니다.
//
// 흐름 (24h 주기):
//   1) heartbeat POST
//   2) sitemap.xml 가져와서 등재된 URL 전수 검사
//   3) 홈에서 시작해 내부 링크 BFS (sitemap 누락 라우트 + dead link 발견)
//   4) 응답 분류: HTTP status code 기반 (404 / 5xx / 4xx / 네트워크오류 / OK)
//   5) 결과 텔레그램 전체 보고 + HealthCheck DB row insert (/admin/health 에 표시)
//
// 참고: soft 404 검출은 안 함 — Next.js 가 모든 페이지 RSC payload 에
// notFound 라우트 정의를 inline 해서 "This page could not be found" 문자열이
// 정상 페이지에도 항상 매치됨. notFound() 는 정확히 HTTP 404 반환하므로
// status code 만으로 충분.
//
// 실행 (Mac mini):
//   cd ~/dev/scorebase/mac-mini-worker
//   node route-guardian.js

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const { hbFail } = require("./hb-log");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-route-guardian";
const POLL_MS = 24 * 60 * 60 * 1000; // 24시간
const REQ_TIMEOUT_MS = 20_000;
const CONCURRENCY = 5;           // 동시 fetch 수 (Vercel function 부하 고려)
const BFS_MAX_URLS = 500;        // BFS 최대 탐색 URL
const BFS_MAX_DEPTH = 3;
// 속도 임계 — checkUrl 의 dur (ms) 기준. CDN HIT 평균 0.5초, MISS 1-2초, cold 3-5초.
// 3초+ 느림, 8초+ 매우 느림 (방문자 체감 큰 지연).
const SLOW_WARN_MS = 3_000;
const SLOW_HIGH_MS = 8_000;

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
      { headers, timeout: 20_000 },
    );
  } catch (e) {
    hbFail(e.message);
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

// /admin/health 대시보드에 노출되도록 HealthCheck row 1개 insert
async function postHealthFinding(payload) {
  try {
    await axios.post(
      `${SITE}/api/internal/health-finding`,
      payload,
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.error(`✗ health-finding fail: ${e.message}`);
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
      // hash/query 제거 — 같은 페이지 중복 방지.
      // 단 ?view= 탭은 보존: 리그/선수 페이지의 탭은 각각 다른 콘텐츠(다른 링크 집합)라
      // 쿼리를 통째로 버리면 탭 안에 숨은 깨진 링크(예: stats 탭의 선수 링크 404)를 영영 못 본다.
      const view = abs.searchParams.get("view");
      abs.hash = "";
      abs.search = "";
      if (view) abs.searchParams.set("view", view);
      found.add(abs.toString());
    } catch {
      // invalid URL
    }
  }
  return [...found];
}

// ── 3. 단일 URL 검사 ──
// ⚠ 본문(body)은 **결과 객체에 담지 않는다.** 담으면 sitemap 전수 결과 배열에 그대로
// 쌓여 힙이 터진다 — 2026-09-03 실측: sitemap 12,436 URL × 페이지당 200~500KB.
// Vultr(2GB) 이전 후 26일간 OOM 재시작 16,119회, 한 번도 완주하지 못했다.
// 링크 추출이 필요한 호출부는 onBody 콜백으로 **본문이 살아 있는 동안** 처리한다.
async function checkUrl(url, onBody) {
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
    let kind = "ok";
    if (status === 404) kind = "404";
    else if (status >= 500) kind = "5xx";
    else if (status >= 400) kind = "4xx";
    if (kind === "ok" && onBody) {
      onBody(typeof res.data === "string" ? res.data : "", url);
    }
    return { url, status, dur, kind };
  } catch (e) {
    return { url, status: 0, dur: Date.now() - t0, kind: "error", error: e.message };
  }
}

// ── 4. 동시성 제한 fetch 풀 ──
async function fetchPool(urls, onResult, onBody) {
  let idx = 0;
  const results = [];
  async function worker() {
    while (idx < urls.length) {
      const my = idx++;
      const r = await checkUrl(urls[my], onBody);
      results.push(r);
      if (onResult) onResult(r, my + 1, urls.length);
    }
  }
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);
  return results;
}

// BFS 추가 시드 — 탭 페이지(?view=)는 홈에서 depth 가 멀어(홈→종목허브→리그→탭) MAX_DEPTH 안에
// 안 닿을 수 있어 직접 시드로 넣는다. 탭 안에 숨은 선수/팀 링크 깨짐(404)을 표면 페이지처럼 검사하기 위함.
// (계기: /leagues/EPL?view=stats 의 선수 링크가 af→ts 미변환으로 /transfers/{afId} 404 였는데 봇이 못 잡음.)
const EXTRA_SEEDS = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "WORLD_CUP"].map(
  (lg) => `${SITE}/leagues/${lg}?view=stats`,
);

// ── 5. BFS 크롤 ──
async function bfsCrawl(startUrls) {
  const seeds = Array.isArray(startUrls) ? startUrls : [startUrls];
  const seen = new Set(seeds);
  const results = [];
  let frontier = seeds.map((url) => ({ url, depth: 0 }));

  while (frontier.length > 0 && seen.size < BFS_MAX_URLS) {
    const batch = frontier.slice(0, CONCURRENCY * 4); // 한 번에 ~20개 처리
    frontier = frontier.slice(batch.length);

    // 링크 추출은 본문이 살아 있는 동안(onBody) 끝낸다 — 결과 배열에 본문을 남기지 않는다.
    const depthByUrl = new Map(batch.map((b) => [b.url, b.depth]));
    const checked = await fetchPool(
      batch.map((b) => b.url),
      null,
      (body, url) => {
        const depth = depthByUrl.get(url) ?? 0;
        if (depth >= BFS_MAX_DEPTH || !body) return;
        for (const l of extractInternalLinks(body, url)) {
          if (seen.has(l) || seen.size >= BFS_MAX_URLS) continue;
          seen.add(l);
          frontier.push({ url: l, depth: depth + 1 });
        }
      },
    );
    for (const r of checked) results.push(r);
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

  // Step B — BFS 크롤 (홈 + 탭 시드)
  console.log(`  • 홈+탭 시드에서 BFS 크롤 (max=${BFS_MAX_URLS}, depth=${BFS_MAX_DEPTH})...`);
  const bfsResults = await bfsCrawl([`${SITE}/`, ...EXTRA_SEEDS]);
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
  const errs5xx = all.filter((r) => r.kind === "5xx");
  const errs4xx = all.filter((r) => r.kind === "4xx");
  const errsNet = all.filter((r) => r.kind === "error");
  const oks = all.filter((r) => r.kind === "ok");

  // ── 속도 통계 (OK 응답만 — 에러는 timeout 으로 max dur 일 수 있어 제외) ──
  const okDurs = oks.map((r) => r.dur).filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
  const avgMs = okDurs.length > 0
    ? Math.round(okDurs.reduce((s, d) => s + d, 0) / okDurs.length)
    : 0;
  const p50Ms = okDurs.length > 0 ? okDurs[Math.floor(okDurs.length * 0.5)] : 0;
  const p95Ms = okDurs.length > 0 ? okDurs[Math.floor(okDurs.length * 0.95)] : 0;
  const slowWarn = oks
    .filter((r) => r.dur >= SLOW_WARN_MS && r.dur < SLOW_HIGH_MS)
    .sort((a, b) => b.dur - a.dur);
  const slowHigh = oks
    .filter((r) => r.dur >= SLOW_HIGH_MS)
    .sort((a, b) => b.dur - a.dur);

  console.log(`\n  결과: OK ${oks.length} / 404 ${bad404.length} / 5xx ${errs5xx.length} / 4xx ${errs4xx.length} / net ${errsNet.length}`);
  console.log(`  속도: avg ${avgMs}ms · p50 ${p50Ms}ms · p95 ${p95Ms}ms · 느림(${SLOW_WARN_MS}ms+) ${slowWarn.length}건 · 매우느림(${SLOW_HIGH_MS}ms+) ${slowHigh.length}건`);

  // ── 텔레그램 보고 + DB finding insert ──
  const totalBad = bad404.length + errs5xx.length + errsNet.length;
  const severity =
    bad404.length + errs5xx.length > 0 || slowHigh.length > 0
      ? "HIGH"
      : errs4xx.length > 0 || slowWarn.length > 0
        ? "WARN"
        : "INFO";

  const sampleList = (arr, max = 8) =>
    arr
      .slice(0, max)
      .map((r) => `• ${r.url.replace(SITE, "")} (${r.status || "ERR"}, src=${r.src})`)
      .join("\n");
  const slowList = (arr, max = 8) =>
    arr
      .slice(0, max)
      .map((r) => `• ${r.dur}ms — ${r.url.replace(SITE, "")}`)
      .join("\n");

  const lines = [];
  lines.push(`📊 검사: ${all.length}개 (sitemap ${sitemapResults.length} + BFS ${bfsResults.length})`);
  lines.push(`✅ 정상: ${oks.length}`);
  lines.push(`⏱ 속도: avg ${avgMs}ms · p50 ${p50Ms}ms · p95 ${p95Ms}ms`);
  if (bad404.length) lines.push(`🚨 404: ${bad404.length}건\n${sampleList(bad404)}`);
  if (errs5xx.length) lines.push(`🔥 5xx: ${errs5xx.length}건\n${sampleList(errs5xx)}`);
  if (errs4xx.length) lines.push(`⚠️ 기타 4xx: ${errs4xx.length}건\n${sampleList(errs4xx, 5)}`);
  if (errsNet.length) lines.push(`📡 네트워크 오류: ${errsNet.length}건\n${sampleList(errsNet, 5)}`);
  if (slowHigh.length)
    lines.push(`🐢 매우 느림 (${SLOW_HIGH_MS}ms+): ${slowHigh.length}건\n${slowList(slowHigh)}`);
  if (slowWarn.length)
    lines.push(`🐌 느림 (${SLOW_WARN_MS}-${SLOW_HIGH_MS}ms): ${slowWarn.length}건\n${slowList(slowWarn, 5)}`);

  const stats = {
    total: all.length,
    ok: oks.length,
    bad404: bad404.length,
    err5xx: errs5xx.length,
    err4xx: errs4xx.length,
    netErr: errsNet.length,
    timing: { avgMs, p50Ms, p95Ms, slowWarn: slowWarn.length, slowHigh: slowHigh.length },
    sample404: bad404.slice(0, 30).map((r) => r.url.replace(SITE, "")),
    sample5xx: errs5xx.slice(0, 10).map((r) => r.url.replace(SITE, "")),
    sampleSlow: [...slowHigh, ...slowWarn]
      .slice(0, 20)
      .map((r) => ({ url: r.url.replace(SITE, ""), dur: r.dur })),
  };

  // 텔레그램 알림
  const totalIssues = totalBad + slowHigh.length + slowWarn.length;
  const title =
    totalBad > 0
      ? `라우트 점검 — 깨진 페이지 ${totalBad}건`
      : slowHigh.length > 0
        ? `라우트 점검 — 매우 느린 페이지 ${slowHigh.length}건`
        : slowWarn.length > 0
          ? `라우트 점검 — 느린 페이지 ${slowWarn.length}건`
          : "라우트 점검 정상";
  await notify({
    severity,
    title,
    what: `sitemap 전수 + 홈 BFS 크롤 + 응답 속도`,
    when: tsKst(),
    impact:
      totalBad > 0
        ? `방문자/검색엔진이 ${totalBad}개 URL에서 깨진 페이지 만남`
        : slowHigh.length > 0
          ? `방문자가 ${slowHigh.length}개 페이지에서 ${SLOW_HIGH_MS / 1000}s+ 지연 체감`
          : "사이트 모든 URL 정상 응답",
    cause: totalBad === 0 && totalIssues === 0
      ? "—"
      : "스킴 변경/매치 삭제/cold start/외부 API 지연 등 추정",
    action: totalIssues === 0 ? "—" : "위 URL 들 직접 확인 후 sitemap·라우트·캐시 수정",
    message: lines.join("\n\n"),
    metadata: stats,
  });

  // /admin/health 채팅에 노출되도록 HealthCheck row insert
  const findingSeverity = severity === "HIGH" ? "HIGH" : severity === "WARN" ? "MED" : "OK";
  const findingMessage =
    totalBad === 0 && slowHigh.length === 0 && slowWarn.length === 0
      ? `사이트 ${all.length}개 URL 모두 정상 (avg ${avgMs}ms)`
      : [
          totalBad > 0 ? `404 ${bad404.length}건${errs5xx.length ? ` · 5xx ${errs5xx.length}건` : ""}${errsNet.length ? ` · 네트워크 ${errsNet.length}건` : ""}` : null,
          slowHigh.length > 0 ? `매우느림 ${slowHigh.length}건` : null,
          slowWarn.length > 0 ? `느림 ${slowWarn.length}건` : null,
        ]
          .filter(Boolean)
          .join(" · ") + ` (avg ${avgMs}ms, p95 ${p95Ms}ms)`;
  await postHealthFinding({
    category: "route-guardian",
    severity: findingSeverity,
    key: `crawl-${all.length}`,
    message: findingMessage,
    metadata: stats,
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
