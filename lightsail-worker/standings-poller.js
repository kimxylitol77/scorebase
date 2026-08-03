// standings-poller.js — TheSports season/table/detail → Scorebase API push
// 10분 주기.
//
// ⚠ 실행 위치는 Vultr Seoul(64.176.230.240) `/home/ubuntu/scorebase-worker/src/` 다.
//   (2026-07-02 Lightsail → Vultr 이전 완료. 이 디렉토리 이름만 옛 이름으로 남아 있다.)
//   배포: 로컬에서 `src/` 하위로 rsync → `systemctl restart scorebase-standings-poller.service`
//
// 흐름:
//   1) GET {SITE_URL}/api/internal/football-seasons (Bearer) — 폴링할 시즌 목록
//      ↳ 실패하면 마지막 성공 응답 캐시(디스크) → 그것도 없으면 동봉된 league-id-mapping.json
//   2) 각 리그마다 season/recent/table/detail?uuid={tsSeasonId} fetch
//   3) POST {SITE_URL}/api/internal/thesports-standings (Bearer auth)
//   4) heartbeat POST — 전체 결과 + 리그별 실패 집계
//
// 2026-07-31 개편: 시즌 목록의 단일 진실을 서버로 옮겼다.
//   이전엔 워커 디렉토리에 사람이 복사해 둔 league-id-mapping.json 이 정본이라,
//   새 시즌에 저장소만 고치고 서버 사본을 못 고치면 지난 시즌 uuid 로 계속 조회했다.
//   → 빈 응답 → 캐시가 작년 순위표에 동결 (2026-07 UCL·분데스리가 72일 동결의 직접 원인).
//
// 안전장치:
//   - 인증 실패·timeout·빈 목록이면 기존 캐시를 절대 지우지 않고 마지막 성공 목록으로 계속 돈다.
//   - 외부 API timeout 은 그대로 유지 (30s).
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (standings-poller)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// 2026-05-25 Phase B: 1h → 10분 (사용자 화면 [순위] 실시간 정확).
// 89 leagues × 6/hour = 534 호출/hour = 8.9/min, TS 분당 120 한도 안. CALL_GAP 250ms
// 유지로 burst 방지.
const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CALL_GAP_MS = 250;
const HEARTBEAT_NAME = "vultr-standings-poller";
// TheSports 가 "이 대회는 순위표를 제공하지 않는다"고 답하는 코드.
// 컵·유스 대회 40여 개가 매 회차 이걸 돌려준다 — 정상 baseline 이지 실패가 아니다.
// (2026-07-02 Vultr 전환 검증에서도 ok=86 / code=405 44건이 평상 상태였다.)
const TS_CODE_NO_TABLE = 405;

