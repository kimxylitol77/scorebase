// football-transfers-cron.js — Lightsail systemd timer (KST 00·06·12·18 = UTC 15·21·03·09).
// TheSports /v1/football/transfer/list?time= 증분(updated_at 기준) → Scorebase API POST.
// league 매핑·upsert 는 서버(/api/internal/football-transfers)가 — 빅5 동적 + 확장 리그 사전.
//
// 배포 위치: /home/ubuntu/scorebase-worker/src/football-transfers-cron.js
// state: /home/ubuntu/scorebase-worker/state/football-transfers.lastrun (unix seconds)
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
const STATE = "/home/ubuntu/scorebase-worker/state/football-transfers.lastrun";
const OVERLAP_SEC = 3600; // 직전 실행과 1h 겹침 — 경계 누락 방지 (서버 upsert 라 중복 무해)
const MAX_PAGES = 50; // 6h 증분이 수만 건일 일 없음 — 안전 cap
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
  return Math.floor(Date.now() / 1000) - 26 * 3600; // 첫 실행: 최근 26h
}

function writeLastRun(ts) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, String(ts) + "\n");
}

async function fetchIncremental(sinceTs) {
  const all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await axios.get(`${TS_BASE}/v1/football/transfer/list`, {
      params: { user: TS_USER, secret: TS_SECRET, time: sinceTs, page },
      timeout: 30_000,
    });
    if (data.code !== 0) throw new Error(`ts code=${data.code} page=${page}`);
    const results = Array.isArray(data.results) ? data.results : [];
    all.push(...results);
    if (results.length < 1000) break; // 마지막 페이지
    await sleep(PAGE_SLEEP_MS);
  }
  return all;
}

async function postBatch(transfers) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/football-transfers`,
    { transfers },
    { headers: SITE_HEADERS, timeout: 60_000 },
  );
  return data;
}

async function heartbeat(metadata) {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: "lightsail-football-transfers", metadata },
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch { /* silent */ }
}

async function main() {
  const startedAt = Math.floor(Date.now() / 1000);
  const since = readLastRun() - OVERLAP_SEC;
  console.log(`[${new Date().toISOString()}] 🚀 football-transfers-cron since=${new Date(since * 1000).toISOString()}`);

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
  await heartbeat({ fetched: rows.length, upserted, uncovered });
}

main().catch(async (e) => {
  console.error(`! fail: ${e.message}`);
  // 실패 시 lastrun 갱신 안 함 — 다음 회차가 같은 윈도우 재시도
  process.exit(1);
});
