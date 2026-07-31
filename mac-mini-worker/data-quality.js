// data-quality.js — 봇 C. 15분 주기 데이터 품질 점검.
//
// 검출 항목:
//   1. LIVE 인데 score null (collector 멈춤 의심)
//   2. 팀명 TBD/TTBD/슬래시 (cleanup 안 된 placeholder)
//   3. 시작시각 30분+ 지났는데 SCHEDULED 인 매치 (status update 누락)
//
// 텔레그램 알림 — 사용자 친화 5요소 (무엇/언제/영향/원인/확인).

const path = require("path");
// 1. mac-mini-worker/.env 우선 (개별 봇 설정)
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
// 2. ../.env.local fallback (override X — 이미 있으면 유지)
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const { hbFail } = require("./hb-log");
const os = require("os");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-data-quality";
const POLL_MS = 15 * 60 * 1000;

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN 미설정"); process.exit(1); }
const headers = { Authorization: `Bearer ${TOKEN}` };

const TBD_PATTERN = /\b(TBD|TTBD|TBDT)\b/i;
const SLASH_PATTERN = /\//; // "Sabres/Canadiens" 같은 미정 placeholder
// 슬래시 체크는 NBA/NHL 만 — 페로 제도 합병팀 (EB/Streymur II), 한국 컵
// 합병 (NSÍ II vs EB/Streymur II in KFA_CUP) 등 실제 슬래시 팀명이
// false positive 로 잡히던 문제 해결 (2026-05-23).
const SLASH_CHECK_LEAGUES = new Set(["NBA", "NHL"]);

function tsKst() { return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }); }

async function sendHeartbeat() {
  try {
    await axios.post(`${SITE}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers, timeout: 20_000 });
  } catch (e) { hbFail(e.message); }
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
    if (TBD_PATTERN.test(h) || TBD_PATTERN.test(a)) return true;
    // 슬래시 체크는 NBA/NHL 만 — 다른 리그는 실제 합병팀명일 가능성
    if (SLASH_CHECK_LEAGUES.has(m.league) && (SLASH_PATTERN.test(h) || SLASH_PATTERN.test(a))) return true;
    return false;
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

  const contentIssues = await checkContentQuality();

  if (liveNoScore.length === 0 && tbdTeams.length === 0 && contentIssues === 0) {
    console.log("  ✓ 데이터 품질 양호");
  }
}

// 표시 품질 — "잘못된 값이 화면에 나간다" 유형. 라이브 상태 점검만으로는 안 걸린다
// (2026-07-31 일본어 잔존·선발 지표 누락을 감시봇 전체가 놓친 뒤 추가).
async function checkContentQuality() {
  let data;
  try {
    const r = await axios.get(`${SITE}/api/internal/content-quality`, { headers, timeout: 30_000 });
    data = r.data;
  } catch (e) {
    console.warn(`  content-quality fetch fail: ${e.message}`);
    return 0;
  }
  const issues = Array.isArray(data?.issues) ? data.issues : [];
  for (const it of issues) {
    await notify({
      severity: it.severity === "high" ? "HIGH" : "WARN",
      title: it.kind === "foreign_text_leak"
        ? `${it.league} 화면에 일본어 원문 노출`
        : `${it.league} 선발 지표 누락`,
      what: `${it.detail} — ${(it.samples ?? []).join(", ")}`,
      when: "현재",
      impact: it.kind === "foreign_text_leak"
        ? "한국어 사이트에 읽을 수 없는 한자·가나가 그대로 보임"
        : "선발 카드의 ERA·WHIP·사진이 '—' 로 비어 보임",
      cause: it.kind === "foreign_text_leak"
        ? "음역 사전 미등록 또는 pid 카나 사전 miss"
        : "npb.jp·MLB 소스 보강 실패 (일시 타임아웃 가능)",
      action: it.kind === "foreign_text_leak"
        ? "npb-name-dict.ts 에 등록 후 DB 정정 (표기 근거는 npb.jp 카나)"
        : "다음 회차 자동 보강 대기, 반복되면 소스 응답 확인",
    });
    console.log(`  ⚠️ ${it.kind}: ${it.detail}`);
  }
  return issues.length;
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