// 환경변수 검사는 실제 실행일 때만 — 테스트가 이 모듈을 require 해도 프로세스가 죽지 않게.
if (require.main === module) {
  if (!TS_USER || !TS_SECRET) {
    console.error("❌ THESPORTS_USER / THESPORTS_SECRET missing");
    process.exit(1);
  }
  if (!TOKEN) {
    console.error("❌ INTERNAL_API_TOKEN missing");
    process.exit(1);
  }
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// 서버에서 받은 마지막 정상 시즌 목록 (프로세스 재시작에도 살아남게 디스크 보관).
const SEASON_CACHE_FILE = path.join(__dirname, ".seasons-cache.json");
// 최후 폴백 — 저장소에서 복사돼 있으면 사용 (없어도 동작한다).
const LEGACY_MAP_FILE = path.join(__dirname, "league-id-mapping.json");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 어느 목록을 쓸지 결정하는 순수 함수 (테스트 대상).
 * 서버 응답이 비었거나(=서버 상태 이상) 실패해도 마지막 정상 목록으로 계속 돈다 —
 * "빈 응답 = 폴링 중단"이 되면 캐시가 통째로 굶어 죽는다.
 *
 * @returns { seasons, source } source ∈ api | disk-cache | legacy-file | none
 */
function pickSeasonList({ apiSeasons, diskSeasons, legacySeasons }) {
  const valid = (arr) =>
    Array.isArray(arr) ? arr.filter((s) => s && s.league && s.tsSeasonId) : [];
  const api = valid(apiSeasons);
  if (api.length > 0) return { seasons: api, source: "api" };
  const disk = valid(diskSeasons);
  if (disk.length > 0) return { seasons: disk, source: "disk-cache" };
  const legacy = valid(legacySeasons);
  if (legacy.length > 0) return { seasons: legacy, source: "legacy-file" };
  return { seasons: [], source: "none" };
}

/**
 * 폴링할 시즌 목록. [{ league, tsSeasonId }]
 * 서버 → 디스크 캐시 → 동봉 JSON 순. 어느 단계도 기존 캐시를 지우지 않는다.
 */
async function loadSeasons() {
  let apiSeasons = [];
  try {
    const { data } = await axios.get(`${SITE_URL}/api/internal/football-seasons`, {
      headers: SITE_HEADERS,
      timeout: 20_000,
    });
    apiSeasons = data && Array.isArray(data.seasons) ? data.seasons : [];
    if (apiSeasons.length === 0) {
      // 빈 목록은 "폴링 중단"이 아니라 "서버 상태 이상"으로 본다 — 마지막 정상 목록 유지.
      console.warn("  ⚠ 서버 시즌 목록이 비어 있음 — 마지막 정상 목록 사용");
    }
  } catch (e) {
    // 인증 실패(401)·timeout 모두 여기로 — 기존 캐시를 지우지 않는다.
    const status = e.response?.status;
    console.warn(`  ⚠ 시즌 목록 API 실패${status ? ` (HTTP ${status})` : ""}: ${e.message}`);
  }

  let diskSeasons = [];
  try {
    diskSeasons = JSON.parse(fs.readFileSync(SEASON_CACHE_FILE, "utf-8"));
  } catch { /* 캐시 없음 — 다음 폴백 */ }

  let legacySeasons = [];
  try {
    legacySeasons = JSON.parse(fs.readFileSync(LEGACY_MAP_FILE, "utf-8"))
      .filter((l) => l.tsSeasonId)
      .map((l) => ({ league: l.code, tsSeasonId: l.tsSeasonId }));
  } catch { /* 파일 없음 */ }

  const picked = pickSeasonList({ apiSeasons, diskSeasons, legacySeasons });
  if (picked.source === "api") {
    try {
      fs.writeFileSync(SEASON_CACHE_FILE, JSON.stringify(picked.seasons), "utf-8");
    } catch (e) {
      console.warn(`  ⚠ 시즌 캐시 저장 실패: ${e.message}`);
    }
  }
  return picked;
}

/** @returns results 객체 | null(=순위표 미제공, 실패 아님). 진짜 오류만 throw. */
async function fetchTsStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/season/recent/table/detail`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: seasonId },
    timeout: 30_000,
  });
  if (data.code === TS_CODE_NO_TABLE) return null; // 컵·유스 — 평상 상태
  if (data.code !== 0) throw new Error(`ts code=${data.code} err=${data.err ?? ""}`);
  return data.results;
}

// 야구 (KBO/NPB) — baseball season/table/detail (축구와 endpoint 다름).
// ⚠️ season_id 는 시즌마다 변경 — 매 시즌 초 /v1/baseball/season/list 에서
//   unique_tournament_id(KBO 56ypq36s0o9qd7o·NPB 9k82re4svpxqepz) + 최신 year 로 갱신.
const BASEBALL_SEASONS = [
  { code: "KBO", seasonId: "318q63s4v00qo9j" },
  { code: "NPB", seasonId: "pxwrxgsj10kmyk0" },
];

// 배구 (VNL/AVC/유럽리그) — volleyball season/table/detail. season_id 는 시즌마다 변경:
// 시즌 초 diary sweep 매치의 season_id 로 갱신 (utid: VNL e4wyrn3hexvm86p / AVC y0or58hld26rwzv / EGL jednm9vh901qyox)
// ⚠ V-리그(한국)는 10월 개막 시 여기에 추가할 것 — utid 남 kn54qldhe9nrvy9 / 여 d23xmvzhowyqg8n.
//   지금 cur_season 표는 경기수가 들쭉날쭉한 어중간한 스냅샷이라(작년 순위 노출 위험) 넣지 않는다.
//   개막 후 diary 매치의 season_id 로: { code: "V_LEAGUE", seasonId: "..." }, { code: "V_LEAGUE_W", seasonId: "..." }
const VOLLEYBALL_SEASONS = [
  { code: "VNL", seasonId: "23xmvzhkkv2qg8n" },
  { code: "VNL_W", seasonId: "zp5rzdhppydq82w" }, // 여자 발리볼 네이션스리그 (2026-07-11 추가, utid yl5ergdh3wpr8k0)
  { code: "AVC_NATIONS_W", seasonId: "dj2rydhgn9yr1zp" },
  { code: "EGL_W", seasonId: "pxwrxdhjj28myk0" },
];

async function fetchVolleyballStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/volleyball/season/table/detail`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: seasonId },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`ts code=${data.code} err=${data.err ?? ""}`);
  return data.results;
}

