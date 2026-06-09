// preview-coverage.js — 봇 E. 30분 주기 PREVIEW 누락 점검.
//
// 정책:
//   - 다음 2일 SCHEDULED 매치 중 PREVIEW 글 없는 것 (generate-previews 잡 horizon 과 일치)
//   - 야구 (KBO/NPB/MLB): 양 팀 투수 확정된 매치만 누락 카운트
//     (투수 미확정 시 정상 — 정책상 PREVIEW 안 만듦)
//   - PREVIEW_LEAGUES 화이트리스트만 (endpoint 측 필터 — PREVIEW 발행 대상과 동일)
//
// 알림:
//   - 누락 1건 이상 → WARN
//   - 누락 5건 이상 → HIGH
//   - 야구 투수 미확정 카운트는 참고로 표시 (정상 — 알림 안 함)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-preview-coverage";
const POLL_MS = 30 * 60 * 1000;
const HORIZON_DAYS = 2; // generate-previews 잡 horizon(기본 2일)과 일치 — 3일째 매치 오탐 방지

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
const headers = { Authorization: `Bearer ${TOKEN}` };

function tsKst() { return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); }
function kstHHmm(iso) {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${String(kst.getUTCMonth()+1).padStart(2,"0")}/${String(kst.getUTCDate()).padStart(2,"0")} ${String(kst.getUTCHours()).padStart(2,"0")}:${String(kst.getUTCMinutes()).padStart(2,"0")}`;
}

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

async function fetchMissing() {
  const { data } = await axios.get(`${SITE}/api/internal/missing-previews`, {
    params: { days: HORIZON_DAYS },
    headers,
    timeout: 30_000,
  });
  return data;
}

function describeMissing(missing, max = 5) {
  return missing.slice(0, max).map(m => {
    const baseball = m.homeStarter && m.awayStarter
      ? ` (선발 ${m.awayStarter} vs ${m.homeStarter})`
      : "";
    return `${kstHHmm(m.startTime)} ${m.awayName} vs ${m.homeName} [${m.league}]${baseball}`;
  }).join("\n  ") + (missing.length > max ? `\n  ... 외 ${missing.length - max}건` : "");
}

let lastNotifiedCount = -1;

async function poll() {
  console.log(`\n[${tsKst()}] ▶ preview-coverage poll`);
  await sendHeartbeat();

  let data;
  try { data = await fetchMissing(); }
  catch (e) { console.error(`missing-previews fetch fail: ${e.message}`); return; }

  const total = data.total_scheduled ?? 0;
  const miss = data.missing ?? [];
  const baseballPending = data.baseball_starter_pending_count ?? 0;

  console.log(`  3일 SCHEDULED: ${total}건 | 누락: ${miss.length}건 | 야구 투수 미확정 (정상 skip): ${baseballPending}건`);

  // 누락 0 → 알림 X (해소 시 INFO 만)
  if (miss.length === 0) {
    if (lastNotifiedCount > 0) {
      await notify({
        severity: "INFO",
        title: "PREVIEW 누락 모두 해소",
        what: `다음 ${HORIZON_DAYS}일 SCHEDULED 매치 ${total}건 전부 PREVIEW 발행됨`,
        when: "방금",
      });
    }
    lastNotifiedCount = 0;
    return;
  }

  // 카운트 변화 없으면 중복 알림 회피
  if (miss.length === lastNotifiedCount) {
    console.log(`  (동일 카운트 — 알림 skip)`);
    return;
  }

  const severity = miss.length >= 5 ? "HIGH" : "WARN";
  const sample = describeMissing(miss, 5);

  await notify({
    severity,
    title: `PREVIEW 누락 ${miss.length}건`,
    what: `다음 ${HORIZON_DAYS}일 SCHEDULED 매치 중 PREVIEW 글 없는 것`,
    when: "지금",
    impact: "방문자가 매치 미리보기 못 봄 → SEO 검색 노출 ↓",
    cause: "preview cron 실패 또는 Anthropic 529 누락",
    action: [
      "샘플 매치:",
      sample,
      "",
      "확인: vercel logs preview cron 또는 /admin/health",
      baseballPending > 0 ? `(참고: 야구 투수 미확정 ${baseballPending}건 — 정상 skip)` : "",
    ].filter(Boolean).join("\n  "),
  });
  lastNotifiedCount = miss.length;
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — poll=${POLL_MS/1000}s, horizon=${HORIZON_DAYS}일`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try { await poll(); } catch (e) { console.error("poll err:", e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
main().catch(err => { console.error("fatal:", err); process.exit(1); });
