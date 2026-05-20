// football-match-collector.js — TheSports football match/diary → Scorebase API push
// 1h 주기. 83개 매핑된 축구 리그 매치 자동 수집.
//
// 흐름:
//   1) league-id-mapping.json 로드 → ts competition_id → 우리 league code 역매핑
//   2) match/diary?tsp={t} ±2일 sweep — 매치 list (id/competition_id/teams/match_time/status_id)
//   3) 매핑된 competition 매치만 필터 + status_id → 우리 status 변환
//   4) POST {SITE_URL}/api/internal/thesports-matches (Bearer auth)
//
// rate limit: 매 호출 1회 (5일 sweep = 5회/h, 매우 안전)
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
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1h
const SWEEP_DAYS = [-1, 0, 1, 2, 3]; // 어제 ~ 3일 후

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const MAP_FILE = path.join(__dirname, "league-id-mapping.json");

// 기존 source (ESPN / api-football) 가 충분히 cover 하는 리그 — TheSports duplicate 회피.
// minor 리그 (cyprus/iceland/venezuela/vietnam/...) 만 ts collector 가 push.
const SKIP_LEAGUES = new Set([
  // 메이저 6
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS",
  // 컨티넨탈 컵
  "UCL", "UEL", "UECL",
  "AFC_CL", "AFC_CL_TWO", "AFC_U23",
  "WORLD_CUP", "CLUB_WORLD_CUP",
  "COPA_LIB", "COPA_SUD",
  // 영국 2부 + 메이저 2부 (api-football)
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  // 아시아 (api-football)
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "SAUDI_PL",
  // 기타 메이저
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG",
]);

// TheSports football status_id (검증):
//   1 = scheduled, 2~7 = LIVE 단계, 8 = finished, 9 = postponed, 10 = cancelled, 11 = interrupted
function mapStatus(id) {
  if (id === 1) return "SCHEDULED";
  if (id >= 2 && id <= 7) return "LIVE";
  if (id === 8) return "FINISHED";
  if (id === 9 || id === 10 || id === 11) return "POSTPONED";
  return "SCHEDULED";
}

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "football", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  }
  return res.data;
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
  const compToCode = new Map();
  for (const l of leagues) compToCode.set(l.tsId, l.code);
  console.log(`[${ts}] ⚽ football-match-collector start — ${compToCode.size} mapped competitions`);

  const seen = new Set();
  const batch = [];
  for (const offset of SWEEP_DAYS) {
    const tsp = Math.floor(Date.now() / 1000) + offset * 86400;
    let raw;
    try {
      raw = await fetchDiary(tsp);
    } catch (e) {
      console.error(`    ✗ diary offset=${offset}: ${e.message}`);
      continue;
    }
    for (const m of raw) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      const ourLeague = compToCode.get(m.competition_id);
      if (!ourLeague) continue; // 우리 매핑 없는 리그
      if (SKIP_LEAGUES.has(ourLeague)) continue; // ESPN/api-football 이 cover — duplicate 회피
      if (!m.home_team_id || !m.away_team_id) continue;
      batch.push({
        league: ourLeague,
        tsMatchId: m.id,
        tsHomeTeamId: m.home_team_id,
        tsAwayTeamId: m.away_team_id,
        startTime: new Date((m.match_time || 0) * 1000).toISOString(),
        status: mapStatus(m.status_id),
        homeScore: Array.isArray(m.home_scores) ? m.home_scores[0] : undefined,
        awayScore: Array.isArray(m.away_scores) ? m.away_scores[0] : undefined,
      });
    }
  }
  console.log(`    수집 ${batch.length}건 (5일 sweep, unique)`);

  // 100건씩 분할 POST
  const CHUNK = 100;
  let totalUp = 0;
  let totalSkip = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    try {
      const r = await postBatch(slice);
      totalUp += r.upserted;
      totalSkip += r.skippedNoTeam;
    } catch (e) {
      console.error(`    ✗ batch ${i}: ${e.message}`);
    }
  }
  console.log(`    summary: upserted=${totalUp} skippedNoTeam=${totalSkip}`);
}

console.log(`🚀 football-match-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
