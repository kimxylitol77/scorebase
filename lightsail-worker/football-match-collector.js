// football-match-collector.js — TheSports football match/diary → Scorebase API push
// 1h 주기. 83개 매핑된 축구 리그 매치 자동 수집.
//
// 흐름:
//   1) league-id-mapping.json 로드 → ts competition_id → 우리 league code 역매핑
//   2) match/diary?tsp={t} ±2일 sweep — 매치 list (id/competition_id/teams/match_time/status_id)
//   3) 매핑된 competition 매치만 필터 + status_id → 우리 status 변환
//   4) POST {SITE_URL}/api/internal/thesports-matches (Bearer auth)
//
// rate limit: 매 호출 1회 (9일 sweep = 9회/h, 매우 안전)
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (football-match-collector)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1h
// 어제 ~ +7일 (1주일). 종전 +3 은 K리그/MLS 처럼 라운드 간격 1주일인 리그의
// 다음 라운드를 sweep edge 에서 놓치는 경우 있었음 (2026-05-27 K_LEAGUE_1+MLS
// 다음 7d SCHEDULED 0 알림 발생). 시즌 중 리그는 다음 라운드를 무조건 잡도록 +7 확장.
const SWEEP_DAYS = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const MAP_FILE = path.join(__dirname, "league-id-mapping.json");

// 이전: 60+ 리그 SKIP — 매치 중복 방지가 목적. 부작용으로 TheSportsMatchCache row 자체가
// 안 만들어져 GoalsTooltip (score hover) 가 메이저 외 리그에서 안 떴음 (2026-05-25 보고).
//
// 2026-05-25 변경: 거의 모든 리그에 대해 ts collector 가 매치 push. server endpoint
// /api/internal/thesports-matches 가 skippedDuplicate 분기에서 매치 row 는 안 만들고
// cache row + tsMatchId 만 연결 — fast-poller 가 incidents 채움. 매치 중복 X.
//
// SKIP 유지 = ts 가 incidents 데이터 부실한 국가대표/특수 대회만.
// 2026-05-29: WORLD_CUP 은 사용자 결정으로 SKIP 해제 — TheSports 스코어 병행 수집.
//   api-football(world-cup.ts) 도 유지하므로 상세 incidents 는 api-football 이 보강.
const SKIP_LEAGUES = new Set([
  "CLUB_WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL",
  "INTL_FRIENDLY", "AFCON", "CONCACAF_GOLD",
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

// home_scores/away_scores: [0]=정규시간, [5]=연장 포함 총점, [6]=승부차기(절대 합산 금지).
// 연장 경기(컵/토너먼트)는 [5]가 최종 — [0]만 쓰면 종료 후 sweep 이 라이브 중 맞게 들어간
// 연장 스코어를 정규 90분 스코어로 되덮는다 (2026-07-20 WC 결승/준결승 사고).
// src/lib/sports/thesports/football-collector.ts finalScore 와 동일 로직.
function finalScore(arr) {
  if (!Array.isArray(arr)) return undefined;
  const reg = Number(arr[0]);
  const ot = Number(arr[5]);
  if (!Number.isFinite(reg)) return undefined;
  return Number.isFinite(ot) && ot > 0 && ot >= reg ? ot : reg;
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
        homeScore: finalScore(m.home_scores),
        awayScore: finalScore(m.away_scores),
      });
    }
  }
  console.log(`    수집 ${batch.length}건 (${SWEEP_DAYS.length}일 sweep, unique)`);

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
