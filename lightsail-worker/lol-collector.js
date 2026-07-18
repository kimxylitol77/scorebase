// lol-collector.js — TheSports lol → Scorebase push.
// ① 일정·결과: match/tournament → /api/internal/lol-matches (League·팀 매핑은 route). ← 항상 cheap
// ② 인게임 상세: mlive=1 매치의 세트·선수보드(single/list·player/stat/list) + 사전(hero·equipment·player)
//    → /api/internal/lol-ingame (buildLolGames 조립·픽밴/골드추이/선수KDA). BDL /lol/v1 401 대체.
//
// 두 모드(같은 스크립트, INGAME 윈도우만 env 로 다름):
//   - full(6h timer): LOL_INGAME_WINDOW_SEC 미설정 → 14일. 과거 시리즈 catch-up.
//   - fast(2분 timer): LOL_INGAME_WINDOW_SEC=10800(3h) → 라이브 매치만 가볍게. 라이브 스코어용.
// 환경변수 (/home/ubuntu/.env): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

// LCK 계열 토너먼트 id — src/lib/sports/lol-thesports.ts TS_LOL_TOURNAMENTS 와 일치.
// 워커는 어느 토너먼트를 호출할지만 알면 됨(League 결정은 route 가 tournament_id 로).
const TOURNAMENTS = ["l7oqd9kb6y6m510", "4wyrnxyt8jgm86p", "6ypq3e3u501md7o", "y39mp8xu53gqojx"]; // LCK 2026, LCK Cup 2026, MSI 2026(EWC 라벨·종료), EWC 2026 본선(7/15~19)

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER/SECRET missing");
  process.exit(1);
}
if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN missing");
  process.exit(1);
}

// 인게임 raw 윈도우 — full=14일(과거 catch-up), fast=env 로 3h(라이브 매치만 가볍게).
// single/list·player/stat 는 time 윈도우만큼 데이터를 받으므로 윈도우가 짧을수록 API·시간 절약.
const INGAME_WINDOW_SEC = Number(process.env.LOL_INGAME_WINDOW_SEC) || 14 * 24 * 3600;

async function tsGet(path, params) {
  const { data } = await axios.get(`${TS_BASE}${path}`, {
    params: { user: TS_USER, secret: TS_SECRET, ...params },
    timeout: 30_000,
  });
  return data;
}

// time 증분 슬라이딩 — 1000건 초과 시 마지막 updated_at 으로 다음 윈도우. dedup by id.
// ⚠️ single/list·player/stat/list 는 time 단독 파라미터만 작동(match_id 필터 무시) → 코드로 필터.
async function fetchAllSince(path, since) {
  const out = [];
  let t = since;
  for (let i = 0; i < 40; i++) {
    let r;
    try {
      r = await tsGet(path, { time: t });
    } catch (e) {
      console.error(`  ${path} time=${t} fail: ${e.message}`);
      break;
    }
    const rs = Array.isArray(r.results) ? r.results : [];
    if (!rs.length) break;
    out.push(...rs);
    if (rs.length < 1000) break;
    const maxU = Math.max(...rs.map((x) => Number(x.updated_at) || 0));
    if (maxU <= t) break;
    t = maxU;
  }
  const seen = new Set();
  return out.filter((x) => (seen.has(String(x.id)) ? false : seen.add(String(x.id))));
}

// 인게임 상세 수집 — mlive=1 매치만(mlive=0 은 인게임 0). matches = match/tournament 원본.
async function collectIngame(matches, ts) {
  const mliveIds = new Set(
    matches.filter((m) => (m.coverage || {}).mlive === 1).map((m) => String(m.id)),
  );
  if (!mliveIds.size) {
    console.log(`[${ts}] 🎮 인게임 — mlive=1 매치 0건, skip`);
    return;
  }
  const since = Math.floor(Date.now() / 1000) - INGAME_WINDOW_SEC;
  const rawSets = await fetchAllSince("/v1/lol/match/single/list", since);
  const rawPlayers = await fetchAllSince("/v1/lol/match/single/player/stat/list", since);
  // 우리 매치 한정 필터
  const sets = rawSets.filter((s) => mliveIds.has(String(s.match_id)));
  const setIds = new Set(sets.map((s) => String(s.id)));
  const players = rawPlayers.filter((p) => setIds.has(String(p.match_single_id)));
  if (!sets.length) {
    console.log(`[${ts}] 🎮 인게임 — 대상 세트 0건(아직 미반영), skip`);
    return;
  }
  // 사전: hero·equipment(1page) + 선수명(pid 루프)
  const heroR = await tsGet("/v1/lol/hero/list", { page: 1 });
  const heroes = (heroR.results || []).map((h) => ({ id: String(h.id), name: h.name, logo: h.logo }));
  const eqR = await tsGet("/v1/lol/equipment/list", { page: 1 });
  const equipment = (eqR.results || []).map((e) => ({ id: String(e.id), name: e.name, logo: e.logo }));
  const pids = [...new Set(players.map((p) => String(p.player_id)))];
  const playerNames = {};
  for (const pid of pids) {
    try {
      const r = await tsGet("/v1/lol/player/list", { uuid: pid });
      const x = (r.results || [])[0];
      if (x && x.name) playerNames[pid] = x.name;
    } catch {
      /* 이름 누락은 route 에서 "?" 처리 */
    }
  }
  const res = await axios.post(
    `${SITE_URL}/api/internal/lol-ingame`,
    { sets, players, heroes, equipment, playerNames },
    {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      timeout: 90_000,
    },
  );
  console.log(
    `[${ts}] 🎮 인게임 — 세트 ${sets.length}·선수 ${players.length}·선수명 ${pids.length}, ${JSON.stringify(res.data)}`,
  );
}

async function main() {
  const ts = new Date().toISOString();
  const all = [];
  for (const uuid of TOURNAMENTS) {
    try {
      const data = await tsGet("/v1/lol/match/tournament", { uuid });
      if (data.code === 0 && Array.isArray(data.results)) {
        all.push(...data.results);
      } else {
        console.error(`[${ts}] tournament ${uuid} code=${data.code}`);
      }
    } catch (e) {
      console.error(`[${ts}] tournament ${uuid} fail: ${e.message}`);
    }
  }
  // 0건이어도 POST — route 가 recordCronRun 으로 "실행됨" 기록(LCK 휴식기 오탐 방지).
  const res = await axios.post(
    `${SITE_URL}/api/internal/lol-matches`,
    { matches: all },
    {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      timeout: 60_000,
    },
  );
  console.log(`[${ts}] 🎮 LOL collect — fetched ${all.length}, ${JSON.stringify(res.data)}`);

  // 인게임 상세는 실패해도 일정/결과 수집은 유지(독립). recordCronRun(lol-ingame)은 route 에서.
  try {
    await collectIngame(all, ts);
  } catch (e) {
    console.error(`[${ts}] 인게임 수집 실패: ${e.message}`);
  }
}

main().catch((e) => {
  console.error(`fatal: ${e.message}`);
  process.exit(1);
});
