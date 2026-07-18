// baseball-poller.js — TheSports baseball detail_live → Scorebase API 로 cache POST.
// 1분 주기. 12개 야구 리그 LIVE 매치 cover (endpoint 가 league filter 단일 출처).
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

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (baseball-poller)";

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

async function postCache(matchId, tsMatchId, detailLive, scoreObj) {
  const body = { matchId, tsMatchId, detailLive };
  if (scoreObj) {
    body.homeScore = scoreObj.homeScore;
    body.awayScore = scoreObj.awayScore;
  }
  await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    body,
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
}

// raw detail_live entry.score = [tsMatchId, statusId, half, scoresObj]
// scoresObj.ft = [ts_home, ts_away] — 2026-05-27 CPBL Wei Chuan vs Fubon 사용자 화면
// swap 사고로 정정 확정. baseball-live.ts 의 KBO 5매치 네이버 검증과 일치 ([home, away]).
// swap=true 면 ts_home == our_away → 우리 관점에서 뒤집어 반환.
function extractScore(entry, swap) {
  const arr = entry?.score;
  if (!Array.isArray(arr) || arr.length < 4) return null;
  const scores = arr[3];
  if (!scores || typeof scores !== "object") return null;
  const ft = scores.ft;
  if (!Array.isArray(ft) || ft.length < 2) return null;
  const tsHome = parseInt(String(ft[0]), 10);
  const tsAway = parseInt(String(ft[1]), 10);
  if (!Number.isFinite(tsAway) || !Number.isFinite(tsHome)) return null;
  return swap
    ? { homeScore: tsAway, awayScore: tsHome }
    : { homeScore: tsHome, awayScore: tsAway };
}

// detail_live 의 ts match id → metadata 캐시 (process 살아있는 동안 reuse).
// 매치 metadata 는 lifecycle 동안 거의 안 변하므로 positive 는 영구 reuse 안전.
// 음수(null)는 영구 캐싱 금지 — 빈 응답/일시 오류 1회가 매치를 영영 unmapped 로
// 고착시킴 (2026-07-12 MLB MIL@PIT cache 미생성 사고). NEG_TTL_MS 후 재조회.
const metaCache = new Map(); // tsMatchId → { v: meta|null, at: ms }
const NEG_TTL_MS = 10 * 60 * 1000;

function cachedMeta(tsMatchId) {
  const hit = metaCache.get(tsMatchId);
  if (hit === undefined) return undefined;
  if (hit.v === null && Date.now() - hit.at >= NEG_TTL_MS) return undefined; // 음수 만료 → 재조회
  return hit;
}

async function ensureMeta(tsMatchId) {
  try {
    const meta = await fetchTsMatchMeta(tsMatchId);
    if (!meta) console.error(`    ✗ match/list uuid=${tsMatchId}: empty results`);
    metaCache.set(tsMatchId, { v: meta ?? null, at: Date.now() });
    return meta ?? null;
  } catch (e) {
    console.error(`    ✗ match/list uuid=${tsMatchId}: ${e.message}`);
    metaCache.set(tsMatchId, { v: null, at: Date.now() });
    return null;
  }
}

function findOurMatch(ourMatches, meta) {
  if (!meta || !meta.homeTeamId || !meta.awayTeamId) return null;
  const tsStart = (meta.matchTime ?? 0) * 1000;
  // 더블헤더(같은 팀쌍, 2~3h 간격) 는 ±3h 창에 두 매치가 다 걸림 —
  // 첫 후보 반환이 아니라 시작시각 최근접 매치를 골라야 게임1/게임2 가 안 섞인다 (LMB 2026-07-02)
  let best = null;
  for (const our of ourMatches) {
    if (!our.home.tsTeamId || !our.away.tsTeamId) continue;
    const ourStart = new Date(our.startTime).getTime();
    const diff = tsStart ? Math.abs(tsStart - ourStart) : 0;
    if (tsStart && diff > 3 * 3600 * 1000) continue;
    const same = meta.homeTeamId === our.home.tsTeamId && meta.awayTeamId === our.away.tsTeamId;
    const swap = meta.homeTeamId === our.away.tsTeamId && meta.awayTeamId === our.home.tsTeamId;
    if ((same || swap) && (!best || diff < best.diff)) {
      best = { matchId: our.matchId, swap, diff };
    }
  }
  return best ? { matchId: best.matchId, swap: best.swap } : null;
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
    const hit = cachedMeta(entry.id);
    let meta;
    if (hit === undefined) {
      if (newLookups >= NEW_LOOKUP_LIMIT) continue; // 이 cycle 에서 skip — 다음 cycle 에서 lookup
      meta = await ensureMeta(entry.id);
      newLookups++;
      // 작은 delay (50ms) — rate limit 여유
      await new Promise((r) => setTimeout(r, 50));
    } else {
      meta = hit.v;
      cacheHits++;
    }
    const matchInfo = findOurMatch(ourMatches, meta);
    if (!matchInfo) continue;
    mappedFound++;
    try {
      // cache.detailLive._swap 합성 → ts-baseball-mapping endpoint 가 ws-subscriber 에 swap 정보 전달용.
      // route 의 detailLive merge 가 보존, ws-subscriber 의 partial push 후에도 살아남음.
      const detailLive = { ...entry, _swap: matchInfo.swap };
      const scoreObj = extractScore(entry, matchInfo.swap);
      await postCache(matchInfo.matchId, entry.id, detailLive, scoreObj);
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
