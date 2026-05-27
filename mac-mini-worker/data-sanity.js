// data-sanity.js — 봇 D. 3분 주기 라이브 데이터 의미적 일관성 점검.
//
// 검출 항목 (2026-05-24 사고 retrospective):
//   1. score_drift        — SCHEDULED 야구 매치인데 점수 있음 (status updater 죽음)
//   2. inning_missing     — LIVE 야구 매치인데 cache score 없음/half=0 (1회초 fallback 위험)
//   3. cache_db_mismatch  — cache.ft (away, home) vs DB.home/awayScore 불일치
//   4. stale_live         — LIVE 매치 updatedAt 15분+ 정체
//
// 실제 검증 로직은 /api/internal/data-sanity (server side, Prisma 직접 접근).
// 이 봇은 단순 fetch + 이슈별 Telegram 알림 (hermes-telegram-bot 경유).
//
// dedup: in-memory Map<issueKey, lastNotifiedAt>. 같은 매치 같은 이슈는 1시간에 1번만.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-data-sanity";
const POLL_MS = 3 * 60 * 1000;
const DEDUP_MS = 60 * 60 * 1000;

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
const headers = { Authorization: `Bearer ${TOKEN}` };

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

// 이슈별 마지막 알림 시각 — 재시작 시 reset (in-memory)
const lastNotified = new Map();
function shouldNotify(issueKey) {
  const last = lastNotified.get(issueKey) ?? 0;
  if (Date.now() - last < DEDUP_MS) return false;
  lastNotified.set(issueKey, Date.now());
  return true;
}

const KIND_LABEL = {
  score_drift: "📊 점수 표시 오류",
  inning_missing: "⚾ 이닝 정보 누락",
  cache_db_mismatch: "🔀 cache vs DB 불일치",
  cache_inner_inconsistent: "📉 cache 이닝 합 vs ft 불일치",
  finished_no_score: "🏁 FINISHED 인데 점수 null",
  stale_live: "⏸ 라이브 갱신 멈춤",
  future_live: "⏭ 미래 매치 LIVE stuck",
  standings_stale: "🏆 순위 cache stale",
  standings_mismatch: "⚠️ 순위 source 불일치",
};

const KIND_CAUSE = {
  score_drift: "TheSports status code 매핑 누락 또는 mapBaseballStatus fallback",
  inning_missing: "ws-subscriber MQTT 수신 끊김 또는 mapping cache 누락",
  cache_db_mismatch: "ft 인덱싱 가정 오류 또는 monotonic max 부작용",
  cache_inner_inconsistent: "TheSports MQTT push 일부 누락 (이닝 partial loss) — ws-subscriber merge 실패 의심",
  finished_no_score: "collector score 추출 path 누락 또는 ws-subscriber/baseball-poller 가 FT 직전 score sync 안 됨",
  stale_live: "collector/ws-subscriber 멈춤 또는 외부 API 응답 stuck",
  future_live: "status_id 매핑 오류 또는 status update path 가 미래 매치 가드 누락",
  standings_stale: "Lightsail standings-poller 죽음 또는 Vercel standings-collect cron 실패",
  standings_mismatch: "두 source 중 하나가 stale — fresh source 우선순위 확인",
};

const KIND_ACTION = {
  score_drift: "mapBaseballStatus 코드 + Match.status 직접 확인",
  inning_missing: "/tmp/baseball-ws-subscriber.log + ts-baseball-mapping endpoint",
  cache_db_mismatch: "convertCacheToBaseballLive 의 ft[0]=away, ft[1]=home 가정 검증 (메모리 feedback_thesports_baseball_indexing.md)",
  cache_inner_inconsistent: "baseball-ws-subscriber + baseball-poller 재시작 후 cache 갱신 확인. partial push merge 로직 점검",
  finished_no_score: "baseball-match-collector score path (m.scores.ft[1]=home, [0]=away) 검증 + lightsail 재시작",
  stale_live: "Vercel cron 로그 + baseball-poller.log + baseball-ws-subscriber.log",
  future_live: "Match.status=SCHEDULED + score null 로 즉시 롤백. status updater 의 status_id 매핑 검증",
  standings_stale: "Lightsail: sudo systemctl status scorebase-standings-poller / Vercel cron: /api/cron/standings-collect 로그",
  standings_mismatch: "src/lib/sports/thesports/standings-helper.ts 의 source 우선순위 확인",
};

async function poll() {
  console.log(`\n[${tsKst()}] ▶ data-sanity poll`);
  await sendHeartbeat();

  let resp;
  try {
    const { data } = await axios.get(`${SITE}/api/internal/data-sanity`, {
      headers, timeout: 30_000,
    });
    resp = data;
  } catch (e) {
    console.error(`fetch fail: ${e.message}`);
    return;
  }
  const issues = Array.isArray(resp?.issues) ? resp.issues : [];
  console.log(`  매치 ${resp?.totals?.matchesChecked ?? "?"}건 / 이슈 ${issues.length}건`);

  if (issues.length === 0) {
    console.log("  ✓ 데이터 일관성 양호");
    return;
  }

  // 종류별 그룹화 + dedup
  const byKind = new Map();
  for (const issue of issues) {
    const key = `${issue.kind}:${issue.matchId}`;
    if (!shouldNotify(key)) continue;
    const arr = byKind.get(issue.kind) ?? [];
    arr.push(issue);
    byKind.set(issue.kind, arr);
  }

  for (const [kind, list] of byKind) {
    const sample = list.slice(0, 5).map((i) =>
      `${i.away} vs ${i.home} (${i.league} #${i.matchId}): ${i.detail}`
    ).join("\n");
    const overflow = list.length > 5 ? `\n외 ${list.length - 5}건` : "";
    await notify({
      severity: list.some((i) => i.severity === "HIGH") ? "HIGH" : "WARN",
      title: `${KIND_LABEL[kind] ?? kind} ${list.length}건`,
      what: sample + overflow,
      when: tsKst(),
      impact: "사용자에게 잘못된/누락된 라이브 정보 노출",
      cause: KIND_CAUSE[kind] ?? "원인 미상",
      action: KIND_ACTION[kind] ?? "코드 확인 필요",
    });
    console.log(`  📤 [${kind}] ${list.length}건 알림 전송`);
  }
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — poll=${POLL_MS/1000}s dedup=${DEDUP_MS/60000}min`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try { await poll(); } catch (e) { console.error("poll err:", e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
main().catch(err => { console.error("fatal:", err); process.exit(1); });
