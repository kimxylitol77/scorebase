// football-market-values-cron.js — Lightsail systemd timer (1일 1회, KST 09:00 = UTC 00:00).
// TheSports /v1/football/player/market/list?time= 증분(updated_at 기준) → Scorebase API POST.
// league 매핑·upsert(PlayerMarketValue) 는 서버(/api/internal/football-market-values) 가.
// 몸값은 자주 안 바뀌어 1일 1회로 충분 (이적 피드는 6h 별도).
//
// 배포 위치: /home/ubuntu/scorebase-worker/src/football-market-values-cron.js
// state: /home/ubuntu/scorebase-worker/state/football-market-values.lastrun (unix seconds)
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (football-market-values-cron)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const STATE = "/home/ubuntu/scorebase-worker/state/football-market-values.lastrun";
const OVERLAP_SEC = 6 * 3600; // 직전 실행과 6h 겹침 — 경계 누락 방지 (서버 upsert 라 중복 무해)
const MAX_PAGES = 200; // time 커서 전진 안전 cap (회당 ~100건 → 1회 실행 최대 ~2만건)
const PAGE_SLEEP_MS = 600;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readLastRun() {
  try {
    const v = parseInt(fs.readFileSync(STATE, "utf8").trim(), 10);
    if (Number.isFinite(v) && v > 0) return v;
  } catch { /* first run */ }
  return Math.floor(Date.now() / 1000) - 30 * 24 * 3600; // 첫 실행: 최근 30일 (몸값 저빈도)
}

function writeLastRun(ts) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, String(ts) + "\n");
}

// ⚠️ time 과 page 를 같이 주면 API 가 page 모드(전체)로 전환됨 — page 절대 금지.
// time 모드는 응답 query.max_time 을 커서로 전진하며 반복한다.
//
// ⚠️ 페이지당 건수를 상수로 가정하지 말 것. 예전 코드는 "1회 1000건" 을 가정해
// `results.length < 1000` 이면 끝으로 봤는데, 실제 응답은 회당 ~100건(실측 100~112,
// 30일 백로그를 줘도 101건)이라 항상 1페이지에서 멈췄다. 그 상태로 커서를 now 로
// 밀어버려 안 받은 구간이 영구 소실 — 2026-07-21 빅5 몸값 재평가 웨이브를 통째로
// 놓쳤다(상위 80명 중 25명 뒤처짐). 종료 조건은 "빈 응답" 또는 "커서 전진 불가" 뿐이다.
//
// 반환 { players, cursor } — cursor 는 실제로 소화한 지점. 호출부가 이 값을 state 에
// 쓴다(다 못 걸러낸 채 now 로 점프하지 않게).
async function fetchIncremental(sinceTs) {
  const all = [];
  let cursor = sinceTs;
  let drained = false;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await axios.get(`${TS_BASE}/v1/football/player/market/list`, {
      params: { user: TS_USER, secret: TS_SECRET, time: cursor },
      timeout: 30_000,
    });
    if (data.code !== 0) throw new Error(`ts code=${data.code} cursor=${cursor}`);
    const results = Array.isArray(data.results) ? data.results : [];
    all.push(...results);
    const maxTime = Number(data.query?.max_time ?? 0);
    if (results.length === 0 || !maxTime || maxTime <= cursor) { drained = true; break; }
    cursor = maxTime;
    await sleep(PAGE_SLEEP_MS);
  }
  if (!drained) console.log(`  ⚠️ MAX_PAGES(${MAX_PAGES}) 도달 — 남은 구간은 다음 실행이 이어받는다`);
  return { players: all, cursor, drained };
}

async function postBatch(players) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/football-market-values`,
    { players },
    { headers: SITE_HEADERS, timeout: 60_000 },
  );
  return data;
}

async function heartbeat(body) {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: "lightsail-football-market-values", ...body },
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch { /* silent */ }
}

async function main() {
  const startedAt = Math.floor(Date.now() / 1000);
  const since = readLastRun() - OVERLAP_SEC;
  console.log(`[${new Date().toISOString()}] 🚀 football-market-values-cron since=${new Date(since * 1000).toISOString()}`);

  const { players: rows, cursor, drained } = await fetchIncremental(since);
  console.log(`  증분 fetch: ${rows.length}건 (커서 ${new Date(cursor * 1000).toISOString()})`);

  let upserted = 0, uncovered = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await postBatch(chunk);
    upserted += r.upserted ?? 0;
    uncovered += r.skippedUncovered ?? 0;
    invalid += r.skippedInvalid ?? 0;
  }
  console.log(`◀ 종료 — upserted=${upserted} uncovered=${uncovered} invalid=${invalid}`);

  // 다 소화했으면 now 로, 아니면 실제 소화 지점까지만 — 못 받은 구간을 건너뛰지 않게.
  writeLastRun(drained ? startedAt : cursor);
  await heartbeat({
    ok: true,
    durationMs: Date.now() - startedAt * 1000,
    metadata: { fetched: rows.length, upserted, uncovered, drained },
  });
}

// 자가치유: 일시 순단(ts API/Neon) 흡수용 1회 재시도. 그래도 실패면 ok:false 정밀 보고.
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
