// basketball-match-collector.js — TheSports basketball match/diary → Scorebase API push
// 30분 주기. NBA/WNBA/KBL/WKBL/NBA_SL 매치 자동 수집 (스케줄 + 점수).
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const SWEEP_DAYS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

// --backfill=N → 일회성 광역 sweep ([-N .. +5]). 플레이오프 과거 라운드 라벨 채우기용.
const backfillArg = process.argv.slice(2).find((a) => a.startsWith("--backfill="));
const BACKFILL_DAYS = backfillArg ? parseInt(backfillArg.split("=")[1], 10) : 0;
const SWEEP =
  BACKFILL_DAYS > 0
    ? Array.from({ length: BACKFILL_DAYS + 6 }, (_, i) => i - BACKFILL_DAYS)
    : SWEEP_DAYS;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const TEAM_MAP_FILE = path.join(__dirname, "basketball-team-id-mapping.json");

// competition_id → 우리 league code
const COMP_TO_LEAGUE = {
  "49vjxm8xt4q6odg": "NBA",
  "0gx7lm73tor2wdk": "WNBA",
  "9d23xmv1t4mg8ny": "KBL",
  "kn54ql7t28rvy9d": "WKBL",
  "p3glrwyt7pqdyjv": "NBA_SL", // NBA 서머리그 (7월 한시) — 팀 tsId 는 정규 NBA 30팀과 동일, 표시 전용
};

// TheSports basketball status_id — src/lib/sports/thesports/status-codes.ts 의 mapBasketballStatus 와 단일 진실.
const BB_LIVE = new Set([2, 3, 4, 5, 6, 7, 8, 9, 11, 13]);
const BB_FINISHED = new Set([10, 14]);
function mapStatus(id) {
  if (BB_FINISHED.has(id)) return "FINISHED";
  if (BB_LIVE.has(id)) return "LIVE";
  if (id === 12) return "POSTPONED";
  return "SCHEDULED"; // 0/1/15 + 미지
}

// TheSports stage 이름 → 우리 라운드/컨퍼런스. src/lib/predict/ts-nba-playoff.ts stageToRound 와 단일 진실.
// NBA Cup(시즌 중 토너먼트)은 제외.
function stageToRound(name) {
  const h = String(name || "").trim().toLowerCase();
  if (/nba cup|cup /.test(h)) return null;
  let round = null;
  if (/1st round|first round/.test(h)) round = "FIRST_ROUND";
  else if (/semifinals|semi-finals/.test(h)) round = "CONF_SEMIS";
  else if (/^(east|west)\s+finals/.test(h)) round = "CONF_FINALS";
  else if (/^finals$/.test(h)) round = "FINALS";
  if (!round) return null;
  let conference = null;
  if (round !== "FINALS") {
    if (/east/.test(h)) conference = "EAST";
    else if (/west/.test(h)) conference = "WEST";
  }
  return { round, conference };
}

// stage/list → stage_id → {round, conference} (플레이오프 stage 만). 시즌 무관 — stage_id 가 유니크.
async function fetchStageInfo() {
  const { data } = await axios.get(`${TS_BASE}/v1/basketball/stage/list`, {
    params: { user: TS_USER, secret: TS_SECRET },
    timeout: 30_000,
  });
  const map = new Map();
  for (const s of Array.isArray(data.results) ? data.results : []) {
    if (!s || !s.id) continue;
    const info = stageToRound(s.name);
    if (info) map.set(s.id, info);
  }
  return map;
}

// diary match: home_scores/away_scores = [q1,q2,q3,q4,ot] — 합이 최종 점수.
function sumScore(arr) {
  if (!Array.isArray(arr)) return undefined;
  let s = 0;
  for (const v of arr) { const n = parseInt(String(v), 10); if (Number.isFinite(n)) s += n; }
  return s;
}

async function fetchDiary(ymd) {
  const { data } = await axios.get(`${TS_BASE}/v1/basketball/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, date: ymd },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "basketball", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  return res.data;
}

function ymdUTC(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

async function poll() {
  const ts = new Date().toISOString();
  let teamMap;
  try { teamMap = JSON.parse(fs.readFileSync(TEAM_MAP_FILE, "utf-8")); }
  catch (e) { console.error(`[${ts}] ❌ team map load fail: ${e.message}`); return; }
  const tsIdSet = new Set(teamMap.map((t) => t.tsId));
  console.log(`[${ts}] 🏀 basketball-match-collector start — ${tsIdSet.size} mapped teams (sweep=${SWEEP.length}d)`);

  // 플레이오프 stage 라벨 (NBA 브라켓용). 실패해도 매치 수집은 계속.
  let stageInfo = new Map();
  try { stageInfo = await fetchStageInfo(); }
  catch (e) { console.error(`    ✗ stage/list: ${e.message}`); }

  const seen = new Set();
  const batch = [];
  for (const offset of SWEEP) {
    let raw;
    try { raw = await fetchDiary(ymdUTC(offset)); }
    catch (e) { console.error(`    ✗ diary offset=${offset}: ${e.message}`); continue; }
    for (const m of raw) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.status_id === 0) continue; // Abnormal(suggest hiding) skip
      const league = COMP_TO_LEAGUE[m.competition_id];
      if (!league) continue;
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!tsIdSet.has(m.home_team_id) || !tsIdSet.has(m.away_team_id)) continue;
      const status = mapStatus(m.status_id);
      let hs, as;
      if (status === "LIVE" || status === "FINISHED") {
        hs = sumScore(m.home_scores);
        as = sumScore(m.away_scores);
      }
      // 플레이오프 라벨 — NBA 만. 매치의 stage_id 가 플레이오프 stage 면 라운드/컨퍼런스 부착.
      let playoffRound, playoffConference, playoffStageId;
      if (league === "NBA" && m.round && m.round.stage_id) {
        const info = stageInfo.get(m.round.stage_id);
        if (info) {
          playoffRound = info.round;
          playoffConference = info.conference; // null 가능 (FINALS)
          playoffStageId = m.round.stage_id;
        }
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
        playoffRound,
        playoffConference,
        playoffStageId,
      });
    }
  }
  const labeled = batch.filter((b) => b.playoffRound).length;
  console.log(`    수집 ${batch.length}건 (플레이오프 라벨 ${labeled}건)`);

  const CHUNK = 100;
  let totalUp = 0, totalSkip = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    try { const r = await postBatch(batch.slice(i, i + CHUNK)); totalUp += r.upserted; totalSkip += r.skippedNoTeam; }
    catch (e) { console.error(`    ✗ batch ${i}: ${e.message}`); }
  }
  console.log(`    summary: upserted=${totalUp} skippedNoTeam=${totalSkip}`);
}

if (BACKFILL_DAYS > 0) {
  console.log(`🔁 일회성 backfill sweep — ${BACKFILL_DAYS}일 back (site=${SITE_URL})`);
  poll()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e.message); process.exit(1); });
} else {
  console.log(`🚀 basketball-match-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
