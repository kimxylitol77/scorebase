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
//   3) (sport, tsp=KST자정) 그룹별 /v1/{baseball|football|ice_hockey}/match/diary 호출 (중복 tsp 캐싱)
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
const { hbFail } = require("./hb-log");
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
//   football: home_scores[0]=정규시간, [5]=연장 포함 총점, [6]=승부차기(합산 금지)
//   baseball·ice_hockey: scores.ft[0] / scores.ft[1] (문자열 → Number)
// 축구 연장 경기는 [5]가 최종 — [0]만 읽으면 연장 경기 검증이 정규 스코어로 통과되는
// 사각지대 (2026-07-20 WC 결승/준결승 사고, football-collector.ts finalScore 와 동일 로직).
function footballFinal(arr) {
  if (!Array.isArray(arr)) return null;
  const reg = numOrNull(arr[0]);
  const ot = numOrNull(arr[5]);
  if (reg == null) return null;
  return ot != null && ot > 0 && ot >= reg ? ot : reg;
}

function extractScore(sport, r) {
  // 하키 diary 의 score 는 야구와 같은 scores.ft[0]/[1] (2026-08-19 실측). 축구만 home_scores 배열.
  if (sport === "baseball" || sport === "ice_hockey") {
    const ft = r.scores && r.scores.ft;
    return { homeScore: numOrNull(ft && ft[0]), awayScore: numOrNull(ft && ft[1]) };
  }
  return {
    homeScore: footballFinal(r.home_scores),
    awayScore: footballFinal(r.away_scores),
  };
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname() } },
      { headers: SITE_HEADERS, timeout: 20_000 },
    );
  } catch (e) {
    hbFail(e.message);
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

// diary 에 없을 때의 2차 확인 — uuid 로 그 매치 1건만 조회해 현재 match_time 을 본다.
//   diary 는 "그 날짜에 있는 경기" 목록이라, 경기가 다른 날로 옮겨가면 부재로만 보이고
//   연기인지 일정이동인지 구분이 안 된다. 그대로 POSTPONED 로 굳히면 실제로는 열릴 경기가
//   "연기" 로 남는다 (2026-08-02 GUATEMALA_LN #3931545 — 8/2 → 8/19 이동인데 KEPT/연기 후보).
//   ⚠️ recent/list 는 football 만 인가됨 (baseball 은 "URL is not authorized") → 축구 전용.
async function fetchRescheduledTs(sport, tsMatchId) {
  if (sport !== "football") return null;
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/recent/list`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
      timeout: 30_000,
    });
    if (data.code !== 0) return null;
    const r = Array.isArray(data.results) ? data.results[0] : null;
    if (!r || r.id !== tsMatchId) return null;
    return { matchTime: numOrNull(r.match_time), statusId: numOrNull(r.status_id) };
  } catch {
    return null;
  }
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
      // diary 에 없음 — 연기인지 일정이동인지 uuid 조회로 가른다(축구만 인가).
      const re = await fetchRescheduledTs(m.sport, m.tsMatchId);
      const movedTo = re && re.matchTime != null && re.matchTime * 1000 !== m.startTimeMs ? re.matchTime : null;
      results.push({ matchId: m.matchId, found: false, rescheduledTo: movedTo, statusId: re ? re.statusId : null });
      console.log(
        movedTo
          ? `    · ${m.league} ${m.tsMatchId} → diary 부재, 일정이동 ${new Date(movedTo * 1000).toISOString()} (startTime 갱신 예정)`
          : `    · ${m.league} ${m.tsMatchId} → diary 부재 (POSTPONED 예정)`,
      );
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
      `[${t}] ✅ 적용: FINISHED ${resp.finished} / POSTPONED ${resp.postponed} / RESCHEDULED ${resp.rescheduled ?? 0} / KEPT ${resp.kept} / skipped ${resp.skipped}`,
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