async function fetchBaseballStandings(seasonId) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/season/table/detail`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid: seasonId },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`ts code=${data.code} err=${data.err ?? ""}`);
  return data.results;
}

async function postCache(league, tsSeasonId, payload) {
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-standings`,
    { league, tsSeasonId, payload },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
  // Vercel 의 404 페이지가 200 으로 반환되는 경우 false positive — body 검증.
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected response (no ok=true): ${JSON.stringify(res.data).slice(0, 100)}`);
  }
}

async function heartbeat(body) {
  try {
    await axios.post(
      `${SITE_URL}/api/internal/bot-heartbeat`,
      { name: HEARTBEAT_NAME, ...body },
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch {
    // silent — heartbeat 실패가 폴링을 막지 않는다. 단발 타임아웃 로그로 진짜 탐지를 덮지 않기
    // 위한 것으로, mac-mini-worker/hb-log.js 와 같은 방침이다. 끊긴 사실은 서버가 lastAt 으로
    // 판정해 알리므로(football-season-watch) 워커가 조용해도 감시 공백은 없다.
  }
}

// 리그별 연속 실패 횟수 — 일시 오류와 "그 리그만 계속 죽는" 상태를 가른다.
//   프로세스 재시작 시 리셋되지만, 재시작 자체가 드물고 리셋돼도 다시 쌓이므로 충분하다.
const leagueFailStreak = new Map();
const ERR_TOLERANCE = 2; // 한 회차에 이만큼까지는 일시 오류로 본다
const LEAGUE_FAIL_STREAK_ALERT = 3; // 같은 리그가 이만큼 연속 실패하면 알린다

// 한 회차에 150여 리그를 70초 안에 밀어넣다 보니 우리 endpoint 가 간헐적으로 500 을 뱉는다.
//   2026-08-03 실측: 203 회차 32,000여 요청 중 10건 실패, 실패 리그가 매번 달랐다(재현 0).
//   같은 요청을 곧바로 다시 보내면 통과하므로 회차 안에서 한 번만 되쏜다. 실패한 리그가
//   10분짜리 갱신 한 번을 통째로 건너뛰던 것도 같이 없어진다.
const RETRY_DELAY_MS = 3000;

async function poll() {
  const startedAt = Date.now();
  const ts = new Date().toISOString();

  const { seasons, source } = await loadSeasons();
  if (seasons.length === 0) {
    console.error(`[${ts}] ❌ 폴링할 시즌 목록이 없다 (api/disk/legacy 전부 실패) — 이번 회차 skip`);
    await heartbeat({
      ok: false,
      durationMs: Date.now() - startedAt,
      error: "season list unavailable (api+disk+legacy all failed)",
      metadata: { seasonSource: "none" },
    });
    return;
  }
  console.log(`[${ts}] 🏆 standings-poller start — ${seasons.length} leagues (source=${source})`);

  let ok = 0;
  let err = 0;
  let empty = 0;
  const failed = [];

  let retried = 0;
  for (const l of seasons) {
    // 1회 재시도 포함. empty(순위표 미제공)는 재시도 대상이 아니다 — 정상 상태다.
    let lastErr = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const payload = await fetchTsStandings(l.tsSeasonId);
        if (!payload || !Array.isArray(payload.tables)) {
          // 순위표 미제공(컵·유스 code=405) 또는 개막 전 빈 표 — 둘 다 정상. 실패로 세지 않는다.
          lastErr = null;
          empty++;
          break;
        }
        await postCache(l.league, l.tsSeasonId, payload);
        lastErr = null;
        ok++;
        if (attempt === 2) retried++;
        leagueFailStreak.delete(l.league);
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 1) await sleep(RETRY_DELAY_MS);
      }
    }
    if (lastErr) {
      err++;
      leagueFailStreak.set(l.league, (leagueFailStreak.get(l.league) ?? 0) + 1);
      const msg = lastErr.response?.data?.error ?? lastErr.response?.data?.err ?? lastErr.message;
      const streak = leagueFailStreak.get(l.league);
      failed.push(`${l.league}:${String(msg).slice(0, 60)}`);
      console.error(`  ✗ ${l.league} (${l.tsSeasonId}): ${msg} [재시도 후]${streak > 1 ? ` [연속 ${streak}회]` : ""}`);
    }
    await sleep(CALL_GAP_MS);
  }
  if (retried > 0) console.log(`    재시도로 복구 ${retried}건`);

  // 배구 (VNL/AVC/유럽리그) — volleyball season/table/detail → 같은 postCache
  for (const v of VOLLEYBALL_SEASONS) {
    try {
      const payload = await fetchVolleyballStandings(v.seasonId);
      if (!payload || !Array.isArray(payload.tables)) {
        empty++;
        console.warn(`  skip ${v.code} — empty payload`);
        continue;
      }
      await postCache(v.code, v.seasonId, payload);
      ok++;
    } catch (e) {
      err++;
      const msg = e.response?.data?.error ?? e.response?.data?.err ?? e.message;
      failed.push(`${v.code}:${String(msg).slice(0, 60)}`);
      console.error(`  ✗ ${v.code} (${v.seasonId}): ${msg}`);
    }
    await sleep(CALL_GAP_MS);
  }

  // 야구 (KBO/NPB) — baseball season/table/detail → 같은 postCache (league별 cache)
  for (const b of BASEBALL_SEASONS) {
    try {
      const payload = await fetchBaseballStandings(b.seasonId);
      if (!payload || !Array.isArray(payload.tables)) {
        empty++;
        console.warn(`  skip ${b.code} — empty payload`);
        continue;
      }
      await postCache(b.code, b.seasonId, payload);
      ok++;
    } catch (e) {
      err++;
      const msg = e.response?.data?.error ?? e.response?.data?.err ?? e.message;
      failed.push(`${b.code}:${String(msg).slice(0, 60)}`);
      console.error(`  ✗ ${b.code} (${b.seasonId}): ${msg}`);
    }
    await sleep(CALL_GAP_MS);
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[${new Date().toISOString()}] summary: ok=${ok} empty=${empty} err=${err} (${Math.round(durationMs / 1000)}s, source=${source})`,
  );
  // 151개 리그 중 한둘이 삐끗한 것과 폴러가 죽은 것은 다르다. 1건 실패에도 ok:false 를 보내면
  //   서버가 즉시 텔레그램을 쏘는데, 다음 회차에 그냥 복구되는 경우가 대부분이다
  //   (2026-08-03 CHINA_3 일시 500 — 다음 회차 err:0, 같은 요청 재현 시 200).
  //
  // ⚠️ 그렇다고 그냥 눈감으면 안 된다. data-sanity 의 standings_stale 은 12개 리그
  //   (STANDINGS_CHECK_LEAGUES)만 보므로 나머지 130여 개는 캐시가 굳어도 아무도 모른다.
  //   그래서 여기서 리그별 연속 실패를 세어, 같은 리그가 계속 실패하면 그때 알린다.
  const persistent = [...leagueFailStreak.entries()].filter(([, n]) => n >= LEAGUE_FAIL_STREAK_ALERT);
  const tooMany = err > ERR_TOLERANCE;
  const shouldAlert = tooMany || persistent.length > 0;
  const reason = tooMany
    ? `${err} leagues failed: ${failed.slice(0, 5).join(", ")}`
    : `연속 실패 리그: ${persistent.map(([lg, n]) => `${lg}(${n}회)`).join(", ")}`;
  await heartbeat({
    ok: !shouldAlert,
    durationMs,
    ...(shouldAlert ? { error: reason } : {}),
    metadata: {
      seasonSource: source,
      leagues: seasons.length,
      ok,
      empty,
      err,
      // 1회 재시도로 살아난 건수 — 0 이 아니면 endpoint 가 간헐적으로 흔들린다는 신호다
      retried,
      failedLeagues: failed.slice(0, 20),
      // 연속 실패 중인 리그 — 알림이 안 나가도 admin/health 에서 추적할 수 있게 항상 싣는다
      failStreaks: Object.fromEntries([...leagueFailStreak.entries()].slice(0, 20)),
    },
  });
}

// 직접 실행할 때만 폴링 시작 — 테스트에서 require 해도 루프가 안 돌게.
if (require.main === module) {
  console.log(`🚀 standings-poller started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
  poll();
  setInterval(poll, POLL_INTERVAL_MS);
}

module.exports = { pickSeasonList };
