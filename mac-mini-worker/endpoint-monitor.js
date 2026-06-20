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

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

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
// koName: 사용자 친화 한국어 이름. impact: 다운 시 사용자에게 미치는 영향.
const ENDPOINTS = [
  { name: "scores",       path: "/scores",          expect: 200, koName: "스코어 페이지",     impact: "방문자가 라이브 스코어 못 봄" },
  { name: "predictions",  path: "/predictions",     expect: 200, koName: "예측 페이지",       impact: "방문자가 시즌 예측 못 봄" },
  { name: "live-api",     path: "/api/live/scores", expect: 200, koName: "라이브 스코어 API", impact: "스코어 페이지 자동 갱신 멈춤" },
  { name: "admin-health", path: "/admin/health",    expect: 200, koName: "헬스체크 대시보드", impact: "운영자가 사이트 상태 점검 불가" },
  { name: "home",         path: "/",                expect: 200, koName: "메인 페이지",       impact: "방문자가 사이트 입장 불가" },
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

async function notify(payload) {
  // payload = { severity, title, message?, what?, when?, impact?, cause?, action?, metadata? }
  try {
    await axios.post(
      `${SITE}/api/internal/notify`,
      { source: WORKER_NAME, ...payload },
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.error(`✗ notify fail: ${e.message}`);
  }
}

function fmtCause(r) {
  if (r.error) {
    if (r.error.includes("timeout") || r.error.includes("ECONN")) return "응답 없음 (30초 초과)";
    if (r.error.includes("ENOTFOUND")) return "DNS 조회 실패";
    return r.error.slice(0, 100);
  }
  if (r.status >= 500) return `서버 오류 (${r.status})`;
  if (r.status >= 400) return `요청 오류 (${r.status})`;
  return `예상 status 아님 (${r.status})`;
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

      const cause = fmtCause(r);
      const when = next >= 2
        ? `약 ${next * 5}분 전부터 (${next}회 연속)`
        : "방금 (1회)";

      if (next >= FAIL_THRESHOLD) {
        await notify({
          severity: "HIGH",
          title: `${ep.koName} 응답 없음`,
          what: `${ep.koName} (${ep.path})`,
          when,
          impact: ep.impact,
          cause,
          action: "scorebase.kr/admin/health 또는 Vercel logs 점검",
        });
      } else {
        await notify({
          severity: "WARN",
          title: `${ep.koName} 일시 오류`,
          what: `${ep.koName} (${ep.path})`,
          when,
          impact: "방문자 일부 영향 가능",
          cause,
          action: "5분 후 다시 확인 — 계속되면 점검",
        });
      }
    } else {
      // 정상 — 카운트 리셋. 복구 알림은 진짜 장애(연속 2회+ HIGH)였을 때만 보낸다.
      // 단발 실패(배포 직후 콜드 스타트·재배포 순간 502 등)→복구는 노이즈라 조용히 리셋.
      if ((failCount.get(ep.name) ?? 0) >= FAIL_THRESHOLD) {
        await notify({
          severity: "INFO",
          title: `${ep.koName} 복구됨`,
          what: `${ep.koName} (${ep.path})`,
          when: "방금",
          impact: "정상 응답 복귀",
          cause: `응답 ${r.dur}ms`,
        });
      }
      failCount.set(ep.name, 0);
      console.log(`  ✓ ${label} ${r.dur}ms${isSlow ? " ⏳SLOW" : ""}`);
      if (isSlow) {
        await notify({
          severity: "WARN",
          title: `${ep.koName} 느림`,
          what: `${ep.koName} (${ep.path})`,
          when: "방금",
          impact: "방문자 체감 속도 ↓ (10초+ 대기)",
          cause: `응답 ${r.dur}ms (정상 1~3초)`,
          action: "DB pool 또는 Vercel function 부하 확인",
        });
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
