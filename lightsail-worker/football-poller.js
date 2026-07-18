// football-poller.js v3 — TheSports football match data 수집 → Scorebase API 로 전송
// 1분 주기.
//
// per-match fetch (회당 20매치):
//   - 모든 매칭 매치: analysis (h2h, history, goal_distribution)
//   - LIVE 매치 (coverage.mlive=1): detail_live (stats, incidents, tlive)
//   - LIVE + coverage.lineup=1 매치: lineup/detail (formation, players)
//   - LIVE/종료 매치 (status_id 2~8): trend/detail (momentum 분당 값)
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
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (football-poller)";

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// detail_live (score/incidents/stats/tlive) 는 football-fast-poller (2s cycle) 가 담당.
// 이 worker 는 analysis/lineup 등 느린 데이터만 5분 cycle 로 갱신.
const POLL_INTERVAL_MS = 5 * 60_000;
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

// TheSports diary 는 tsp 기준 KST 자정 ± 윈도우의 매치만 반환한다.
// 종료 직후 매치는 다음 KST 자정 이후엔 어제 tsp 의 diary 에서만 보이므로
// [-1day, 0, +1day] 3개 tsp 의 results 를 합쳐 dedup 한다.
async function fetchTsDiary() {
  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86_400;
  const tsps = [nowSec - DAY, nowSec, nowSec + DAY];
  const responses = await Promise.allSettled(
    tsps.map((tsp) =>
      axios.get(`${TS_BASE}/v1/football/match/diary`, {
        params: { user: TS_USER, secret: TS_SECRET, tsp },
        timeout: 30_000,
      }),
    ),
  );
  const byId = new Map();
  for (const res of responses) {
    if (res.status !== "fulfilled") continue;
    const results = res.value?.data?.results || [];
    for (const r of results) {
      if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
    }
  }
  return [...byId.values()];
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

// match/trend/detail — momentum 1분 단위 값 (-100~+100). LIVE + 종료 모두 의미 있음.
// 응답: { count, per, data: [[전반 분당 값들], [후반 분당 값들]] }
async function fetchTsTrend(tsMatchId) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/trend/detail`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
      timeout: 30_000,
    });
    const r = data.results;
    if (!r || !Array.isArray(r.data) || r.data.length === 0) return null;
    return r;
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

// match/half/team_stats/detail — uuid 로 특정 매치 전/후반 통계 (영구 조회).
// list(delta) 는 5분 poll 이 120s 변경 윈도우를 놓쳐 종료 매치 0건 → detail 로 보강.
// 응답: results = { ft:{...}, p1:{stat_id:[home,away]}, p2:{...}, o1, o2 } (p1=전반, p2=후반)
async function fetchTsHalfTeamStatsDetail(uuid) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/half/team_stats/detail`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid },
      timeout: 30_000,
    });
    if (!data || data.code !== 0 || !data.results) return null;
    return Object.keys(data.results).length > 0 ? data.results : null;
  } catch {
    return null;
  }
}

