// stale-ts-verify.js — TheSports "ts-" 매치 stale 검증 (고정 IP worker).
//
// 배경:
//   cleanup-stale-scheduled cron 은 Vercel(동적 IP)이라 TheSports(IP 화이트리스트) 호출 불가.
//   → externalId 가 "ts-" prefix 인 매치(NPB/CHILE_PB/CANADA_PL 등)는 거기서 verify 못 하고
//     매번 KEPT 로 쌓인다. 이 worker(화이트리스트 등록 고정 IP)가 대신 diary verify 한다.
//
// 흐름 (4h 주기):
//   1) heartbeat POST
//   2) GET  /api/internal/stale-ts-verify → stale ts- SCHEDULED 목록 {matchId, tsMatchId, startTimeMs, sport}
//   3) (sport, tsp=KST자정) 그룹별 /v1/{baseball|football}/match/diary 호출 (중복 tsp 캐싱)
//      → results 에서 tsMatchId 매칭 → status_id / score 추출
//   4) POST /api/internal/stale-ts-verify {results:[{matchId, found, statusId, homeScore, awayScore}]}
//      (status_id → FINISHED/POSTPONED 매핑은 서버가 mapBaseballStatus/mapFootballStatus 로 처리)
//
// 환경변수 (.env 또는 ../.env.local):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const os = require("os");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-stale-ts-verify";
const POLL_MS = 4 * 60 * 60 * 1000; // 4시간 (cleanup-stale-scheduled 와 동일 주기)

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정 — .env 확인");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

function tsKst() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

// 매치 startTime(ms) → 그 매치 KST 날짜 자정(KST)의 unix sec.
// diary 는 tsp 가 가리키는 KST 날짜 24h 매치를 반환한다 (collector 와 동일 계산).
function kstMidnightTsp(startTimeMs) {
  const kst = new Date(startTimeMs + 9 * 3600 * 1000);
  const midnightUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) -
    9 * 3600 * 1000;
  return Math.floor(midnightUtcMs / 1000);
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// diary result → {homeScore, awayScore}. sport 별 score 위치가 다름.
//   football: home_scores[0] / away_scores[0] (숫자)
//   baseball: scores.ft[0] / scores.ft[1] (문자열 → Number)
function extractScore(sport, r) {
  if (sport === "baseball") {
    const ft = r.scores && r.scores.ft;
    return { homeScore: numOrNull(ft && ft[0]), awayScore: numOrNull(ft && ft[1]) };
  }
  return {
    homeScore: numOrNull(r.home_scores && r.home_scores[0]),
    awayScore: numOrNull(r.away_scores && r.away_scores[0]),
  };
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch (e) {
    console.warn(`⚠️ heartbeat fail: ${e.message}`);
  }
}

async function fetchStaleList() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/stale-ts-verify`, {
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return Array.isArray(data.matches) ? data.matches : [];
}

async function fetchDiaryIdMap(sport, tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/${sport}/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`diary code=${data.code}`);
  const results = Array.isArray(data.results) ? data.results : [];
  return new Map(results.map((r) => [r.id, r]));
}

async function postResults(results) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/stale-ts-verify`,
    { results },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
  return data;
}

async function runOnce() {
  const t = tsKst();
  await sendHeartbeat();

  let matches = [];
  try {
    matches = await fetchStaleList();
  } catch (e) {
    console.error(`[${t}] ❌ stale 목록 fetch fail: ${e.message}`);
    return;
  }
  if (matches.length === 0) {
    console.log(`[${t}] ✓ stale ts- 매치 없음`);
    return;
  }
  console.log(`[${t}] 🔍 stale ts- ${matches.length}건 verify 시작`);

  // (sport, tsp) 그룹별 diary 1회 호출 캐싱 — 같은 날짜 매치 중복 호출 회피.
  const diaryCache = new Map();
  async function diaryFor(sport, tsp) {
    const key = `${sport}:${tsp}`;
    if (diaryCache.has(key)) return diaryCache.get(key);
    const idMap = await fetchDiaryIdMap(sport, tsp);
    diaryCache.set(key, idMap);
    return idMap;
  }

  const results = [];
  for (const m of matches) {
    const tsp = kstMidnightTsp(m.startTimeMs);
    let idMap;
    try {
      idMap = await diaryFor(m.sport, tsp);
    } catch (e) {
      // diary 호출 실패 — 이 매치는 결과에서 제외(유지) → 다음 run 재시도.
      console.error(`    ✗ diary ${m.sport} tsp=${tsp} (${m.league}): ${e.message}`);
      continue;
    }
    const hit = idMap.get(m.tsMatchId);
    if (!hit) {
      // diary 에 없음 = 취소/일정변경 → 서버가 POSTPONED 처리.
      results.push({ matchId: m.matchId, found: false });
      console.log(`    · ${m.league} ${m.tsMatchId} → diary 부재 (POSTPONED 예정)`);
      continue;
    }
    const { homeScore, awayScore } = extractScore(m.sport, hit);
    results.push({
      matchId: m.matchId,
      found: true,
      statusId: hit.status_id,
      homeScore,
      awayScore,
    });
    console.log(
      `    · ${m.league} ${m.tsMatchId} → status_id=${hit.status_id} score=${homeScore}-${awayScore}`,
    );
  }

  if (results.length === 0) {
    console.log(`[${t}] diary 호출 모두 실패 — POST skip`);
    return;
  }
  try {
    const resp = await postResults(results);
    console.log(
      `[${t}] ✅ 적용: FINISHED ${resp.finished} / POSTPONED ${resp.postponed} / KEPT ${resp.kept} / skipped ${resp.skipped}`,
    );
  } catch (e) {
    console.error(`[${t}] ❌ 결과 POST fail: ${e.message}`);
  }
}

async function main() {
  console.log(`🛰️ ${WORKER_NAME} 시작 — ${POLL_MS / 3600000}h 주기 (${tsKst()})`);
  await runOnce();
  setInterval(() => {
    runOnce().catch((e) => console.error(`runOnce error: ${e.message}`));
  }, POLL_MS);
}

main().catch((e) => {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
});
