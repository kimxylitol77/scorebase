// ice-hockey-match-collector.js — TheSports ice_hockey match/diary → Scorebase API push
// 30분 주기. NHL 매치 자동 수집 (스케줄 + 점수).
//
// 흐름:
//   1) ice-hockey-team-id-mapping.json 로드 → tsTeamId 화이트리스트
//   2) match/diary?date=YYYYMMDD ±5일 sweep (UTC date)
//   3) unique_tournament_id 로 우리 league 분류 (NHL) + 매핑된 팀 매치만
//   4) POST {SITE_URL}/api/internal/thesports-matches (sport: ice_hockey)
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (ice-hockey-match-collector)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30min
const SWEEP_DAYS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const TEAM_MAP_FILE = path.join(__dirname, "ice-hockey-team-id-mapping.json");

// unique_tournament_id → 우리 league code. (추후 KHL/SHL 등 확장 시 추가)
const COMP_TO_LEAGUE = {
  "gx7lm78b45nq2wd": "NHL",
  "56ypq3vbxgerd7o": "IIHF_WC", // IIHF 세계선수권 (국가대표)
  // 2026-08-04 남반구 리그 — NHL 오프시즌(6~9월)에 하키 탭을 채운다.
  // ⚠️ AIHL utid 는 IIHF_WC 와 한 글자만 다르다 (x7e vs xge). 복사 시 반드시 대조할 것.
  "56ypq3vbx7erd7o": "AIHL", // 호주 (4~9월)
  "gpxwrx0bdx3ryk0": "NZIHL", // 뉴질랜드 (5~8월)
  // 2026-08-16 클럽 친선 — 유럽 리그 프리시즌(8월). KHL·SHL·스위스NL·DEL 등 249팀.
  // ⚠️ 핀란드 2부 메스티스 utid 는 `j1l4rj1bv39r7vx` 로 한 글자만 다르다 (v30 vs v39).
  "j1l4rj1bv30r7vx": "HOCKEY_FRIENDLY",
  // 2026-08-16 유럽 하키 9개 — 9월 개막. 대회명은 ts unique_tournament/list 공식값.
  "9vjxm87bywlr6od": "KHL",               // Kontinental Hockey League
  "d23xmv0b7wlrg8n": "CHL_HOCKEY",        // Champions Hockey League
  "4zp5rzyb825q82w": "LIIGA",             // Liiga (핀란드 1부)
  "l965mknbpg0m1ge": "SWISS_NL",          // National League (스위스 1부)
  "jednm95b1doryox": "CZECH_EXTRALIGA",   // Extraliga (체코 1부)
  "kdj2ry0b8x2q1zp": "SLOVAK_EXTRALIGA",  // Tipos Extraliga
  "z8yomodbn49q0j6": "DENMARK_METAL",     // Metal Ligaen
  "8yomodb7o17q0j6": "KAZAKHSTAN_CUP",    // Kazakhstan Cup
  "p4jwq2lblzyr0ve": "BELARUS_SALEI_CUP", // Salei Cup (벨라루시)
};

// TheSports ice_hockey status_id — src/lib/sports/thesports/status-codes.ts 의
// mapIceHockeyStatus 와 단일 진실 통일 (docs 표 2026-05-28).
const HOCKEY_LIVE = new Set([30, 331, 31, 332, 32, 6, 10, 8, 13, 17]);
const HOCKEY_FINISHED = new Set([100, 105, 110, 19]);
const HOCKEY_POSTPONED = new Set([14, 16]);
function mapStatus(id) {
  if (HOCKEY_FINISHED.has(id)) return "FINISHED";
  if (HOCKEY_LIVE.has(id)) return "LIVE";
  if (HOCKEY_POSTPONED.has(id)) return "POSTPONED";
  return "SCHEDULED"; // 0/1/15/99 + 미지
}

// scores: ft(정규)/p*(피리어드)/ot(연장, 정규 포함)/ap(승부치기, 연장 포함) — 전부 [home, away].
// 최종 점수 = ap ?? ot ?? ft.
function finalScore(scores) {
  if (!scores || typeof scores !== "object") return null;
  const arr = scores.ap || scores.ot || scores.ft;
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const h = parseInt(String(arr[0]), 10);
  const a = parseInt(String(arr[1]), 10);
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  return { homeScore: h, awayScore: a };
}

async function fetchDiary(ymd) {
  const { data } = await axios.get(`${TS_BASE}/v1/ice_hockey/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, date: ymd },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "ice_hockey", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  }
  return res.data;
}

function ymdUTC(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function poll() {
  const ts = new Date().toISOString();
  let teamMap;
  try {
    teamMap = JSON.parse(fs.readFileSync(TEAM_MAP_FILE, "utf-8"));
  } catch (e) {
    console.error(`[${ts}] ❌ team map load fail: ${e.message} — ice-hockey-team-id-mapping.json 필요`);
    return;
  }
  const tsIdSet = new Set(teamMap.map((t) => t.tsId));
  console.log(`[${ts}] 🏒 ice-hockey-match-collector start — ${tsIdSet.size} mapped teams`);

  const seen = new Set();
  const batch = [];
  for (const offset of SWEEP_DAYS) {
    let raw;
    try {
      raw = await fetchDiary(ymdUTC(offset));
    } catch (e) {
      console.error(`    ✗ diary offset=${offset}: ${e.message}`);
      continue;
    }
    for (const m of raw) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      // status_id=0 = ABNORMAL(Suggest Hiding) — TheSports 가 숨김 권장. 같은 경기의
      // 중복/유령 entry 인 경우가 많아 매치 생성 skip (Sweden@Slovakia 중복 사고 2026-05-28).
      if (m.status_id === 0) continue;
      if (m.status_id === 99) continue; // TBD(시간 미정) — SCHEDULED 유령 row 방지 push 제외
      const league = COMP_TO_LEAGUE[m.unique_tournament_id];
      if (!league) continue;
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!tsIdSet.has(m.home_team_id) || !tsIdSet.has(m.away_team_id)) continue;
      const status = mapStatus(m.status_id);
      let hs, as;
      if (status === "LIVE" || status === "FINISHED") {
        const sc = finalScore(m.scores);
        if (sc) { hs = sc.homeScore; as = sc.awayScore; }
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
  let totalUp = 0, totalSkip = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    try {
      const r = await postBatch(batch.slice(i, i + CHUNK));
      totalUp += r.upserted;
      totalSkip += r.skippedNoTeam;
    } catch (e) {
      console.error(`    ✗ batch ${i}: ${e.message}`);
    }
  }
  console.log(`    summary: upserted=${totalUp} skippedNoTeam=${totalSkip}`);
}

console.log(`🚀 ice-hockey-match-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
