// football-poller.js v3 — TheSports football match data 수집 → Scorebase API 로 전송
// 1분 주기.
//
// per-match fetch (회당 20매치):
//   - 모든 매칭 매치: analysis (h2h, history, goal_distribution)
//   - LIVE 매치 (coverage.mlive=1): detail_live (stats, incidents, tlive)
//   - LIVE + coverage.lineup=1 매치: lineup/detail (formation, players)
//
// delta poll (매 poll 1회씩, 전체 매치):
//   - match/team_stats/list — 직전 120s 변경된 풀타임 team stats
//   - match/player_stats/list — 직전 120s 변경된 player stats
//   - 응답 results[].id → 우리 cache 의 tsMatchId 와 매칭되는 것만 POST
//
// Rate limit 안전:
//   - per-match 최대 3회 + delta 2회 = 62회 / 1분
//   - LIVE 매치 우선 (timing 민감)
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
const MAX_MATCHES_PER_POLL = 20;

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET missing");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN missing");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// TheSports status_id 의미 (검증된 코드):
//   1 = 예정 (scheduled / not started)
//   2~7 = 진행 중 (LIVE — 전반·HT·후반·OT·PK 등)
//   8 = 종료 (finished)
//   9 = 연기
//   10 = 취소
//   11 = 중단
//   12 = 후반전 시작 전 등 (사례별)
//   13 = 무관중 등
function isLiveStatus(id) {
  return id >= 2 && id <= 7;
}

async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/football-matches-with-ts-mapping`, {
    params: { days: 2 },
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDiary() {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp: Math.floor(Date.now() / 1000) },
    timeout: 30_000,
  });
  return data.results || [];
}

async function fetchTsAnalysis(tsMatchId) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/analysis`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
      timeout: 30_000,
    });
    return data.results || null;
  } catch {
    return null;
  }
}

async function fetchTsDetailLive(tsMatchId) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/detail_live`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
      timeout: 30_000,
    });
    return data.results || null;
  } catch {
    return null;
  }
}

async function fetchTsLineup(tsMatchId) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/lineup/detail`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
      timeout: 30_000,
    });
    const r = data.results;
    // empty object 면 lineup 미제공
    return r && typeof r === "object" && Object.keys(r).length > 0 ? r : null;
  } catch {
    return null;
  }
}

