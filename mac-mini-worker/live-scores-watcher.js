// live-scores-watcher.js — 봇 F. 1분 주기 라이브 스코어 전담 감시.
//
// scorebase 의 최대 오류 발생 지점 = 라이브 스코어. 가장 자주·깊게 점검.
//
// 검출 항목:
//   1. /api/live/scores 응답 시간 (5초+ WARN, 15초+ HIGH)
//   2. status ≠ 200 (즉시 HIGH)
//   3. LIVE 인데 score null (10분+ 지속 시 HIGH)
//   4. 같은 score 90분+ 변화 없음 (단, 0-0 은 제외 — 무득점 완주 흔함)
//   5. (옵션) 라이브 매치 0건 — "있어야 하는 시간대" 판단 어려워 skip
//   6. 응답 JSON 깨짐 (matches 배열 없음)
//
// 2026-05-23 noise reduction:
//   - WARN 30분 알림 제거 (본문에 "정상 가능"이라 적혀있던 false alarm)
//   - 0-0 매치 stuck 추적 제외 (축구 무득점 90분 완주 케이스가 흔함)
//   - HIGH 60분 → 90분 (정규 경기 종료 시간 + 마진)
//
// 상태 메모리 (앱 재시작 시 reset, 단기간 트래킹 OK):
//   - liveNullSince[matchId] = 처음 null 발견 timestamp
//   - lastScore[matchId] = { score: "1-0", at: timestamp }

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-live-scores";
const POLL_MS = 60 * 1000; // 1분
const REQ_TIMEOUT_MS = 20_000;
// Vercel function cold start (~1.5s) + 외부 API 일시 지연 시 5-8s 가능 (outlier).
// CDN HIT 시 평균 0.5초라 8초 넘기면 실제 stale, 20초+ 면 함수 문제.
// 2026-05-23: false alarm noise 줄이기 위해 5→8s, 15→20s.
const SLOW_WARN_MS = 8_000;
const SLOW_HIGH_MS = 20_000;
const NULL_HIGH_MS = 10 * 60 * 1000;    // LIVE null 10분 지속 → HIGH
const STUCK_HIGH_MS = 90 * 60 * 1000;   // 같은 score 90분 → HIGH (정규 종료 시간 + 마진)

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
const headers = { Authorization: `Bearer ${TOKEN}` };

const liveNullSince = new Map();   // matchId → first-null timestamp
const lastScore = new Map();        // matchId → { score, at, notified }
const lastNotified = new Map();     // alertKey → timestamp (중복 알림 회피)
const RENOTIFY_MS = 30 * 60 * 1000; // 같은 알림 30분 cooldown

function tsKst() { return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); }

