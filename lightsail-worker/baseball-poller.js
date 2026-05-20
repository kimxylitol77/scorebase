// baseball-poller.js — TheSports baseball detail_live → Scorebase API 로 cache POST.
// 1분 주기. KBO/NPB/MLB LIVE 매치만 cover.
//
// 매핑 흐름:
//   1) Scorebase /api/internal/baseball-matches-with-ts-mapping → 우리 매치 list + tsTeamId
//   2) TheSports /v1/baseball/match/diary?tsp=now → ts 매치 list (home/away_team_id 포함)
//   3) 우리 매치 ↔ ts 매치 매핑: home/away tsTeamId 일치 + 시간 ±2h
//   4) TheSports /v1/baseball/match/detail_live → 전체 LIVE list 응답
//   5) 매칭된 ts match id 만 filter → POST /api/internal/thesports-cache
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

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/baseball-matches-with-ts-mapping`, {
    params: { days: 1 },
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchTsDetailLive() {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/match/detail_live`, {
    params: { user: TS_USER, secret: TS_SECRET },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postCache(matchId, tsMatchId, detailLive) {
  await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    { matchId, tsMatchId, detailLive },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
}

function buildMatching(ourMatches, tsMatches) {
  // 우리 매치 ↔ ts 매치 매핑: home/away tsTeamId 일치 + match_time ±2h
  const map = new Map(); // tsMatchId → our matchId
  for (const our of ourMatches) {
    const ourStart = new Date(our.startTime).getTime();
    for (const ts of tsMatches) {
      if (!ts.id || !ts.home_team_id || !ts.away_team_id || !ts.match_time) continue;
      const tsStart = ts.match_time * 1000;
      if (Math.abs(tsStart - ourStart) > 2 * 3600 * 1000) continue;
      const home = ts.home_team_id === our.home.tsTeamId && ts.away_team_id === our.away.tsTeamId;
      const swap = ts.home_team_id === our.away.tsTeamId && ts.away_team_id === our.home.tsTeamId;
      if (home || swap) {
        map.set(ts.id, our.matchId);
        break;
      }
    }
  }
  return map;
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
    console.log(`[${ts}] ⚾ no mappable matches (SCHEDULED/LIVE 24h ahead)`);
    return;
  }

  // 1) ts diary 양 옆 timestamp sweep (이전/현재/이후 1일)
  const now = Math.floor(Date.now() / 1000);
  const tsMatches = [];
  const seen = new Set();
  for (const offset of [-86400, 0, 86400]) {
    try {
      const raw = await fetchTsDiary(now + offset);
      for (const r of raw) {
        if (r.id && !seen.has(r.id)) { seen.add(r.id); tsMatches.push(r); }
      }
    } catch (e) {
      console.error(`    ✗ diary offset=${offset}: ${e.message}`);
    }
  }

  // 2) 매핑 구성
  const mapping = buildMatching(ourMatches, tsMatches);
  console.log(`[${ts}] ⚾ our=${ourMatches.length} ts-diary=${tsMatches.length} matched=${mapping.size}`);
  if (mapping.size === 0) return;

  // 3) detail_live 호출 + filter
  let live = [];
  try {
    live = await fetchTsDetailLive();
  } catch (e) {
    console.error(`    ✗ detail_live: ${e.message}`);
    return;
  }
  console.log(`    detail_live total=${live.length} entries`);

  let pushed = 0;
  for (const entry of live) {
    if (!entry.id) continue;
    const ourMatchId = mapping.get(entry.id);
    if (!ourMatchId) continue;
    try {
      await postCache(ourMatchId, entry.id, entry);
      pushed++;
    } catch (e) {
      console.error(`    ✗ cache POST id=${entry.id}: ${e.message}`);
    }
  }
  console.log(`    ✅ pushed ${pushed} cache rows`);
}

async function main() {
  console.log(`[startup] baseball-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
