// basketball-poller.js — TheSports basketball detail_live → Scorebase cache POST.
// 1분 주기. NBA/WNBA/KBL/WKBL LIVE 매치 cover.
//
// 농구는 diary/season id === detail_live id (단일 id system) → team-id 매칭/swap 불필요.
//   1) /api/internal/basketball-matches-with-ts-mapping → {matchId, tsMatchId}
//   2) /v1/basketball/match/detail_live → 전체 live/recent list
//   3) detail_live.id === tsMatchId 인 것만 cache POST → /api/internal/thesports-cache
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

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
  const { data } = await axios.get(`${SITE_URL}/api/internal/basketball-matches-with-ts-mapping`, {
    params: { days: 2 }, headers: SITE_HEADERS, timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDetailLive() {
  const { data } = await axios.get(`${TS_BASE}/v1/basketball/match/detail_live`, {
    params: { user: TS_USER, secret: TS_SECRET }, timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

// H2H + 양 팀 최근경기 (history.vs/home/away) + 미래 일정. 느리게 변함 → 매치당 10분 throttle.
async function fetchTsAnalysis(tsMatchId) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/basketball/match/analysis`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId }, timeout: 30_000,
    });
    return data.code === 0 ? (data.results || null) : null;
  } catch { return null; }
}
const ANALYSIS_TTL_MS = 10 * 60_000;
const lastAnalysisAt = new Map(); // tsMatchId → epoch ms

// detail_live entry.score = [id, statusId, ?, [q1,q2,q3,q4,ot]home, [q1,q2,q3,q4,ot]away]
// 최종 점수 = 각 쿼터배열 합. id system 일치 → swap 없음.
function sumArr(a) { if (!Array.isArray(a)) return null; let s=0; for (const v of a){ const n=parseInt(String(v),10); if(Number.isFinite(n)) s+=n; } return s; }
function extractScore(entry) {
  const arr = entry?.score;
  if (!Array.isArray(arr) || arr.length < 5) return null;
  const h = sumArr(arr[3]); const a = sumArr(arr[4]);
  if (h == null || a == null) return null;
  return { homeScore: h, awayScore: a };
}

async function postCache(matchId, tsMatchId, detailLive, scoreObj, extra) {
  const body = { matchId, tsMatchId, detailLive };
  if (scoreObj) { body.homeScore = scoreObj.homeScore; body.awayScore = scoreObj.awayScore; }
  if (extra) Object.assign(body, extra);
  await axios.post(`${SITE_URL}/api/internal/thesports-cache`, body, {
    headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000,
  });
}

async function poll() {
  const ts = new Date().toISOString();
  let ourMatches = [];
  try { ourMatches = await fetchOurMatches(); }
  catch (e) { console.error(`[${ts}] ❌ our matches fetch fail: ${e.message}`); return; }
  if (ourMatches.length === 0) { console.log(`[${ts}] 🏀 no mappable matches (±2d)`); return; }
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

  // analysis (H2H + 양 팀 최근경기) — live 뿐 아니라 예정 매치도 대상. 매치당 10분 throttle.
  let analysisPushed = 0;
  const now = Date.now();
  for (const m of ourMatches) {
    if (!m.tsMatchId || now - (lastAnalysisAt.get(m.tsMatchId) || 0) <= ANALYSIS_TTL_MS) continue;
    lastAnalysisAt.set(m.tsMatchId, now);
    const analysis = await fetchTsAnalysis(m.tsMatchId);
    if (!analysis) continue;
    try { await postCache(m.matchId, m.tsMatchId, undefined, undefined, { analysis }); analysisPushed++; }
    catch (e) { console.error(`    ✗ analysis POST id=${m.tsMatchId}: ${e.message}`); }
  }
  console.log(`[${ts}] 🏀 our=${ourMatches.length} live=${live.length} pushed=${pushed} analysis=${analysisPushed}`);
}

async function main() {
  console.log(`[startup] basketball-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