// match/team_stats/detail — uuid 로 풀타임 팀 통계 (영구 조회).
// list(delta) 가 5분 poll 의 120s 윈도우를 놓쳐 적재율 낮던 문제 → detail 로 보강.
// 응답: results = [home, away] (named fields: ball_possession, shots, corner_kicks ...)
async function fetchTsTeamStatsDetail(uuid) {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/team_stats/detail`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid },
      timeout: 30_000,
    });
    if (!data || data.code !== 0 || !Array.isArray(data.results) || data.results.length < 2) return null;
    return data.results;
  } catch {
    return null;
  }
}

// 두 단계 매칭:
//   strict: competition + 양 팀 ts_id 정확 일치 + ±150분 (시간대 30분~1시간 오프셋 흡수)
//   fallback: competition + 한쪽 team_id 만 일치 + ±90분 윈도우, 후보가 unique 일 때만
//   fallback 은 ts side 에서 한쪽 팀의 ts_team_id 가 시즌 새로 발급된 경우를 흡수
//   (시즌마다 ts team id 새로 발급 — feedback_ts_team_id_seasonal 패턴)
const STRICT_WINDOW_SEC = 9000; // ±150분
const FALLBACK_WINDOW_SEC = 5400; // ±90분 (보수적)

function matchToTsMatchStrict(our, tsDiary) {
  const ourTime = new Date(our.startTime).getTime() / 1000;
  return tsDiary.find((ts) => {
    if (ts.competition_id !== our.tsCompetitionId) return false;
    const sameTeams =
      (ts.home_team_id === our.home.tsTeamId && ts.away_team_id === our.away.tsTeamId) ||
      (ts.home_team_id === our.away.tsTeamId && ts.away_team_id === our.home.tsTeamId);
    if (!sameTeams) return false;
    const diff = Math.abs((ts.match_time || 0) - ourTime);
    return diff < STRICT_WINDOW_SEC;
  });
}

function matchToTsMatchFallback(our, tsDiary) {
  if (!our.home.tsTeamId || !our.away.tsTeamId) return null;
  const ourTime = new Date(our.startTime).getTime() / 1000;
  const ourTeamSet = new Set([our.home.tsTeamId, our.away.tsTeamId]);
  const candidates = tsDiary.filter((ts) => {
    if (ts.competition_id !== our.tsCompetitionId) return false;
    const hit = ourTeamSet.has(ts.home_team_id) || ourTeamSet.has(ts.away_team_id);
    if (!hit) return false;
    const diff = Math.abs((ts.match_time || 0) - ourTime);
    return diff < FALLBACK_WINDOW_SEC;
  });
  if (candidates.length !== 1) return null; // unique 일 때만 안전하게 채택
  const cand = candidates[0];
  // outdated team_id 정보 추출 (mapping audit log 용)
  const ourHas = (id) => ourTeamSet.has(id);
  const outdated = [];
  if (!ourHas(cand.home_team_id)) outdated.push({ side: "home", tsId: cand.home_team_id, ourName: ourTeamSet.has(our.home.tsTeamId) ? null : our.home.name });
  if (!ourHas(cand.away_team_id)) outdated.push({ side: "away", tsId: cand.away_team_id, ourName: ourTeamSet.has(our.away.tsTeamId) ? null : our.away.name });
  return { tsMatch: cand, outdated };
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

    // 1. 매칭 — strict 먼저, 실패 시 fallback (한쪽 team_id 만 일치 + unique)
    const pairs = [];
    let strictCount = 0;
    let fallbackCount = 0;
    const outdatedTeamLog = [];
    for (const our of ourMatches) {
      const strict = matchToTsMatchStrict(our, tsDiary);
      if (strict) {
        pairs.push({ our, ts: strict });
        strictCount++;
        continue;
      }
      const fb = matchToTsMatchFallback(our, tsDiary);
      if (fb) {
        pairs.push({ our, ts: fb.tsMatch });
        fallbackCount++;
        if (fb.outdated.length > 0) {
          outdatedTeamLog.push({
            league: our.league,
            matchId: our.matchId,
            home: { name: our.home.name, ourTsId: our.home.tsTeamId },
            away: { name: our.away.name, ourTsId: our.away.tsTeamId },
            tsMatch: { home_team_id: fb.tsMatch.home_team_id, away_team_id: fb.tsMatch.away_team_id },
            outdated: fb.outdated,
          });
        }
      }
    }
    console.log(`    매칭됨: ${pairs.length}/${ourMatches.length} (strict=${strictCount}, fallback=${fallbackCount})`);
    if (outdatedTeamLog.length > 0) {
      console.log(`    ⚠ outdated ts_team_id 의심 (mapping audit 필요): ${outdatedTeamLog.length}건`);
      for (const o of outdatedTeamLog.slice(0, 5)) {
        console.log(`      ${o.league} matchId=${o.matchId} ${o.home.name}(${o.home.ourTsId}) vs ${o.away.name}(${o.away.ourTsId}) → ts ${o.tsMatch.home_team_id} vs ${o.tsMatch.away_team_id}`);
      }
    }

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
    let lineupCount = 0;
    let errors = 0;

    // 3. 각 매치 처리
    for (const { our, ts: tsMatch } of slice) {
      try {
        const payload = {};

        // 모든 매치: analysis (h2h, goal_distribution)
        const analysis = await fetchTsAnalysis(tsMatch.id);
        if (analysis) payload.analysis = analysis;

        // detail_live (score/incidents/stats/tlive) 는 football-fast-poller 가 2초 cycle 로 담당 — 여기서 제거.

        // coverage.lineup=1: lineup/detail (예정·LIVE 매치)
        if (tsMatch.coverage?.lineup === 1) {
          const lineup = await fetchTsLineup(tsMatch.id);
          if (lineup) {
            payload.lineup = lineup;
            lineupCount++;
          }
        }

        // trend: LIVE 또는 종료 매치만 (예정 매치는 데이터 없음).
        // status_id 2~8 = 진행 중 또는 종료.
        if (tsMatch.status_id >= 2 && tsMatch.status_id <= 8) {
          const trend = await fetchTsTrend(tsMatch.id);
          if (trend) payload.trend = trend;
        }

        // team stats (풀타임) + half-time team stats (전/후반): status_id 2~8 (라이브~종료).
        // detail 은 uuid 직접 조회라 list(delta 누락) 와 달리 종료 매치도 채움.
        if (tsMatch.status_id >= 2 && tsMatch.status_id <= 8) {
          const teamStats = await fetchTsTeamStatsDetail(tsMatch.id);
          if (teamStats) payload.teamStats = teamStats;
          const halfStats = await fetchTsHalfTeamStatsDetail(tsMatch.id);
          if (halfStats) payload.halfTeamStats = halfStats;
        }

        if (Object.keys(payload).length === 0) continue;

        await postCache(our.matchId, tsMatch.id, payload);
        cached++;
      } catch (e) {
        errors++;
        console.error(`    ✗ matchId=${our.matchId}: ${e.message}`);
      }
    }

    console.log(`    summary: cached=${cached}/${slice.length}, lineup=${lineupCount}, errors=${errors}`);
  } catch (err) {
    console.error(`[${ts}] ❌ poll error: ${err.message}`);
  }
}

console.log(`🚀 football-poller started (interval=${POLL_INTERVAL_MS}ms, max=${MAX_MATCHES_PER_POLL}/poll, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
