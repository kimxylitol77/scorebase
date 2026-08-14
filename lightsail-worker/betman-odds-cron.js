// betman-odds-cron.js — Vultr systemd timer (1일 2회, KST 09:00·21:00 = UTC 00:00·12:00).
// 베트맨(스포츠토토) 프로토 승부식 배당 + 국내 투표분포 → Scorebase API POST.
// 파싱·정규화·upsert 는 서버(/api/internal/betman-odds)가. 워커는 받아서 넘기기만 한다.
//
// 배포 위치: /home/ubuntu/scorebase-worker/src/betman-odds-cron.js
// 환경변수 (/home/ubuntu/.env): SITE_URL, INTERNAL_API_TOKEN
// state 파일 없음 — 회차 목록을 매번 조회해 "발매중 + 직전 1회차" 를 받는다.
//
// 소스 메모: 로그인·키 불필요한 공개 JSON POST. G101 = 프로토 승부식.
// 응답이 회차당 ~370KB / 15초로 무겁다 → timeout 넉넉히, 회차 간 sleep.

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (betman-odds-cron)";

const BETMAN_BASE = "https://www.betman.co.kr";
const GM_ID = "G101"; // 프로토 승부식
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const PREV_ROUNDS = 1; // 발매중 회차 외에 추가로 받을 지난 회차 수 (결과 확정 반영용)
const ROUND_SLEEP_MS = 3000;

if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
// 베트맨 JS 가 항상 붙이는 필드 — 원본 동작을 그대로 따른다.
const SBM = { _sbmInfo: { debugMode: "false" } };
const BETMAN_HEADERS = {
  "Content-Type": "application/json; charset=UTF-8",
  Referer: `${BETMAN_BASE}/main/mainPage/gamebuy/gameSlip.do`,
  "X-Requested-With": "XMLHttpRequest",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function betmanPost(path, params) {
  const { data } = await axios.post(
    `${BETMAN_BASE}${path}`,
    { ...params, ...SBM },
    { headers: BETMAN_HEADERS, timeout: 120_000, maxContentLength: 50 * 1024 * 1024 },
  );
  if (typeof data !== "object" || data === null) {
    // 파라미터가 틀리면 JSON 대신 에러 HTML 페이지가 온다 — 조용히 넘어가지 않게.
    throw new Error(`betman ${path} 가 JSON 이 아닌 응답을 반환`);
  }
  return data;
}

/** 수집 대상 회차 — 발매중(SaleProgress) 전부 + 직전 PREV_ROUNDS 개. */
async function targetRounds() {
  const res = await betmanPost("/buyPsblGame/lotterySchedulesInq.do", { gmId: GM_ID });
  const list = Array.isArray(res.lotterySchedulesList) ? res.lotterySchedulesList : [];
  if (list.length === 0) throw new Error("회차 목록이 비어 있음");
  const onSale = list.filter((r) => r.saleStatus === "SaleProgress").map((r) => r.gmTs);
  // 목록은 최신순. 발매중이 아닌 것 중 앞쪽 = 직전 회차.
  const closed = list.filter((r) => r.saleStatus !== "SaleProgress").map((r) => r.gmTs);
  return [...new Set([...onSale, ...closed.slice(0, PREV_ROUNDS)])].filter((n) => Number.isFinite(n));
}

async function pushRound(gmTs) {
  const res = await betmanPost("/buyPsblGame/gameInfoInq.do", { gmId: GM_ID, gmTs });
  const rows = res.compSchedules?.datas?.length ?? 0;
  if (rows === 0) {
    console.log(`  · ${gmTs} 경기 0건 — skip`);
    return { gmTs, rows: 0, upserted: 0, skipped: 0 };
  }
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/betman-odds`,
    { gmTs, compSchedules: res.compSchedules, voteStatus: res.voteStatus ?? [] },
    { headers: SITE_HEADERS, timeout: 120_000, maxContentLength: 50 * 1024 * 1024 },
  );
  console.log(`  · ${gmTs} 경기 ${rows}건 → upserted ${data.upserted} / skipped ${data.skipped}`);
  return { gmTs, rows, upserted: data.upserted ?? 0, skipped: data.skipped ?? 0 };
}

async function heartbeat(body) {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: "vultr-betman-odds", ...body },
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch { /* silent */ }
}

async function main() {
  const startedAt = Date.now();
  console.log(`[${new Date().toISOString()}] 🚀 betman-odds-cron`);

  const rounds = await targetRounds();
  console.log(`  대상 회차: ${rounds.join(", ")}`);

  let rows = 0, upserted = 0, skipped = 0;
  for (const gmTs of rounds) {
    const r = await pushRound(gmTs);
    rows += r.rows; upserted += r.upserted; skipped += r.skipped;
    await sleep(ROUND_SLEEP_MS);
  }
  console.log(`◀ 종료 — 회차 ${rounds.length} / 행 ${rows} / upserted ${upserted} / skipped ${skipped}`);

  await heartbeat({
    ok: true,
    durationMs: Date.now() - startedAt,
    metadata: { rounds: rounds.length, rows, upserted, skipped },
  });
}

// 자가치유: 일시 순단(베트맨/Neon) 흡수용 1회 재시도. 그래도 실패면 ok:false 정밀 보고.
(async () => {
  const t0 = Date.now();
  try {
    await main();
  } catch (e) {
    console.error(`! 1차 실패: ${e.message} — 30s 후 재시도`);
    await sleep(30_000);
    try {
      await main();
    } catch (e2) {
      console.error(`! fail: ${e2.message}`);
      await heartbeat({ ok: false, durationMs: Date.now() - t0, error: String(e2.message || e2).slice(0, 380) });
      process.exit(1);
    }
  }
})();
