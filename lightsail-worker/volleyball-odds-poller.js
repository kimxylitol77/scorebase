// volleyball-odds-poller.js — TheSports `/v1/volleyball/odds/history` → Scorebase API push.
// 3분 cycle (배당 변동 느림 — 프리매치+라이브 모두 cover, ±2일 매핑 매치 대상).
// 저장은 야구와 동일 테이블/라우트 재사용 (TsBaseballOddsHistory — 구조 sport-agnostic):
//   eu = 승패 배당 [ts, home, mid(0), away, status], company 2 = bet365.
//
// 흐름:
//   1) /api/internal/volleyball-matches-with-ts-mapping?days=2 → [{matchId, tsMatchId}]
//   2) 각 tsMatchId → /v1/volleyball/odds/history?uuid=
//   3) /api/internal/save-baseball-odds 로 POST (createMany skipDuplicates)
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (volleyball-odds-poller)";

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 3 * 60_000;
const PER_CALL_DELAY_MS = 250;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchMappedMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/volleyball-matches-with-ts-mapping`, {
    params: { days: 2 },
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return Array.isArray(data.matches) ? data.matches : [];
}

async function fetchOddsHistory(tsMatchId) {
  const { data } = await axios.get(`${TS_BASE}/v1/volleyball/odds/history`, {
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
    matches = await fetchMappedMatches();
  } catch (e) {
    console.error(`[${ts}] ❌ volleyball-matches fetch fail: ${e.message}`);
    return;
  }
  if (matches.length === 0) {
    console.log(`[${ts}] 💤 no mapped volleyball matches (±2d)`);
    return;
  }

  let okMatches = 0, totalInserted = 0, oddsMissing = 0, pushFails = 0;
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
    } catch (e) {
      pushFails++;
      console.error(`    ✗ push matchId=${m.matchId}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, PER_CALL_DELAY_MS));
  }
  console.log(`[${ts}] 🏐💰 matches=${matches.length} ok=${okMatches} inserted=${totalInserted} noOdds=${oddsMissing} pushFail=${pushFails}`);
}

async function main() {
  console.log(`[startup] volleyball-odds-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
