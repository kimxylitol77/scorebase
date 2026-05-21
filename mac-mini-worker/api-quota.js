// api-quota.js — 봇 D. 30분 주기 외부 API 한도 점검.
//
// 추적 API:
//   - api-football  (v3.football.api-sports.io/status)
//   - api-sports basketball (v1.basketball.api-sports.io/status)
//   - api-sports baseball  (v1.baseball.api-sports.io/status)
//   - api-sports NBA v2    (v2.nba.api-sports.io/status)
//
// 같은 키 (API_FOOTBALL_KEY) 가 4개 host 공통. host 별 한도 별도.
// 80% 도달 → WARN, 95% → HIGH.

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });
require("dotenv").config();

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const API_KEY = process.env.API_FOOTBALL_KEY;
const WORKER_NAME = "mac-mini-api-quota";
const POLL_MS = 30 * 60 * 1000;

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
if (!API_KEY) { console.error("❌ API_FOOTBALL_KEY 미설정 (../.env.local 확인)"); process.exit(1); }

const headers = { Authorization: `Bearer ${TOKEN}` };

// host 별 한국 친화 이름 + 사용처
const APIS = [
  { host: "v3.football.api-sports.io",    koName: "api-football",         use: "축구 (EPL/라리가/K리그/J리그/UCL/유로파 등 86리그)" },
  { host: "v1.basketball.api-sports.io",  koName: "api-sports 농구",      use: "WNBA, KBL, NCAA 등" },
  { host: "v1.baseball.api-sports.io",    koName: "api-sports 야구",      use: "MLB 보강 (KBO/NPB 는 자체 source)" },
  { host: "v2.nba.api-sports.io",         koName: "api-sports NBA",       use: "NBA 라이브 + boxscore" },
];

function tsKst() { return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); }

async function sendHeartbeat() {
  try {
    await axios.post(`${SITE}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers, timeout: 10_000 });
  } catch (e) { console.warn(`⚠️ heartbeat: ${e.message}`); }
}

async function notify(payload) {
  try {
    await axios.post(`${SITE}/api/internal/notify`,
      { source: WORKER_NAME, ...payload },
      { headers, timeout: 10_000 });
  } catch (e) { console.error(`✗ notify: ${e.message}`); }
}

async function fetchStatus(api) {
  try {
    const { data } = await axios.get(`https://${api.host}/status`, {
      headers: { "x-apisports-key": API_KEY },
      timeout: 15_000,
    });
    const reqs = data?.response?.requests;
    if (!reqs) return null;
    return {
      current: Number(reqs.current ?? 0),
      limit: Number(reqs.limit_day ?? 0),
    };
  } catch (e) {
    console.warn(`  ${api.koName} fetch fail: ${e.message}`);
    return null;
  }
}

// 알림 상태 메모리 — 같은 한도 도달 시 중복 알림 회피
const lastNotified = new Map(); // host → severity

async function poll() {
  console.log(`\n[${tsKst()}] ▶ api-quota poll`);
  await sendHeartbeat();

  for (const api of APIS) {
    const s = await fetchStatus(api);
    if (!s || s.limit === 0) {
      console.log(`  - ${api.koName.padEnd(20)} status 없음 (key 미사용)`);
      continue;
    }
    const pct = Math.round((s.current / s.limit) * 100);
    console.log(`  ${pct >= 80 ? "⚠" : "✓"} ${api.koName.padEnd(20)} ${s.current}/${s.limit} (${pct}%)`);

    let severity = null;
    if (pct >= 95) severity = "HIGH";
    else if (pct >= 80) severity = "WARN";

    if (severity) {
      const prev = lastNotified.get(api.host);
      if (prev !== severity) {
        await notify({
          severity,
          title: `${api.koName} 한도 ${pct}% 사용`,
          what: `${api.koName} (${api.host})`,
          when: "오늘",
          impact: `${api.use} 데이터 수집 위험${severity === "HIGH" ? " — 곧 차단" : ""}`,
          cause: `요청 ${s.current.toLocaleString()} / ${s.limit.toLocaleString()} (${pct}%)`,
          action: pct >= 95
            ? "즉시: 비핵심 cron 일시 중단 또는 plan 업그레이드"
            : "오늘 사용 패턴 확인 — UTC 자정 리셋까지 남은 시간 계산",
        });
        lastNotified.set(api.host, severity);
      }
    } else {
      // 70% 이하 복귀
      const prev = lastNotified.get(api.host);
      if (prev && pct < 70) {
        await notify({
          severity: "INFO",
          title: `${api.koName} 한도 정상 복귀`,
          what: api.koName,
          when: "방금",
          impact: `사용량 ${pct}% — 안전 범위`,
        });
        lastNotified.delete(api.host);
      }
    }
  }
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — poll=${POLL_MS/1000}s`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try { await poll(); } catch (e) { console.error("poll err:", e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
main().catch(err => { console.error("fatal:", err); process.exit(1); });
