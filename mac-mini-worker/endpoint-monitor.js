// endpoint-monitor.js — Mac mini 모니터링 봇 A.
// scorebase 핵심 endpoint 5분 주기 ping. 다운/느림 발견 시 텔레그램 알림.
//
// 흐름:
//   1) heartbeat POST (살아있음)
//   2) 각 endpoint GET → status code + 응답 시간 측정
//   3) 이상 (5xx, 타임아웃, 30초+ 지연) → POST /api/internal/notify
//   4) 연속 N회 같은 endpoint 실패 시 severity HIGH (단발은 WARN)
//
// 실행 (Mac mini):
//   cd ~/dev/scorebase/mac-mini-worker
//   node endpoint-monitor.js

require("dotenv").config();
const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-endpoint-monitor";
const POLL_MS = 5 * 60 * 1000; // 5분
const REQ_TIMEOUT_MS = 30_000;
const SLOW_THRESHOLD_MS = 10_000;

if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

// 체크할 endpoint list — 200 OK + 응답시간 측정
const ENDPOINTS = [
  { name: "scores",       path: "/scores",        expect: 200 },
  { name: "predictions",  path: "/predictions",   expect: 200 },
  { name: "live-api",     path: "/api/live/scores", expect: 200 },
  { name: "admin-health", path: "/admin/health",  expect: 200 },
  { name: "home",         path: "/",              expect: 200 },
];

// 연속 실패 카운트 (endpoint name → count)
const failCount = new Map();
const FAIL_THRESHOLD = 2; // 연속 2회 실패 → HIGH

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

async function notify(severity, title, message, metadata) {
  try {
    await axios.post(
      `${SITE}/api/internal/notify`,
      { source: WORKER_NAME, severity, title, message, metadata },
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.error(`✗ notify fail: ${e.message}`);
  }
}

async function checkEndpoint(ep) {
  const url = `${SITE}${ep.path}`;
  const t0 = Date.now();
  try {
    const res = await axios.get(url, {
      timeout: REQ_TIMEOUT_MS,
      validateStatus: () => true, // 모든 status 받아서 직접 판단
      headers: { "User-Agent": "scorebase-monitor/1.0" },
    });
    const dur = Date.now() - t0;
    const ok = res.status === ep.expect;
    return { ok, status: res.status, dur, error: null };
  } catch (e) {
    return { ok: false, status: 0, dur: Date.now() - t0, error: e.message };
  }
}

async function poll() {
  console.log(`\n[${tsKst()}] ▶ poll start`);
  await sendHeartbeat();

  for (const ep of ENDPOINTS) {
    const r = await checkEndpoint(ep);
    const isSlow = r.ok && r.dur > SLOW_THRESHOLD_MS;
    const label = `${ep.name.padEnd(15)}`;

    if (!r.ok) {
      const prev = failCount.get(ep.name) ?? 0;
      const next = prev + 1;
      failCount.set(ep.name, next);
      console.log(`  ✗ ${label} status=${r.status} dur=${r.dur}ms err=${r.error ?? "-"} fail=${next}/2`);
      if (next >= FAIL_THRESHOLD) {
        await notify(
          "HIGH",
          `${ep.name} ${next}회 연속 실패`,
          `${ep.path} 응답 비정상.`,
          { status: r.status, dur_ms: r.dur, error: r.error ?? "—" },
        );
      } else {
        await notify(
          "WARN",
          `${ep.name} 1회 실패`,
          `${ep.path} 일시 오류 감지.`,
          { status: r.status, dur_ms: r.dur, error: r.error ?? "—" },
        );
      }
    } else {
      // 정상 — 카운트 리셋
      if (failCount.get(ep.name)) {
        await notify(
          "INFO",
          `${ep.name} 복구됨`,
          `${ep.path} 정상 응답 복귀.`,
          { dur_ms: r.dur },
        );
      }
      failCount.set(ep.name, 0);
      console.log(`  ✓ ${label} ${r.dur}ms${isSlow ? " ⏳SLOW" : ""}`);
      if (isSlow) {
        await notify(
          "WARN",
          `${ep.name} 느림`,
          `${ep.path} ${r.dur}ms (임계 ${SLOW_THRESHOLD_MS}ms)`,
          { dur_ms: r.dur },
        );
      }
    }
  }
  console.log(`[${tsKst()}] ◀ poll done`);
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — site=${SITE} poll=${POLL_MS / 1000}s`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try {
      await poll();
    } catch (e) {
      console.error("poll error:", e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
