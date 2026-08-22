// football-match-collector.js — TheSports football match/diary → Scorebase API push
// 1h 주기. 83개 매핑된 축구 리그 매치 자동 수집.
//
// 흐름:
//   1) league-id-mapping.json 로드 → ts competition_id → 우리 league code 역매핑
//   2) match/diary?tsp={t} ±2일 sweep — 매치 list (id/competition_id/teams/match_time/status_id)
//   3) 매핑된 competition 매치만 필터 + status_id → 우리 status 변환
//   4) POST {SITE_URL}/api/internal/thesports-matches (Bearer auth)
//
// rate limit: 매 호출 1회 (9일 sweep = 9회/h, 매우 안전)
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (football-match-collector)";
const fs = require("fs");
const path = require("path");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1h
// 어제 ~ +7일 (1주일). 종전 +3 은 K리그/MLS 처럼 라운드 간격 1주일인 리그의
// 다음 라운드를 sweep edge 에서 놓치는 경우 있었음 (2026-05-27 K_LEAGUE_1+MLS
// 다음 7d SCHEDULED 0 알림 발생). 시즌 중 리그는 다음 라운드를 무조건 잡도록 +7 확장.
const SWEEP_DAYS = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };
const MAP_FILE = path.join(__dirname, "league-id-mapping.json");

// 이전: 60+ 리그 SKIP — 매치 중복 방지가 목적. 부작용으로 TheSportsMatchCache row 자체가
// 안 만들어져 GoalsTooltip (score hover) 가 메이저 외 리그에서 안 떴음 (2026-05-25 보고).
//
// 2026-05-25 변경: 거의 모든 리그에 대해 ts collector 가 매치 push. server endpoint
// /api/internal/thesports-matches 가 skippedDuplicate 분기에서 매치 row 는 안 만들고
// cache row + tsMatchId 만 연결 — fast-poller 가 incidents 채움. 매치 중복 X.
//
// SKIP 유지 = ts 가 incidents 데이터 부실한 국가대표/특수 대회만.
// 2026-05-29: WORLD_CUP 은 사용자 결정으로 SKIP 해제 — TheSports 스코어 병행 수집.
//   api-football(world-cup.ts) 도 유지하므로 상세 incidents 는 api-football 이 보강.
// 한 대회 안에 여러 티어가 stage 로 섞여 오는 경우 — stage **이름**으로 리그를 가른다.
// ts 에 카코넨 전용 대회 id 가 없다: "Finnish Ykkonen" 시즌 하나에
//   Group A/B/C(각 10팀) = Kakkonen 4부 · Group D(12팀) = Ykkönen 3부
// 가 함께 들어온다. 대회 id 로만 리그를 정하면 4부 경기가 YKKONEN 으로 들어간다
// (지금까지는 팀이 YKKONEN 네임스페이스에 없어 skippedNoTeam 으로 조용히 버려졌다).
// ⚠ Group D 는 넣지 않는다 — YKKONEN 매치는 af 가 정본이라 ts 로도 만들면 크로스소스 중복.
// ⚠ stage_id 는 시즌마다 바뀌므로 절대 박아두지 않는다. 이름으로 매칭한다.
const STAGE_SPLIT = {
  gpxwrxlh7zryk0j: { "Group A": "KAKKONEN_A", "Group B": "KAKKONEN_B", "Group C": "KAKKONEN_C" },
};
const stageNameCache = new Map();
async function stageNameOf(stageId) {
  if (stageNameCache.has(stageId)) return stageNameCache.get(stageId);
  try {
    const { data } = await axios.get(`${TS_BASE}/v1/football/stage/list`, {
      params: { user: TS_USER, secret: TS_SECRET, uuid: stageId },
      timeout: 15_000,
    });
    const name = (data?.results?.[0]?.name ?? "").trim();
    stageNameCache.set(stageId, name);
    return name;
  } catch {
    stageNameCache.set(stageId, null);
    return null;
  }
}

