// ice-hockey-poller.js — TheSports ice_hockey detail_live → Scorebase cache POST.
// 1분 주기. NHL LIVE 매치 cover.
//
// 하키는 diary/list id === detail_live id (단일 id system) → 야구 같은 team-id 매칭/swap 불필요.
//   1) /api/internal/ice-hockey-matches-with-ts-mapping → {matchId, tsMatchId} list
//   2) /v1/ice_hockey/match/detail_live → 전체 live/recent list (id, score, ...)
//   3) detail_live.id === tsMatchId 인 것만 cache POST → /api/internal/thesports-cache
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (ice-hockey-poller)";

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
  const { data } = await axios.get(`${SITE_URL}/api/internal/ice-hockey-matches-with-ts-mapping`, {
    params: { days: 2 }, headers: SITE_HEADERS, timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDetailLive() {
  const { data } = await axios.get(`${TS_BASE}/v1/ice_hockey/match/detail_live`, {
    params: { user: TS_USER, secret: TS_SECRET }, timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

// detail_live entry.score = [tsMatchId, statusId, ?, scoresObj]
// scoresObj: ft/p*/ot(연장,정규포함)/ap(승부치기,연장포함) — 전부 [home, away]. 최종 = ap ?? ot ?? ft.
// id system 일치 → swap 없음 (externalId 매핑이 home/away 방향 보존).
function extractScore(entry) {
  const arr = entry?.score;
  if (!Array.isArray(arr) || arr.length < 4) return null;
  const scores = arr[3];
  if (!scores || typeof scores !== "object") return null;
  const s = scores.ap || scores.ot || scores.ft;
  if (!Array.isArray(s) || s.length < 2) return null;
  const h = parseInt(String(s[0]), 10);
  const a = parseInt(String(s[1]), 10);
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
  try {
    ourMatches = await fetchOurMatches();
  } catch (e) {
    console.error(`[${ts}] ❌ our matches fetch fail: ${e.message}`);
    return;
  }
  if (ourMatches.length === 0) {
    console.log(`[${ts}] 🏒 no mappable NHL matches (±2d)`);
    return;
  }
  const byTsId = new Map(ourMatches.map((m) => [m.tsMatchId, m.matchId]));

  let live = [];
  try {
    live = await fetchTsDetailLive();
  } catch (e) {
    console.error(`    ✗ detail_live: ${e.message}`);
    return;
  }

  let pushed = 0;
  for (const entry of live) {
    if (!entry.id) continue;
    const matchId = byTsId.get(entry.id);
    if (!matchId) continue; // NHL 외 다른 리그/미매핑 매치 — 정상 skip
    try {
      await postCache(matchId, entry.id, entry, extractScore(entry));
      pushed++;
    } catch (e) {
      console.error(`    ✗ cache POST id=${entry.id}: ${e.message}`);
    }
  }

  console.log(`[${ts}] 🏒 our=${ourMatches.length} live=${live.length} pushed=${pushed}`);
}

async function main() {
  console.log(`[startup] ice-hockey-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
