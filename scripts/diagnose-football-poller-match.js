// scripts/diagnose-football-poller-match.js
// football-poller 매칭 실패 진단 — 어떤 매치가 어떤 사유로 ts_diary 매칭 실패하는지 dump.
//
// 사용:
//   node scripts/diagnose-football-poller-match.js
//
// 환경변수: .env.local (THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN)
//
// 분류:
//   a. NO_COMPETITION_IN_DIARY — ts_diary 에 그 competition_id 매치가 0개 (마이너 리그 미커버 가능)
//   b. NO_TEAM_MATCH — competition 은 있는데 home/away ts_id 쌍이 안 맞음 (mapping outdated 가능)
//   c. TIME_DRIFT — team/competition 다 맞는데 시간 차 > 5400s
//   d. SHOULD_MATCH — 코드상 매칭돼야 함 (버그)

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

if (!TS_USER || !TS_SECRET || !TOKEN) {
  console.error("env missing: THESPORTS_USER / THESPORTS_SECRET / INTERNAL_API_TOKEN");
  process.exit(1);
}

async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/football-matches-with-ts-mapping`, {
    params: { days: 2 },
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30_000,
  });
  return data.matches || [];
}

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
  let perTspCount = [];
  for (const res of responses) {
    if (res.status !== "fulfilled") {
      perTspCount.push(`error:${res.reason?.message ?? "?"}`);
      continue;
    }
    const results = res.value?.data?.results || [];
    perTspCount.push(results.length);
    for (const r of results) {
      if (r?.id && !byId.has(r.id)) byId.set(r.id, r);
    }
  }
  return { matches: [...byId.values()], perTspCount };
}

function classify(our, tsDiary) {
  const ourTime = new Date(our.startTime).getTime() / 1000;
  // (a) competition 자체 없음
  const sameCompetition = tsDiary.filter((ts) => ts.competition_id === our.tsCompetitionId);
  if (sameCompetition.length === 0) return { reason: "NO_COMPETITION_IN_DIARY", candidates: [] };

  // (b) team match 없음
  const sameTeams = sameCompetition.filter(
    (ts) =>
      (ts.home_team_id === our.home.tsTeamId && ts.away_team_id === our.away.tsTeamId) ||
      (ts.home_team_id === our.away.tsTeamId && ts.away_team_id === our.home.tsTeamId),
  );
  if (sameTeams.length === 0) {
    // ts side 의 후보 team_id list 일부 dump (mapping 진단용)
    const candTeamIds = new Set();
    for (const ts of sameCompetition.slice(0, 30)) {
      candTeamIds.add(ts.home_team_id);
      candTeamIds.add(ts.away_team_id);
    }
    return {
      reason: "NO_TEAM_MATCH",
      ourTsHome: our.home.tsTeamId,
      ourTsAway: our.away.tsTeamId,
      compMatchCount: sameCompetition.length,
      candTeamIds: [...candTeamIds].slice(0, 12),
    };
  }

  // (c) time drift
  const drifts = sameTeams.map((ts) => Math.abs((ts.match_time || 0) - ourTime));
  const minDrift = Math.min(...drifts);
  if (minDrift >= 5400) {
    return { reason: "TIME_DRIFT", minDriftSec: minDrift };
  }
  return { reason: "SHOULD_MATCH" }; // 버그
}

const STRICT_WINDOW_SEC = 9000;
const FALLBACK_WINDOW_SEC = 5400;

function matchStrict(our, tsDiary) {
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

function matchFallback(our, tsDiary) {
  if (!our.home.tsTeamId || !our.away.tsTeamId) return null;
  const ourTime = new Date(our.startTime).getTime() / 1000;
  const ourTeamSet = new Set([our.home.tsTeamId, our.away.tsTeamId]);
  const cands = tsDiary.filter((ts) => {
    if (ts.competition_id !== our.tsCompetitionId) return false;
    const hit = ourTeamSet.has(ts.home_team_id) || ourTeamSet.has(ts.away_team_id);
    if (!hit) return false;
    const diff = Math.abs((ts.match_time || 0) - ourTime);
    return diff < FALLBACK_WINDOW_SEC;
  });
  return cands.length === 1 ? cands[0] : null;
}

(async () => {
  const [our, tsDiaryRes] = await Promise.all([fetchOurMatches(), fetchTsDiary()]);
  const tsDiary = tsDiaryRes.matches;
  console.log(`our=${our.length} | ts_diary_unique=${tsDiary.length} | per_tsp=${JSON.stringify(tsDiaryRes.perTspCount)}\n`);

  const unmatched = [];
  let strictMatched = 0;
  let fallbackMatched = 0;
  for (const m of our) {
    if (matchStrict(m, tsDiary)) {
      strictMatched++;
      continue;
    }
    if (matchFallback(m, tsDiary)) {
      fallbackMatched++;
      continue;
    }
    const cls = classify(m, tsDiary);
    unmatched.push({ ...m, _cls: cls });
  }
  const total = strictMatched + fallbackMatched;
  console.log(`매칭됨 합계: ${total}/${our.length} (strict=${strictMatched}, fallback=${fallbackMatched})\n`);

  // 리그별 누락
  const byLeague = new Map();
  const byReason = new Map();
  for (const u of unmatched) {
    const lg = u.league;
    const reason = u._cls.reason;
    byLeague.set(lg, (byLeague.get(lg) || 0) + 1);
    byReason.set(reason, (byReason.get(reason) || 0) + 1);
  }
  console.log("=== 사유별 ===");
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${n}`);
  }
  console.log("\n=== 리그별 누락 (top 15) ===");
  for (const [lg, n] of [...byLeague.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${lg}: ${n}`);
  }

  // 사유별 예시 dump
  console.log("\n=== 사유별 예시 (각 reason 마다 3건) ===");
  const reasonGroups = new Map();
  for (const u of unmatched) {
    const arr = reasonGroups.get(u._cls.reason) || [];
    if (arr.length < 3) arr.push(u);
    reasonGroups.set(u._cls.reason, arr);
  }
  for (const [reason, arr] of reasonGroups) {
    console.log(`\n[${reason}]`);
    for (const u of arr) {
      const home = `${u.home.name}(${u.home.tsTeamId})`;
      const away = `${u.away.name}(${u.away.tsTeamId})`;
      console.log(`  ${u.league} | ${u.startTime} | matchId=${u.matchId} ${home} vs ${away} | tsComp=${u.tsCompetitionId}`);
      console.log(`    detail: ${JSON.stringify(u._cls)}`);
    }
  }
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
