// football-fast-poller.js — TheSports football detail_live 2초 cycle 전체 호출 → cache.
// docs 권장 빈도 2초/회. uuid 없이 호출하면 전체 LIVE+예정 매치 list (~80매치) 한 번에.
//
// 분리: score/incidents/stats/tlive 빠른 갱신 전용.
// analysis/lineup 등 느린 데이터는 기존 football-poller (5분 cycle) 가 담당.
//
// 매핑: /api/internal/ts-football-mapping (TheSportsMatchCache 의 축구 매치 누적).
// → ts match id 가 cache 에 있어야 fast-poller 가 update 가능.
// → 즉 기존 football-poller 가 매칭 채워야 fast-poller 가 그 매치 점수만 빠르게 갱신.

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

const POLL_INTERVAL_MS = 2_000;        // docs 권장 빈도
const MAPPING_REFRESH_MS = 5 * 60_000; // mapping 5분 TTL
const BACKOFF_BASE_MS = 5_000;          // throttle 발생 시 backoff 시작
const BACKOFF_MAX_MS = 60_000;          // 최대 1분

if (!TS_USER || !TS_SECRET || !TOKEN) {
  console.error("❌ env missing (THESPORTS_USER/SECRET, INTERNAL_API_TOKEN)");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

let tsMatchIdToOurId = new Map();
let mappingFetchedAt = 0;
let currentBackoff = 0; // throttle 발생 시 다음 호출 지연 (ms)

async function refreshMapping(force = false) {
  if (!force && Date.now() - mappingFetchedAt < MAPPING_REFRESH_MS && tsMatchIdToOurId.size > 0) return;
  try {
    const { data } = await axios.get(`${SITE_URL}/api/internal/ts-football-mapping`, {
      headers: SITE_HEADERS,
      timeout: 15_000,
    });
    const map = new Map();
    for (const [tsId, ourId] of Object.entries(data.mapping || {})) {
      map.set(tsId, parseInt(ourId, 10));
    }
    tsMatchIdToOurId = map;
    mappingFetchedAt = Date.now();
    console.log(`[mapping] refreshed ${tsMatchIdToOurId.size} entries`);
  } catch (e) {
    console.error(`[mapping] refresh fail: ${e.message}`);
  }
}

async function fetchDetailLiveAll() {
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/match/detail_live`, {
      params: { user: TS_USER, secret: TS_SECRET },
      timeout: 15_000,
    });
    if (data?.code && data.code !== 0) {
      // TheSports error code (rate limit 등)
      const msg = data?.err_msg || `code=${data.code}`;
      throw new Error(msg);
    }
    currentBackoff = 0; // 성공 시 backoff reset
    return Array.isArray(data.results) ? data.results : [];
  } catch (e) {
    // 429 / quota / network — exponential backoff
    currentBackoff = currentBackoff === 0
      ? BACKOFF_BASE_MS
      : Math.min(currentBackoff * 2, BACKOFF_MAX_MS);
    console.error(`[detail_live] fail: ${e.message} → backoff ${currentBackoff}ms`);
    return null;
  }
}

async function pushCache(matchId, tsMatchId, detailLive) {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/thesports-cache`,
      { matchId, tsMatchId, detailLive },
      { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 8_000 },
    );
    return true;
  } catch (e) {
    return false;
  }
}

let totalReceived = 0;
let totalPushed = 0;
let totalSkipped = 0;
let totalFails = 0;

async function poll() {
  await refreshMapping();
  if (tsMatchIdToOurId.size === 0) return;

  const results = await fetchDetailLiveAll();
  if (!results) {
    totalFails++;
    return;
  }

  totalReceived += results.length;

  // 매핑된 매치만 cache POST (병렬 — Lightsail-Vercel 왕복 8초 이내)
  const updates = [];
  for (const item of results) {
    if (!item?.id) continue;
    const matchId = tsMatchIdToOurId.get(item.id);
    if (matchId == null) {
      totalSkipped++;
      continue;
    }
    // detailLive 부분 — score/incidents/stats/tlive 만. analysis/lineup 은 별도 cycle.
    // POST endpoint 가 detailLive 통째 replace 라 detail_live REST 응답 그대로 보냄.
    updates.push(pushCache(matchId, item.id, item));
  }
  const settled = await Promise.allSettled(updates);
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) totalPushed++;
  }
}

// stats 매분
setInterval(() => {
  console.log(
    `[stats] received=${totalReceived} pushed=${totalPushed} skipped=${totalSkipped} fails=${totalFails} mapping=${tsMatchIdToOurId.size} backoff=${currentBackoff}ms`,
  );
}, 60_000);

// poll loop — backoff 적용
async function loop() {
  while (true) {
    try {
      await poll();
    } catch (e) {
      console.error(`[poll] uncaught: ${e.message}`);
    }
    const delay = currentBackoff > 0 ? currentBackoff : POLL_INTERVAL_MS;
    await new Promise((r) => setTimeout(r, delay));
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

console.log(`🚀 football-fast-poller started (interval=${POLL_INTERVAL_MS}ms, site=${SITE_URL})`);
loop().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
