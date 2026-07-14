// 스포츠 특별 이벤트(올스타·시상식·드래프트·특별경기) 시드 캘린더를 매일 훑어
// 오늘 기준 리드타임(D-N)이 걸린 이벤트를 텔레그램으로 알린다. 놓치기 쉬운 콘텐츠 기회 방지.
//
// 흐름:
//   1) data/sports-events-seed.json 로드
//   2) 각 이벤트의 D-day 계산(KST 자정 기준) → leadDays 에 딱 걸린 것만 대상
//   3) seen.json 과 대조해 이미 보낸 (이벤트:리드) 조합은 skip
//   4) 대상 있으면 임박순으로 텔레그램 1건, 없으면 조용히 종료
//
// estimated=true 이벤트는 "(추정)" 표기 — 실제 발표 시 시드의 date 를 확정치로 수정.
//
// 환경변수(../.env 또는 ../.env.local): SITE_URL, INTERNAL_API_TOKEN
// 옵션: --dry (알림·seen 저장 없이 다가오는 이벤트 전체를 콘솔 출력)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const fs = require("fs");

const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-event-radar";
const DRY = process.argv.includes("--dry");

const SEED_PATH = path.resolve(__dirname, "../data/sports-events-seed.json");
const SEEN_PATH = path.resolve(__dirname, "event-radar.seen.json");

if (!TOKEN && !DRY) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// KST 자정 기준 YYYY-MM-DD (오늘)
function kstToday() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 두 YYYY-MM-DD 사이 달력일 차이 (b - a). KST 자정끼리 비교라 DST 무관.
function daysBetween(a, b) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const au = Date.UTC(ay, am - 1, ad);
  const bu = Date.UTC(by, bm - 1, bd);
  return Math.round((bu - au) / 86400000);
}

async function notify(payload) {
  await axios.post(
    `${SITE_URL}/api/internal/notify`,
    { source: WORKER_NAME, ...payload },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15_000 },
  );
}

// seen.json — { updatedAt, notified: { "eventId:lead": "YYYY-MM-DD" } }
function loadSeen() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
    return { notified: raw.notified || {} };
  } catch {
    return { notified: {} };
  }
}
function saveSeen(seen) {
  fs.writeFileSync(
    SEEN_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), notified: seen.notified }, null, 2),
  );
}

// D-day 라벨 (0=오늘, 그 외 D-N)
function ddayLabel(n) {
  return n === 0 ? "오늘 (D-day)" : `D-${n}`;
}

function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const today = kstToday();
  const events = Array.isArray(seed.events) ? seed.events : [];

  // 다가오는 이벤트(오늘 이후) + D-day 계산
  const upcoming = events
    .map((e) => ({ ...e, dday: daysBetween(today, e.date) }))
    .filter((e) => e.dday >= 0)
    .sort((a, b) => a.dday - b.dday);

  if (DRY) {
    console.log(`\n=== 다가오는 이벤트 (오늘 ${today} 기준) ===`);
    for (const e of upcoming) {
      const hit = (e.leadDays || []).includes(e.dday) ? "  ← 오늘 알림 대상" : "";
      const est = e.estimated ? " (추정)" : "";
      console.log(`${String(e.dday).padStart(4)}일  ${e.name}${est} [${e.sport}] ${e.date}${hit}`);
    }
    console.log(`\n[dry] 알림/seen 저장 생략`);
    return;
  }

  const seen = loadSeen();
  const due = []; // 오늘 알림 걸린 이벤트
  for (const e of upcoming) {
    if (!(e.leadDays || []).includes(e.dday)) continue;
    const key = `${e.id}:${e.dday}`;
    if (seen.notified[key]) continue; // 이미 보냄
    due.push(e);
    seen.notified[key] = today;
  }

  if (!due.length) {
    console.error(`알림 대상 이벤트 없음 (오늘 ${today}) — 종료`);
    return;
  }

  const lines = due.map((e) => {
    const est = e.estimated ? " <i>(추정)</i>" : "";
    const hint = e.hint ? ` — ${escapeHtml(e.hint)}` : "";
    return `• <b>${ddayLabel(e.dday)}</b> ${escapeHtml(e.name)}${est} [${escapeHtml(e.sport)}] ${e.date}${hint}`;
  });

  notify({
    severity: "INFO",
    title: `다가오는 스포츠 이벤트 ${due.length}건`,
    message: lines.join("\n"),
    action: "콘텐츠 준비 타이밍. 추정 날짜는 실제 발표 확인 후 시드(sports-events-seed.json) 수정",
  })
    .then(() => {
      saveSeen(seen);
      console.error(`알림 ${due.length}건 전송 완료`);
    })
    .catch((e) => {
      console.error(`❌ 알림 전송 실패: ${e.message}`);
      process.exit(1);
    });
}

try {
  main();
} catch (e) {
  console.error(`❌ event-radar 실패: ${e.stack || e.message}`);
  process.exit(1);
}