const SKIP_LEAGUES = new Set([
  "CLUB_WORLD_CUP", "WC_QUAL", "EURO_QUAL", "UEFA_NL",
  "INTL_FRIENDLY",
  // AFCON·CONCACAF_GOLD 제외 (2026-08-21) — "af/ESPN 이 cover" 는 사실이 아니었다.
  // 둘 다 af 컬렉터는 등록돼 있지만 collect 라우트의 ALL_LEAGUES(106개)에 없어 한 번도 호출되지
  // 않았고, 여기서 ts 까지 막혀 양쪽 다 안 돌아 매치 0건이었다(순위 캐시만 있고 팀 매핑 0).
  // ts 로 소스를 넘긴다. 나중에 af 를 켜도 tsSeasonId 가 있어 TS_COVERED 필터가 af 를 걸러낸다.
]);

// TheSports football status_id (docs):
//   0 = abnormal(숨김 권장), 1 = scheduled, 2~7 = LIVE 단계, 8 = finished,
//   9 = delay, 10 = interrupt, 11 = cut in half, 12 = cancelled, 13 = TBD
// 12 가 default SCHEDULED 로 빠지면 취소 경기가 유령 SCHEDULED row 로 남아
// stale-scheduled 알림 반복 (2026-07-26 CLUB_FRIENDLY Thionville 사건).
function mapStatus(id) {
  if (id === 1) return "SCHEDULED";
  if (id >= 2 && id <= 7) return "LIVE";
  if (id === 8) return "FINISHED";
  if (id === 9 || id === 10 || id === 11 || id === 12) return "POSTPONED";
  return "SCHEDULED";
}

// diary 의 results_extra.team 이 팀 로고를 준다 — 한 번의 poll 안에서 id→logo 로 모아
// 매치 payload 에 실어 보낸다(서버는 로고가 비어 있는 팀만 채움). 이걸 버리면 라우트가
// 만든 하부리그 팀이 전부 로고 없이 남는다(2026-08-22 카코넨·DFB 포칼 144팀).
const teamLogos = new Map();
async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  for (const t of (data.results_extra && data.results_extra.team) || []) {
    if (t && t.id && t.logo) teamLogos.set(t.id, t.logo);
  }
  return Array.isArray(data.results) ? data.results : [];
}

// home_scores/away_scores: [0]=정규시간, [5]=연장 포함 총점, [6]=승부차기(절대 합산 금지).
// 연장 경기(컵/토너먼트)는 [5]가 최종 — [0]만 쓰면 종료 후 sweep 이 라이브 중 맞게 들어간
// 연장 스코어를 정규 90분 스코어로 되덮는다 (2026-07-20 WC 결승/준결승 사고).
// src/lib/sports/thesports/football-collector.ts finalScore 와 동일 로직.
function finalScore(arr) {
  if (!Array.isArray(arr)) return undefined;
  const reg = Number(arr[0]);
  const ot = Number(arr[5]);
  if (!Number.isFinite(reg)) return undefined;
  return Number.isFinite(ot) && ot > 0 && ot >= reg ? ot : reg;
}

// diary 의 round {stage_id, round_num, group_num} 을 payload 로. stage 이름은 캐시 조회(대회당 몇 개).
async function roundOf(m) {
  const r = m.round;
  if (!r || typeof r !== "object") return {};
  const stageName = r.stage_id ? await stageNameOf(r.stage_id) : null;
  return {
    round: {
      stageId: r.stage_id || null,
      roundNum: Number(r.round_num) || 0,
      groupNum: Number(r.group_num) || 0,
      stageName: stageName || null,
    },
  };
}

async function postBatch(matches) {
  if (matches.length === 0) return { ok: true, upserted: 0, skippedNoTeam: 0 };
  const res = await axios.post(
    `${SITE_URL}/api/internal/thesports-matches`,
    { sport: "football", matches },
    { headers: { ...SITE_HEADERS, "Content-Type": "application/json" }, timeout: 60_000 },
  );
  if (!res.data || res.data.ok !== true) {
    throw new Error(`unexpected: ${JSON.stringify(res.data).slice(0, 120)}`);
  }
  return res.data;
}

