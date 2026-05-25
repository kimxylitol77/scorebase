// baseball-odds-poller.js — TheSports `/v1/baseball/odds/history` → Scorebase API push.
// 60초 cycle. KBO/NPB/MLB LIVE + 시작 ±3h 매치만 cover.
//
// 흐름:
//   1) Scorebase /api/internal/baseball-live-ts-matches → [{matchId, tsMatchId}]
//   2) 각 tsMatchId 에 대해 TheSports /v1/baseball/odds/history?uuid=... fetch
//      (호출 사이 200ms 간격 — rate limit 안전)
//   3) 응답 그대로 /api/internal/save-baseball-odds 로 POST → upsert (createMany skipDuplicates)
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60_000;
const PER_CALL_DELAY_MS = 200;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchLiveMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/baseball-live-ts-matches`, {
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return Array.isArray(data.matches) ? data.matches : [];
}

async function fetchOddsHistory(tsMatchId) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/odds/history`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
    timeout: 30_000,
  });
  if (data?.code !== 0) return null;
  return data.results ?? null;
}

async function pushOdds(matchId, tsMatchId, results) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/save-baseball-odds`,
    { matchId, tsMatchId, results },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
  return data;
}

async function poll() {
  const ts = new Date().toISOString();
  let matches = [];
  try {
    matches = await fetchLiveMatches();
  } catch (e) {
    console.error(`[${ts}] ❌ live-ts-matches fetch fail: ${e.message}`);
    return;
  }
  if (matches.length === 0) {
    console.log(`[${ts}] 💤 no live ts-mapped baseball matches`);
    return;
  }

  let okMatches = 0;
  let totalInserted = 0;
  let totalRows = 0;
  let oddsMissing = 0;
  let pushFails = 0;

  for (const m of matches) {
    let results = null;
    try {
      results = await fetchOddsHistory(m.tsMatchId);
    } catch (e) {
      console.error(`    ✗ odds/history uuid=${m.tsMatchId}: ${e.message}`);
    }
    if (!results || Object.keys(results).length === 0) {
      oddsMissing++;
      await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS));
      continue;
    }
    try {
      const out = await pushOdds(m.matchId, m.tsMatchId, results);
      okMatches++;
      totalInserted += out?.inserted ?? 0;
      totalRows += out?.totalRows ?? 0;
    } catch (e) {
      pushFails++;
      console.error(`    ✗ push matchId=${m.matchId}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS));
  }

  console.log(
    `[${ts}] ⚾💰 matches=${matches.length} ok=${okMatches} noOdds=${oddsMissing} pushFail=${pushFails} inserted=${totalInserted}/${totalRows}`,
  );
}

async function main() {
  console.log(`[startup] baseball-odds-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