// delta list endpoints (uuid 안 받음, 직전 120s 변경된 매치 list)
async function fetchTsTeamStatsList() {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/team_stats/list`, {
      params: { user: TS_USER, secret: TS_SECRET },
      timeout: 30_000,
    });
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

async function fetchTsPlayerStatsList() {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/player_stats/list`, {
      params: { user: TS_USER, secret: TS_SECRET },
      timeout: 30_000,
    });
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// match/half/team_stats/list — 직전 120s 변경된 매치의 하프타임 team stats
// 응답 구조: results[].stats = { p1: { stat_type_id: [home, away] }, p2: { ... } }
// p1 = 전반, p2 = 후반 (TheSports half-time stat 표기)
async function fetchTsHalfTeamStatsList() {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/half/team_stats/list`, {
      params: { user: TS_USER, secret: TS_SECRET },
      timeout: 30_000,
    });
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

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

async function postCache(matchId, tsMatchId, payload) {
  await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    { matchId, tsMatchId, ...payload },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
}

async function poll() {
  const ts = new Date().toISOString();
  try {
    const [ourMatches, tsDiary, tsTeamStatsList, tsPlayerStatsList, tsHalfTeamStatsList] = await Promise.all([
      fetchOurMatches(),
      fetchTsDiary(),
      fetchTsTeamStatsList(),
      fetchTsPlayerStatsList(),
      fetchTsHalfTeamStatsList(),
    ]);
    console.log(`[${ts}] ⚽ our=${ourMatches.length} | ts_diary=${tsDiary.length} | team_stats_changed=${tsTeamStatsList.length} | player_stats_changed=${tsPlayerStatsList.length} | half_team_stats_changed=${tsHalfTeamStatsList.length}`);

    // 1. 매칭
    const pairs = [];
    for (const our of ourMatches) {
      const tsMatch = matchToTsMatch(our, tsDiary);
      if (tsMatch) pairs.push({ our, ts: tsMatch });
    }
    console.log(`    매칭됨: ${pairs.length}/${ourMatches.length}`);

    // 매칭된 tsMatchId → ourMatchId 역매핑 (delta stats 처리용)
    const tsIdToOurId = new Map();
    for (const { our, ts: tsMatch } of pairs) tsIdToOurId.set(tsMatch.id, our.matchId);

    // delta stats — 매칭된 매치만 cache push
    let teamStatsPushed = 0;
    let playerStatsPushed = 0;
    for (const r of tsTeamStatsList) {
      const ourMatchId = tsIdToOurId.get(r.id);
      if (!ourMatchId || !r.stats) continue;
      try {
        await postCache(ourMatchId, r.id, { teamStats: r.stats });
        teamStatsPushed++;
      } catch (e) {
        console.error(`    ✗ teamStats matchId=${ourMatchId}: ${e.message}`);
      }
    }
    for (const r of tsPlayerStatsList) {
      const ourMatchId = tsIdToOurId.get(r.id);
      if (!ourMatchId || !r.player_stats) continue;
      try {
        await postCache(ourMatchId, r.id, { playerStats: r.player_stats });
        playerStatsPushed++;
      } catch (e) {
        console.error(`    ✗ playerStats matchId=${ourMatchId}: ${e.message}`);
      }
    }
    let halfStatsPushed = 0;
    for (const r of tsHalfTeamStatsList) {
      const ourMatchId = tsIdToOurId.get(r.id);
      // 응답 stats 필드는 stat (단수) 또는 stats (복수) 일 수 있음 — 양쪽 처리
      const payload = r.stats ?? r.stat ?? null;
      if (!ourMatchId || !payload) continue;
      try {
        await postCache(ourMatchId, r.id, { halfTeamStats: payload });
        halfStatsPushed++;
      } catch (e) {
        console.error(`    ✗ halfTeamStats matchId=${ourMatchId}: ${e.message}`);
      }
    }
    if (teamStatsPushed + playerStatsPushed + halfStatsPushed > 0) {
      console.log(`    delta cached: teamStats=${teamStatsPushed} playerStats=${playerStatsPushed} halfTeamStats=${halfStatsPushed}`);
    }

    // 2. LIVE 매치 우선 정렬 (timing 민감)
    pairs.sort((a, b) => {
      const aLive = isLiveStatus(a.ts.status_id) ? 0 : 1;
      const bLive = isLiveStatus(b.ts.status_id) ? 0 : 1;
      return aLive - bLive;
    });
    const slice = pairs.slice(0, MAX_MATCHES_PER_POLL);

    let cached = 0;
    let liveCount = 0;
    let lineupCount = 0;
    let errors = 0;

    // 3. 각 매치 처리
    for (const { our, ts: tsMatch } of slice) {
      try {
        const payload = {};

        // 모든 매치: analysis (h2h, goal_distribution)
        const analysis = await fetchTsAnalysis(tsMatch.id);
        if (analysis) payload.analysis = analysis;

        // LIVE 매치 + coverage.mlive=1: detail_live
        if (isLiveStatus(tsMatch.status_id) && tsMatch.coverage?.mlive === 1) {
          liveCount++;
          const detailLive = await fetchTsDetailLive(tsMatch.id);
          if (detailLive) payload.detailLive = detailLive;
        }

        // coverage.lineup=1: lineup/detail (예정·LIVE 매치)
        if (tsMatch.coverage?.lineup === 1) {
          const lineup = await fetchTsLineup(tsMatch.id);
          if (lineup) {
            payload.lineup = lineup;
            lineupCount++;
          }
        }

        if (Object.keys(payload).length === 0) continue;

        await postCache(our.matchId, tsMatch.id, payload);
        cached++;
      } catch (e) {
        errors++;
        console.error(`    ✗ matchId=${our.matchId}: ${e.message}`);
      }
    }

    console.log(`    summary: cached=${cached}/${slice.length}, live=${liveCount}, lineup=${lineupCount}, errors=${errors}`);
  } catch (err) {
    console.error(`[${ts}] ❌ poll error: ${err.message}`);
  }
}

console.log(`🚀 football-poller started (interval=${POLL_INTERVAL_MS}ms, max=${MAX_MATCHES_PER_POLL}/poll, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