async function poll() {
  const ts = new Date().toISOString();
  let leagues;
  try {
    leagues = JSON.parse(fs.readFileSync(MAP_FILE, "utf-8"));
  } catch (e) {
    console.error(`[${ts}] ❌ map file load fail: ${e.message}`);
    return;
  }
  // 선착순 — 같은 tsId 를 여러 코드가 공유하는 경우(카코넨 3개 조가 Ykkonen 대회를 공유)
  // 나중 항목이 기존 리그를 덮으면 안 된다. 그 대회의 실제 분기는 STAGE_SPLIT 이 맡는다.
  const compToCode = new Map();
  for (const l of leagues) if (!compToCode.has(l.tsId)) compToCode.set(l.tsId, l.code);
  console.log(`[${ts}] ⚽ football-match-collector start — ${compToCode.size} mapped competitions`);

  const seen = new Set();
  const batch = [];
  for (const offset of SWEEP_DAYS) {
    const tsp = Math.floor(Date.now() / 1000) + offset * 86400;
    let raw;
    try {
      raw = await fetchDiary(tsp);
    } catch (e) {
      console.error(`    ✗ diary offset=${offset}: ${e.message}`);
      continue;
    }
    for (const m of raw) {
      if (!m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      // 0=Abnormal(숨김 권장)·13=TBD(시간 미정) — push 자체 제외. TBD 를 SCHEDULED 로
      // 넣으면 같은 fixture 의 두 번째 ts id 가 유령 row 로 생성됨 (2026-07-26 사건).
      if (m.status_id === 0 || m.status_id === 13) continue;
      let ourLeague = compToCode.get(m.competition_id);
      const split = STAGE_SPLIT[m.competition_id];
      if (split) {
        // 이 대회는 stage 로 리그가 갈린다 — 매핑에 없는 stage(예: Ykkönen Group D)는 건너뛴다.
        const sid = m.round && m.round.stage_id;
        const name = sid ? await stageNameOf(sid) : null;
        ourLeague = name && split[name] ? split[name] : null;
      }
      if (!ourLeague) continue; // 우리 매핑 없는 리그
      if (SKIP_LEAGUES.has(ourLeague)) continue; // ESPN/api-football 이 cover — duplicate 회피
      if (!m.home_team_id || !m.away_team_id) continue;
      batch.push({
        league: ourLeague,
        tsMatchId: m.id,
        tsHomeTeamId: m.home_team_id,
        tsAwayTeamId: m.away_team_id,
        startTime: new Date((m.match_time || 0) * 1000).toISOString(),
        status: mapStatus(m.status_id),
        homeScore: finalScore(m.home_scores),
        awayScore: finalScore(m.away_scores),
        // 날씨 — diary environment {weather, temperature, humidity, wind, pressure}. 라이브 상세 표시용.
        ...(m.environment && typeof m.environment === "object" ? { environment: m.environment } : {}),
        // 라운드 — 리그는 round_num, 컵은 round_num=0 이라 stage 이름("Round 1"·"Round of 16")이
        // 정본. 서버가 raw 에 남겨 일정 탭 라운드 네비·컵 대진표가 ts 매치에서도 선다.
        ...(await roundOf(m)),
        ...(teamLogos.has(m.home_team_id) ? { homeLogo: teamLogos.get(m.home_team_id) } : {}),
        ...(teamLogos.has(m.away_team_id) ? { awayLogo: teamLogos.get(m.away_team_id) } : {}),
      });
    }
  }
  console.log(`    수집 ${batch.length}건 (${SWEEP_DAYS.length}일 sweep, unique)`);

  // 100건씩 분할 POST
  const CHUNK = 100;
  let totalUp = 0;
  let totalSkip = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    try {
      const r = await postBatch(slice);
      totalUp += r.upserted;
      totalSkip += r.skippedNoTeam;
    } catch (e) {
      console.error(`    ✗ batch ${i}: ${e.message}`);
    }
  }
  console.log(`    summary: upserted=${totalUp} skippedNoTeam=${totalSkip}`);
}

console.log(`🚀 football-match-collector started (interval=${POLL_INTERVAL_MS / 1000}s, site=${SITE_URL})`);
poll();
setInterval(poll, POLL_INTERVAL_MS);
