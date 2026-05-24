// baseball-poller.js — TheSports baseball detail_live → Scorebase API 로 cache POST.
// 1분 주기. KBO/NPB/MLB LIVE 매치만 cover.
//
// 매핑 흐름 (diary 와 detail_live 의 id system 이 거의 겹치지 않음 → match/list lookup):
//   1) Scorebase /api/internal/baseball-matches-with-ts-mapping → 우리 매치 list + tsTeamId
//   2) TheSports /v1/baseball/match/detail_live → 전체 LIVE list (id, score, extra)
//   3) detail_live 의 신규 id 만 /v1/baseball/match/list?uuid=X 로 metadata lookup
//      (home/away_team_id, match_time) — 메모리 캐싱으로 동일 매치 재호출 회피
//   4) 우리 매치 ↔ ts 매치 매핑: tsTeamId 일치 (양방향 swap 포함) + 시간 ±3h
//   5) 매칭된 ts match id 만 cache POST → /api/internal/thesports-cache
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60_000;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

async function fetchOurMatches() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/baseball-matches-with-ts-mapping`, {
    params: { days: 1 },
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return data.matches || [];
}

async function fetchTsDetailLive() {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/match/detail_live`, {
    params: { user: TS_USER, secret: TS_SECRET },
    timeout: 30_000,
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchTsMatchMeta(tsMatchId) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/match/list`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: tsMatchId },
    timeout: 30_000,
  });
  const r = Array.isArray(data.results) ? data.results[0] : null;
  if (!r) return null;
  return {
    homeTeamId: r.home_team_id,
    awayTeamId: r.away_team_id,
    matchTime: r.match_time,
    statusId: r.status_id,
  };
}

async function postCache(matchId, tsMatchId, detailLive) {
  await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    { matchId, tsMatchId, detailLive },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
}

// detail_live 의 ts match id → metadata 캐시 (process 살아있는 동안 reuse).
// 매치 metadata 는 lifecycle 동안 거의 안 변하므로 한 번 lookup 후 재사용 안전.
const metaCache = new Map();

async function ensureMeta(tsMatchId) {
  if (metaCache.has(tsMatchId)) return metaCache.get(tsMatchId);
  try {
    const meta = await fetchTsMatchMeta(tsMatchId);
    metaCache.set(tsMatchId, meta);
    return meta;
  } catch (e) {
    console.error(`    ✗ match/list uuid=${tsMatchId}: ${e.message}`);
    metaCache.set(tsMatchId, null); // 음수 캐시 — 다시 호출 안 함
    return null;
  }
}

function findOurMatch(ourMatches, meta) {
  if (!meta || !meta.homeTeamId || !meta.awayTeamId) return null;
  const tsStart = (meta.matchTime ?? 0) * 1000;
  for (const our of ourMatches) {
    if (!our.home.tsTeamId || !our.away.tsTeamId) continue;
    const ourStart = new Date(our.startTime).getTime();
    if (tsStart && Math.abs(tsStart - ourStart) > 3 * 3600 * 1000) continue;
    const same = meta.homeTeamId === our.home.tsTeamId && meta.awayTeamId === our.away.tsTeamId;
    const swap = meta.homeTeamId === our.away.tsTeamId && meta.awayTeamId === our.home.tsTeamId;
    if (same || swap) return our.matchId;
  }
  return null;
}

async function poll() {
  const ts = new Date().toISOString();
  let ourMatches = [];
  try {
    ourMatches = await fetchOurMatches();
  } catch (e) {
    console.error(`[${ts}] ❌ our matches fetch fail: ${e.message}`);
    return;
  }
  if (ourMatches.length === 0) {
    console.log(`[${ts}] ⚾ no mappable matches (SCHEDULED/LIVE 24h ahead)`);
    return;
  }

  let live = [];
  try {
    live = await fetchTsDetailLive();
  } catch (e) {
    console.error(`    ✗ detail_live: ${e.message}`);
    return;
  }

  // 매치별 metadata lookup — 한 cycle 당 신규 매치 최대 30개 (rate limit 안전).
  // 캐시 hit 는 즉시 처리, 신규만 max 30개 lookup.
  const NEW_LOOKUP_LIMIT = 30;
  let newLookups = 0;
  let pushed = 0;
  let cacheHits = 0;
  let mappedFound = 0;

  for (const entry of live) {
    if (!entry.id) continue;
    let meta = metaCache.get(entry.id);
    if (meta === undefined) {
      if (newLookups >= NEW_LOOKUP_LIMIT) continue; // 이 cycle 에서 skip — 다음 cycle 에서 lookup
      meta = await ensureMeta(entry.id);
      newLookups++;
      // 작은 delay (50ms) — rate limit 여유
      await new Promise((r) => setTimeout(r, 50));
    } else {
      cacheHits++;
    }
    const ourMatchId = findOurMatch(ourMatches, meta);
    if (!ourMatchId) continue;
    mappedFound++;
    try {
      await postCache(ourMatchId, entry.id, entry);
      pushed++;
    } catch (e) {
      console.error(`    ✗ cache POST id=${entry.id}: ${e.message}`);
    }
  }

  console.log(
    `[${ts}] ⚾ our=${ourMatches.length} live=${live.length} new-lookups=${newLookups} cache-hits=${cacheHits} mapped=${mappedFound} pushed=${pushed} meta-cache=${metaCache.size}`,
  );
}

async function main() {
  console.log(`[startup] baseball-poller — ${POLL_INTERVAL_MS / 1000}s interval`);
  while (true) {
    try { await poll(); } catch (e) { console.error(`[poll] uncaught: ${e.message}`); }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
