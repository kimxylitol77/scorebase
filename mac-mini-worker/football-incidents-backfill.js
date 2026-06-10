// football-incidents-backfill.js — 종료 축구 매치 골/카드(incidents) 백필 (고정 IP worker).
//
// 배경:
//   /scores 점수 hover 팝업(골 타임라인·카드·전반점수)은 TheSportsMatchCache.detailLive.incidents
//   에서 나온다. Lightsail fast-poller 가 라이브 시간대를 놓치면 영영 빈 채로 남아
//   IRAQ_SL·ARG_PRIMERA_NACIONAL 등 팝업 전멸 (2026-06-10 전수조사: 14일 150건+).
//   TheSports /v1/football/match/live/history 가 종료 매치를 uuid 단위로
//   detail_live 동일 shape {id, score, stats, incidents, tlive} 로 반환함을 검증 → 사후 백필.
//
// 흐름 (4h 주기, --once 로 1회 실행):
//   1) heartbeat POST
//   2) GET  /api/internal/football-incidents-backfill → incidents 없는 종료 매치 목록
//   3) ts id 결정: tsMatchId 직접(ts- 소스) / 없으면 diary(tsp=KST자정) 팀id·이름 매칭(af 소스)
//   4) /v1/football/match/live/history?uuid → incidents 있으면
//      POST /api/internal/thesports-cache {matchId, tsMatchId, detailLive}
//      (server 가 merge 저장 — 팝업 즉시 활성. status 는 monotonic 가드로 안전)
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
const WORKER_NAME = "mac-mini-football-incidents";
const POLL_MS = 4 * 60 * 60 * 1000; // 4시간
const ONCE = process.argv.includes("--once");
const PACE_MS = 650; // live/history 호출 간격 (~90/min, rate 보수적)

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정 — .env 확인");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

const tsKst = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").toLowerCase().replace(/[\s.&·'-]/g, "");

// 매치 startTime(ms) → KST 날짜 자정의 unix sec (stale-ts-verify 와 동일 계산)
function kstMidnightTsp(startTimeMs) {
  const kst = new Date(startTimeMs + 9 * 3600 * 1000);
  const midnightUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000;
  return Math.floor(midnightUtcMs / 1000);
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

async function fetchTargets() {
  const { data } = await axios.get(`${SITE_URL}/api/internal/football-incidents-backfill`, {
    headers: SITE_HEADERS,
    timeout: 30_000,
  });
  return Array.isArray(data.matches) ? data.matches : [];
}

// diary 1회 호출 캐싱 — {results[], teamName: Map<tsTeamId, name>}
async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`diary code=${data.code}`);
  const teamName = new Map(
    (data.results_extra?.team ?? []).map((t) => [t.id, t.name]),
  );
  return { results: Array.isArray(data.results) ? data.results : [], teamName };
}

// af 소스 매치 → diary 에서 ts match id 탐색.
// 1순위: competition + 양팀 ts team id 일치 / 2순위: competition + 양팀 이름 norm 일치.
function findTsMatchInDiary(diary, m) {
  for (const r of diary.results) {
    if (m.tsCompetitionId && r.competition_id !== m.tsCompetitionId) continue;
    if (
      m.homeTsTeamId &&
      m.awayTsTeamId &&
      r.home_team_id === m.homeTsTeamId &&
      r.away_team_id === m.awayTsTeamId
    ) {
      return r.id;
    }
    const hn = norm(diary.teamName.get(r.home_team_id));
    const an = norm(diary.teamName.get(r.away_team_id));
    if (hn && an && hn === norm(m.homeName) && an === norm(m.awayName)) return r.id;
  }
  return null;
}

async function fetchLiveHistory(uuid) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/live/history`, {
    params: { user: TS_USER, secret: TS_SECRET, uuid },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`live/history code=${data.code}`);
  const hit = data.results;
  if (!hit || typeof hit !== "object" || hit.id !== uuid) return null;
  return hit;
}

async function postCache(matchId, tsMatchId, detailLive) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/thesports-cache`,
    { matchId, tsMatchId, detailLive },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 30_000 },
  );
  return data;
}

async function runOnce() {
  const t = tsKst();
  await sendHeartbeat();

  let targets = [];
  try {
    targets = await fetchTargets();
  } catch (e) {
    console.error(`[${t}] ❌ 대상 목록 fetch fail: ${e.message}`);
    return;
  }
  if (targets.length === 0) {
    console.log(`[${t}] ✓ incidents 누락 매치 없음`);
    return;
  }
  console.log(`[${t}] 🔍 incidents 백필 대상 ${targets.length}건`);

  const diaryCache = new Map();
  async function diaryFor(tsp) {
    if (diaryCache.has(tsp)) return diaryCache.get(tsp);
    const d = await fetchDiary(tsp);
    diaryCache.set(tsp, d);
    return d;
  }

  let applied = 0;
  let noTsId = 0;
  let noData = 0;
  let failed = 0;
  const byLeague = new Map();

  for (const m of targets) {
    try {
      // 1) ts match id 결정
      let uuid = m.tsMatchId;
      if (!uuid) {
        const diary = await diaryFor(kstMidnightTsp(m.startTimeMs));
        uuid = findTsMatchInDiary(diary, m);
        if (!uuid) {
          noTsId++;
          continue; // ts 미커버 또는 매칭 실패 — 다음 run 재시도 (영구 미매칭은 그대로 잔류)
        }
      }
      // 2) live/history → incidents
      const hit = await fetchLiveHistory(uuid);
      await sleep(PACE_MS);
      if (!hit || !Array.isArray(hit.incidents) || hit.incidents.length === 0) {
        noData++;
        continue; // TheSports 에 incidents 자체가 없는 매치 (군소 리그)
      }
      // 3) cache POST — server 가 detailLive merge + 저장
      await postCache(m.matchId, uuid, hit);
      applied++;
      byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);
    } catch (e) {
      failed++;
      console.error(`    ✗ ${m.league} #${m.matchId}: ${e.message}`);
      await sleep(PACE_MS);
    }
  }

  console.log(
    `[${t}] ✅ 적용 ${applied} / ts-id 미해결 ${noTsId} / 데이터없음 ${noData} / 실패 ${failed}`,
  );
  if (byLeague.size > 0) {
    const summary = [...byLeague.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([l, c]) => `${l}:${c}`)
      .join(" ");
    console.log(`    리그별: ${summary}`);
  }
}

async function main() {
  console.log(
    `🛰️ ${WORKER_NAME} 시작 — ${ONCE ? "1회 실행(--once)" : `${POLL_MS / 3600000}h 주기`} (${tsKst()})`,
  );
  await runOnce();
  if (ONCE) return;
  setInterval(() => {
    runOnce().catch((e) => console.error(`runOnce error: ${e.message}`));
  }, POLL_MS);
}

main().catch((e) => {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
});
