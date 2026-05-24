// standings-poller.js — TheSports season/recent/table/detail → Scorebase API push
// 1시간 주기. 78개 축구 리그 (league-id-mapping.json 의 tsSeasonId 보유 리그)
//
// 흐름:
//   1) league-id-mapping.json 로드 (tsSeasonId 있는 리그만)
//   2) 각 리그마다 season/recent/table/detail?uuid={tsSeasonId} fetch
//   3) POST {SITE_URL}/api/internal/thesports-standings (Bearer auth)
//
// Rate limit: 120 req/min — 78리그 * 1 호출 = 78req → 1분 안에 끝남, 안전.
// 호출 간 250ms sleep 으로 burst 회피.
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CALL_GAP_MS = 250;

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET missing");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN missing");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// league-id-mapping.json (worker 디렉토리에 copy 되어 있어야)
const MAP_FILE = path.join(__dirname, "league-id-mapping.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchTsStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/season/recent/table/detail`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: seasonId },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`ts code=${data.code} err=${data.err ?? ""}`);
  return data.results;
}

async function postCache(league, tsSeasonId, payload) {
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-standings`,
    { league, tsSeasonId, payload },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
  // Vercel 의 404 페이지가 200 으로 반환되는 경우 false positive — body 검증.
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected response (no ok=true): ${JSON.stringify(res.data).slice(0, 100)}`);
  }
}

async function poll() {
  const ts = new Date().toISOString();
  let leagues;
  try {
    leagues = JSON.parse(fs.readFileSync(MAP_FILE, "utf-8"));
  } catch (e) {
    console.error(`[${ts}] ❌ map file load fail: ${e.message}`);
    return;
  }
  const targets = leagues.filter((l) => l.tsSeasonId);
  console.log(`[${ts}] 🏆 standings-poller start — ${targets.length} leagues`);

  let ok = 0;
  let err = 0;
  for (const l of targets) {
    try {
      const payload = await fetchTsStandings(l.tsSeasonId);
      if (!payload || !Array.isArray(payload.tables)) {
        console.warn(`  skip ${l.code} — empty payload`);
        continue;
      }
      await postCache(l.code, l.tsSeasonId, payload);
      ok++;
    } catch (e) {
      err++;
      const msg = e.response?.data?.error ?? e.response?.data?.err ?? e.message;
      console.error(`  ✗ ${l.code} (${l.tsSeasonId}): ${msg}`);
    }
    await sleep(CALL_GAP_MS);
  }
  console.log(`[${new Date().toISOString()}] summary: ok=${ok} err=${err}`);
}

console.log(`🚀 standings-poller started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
