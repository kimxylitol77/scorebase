// volleyball-poller.js — TheSports volleyball detail_live → Scorebase cache POST.
// 1분 주기. VNL/AVC/유럽리그 LIVE 매치 cover.
//
// 배구도 농구처럼 diary/detail_live 단일 id system → swap 불필요.
//   1) /api/internal/volleyball-matches-with-ts-mapping → {matchId, tsMatchId}
//   2) /v1/volleyball/match/detail_live → 전체 live/recent list
//   3) detail_live.id === tsMatchId 인 것만 cache POST → /api/internal/thesports-cache
//
// detail_live entry.score = [id, status_id, serving(1홈/2어웨이/0), {ft:[h,a]세트, p1..p5:[h,a]점수}]
//   → Match.homeScore/awayScore = ft (세트 스코어). thesports-cache 가 score[1] 로 status 동기화.
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (volleyball-poller)";

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60_000;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/volleyball-matches-with-ts-mapping`, {
    params: { days: 2 }, headers: SITE_HEADERS, timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDetailLive() {
  const { data } = await axios.get(`${TS_BASE}/v1/volleyball/match/detail_live`, {
    params: { user: TS_USER, secret: TS_SECRET }, timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

// score[3].ft = [home세트, away세트]
function extractScore(entry) {
  const arr = entry?.score;
  if (!Array.isArray(arr) || arr.length < 4) return null;
  const ft = arr[3] && Array.isArray(arr[3].ft) ? arr[3].ft : null;
  if (!ft || ft.length !== 2) return null;
  const h = parseInt(String(ft[0]), 10);
  const a = parseInt(String(ft[1]), 10);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { homeScore: h, awayScore: a };
}

async function postCache(matchId, tsMatchId, detailLive, scoreObj) {
  const body = { matchId, tsMatchId, detailLive };
  if (scoreObj) { body.homeScore = scoreObj.homeScore; body.awayScore = scoreObj.awayScore; }
  await axios.post(`${SITE_URL}/api/internal/thesports-cache`, body, {
    headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000,
  });
}

async function poll() {
  const ts = new Date().toISOString();
  let ourMatches = [];
  try { ourMatches = await fetchOurMatches(); }
  catch (e) { console.error(`[${ts}] ❌ our matches fetch fail: ${e.message}`); return; }
  if (ourMatches.length === 0) { console.log(`[${ts}] 🏐 no mappable matches (±2d)`); return; }
  const byTsId = new Map(ourMatches.map((m) => [m.tsMatchId, m.matchId]));

  let live = [];
  try { live = await fetchTsDetailLive(); }
  catch (e) { console.error(`    ✗ detail_live: ${e.message}`); return; }

  let pushed = 0;
  for (const entry of live) {
    if (!entry.id) continue;
    const matchId = byTsId.get(entry.id);
    if (!matchId) continue;
    try { await postCache(matchId, entry.id, entry, extractScore(entry)); pushed++; }
    catch (e) { console.error(`    ✗ cache POST id=${entry.id}: ${e.message}`); }
  }
  console.log(`[${ts}] 🏐 our=${ourMatches.length} live=${live.length} pushed=${pushed}`);
}

async function main() {
  console.log(`[startup] volleyball-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
