// data-quality.js — 봇 C. 15분 주기 데이터 품질 점검.
//
// 검출 항목:
//   1. LIVE 인데 score null (collector 멈춤 의심)
//   2. 팀명 TBD/TTBD/슬래시 (cleanup 안 된 placeholder)
//   3. 시작시각 30분+ 지났는데 SCHEDULED 인 매치 (status update 누락)
//
// 텔레그램 알림 — 사용자 친화 5요소 (무엇/언제/영향/원인/확인).

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env.local") });
require("dotenv").config(); // mac-mini-worker/.env 도 (override)

const axios = require("axios");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-data-quality";
const POLL_MS = 15 * 60 * 1000;

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
const headers = { Authorization: `Bearer ${TOKEN}` };

const TBD_PATTERN = /\b(TBD|TTBD|TBDT)\b/i;
const SLASH_PATTERN = /\//; // "Sabres/Canadiens" 같은 미정 placeholder

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

async function fetchLiveScores() {
  const { data } = await axios.get(`${SITE}/api/live/scores`, { timeout: 30_000 });
  return Array.isArray(data?.matches) ? data.matches : [];
}

function describeMatches(matches, max = 3) {
  return matches.slice(0, max).map(m =>
    `${m.awayName ?? m.away?.name ?? "?"} vs ${m.homeName ?? m.home?.name ?? "?"} (${m.league ?? "?"})`
  ).join(" / ") + (matches.length > max ? ` 외 ${matches.length - max}건` : "");
}

async function poll() {
  console.log(`\n[${tsKst()}] ▶ data-quality poll`);
  await sendHeartbeat();

  let matches;
  try { matches = await fetchLiveScores(); }
  catch (e) { console.error(`live-scores fetch fail: ${e.message}`); return; }
  console.log(`  매치 수: ${matches.length}`);

  const now = Date.now();
  const liveNoScore = matches.filter(m =>
    (m.statusLabel?.includes("'") || /Q\d|Inning|HT|BT|LIVE/i.test(m.statusLabel ?? "")) &&
    (m.homeScore == null || m.awayScore == null)
  );

  const tbdTeams = matches.filter(m => {
    const h = m.homeName ?? "";
    const a = m.awayName ?? "";
    return TBD_PATTERN.test(h) || TBD_PATTERN.test(a) || SLASH_PATTERN.test(h) || SLASH_PATTERN.test(a);
  });

  // 시작시각 30분+ 지났는데 라이브 표시 안 됨 (SCHEDULED) — statusLabel 로 판단 어려움.
  // /api/live/scores 가 라이브만 반환할 수도 있어 이 항목은 skip.
  // (별도 endpoint 필요 시 후속 PR)

  // ── 알림
  if (liveNoScore.length > 0) {
    await notify({
      severity: "HIGH",
      title: `라이브 매치 ${liveNoScore.length}개 점수 누락`,
      what: describeMatches(liveNoScore),
      when: "현재",
      impact: "방문자가 라이브 점수를 못 봄",
      cause: "collector cron 멈춤 또는 score 필드 null 누수",
      action: "Vercel cron 로그 (live-recap, collect) + 매치 DB row 확인",
    });
    console.log(`  ⚠️ LIVE null score: ${liveNoScore.length}건`);
  }

  if (tbdTeams.length > 0) {
    await notify({
      severity: "WARN",
      title: `미정 팀명 매치 ${tbdTeams.length}개`,
      what: describeMatches(tbdTeams),
      when: "현재",
      impact: "사이트에 '[미정]' 또는 깨진 팀명 노출",
      cause: "NBA/NHL 플레이오프 다음 라운드 placeholder + cleanup 누락",
      action: "scripts/_cleanup-duplicate-matches.ts 또는 _inspect-* 실행",
    });
    console.log(`  ⚠️ TBD 팀명: ${tbdTeams.length}건`);
  }

  if (liveNoScore.length === 0 && tbdTeams.length === 0) {
    console.log("  ✓ 데이터 품질 양호");
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
