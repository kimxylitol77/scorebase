// football-poller.js — TheSports football match analysis 수집 → Scorebase API 로 전송
// 1분 주기.
//
// 흐름:
//   1. GET /api/internal/football-matches-with-ts-mapping?days=2 — 매칭된 매치 list
//   2. TheSports /v1/football/match/diary 로 매치 list (오늘 + 내일) 받아서 ts_match_id 식별
//   3. 매칭된 매치별 /v1/football/match/analysis 호출
//   4. POST /api/internal/thesports-cache — analysis JSON 저장
//
// 매칭 알고리즘:
//   diary 매치 (home_team_id + away_team_id + match_time) ≈ 우리 매치 (home.tsTeamId + away.tsTeamId + startTime ± 1시간)
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET
//   SITE_URL (예: https://www.scorebase.kr 또는 localhost dev), INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60_000;

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET missing");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN missing");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// 우리 매치 list (매핑 hint 포함) fetch.
async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/football-matches-with-ts-mapping`, {
    params: { days: 2 },
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return data.matches || [];
}

// TheSports match/diary 응답.
async function fetchTsDiary() {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp: Math.floor(Date.now() / 1000) },
    timeout: 30_000,
  });
  return data.results || [];
}

// TheSports analysis 응답.
async function fetchTsAnalysis(tsMatchId) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/analysis`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
    timeout: 30_000,
  });
  return data.results || null;
}

// 매칭: 우리 매치 1개 ↔ ts diary 매치 list.
// 양 팀 ts_team_id + 시작 시간 ± 90분 일치.
function matchToTsMatch(our, tsDiary) {
  const ourTime = new Date(our.startTime).getTime() / 1000;
  return tsDiary.find((ts) => {
    if (ts.competition_id !== our.tsCompetitionId) return false;
    const sameTeams =
      (ts.home_team_id === our.home.tsTeamId && ts.away_team_id === our.away.tsTeamId) ||
      (ts.home_team_id === our.away.tsTeamId && ts.away_team_id === our.home.tsTeamId);
    if (!sameTeams) return false;
    const diff = Math.abs((ts.match_time || 0) - ourTime);
    return diff < 5400; // 90분
  });
}

// upsert cache.
async function postCache(matchId, tsMatchId, analysis) {
  await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    { matchId, tsMatchId, analysis },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
}

async function poll() {
  const ts = new Date().toISOString();
  try {
    const ourMatches = await fetchOurMatches();
    const tsDiary = await fetchTsDiary();
    console.log(`[${ts}] ⚽ our=${ourMatches.length} | ts_diary=${tsDiary.length}`);

    let matched = 0;
    let cached = 0;
    let skipped = 0;
    let errors = 0;

    // PoC: 처음 5개만 처리 (rate limit + 안전)
    for (const our of ourMatches.slice(0, 5)) {
      const tsMatch = matchToTsMatch(our, tsDiary);
      if (!tsMatch) {
        skipped++;
        continue;
      }
      matched++;
      try {
        const analysis = await fetchTsAnalysis(tsMatch.id);
        if (analysis) {
          await postCache(our.matchId, tsMatch.id, analysis);
          cached++;
          console.log(
            `    ✓ matchId=${our.matchId} (${our.away.name} @ ${our.home.name}) tsMatchId=${tsMatch.id}`,
          );
        }
      } catch (e) {
        errors++;
        console.error(`    ✗ matchId=${our.matchId}: ${e.message}`);
      }
    }

    console.log(`    summary: matched=${matched} cached=${cached} skipped=${skipped} errors=${errors}`);
  } catch (err) {
    console.error(`[${ts}] ❌ poll error: ${err.message}`);
  }
}

console.log(`🚀 football-poller started (interval=${POLL_INTERVAL_MS}ms, site=${SITE_URL})`);
poll(); // 즉시 1회
setInterval(poll, POLL_INTERVAL_MS);
