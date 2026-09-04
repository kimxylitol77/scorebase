// volleyball-collector.js — TheSports volleyball match/diary → Scorebase API push
// 30분 주기. VNL(남) / AVC 네이션스컵(여) / 유럽 발리볼리그(여) 매치 자동 수집 (스케줄 + 세트 스코어).
//
// 배구 특이점 (basketball-match-collector 대비):
//   - diary 는 date= 가 아니라 tsp=(unix, KST 자정 권장) — date= 는 405
//   - competition_id 없음 → unique_tournament_id 로 대회 식별 (시즌 불변 — 2026-06-12 실측)
//   - scores.ft = [home세트, away세트] (세트 스코어가 우리 homeScore/awayScore)
//   - status: 1 시작전 / 432~440 1~5세트 / 100 종료 / 14·16 연기·취소 / 15·99 지연·TBD
//
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (volleyball-collector)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 30 * 60 * 1000;
const SWEEP_DAYS = [-3, -2, -1, 0, 1, 2, 3, 4, 5];

// --backfill=N → 일회성 광역 sweep ([-N .. +7]). 대회 개막 이전 결과 채우기용.
const backfillArg = process.argv.slice(2).find((a) => a.startsWith("--backfill="));
const BACKFILL_DAYS = backfillArg ? parseInt(backfillArg.split("=")[1], 10) : 0;
const SWEEP =
  BACKFILL_DAYS > 0
    ? Array.from({ length: BACKFILL_DAYS + 8 }, (_, i) => i - BACKFILL_DAYS)
    : SWEEP_DAYS;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const TEAM_MAP_FILE = path.join(__dirname, "volleyball-team-id-mapping.json");

// unique_tournament_id → 우리 league code (utid 는 시즌 불변 — season_id 와 달리 안정)
const UTID_TO_LEAGUE = {
  "e4wyrn3hexvm86p": "VNL",
  "yl5ergdh3wpr8k0": "VNL_W", // 여자 발리볼 네이션스리그 (2026-07-11 추가)
  "y0or58hld26rwzv": "AVC_NATIONS_W",
  "jednm9vh901qyox": "EGL_W",
  // 2026-08-01 V-리그(한국) — 10월 개막. TheSports 명칭은 "Volleyball League (Women)"
  "kn54qldhe9nrvy9": "V_LEAGUE",
  "d23xmvzhowyqg8n": "V_LEAGUE_W",
  // KOVO컵 (프리시즌, 통상 8~9월 — 2026-08-01 시점 일정 미공개, 공개 시 diary 로 자동 유입)
  "4zp5rzdh70oq82w": "KOVO_CUP",
  "j1l4rjdh12dr7vx": "KOVO_CUP_W",
  // 2026-08-16 국가대표 친선 (남/여) — 매핑된 국대끼리의 친선만 수집 (미매핑 팀 매치는 tsIdSet 필터가 skip)
  "z8yomoxhk3gm0j6": "VB_FRIENDLY",
  "56ypq3xh533qd7o": "VB_FRIENDLY_W",
  // 2026-08-16 대륙·연령별 선수권 (대회명 7m 대조 확인)
  "dn1m1nh4xzkqoep": "VB_U17_WC",
  "jw2r0nhl3d6qz84": "VB_U17_WC_W",
  "gy0or58h4onrwzv": "VB_EURO_W",
  "9k82redh967qepz": "VB_ASIAN_W",
  "965mkdh73y8r1ge": "VB_NORCECA_W",
  "p3glrwjh1n4qdyj": "VB_PANAM",
  "vjxm8lh46vlq6od": "VB_COPA_AM",
  // 2026-09-04 아시아선수권 (남) — 12개국 4개조, ts unique_tournament "Asian Championship"
  "8y39mpwh5wlqojx": "VB_ASIAN",
};

// src/lib/sports/thesports/status-codes.ts 의 mapVolleyballStatus 와 단일 진실.
const VB_LIVE = new Set([432, 434, 436, 438, 440, 17]);
const VB_FINISHED = new Set([100, 19]);
const VB_POSTPONED = new Set([14, 16]);
function mapStatus(id) {
  if (VB_FINISHED.has(id)) return "FINISHED";
  if (VB_LIVE.has(id)) return "LIVE";
  if (VB_POSTPONED.has(id)) return "POSTPONED";
  return "SCHEDULED"; // 0/1/15/99 + 미지
}

// diary 는 tsp=(KST 자정 unix) — offsetDays 의 KST 자정 timestamp
function kstMidnightTsp(offsetDays) {
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const kstMidnightUtcMs = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600_000;
  return Math.floor(kstMidnightUtcMs / 1000) + offsetDays * 86400;
}

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/volleyball/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "volleyball", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  return res.data;
}

async function poll() {
  const ts = new Date().toISOString();
  let teamMap;
  try { teamMap = JSON.parse(fs.readFileSync(TEAM_MAP_FILE, "utf-8")); }
  catch (e) { console.error(`[${ts}] ❌ team map load fail: ${e.message}`); return; }
  const tsIdSet = new Set(teamMap.map((t) => t.tsId));
  console.log(`[${ts}] 🏐 volleyball-collector start — ${tsIdSet.size} mapped teams (sweep=${SWEEP.length}d)`);

  const seen = new Set();
  const batch = [];
  for (const offset of SWEEP) {
    let raw;
    try { raw = await fetchDiary(kstMidnightTsp(offset)); }
    catch (e) { console.error(`    ✗ diary offset=${offset}: ${e.message}`); continue; }
    for (const m of raw) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.status_id === 0 || m.status_id === 99) continue; // 0=Abnormal(hide)·99=TBD(시간 미정) skip
      const league = UTID_TO_LEAGUE[m.unique_tournament_id];
      if (!league) continue;
      if (!m.home_team_id || !m.away_team_id) continue;
      if (!tsIdSet.has(m.home_team_id) || !tsIdSet.has(m.away_team_id)) continue;
      const status = mapStatus(m.status_id);
      // scores.ft = [home세트, away세트] — LIVE/FINISHED 일 때만 반영
      let hs, as;
      if (status === "LIVE" || status === "FINISHED") {
        const ft = m.scores && Array.isArray(m.scores.ft) ? m.scores.ft : null;
        if (ft && ft.length === 2) {
          const h = parseInt(String(ft[0]), 10);
          const a = parseInt(String(ft[1]), 10);
          if (Number.isFinite(h)) hs = h;
          if (Number.isFinite(a)) as = a;
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
      });
    }
  }
  console.log(`    수집 ${batch.length}건`);

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
  console.log(`🚀 volleyball-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}