async function sendHeartbeat() {
  try {
    await axios.post(`${SITE}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers, timeout: 10_000 });
  } catch (e) { console.warn(`⚠️ heartbeat: ${e.message}`); }
}

async function notify(payload) {
  const key = `${payload.title}`;
  const now = Date.now();
  const prev = lastNotified.get(key);
  if (prev && now - prev < RENOTIFY_MS) {
    console.log(`  (중복 알림 cooldown — skip: ${key})`);
    return;
  }
  try {
    await axios.post(`${SITE}/api/internal/notify`,
      { source: WORKER_NAME, ...payload },
      { headers, timeout: 10_000 });
    lastNotified.set(key, now);
  } catch (e) { console.error(`✗ notify: ${e.message}`); }
}

function matchLabel(m) {
  const away = m.awayName ?? m.away?.name ?? "?";
  const home = m.homeName ?? m.home?.name ?? "?";
  return `${away} vs ${home} (${m.league ?? "?"})`;
}

function describeMatches(ms, max = 3) {
  return ms.slice(0, max).map(matchLabel).join(" / ")
    + (ms.length > max ? ` 외 ${ms.length - max}건` : "");
}

async function poll() {
  const cycleStart = Date.now();
  console.log(`\n[${tsKst()}] ▶ live-scores poll`);
  await sendHeartbeat();

  // 1. /api/live/scores 호출 + 응답시간 측정
  let res;
  const t0 = Date.now();
  try {
    res = await axios.get(`${SITE}/api/live/scores`, {
      timeout: REQ_TIMEOUT_MS,
      validateStatus: () => true,
    });
  } catch (e) {
    const dur = Date.now() - t0;
    await notify({
      severity: "HIGH",
      title: "라이브 스코어 API 응답 없음",
      what: "/api/live/scores",
      when: "방금",
      impact: "방문자 라이브 스코어 자동 갱신 멈춤",
      cause: e.code === "ECONNABORTED" ? `타임아웃 (${dur}ms)` : (e.message ?? "네트워크 오류"),
      action: "Vercel function 로그 + DB pool 상태 확인",
    });
    return;
  }

  const dur = Date.now() - t0;
  const ok = res.status === 200;

  // 2. status 체크
  if (!ok) {
    await notify({
      severity: "HIGH",
      title: `라이브 스코어 API ${res.status}`,
      what: "/api/live/scores",
      when: "방금",
      impact: "방문자 라이브 스코어 자동 갱신 멈춤",
      cause: `HTTP ${res.status} 응답 (정상 200)`,
      action: "Vercel function 로그 확인",
    });
    return;
  }

  // 3. 응답 시간 체크
  if (dur > SLOW_HIGH_MS) {
    await notify({
      severity: "HIGH",
      title: `라이브 스코어 API 매우 느림`,
      what: "/api/live/scores",
      when: "방금",
      impact: "방문자가 페이지 로딩 멈춤처럼 체감",
      cause: `응답 ${dur}ms (HIGH 임계 ${SLOW_HIGH_MS}ms)`,
      action: "DB pool 소진 / TheSports API timeout / fetchAllLiveScores 병목 확인",
    });
  } else if (dur > SLOW_WARN_MS) {
    await notify({
      severity: "WARN",
      title: `라이브 스코어 API 느림`,
      what: "/api/live/scores",
      when: "방금",
      impact: "체감 속도 ↓",
      cause: `응답 ${dur}ms (정상 1~3초)`,
    });
  }

  // 4. JSON 구조 검증
  const data = res.data;
  if (!data || !Array.isArray(data.matches)) {
    await notify({
      severity: "HIGH",
      title: "라이브 스코어 API 응답 깨짐",
      what: "/api/live/scores",
      when: "방금",
      impact: "방문자 라이브 페이지 빈 화면 가능",
      cause: "응답 JSON 에 matches 배열 없음 (캐시 누수 의심)",
      action: "etag 캐시 토큰 + force-dynamic 설정 확인",
    });
    return;
  }
  const matches = data.matches;
  console.log(`  매치 ${matches.length}건, 응답 ${dur}ms`);

  // 5. LIVE 매치만 처리
  const isLive = (m) => /Q\d|Inning|회|HT|BT|OT|'|LIVE/i.test(m.statusLabel ?? "");
  const liveMatches = matches.filter(isLive);
  console.log(`  LIVE: ${liveMatches.length}건`);

  // 6. LIVE 인데 score null — 10분+ 지속 시 HIGH
  const now = Date.now();
  const liveNullNow = [];
  const liveNullStuckLong = [];

  for (const m of liveMatches) {
    if (m.homeScore != null && m.awayScore != null) {
      // null 상태 해제 — 메모리에서 제거
      liveNullSince.delete(m.id);
      continue;
    }
    if (!liveNullSince.has(m.id)) liveNullSince.set(m.id, now);
    const since = liveNullSince.get(m.id);
    liveNullNow.push(m);
    if (now - since > NULL_HIGH_MS) liveNullStuckLong.push(m);
  }

  if (liveNullStuckLong.length > 0) {
    await notify({
      severity: "HIGH",
      title: `LIVE 점수 null ${liveNullStuckLong.length}건 (10분+ 지속)`,
      what: describeMatches(liveNullStuckLong),
      when: "10분 전부터 계속",
      impact: "방문자가 라이브 점수 못 봄",
      cause: "collector cron 멈춤 또는 라이브 API source 갱신 멈춤",
      action: "Vercel cron 로그 (live-recap, collect) + 외부 API status 확인",
    });
  } else if (liveNullNow.length > 0) {
    console.log(`  ⚠ LIVE null ${liveNullNow.length}건 (10분 미만, 관찰 중)`);
  }

  // 7. 같은 score 90분+ 정지 (LIVE 인데 갱신 멈춤)
  //    0-0 은 제외 — 무득점 90분 완주 매치 흔함 (특히 청소년·마이너 리그)
  const stuckHigh = [];
  for (const m of liveMatches) {
    if (m.homeScore == null || m.awayScore == null) continue;
    // 0-0 매치는 stuck 추적 안 함 (false alarm 본질적 원인)
    if (m.homeScore === 0 && m.awayScore === 0) {
      lastScore.delete(m.id);
      continue;
    }
    const scoreStr = `${m.homeScore}-${m.awayScore}`;
    const prev = lastScore.get(m.id);
    if (!prev || prev.score !== scoreStr) {
      lastScore.set(m.id, { score: scoreStr, at: now });
      continue;
    }
    const stuck = now - prev.at;
    if (stuck > STUCK_HIGH_MS) stuckHigh.push({ ...m, stuckMs: stuck });
  }

  if (stuckHigh.length > 0) {
    await notify({
      severity: "HIGH",
      title: `LIVE 점수 90분+ 변화 없음 ${stuckHigh.length}건`,
      what: describeMatches(stuckHigh),
      when: "90분+ 전부터",
      impact: "LIVE 표시인데 실제는 종료된 매치 가능 (status 누락)",
      cause: "collector 의 status 업데이트 또는 score fetch 실패",
      action: "DB Match.updatedAt + status 직접 확인 (해당 league cron)",
    });
  }

  // 메모리 청소 — 1시간 이상 안 본 matchId 제거 (LIVE 끝난 매치)
  const stale = now - 60 * 60 * 1000;
  for (const [id, prev] of lastScore) {
    if (prev.at < stale) lastScore.delete(id);
  }

  const cycleDur = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`[${tsKst()}] ◀ cycle ${cycleDur}s (mem: nullSince=${liveNullSince.size}, lastScore=${lastScore.size})`);
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작 — poll=${POLL_MS/1000}s (라이브 스코어 전담)`);
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  while (true) {
    try { await poll(); } catch (e) { console.error("poll err:", e.message); }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
}
main().catch(err => { console.error("fatal:", err); process.exit(1); });
