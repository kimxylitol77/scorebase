// baseball-match-collector.js — TheSports baseball match/diary → Scorebase API push
// 30분 주기. KBO/NPB/MLB 매치 자동 수집.
//
// 흐름:
//   1) baseball-team-id-mapping.json 로드 → tsTeamId 화이트리스트
//   2) match/diary?tsp={t} ±2일 sweep (KST 자정 timestamp 권장)
//   3) 매핑된 팀 매치만 + competition_id 로 우리 league 분류 (KBO/NPB/MLB)
//   4) POST {SITE_URL}/api/internal/thesports-matches (Bearer auth)
//
// rate limit: 매 호출 1회 (5일 sweep = 5회/30min, 매우 안전)

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30min
// ±5일 sweep — WBC/Olympic 같은 단기 토너먼트는 일정 변동 잦음. 그 외 정규 시즌은 ±2 이면 충분.
const SWEEP_DAYS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const TEAM_MAP_FILE = path.join(__dirname, "baseball-team-id-mapping.json");

// TheSports baseball status_id — src/lib/sports/thesports/status-codes.ts 의
// mapBaseballStatus 와 단일 진실 통일 (2026-05-27 status_id=1 LIVE 오매핑 사고).
//   0, 1 = SCHEDULED (Not Started)
//   100 = FINISHED
//   2~99 = LIVE (이닝 진행)
//   400대 = LIVE (이닝/half 세부)
//   200대 = SCHEDULED
//   300대 = POSTPONED
function mapStatus(id) {
  if (id === 0 || id === 1) return "SCHEDULED";
  if (id === 100) return "FINISHED";
  if (id >= 2 && id < 100) return "LIVE";
  if (id >= 400 && id < 500) return "LIVE";
  if (id >= 200 && id < 300) return "SCHEDULED";
  if (id >= 300 && id < 400) return "POSTPONED";
  return "SCHEDULED";
}

// competition_id → 우리 league code
// 12개 야구 리그 cover (2026-05-27 9개 확장)
const COMP_TO_LEAGUE = {
  "56ypq36s0o9qd7o": "KBO",
  "9k82re4svpxqepz": "NPB",
  "z8yomoys7olq0j6": "MLB",
  // 신규 9개 — types.ts TS_BASEBALL_TOURNAMENT_ID 동일
  "gpxwrxgsgw0myk0": "CPBL",
  "yl5ergxs3k8q8k0": "WBC",
  "kjw2r06sn56rz84": "WBSC_PREMIER_12",
  "gy0or56slylmwzv": "ASIAN_GAMES_BB",
  "l5ergxsov0kq8k0": "OLYMPICS_BB",
  "p3glrw5sweerdyj": "KBO_FUTURES",
  "9dn1m16s4y2roep": "NPB_MINOR",
  "8y39mpzs3gwqojx": "CARIBBEAN_SERIES",
  "l965mk5s7x1m1ge": "LMB",
};

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "baseball", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  }
  return res.data;
}

async function poll() {
  const ts = new Date().toISOString();
  let teamMap;
  try {
    teamMap = JSON.parse(fs.readFileSync(TEAM_MAP_FILE, "utf-8"));
  } catch (e) {
    console.error(`[${ts}] ❌ team map load fail: ${e.message} — baseball-team-id-mapping.json 빌드 필요`);
    return;
  }
  const tsIdSet = new Set(teamMap.map((t) => t.tsId));
  console.log(`[${ts}] ⚾ baseball-match-collector start — ${tsIdSet.size} mapped teams`);

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
      const league = COMP_TO_LEAGUE[m.competition_id] || COMP_TO_LEAGUE[m.unique_tournament_id];
      if (!league) continue;
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!tsIdSet.has(m.home_team_id) || !tsIdSet.has(m.away_team_id)) continue;
      const status = mapStatus(m.status_id);
      // diary 응답 scores.ft = [ts_home_str, ts_away_str] — 2026-05-27 CPBL 검증 정정.
      // baseball-live.ts 의 KBO 5매치 네이버 검증과 일치 ([home, away]).
      // endpoint 가 tsHomeTeamId → our.homeTeamId 그대로 매핑하므로 swap 불필요.
      let hs, as;
      if ((status === "LIVE" || status === "FINISHED") && m.scores && Array.isArray(m.scores.ft) && m.scores.ft.length >= 2) {
        const tsHome = parseInt(String(m.scores.ft[0]), 10);
        const tsAway = parseInt(String(m.scores.ft[1]), 10);
        if (Number.isFinite(tsHome)) hs = tsHome;
        if (Number.isFinite(tsAway)) as = tsAway;
      }
      batch.push({
        league,
        tsMatchId: m.id,
        tsHomeTeamId: m.home_team_id,
        tsAwayTeamId: m.away_team_id,
        startTime: new Date((m.match_time || 0) * 1000).toISOString(),
        status,
        homeScore: hs,
        awayScore: as,
      });
    }
  }
  console.log(`    수집 ${batch.length}건`);

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

console.log(`🚀 baseball-match-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
