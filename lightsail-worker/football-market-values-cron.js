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
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const STATE = "/home/ubuntu/scorebase-worker/state/football-market-values.lastrun";
const OVERLAP_SEC = 6 * 3600; // 직전 실행과 6h 겹침 — 경계 누락 방지 (서버 upsert 라 중복 무해)
const MAX_PAGES = 200; // time 커서 전진 안전 cap (1회 1000건)
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
// time 모드는 1회 최대 1000건 → 응답 query.max_time 을 커서로 전진하며 반복.
async function fetchIncremental(sinceTs) {
  const all = [];
  let cursor = sinceTs;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data } = await axios.get(`${TS_BASE}/v1/football/player/market/list`, {
      params: { user: TS_USER, secret: TS_SECRET, time: cursor },
      timeout: 30_000,
    });
    if (data.code !== 0) throw new Error(`ts code=${data.code} cursor=${cursor}`);
    const results = Array.isArray(data.results) ? data.results : [];
    all.push(...results);
    const maxTime = Number(data.query?.max_time ?? 0);
    if (results.length < 1000 || !maxTime || maxTime <= cursor) break;
    cursor = maxTime;
    await sleep(PAGE_SLEEP_MS);
  }
  return all;
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

  const rows = await fetchIncremental(since);
  console.log(`  증분 fetch: ${rows.length}건`);

  let upserted = 0, uncovered = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const r = await postBatch(chunk);
    upserted += r.upserted ?? 0;
    uncovered += r.skippedUncovered ?? 0;
    invalid += r.skippedInvalid ?? 0;
  }
  console.log(`◀ 종료 — upserted=${upserted} uncovered=${uncovered} invalid=${invalid}`);

  writeLastRun(startedAt);
  await heartbeat({ ok: true, durationMs: Date.now() - startedAt * 1000, metadata: { fetched: rows.length, upserted, uncovered } });
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
