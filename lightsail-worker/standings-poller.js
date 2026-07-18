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
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (standings-poller)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// 2026-05-25 Phase B: 1h → 10분 (사용자 화면 [순위] 실시간 정확).
// 89 leagues × 6/hour = 534 호출/hour = 8.9/min, TS 분당 120 한도 안. CALL_GAP 250ms
// 유지로 burst 방지.
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
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

// 야구 (KBO/NPB) — baseball season/table/detail (축구와 endpoint 다름).
// ⚠️ season_id 는 시즌마다 변경 — 매 시즌 초 /v1/baseball/season/list 에서
//   unique_tournament_id(KBO 56ypq36s0o9qd7o·NPB 9k82re4svpxqepz) + 최신 year 로 갱신.
const BASEBALL_SEASONS = [
  { code: "KBO", seasonId: "318q63s4v00qo9j" },
  { code: "NPB", seasonId: "pxwrxgsj10kmyk0" },
];

// 배구 (VNL/AVC/유럽리그) — volleyball season/table/detail. season_id 는 시즌마다 변경:
// 시즌 초 diary sweep 매치의 season_id 로 갱신 (utid: VNL e4wyrn3hexvm86p / AVC y0or58hld26rwzv / EGL jednm9vh901qyox)
const VOLLEYBALL_SEASONS = [
  { code: "VNL", seasonId: "23xmvzhkkv2qg8n" },
  { code: "VNL_W", seasonId: "zp5rzdhppydq82w" }, // 여자 발리볼 네이션스리그 (2026-07-11 추가, utid yl5ergdh3wpr8k0)
  { code: "AVC_NATIONS_W", seasonId: "dj2rydhgn9yr1zp" },
  { code: "EGL_W", seasonId: "pxwrxdhjj28myk0" },
];

async function fetchVolleyballStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/volleyball/season/table/detail`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: seasonId },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`ts code=${data.code} err=${data.err ?? ""}`);
  return data.results;
}

async function fetchBaseballStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/season/table/detail`, {
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

  // 배구 (VNL/AVC/유럽리그) — volleyball season/table/detail → 같은 postCache
  for (const v of VOLLEYBALL_SEASONS) {
    try {
      const payload = await fetchVolleyballStandings(v.seasonId);
      if (!payload || !Array.isArray(payload.tables)) {
        console.warn(`  skip ${v.code} — empty payload`);
        continue;
      }
      await postCache(v.code, v.seasonId, payload);
      ok++;
    } catch (e) {
      err++;
      const msg = e.response?.data?.error ?? e.response?.data?.err ?? e.message;
      console.error(`  ✗ ${v.code} (${v.seasonId}): ${msg}`);
    }
    await sleep(CALL_GAP_MS);
  }

  // 야구 (KBO/NPB) — baseball season/table/detail → 같은 postCache (league별 cache)
  for (const b of BASEBALL_SEASONS) {
    try {
      const payload = await fetchBaseballStandings(b.seasonId);
      if (!payload || !Array.isArray(payload.tables)) {
        console.warn(`  skip ${b.code} — empty payload`);
        continue;
      }
      await postCache(b.code, b.seasonId, payload);
      ok++;
    } catch (e) {
      err++;
      const msg = e.response?.data?.error ?? e.response?.data?.err ?? e.message;
      console.error(`  ✗ ${b.code} (${b.seasonId}): ${msg}`);
    }
    await sleep(CALL_GAP_MS);
  }

  console.log(`[${new Date().toISOString()}] summary: ok=${ok} err=${err}`);
}

console.log(`🚀 standings-poller started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
