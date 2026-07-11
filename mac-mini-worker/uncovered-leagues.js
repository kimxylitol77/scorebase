// TheSports 축구 일정(diary)을 훑어 우리가 아직 매핑 안 한 대회(각국 1~2부+전국컵) 중
// 새로 등장한 것만 텔레그램으로 알린다. 매일 1회 실행(launchd), 신규 없으면 조용히 종료.
//
// 흐름:
//   1) TheSports /v1/football/match/diary 를 -1~+3일 sweep → competition_id 집계 + 이름/로고
//   2) league-id-mapping.json 의 tsId 에 없는 대회 = 미커버 후보
//   3) 지역·주·아마추어·유스·여자·3부이하 노이즈 제외 → 1~2부+전국컵 후보만
//   4) seen.json 과 대조해 "새로 등장한" 후보만 텔레그램 알림 (첫 실행은 부트스트랩=개수만)
//
// 환경변수(.env 또는 ../.env.local): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN
// 옵션: --dry (알림·seen 저장 없이 콘솔만)

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");
const fs = require("fs");

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const WORKER_NAME = "mac-mini-uncovered-leagues";

const SWEEP_OFFSETS = [-1, 0, 1, 2, 3]; // KST 기준 어제~+3일
const MIN_MATCHES = 2; // 이 기간 내 최소 경기 수 (단발 친선/예선 컷)
const MAX_LIST = 40; // 텔레그램 한 통에 나열할 최대 개수
const DRY = process.argv.includes("--dry");

const SEEN_PATH = path.resolve(__dirname, "uncovered-leagues.seen.json");
const MAPPING_PATH = path.resolve(
  __dirname,
  "../src/lib/sports/thesports/league-id-mapping.json",
);
const SNAPSHOT_PATH = path.resolve(
  __dirname,
  "../data/thesports-translations/_competition-mapping.json",
);

if (!TS_USER || !TS_SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정 — .env 확인");
  process.exit(1);
}
if (!TOKEN && !DRY) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

// 노이즈 필터 — 유스/여자/예비/지역/주/아마추어/3부 이하 (영문명 기준, 1차)
const NOISE_EN = new RegExp(
  [
    "youth", "academy", "reserve", "U-?1[5-9]", "U-?2[0-3]", "women", "ladies", "girls",
    "friendl", "futsal", "indoor", "beach", "amateur", "veteran",
    "regional", "provincial", "county", "state league", "city league", "metropolitan",
    "national premier leagues", "victoria", "queensland", "new south wales", "tasmania",
    "brisbane", "capital football", "western australia", "south australia", "northern nsw",
    "adelaide", "new zealand",
    "inner mongolia", "shandong", "guangxi", "guangdong", "foshan", "zhejiang",
    "jiangsu", "sichuan", "hebei", "yunnan", "rural",
    "serie c", "serie d", "division [3-9]", "tercera", "cuarta", "segunda b",
    "kolmonen", "nelonen", "league two", "league one", "third division", "fourth division",
    "next pro", "\\bd[3-9]", "university",
    // 브라질 州 선수권 (전국 아님)
    "carioca", "paulista", "mineiro", "gaucho", "baiano", "goiano", "catarinense", "pernambucano",
    // 지역 약어·그룹
    "\\bqld\\b", "\\bnsw\\b", "\\bvic\\b", "tebolidun", "group [a-z]\\b", "\\bnsl\\b",
  ].join("|"),
  "i",
);
// 한글명 노이즈 (스냅샷 ko 는 en 을 못 걸러 별도 보조)
const NOISE_KO = new RegExp(
  [
    "여자", "청소년", "유스", "예비", "아카데미", "우-?2[0-3]", "우-?1[5-9]", "아마추어", "풋살",
    "지역", "주\\s?리그", "시\\s?리그",
    "빅토리아", "퀸즐랜드", "뉴\\s?사우스웨일[스즈]", "타[스즈]마니아", "브리즈번", "캐피털", "뉴질랜드",
    "내몽골", "산둥", "광[시둥]", "시골",
    "세리에?\\s?[cd]", "세리[이에]\\s?[cd]", "리그\\s?[3-9]", "[3-9]부", "디비전\\s?[3-9]",
    "테르세라", "쿠아르타", "대학", "카리오카", "파울리스타", "미네이로",
  ].join("|"),
);

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// dayOffset 일 뒤 KST 자정의 unix sec (diary tsp 파라미터)
function kstMidnightTsp(dayOffset) {
  const ms = Date.now() + dayOffset * 86400 * 1000;
  const kst = new Date(ms + 9 * 3600 * 1000);
  const midnightUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000;
  return Math.floor(midnightUtcMs / 1000);
}

async function fetchDiary(tsp) {
  const { data } = await axios.get(`${TS_BASE}/v1/football/match/diary`, {
    params: { user: TS_USER, secret: TS_SECRET, tsp },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`diary code=${data.code}`);
  return {
    results: Array.isArray(data.results) ? data.results : [],
    comps: data.results_extra?.competition ?? [],
  };
}

async function notify(payload) {
  await axios.post(
    `${SITE_URL}/api/internal/notify`,
    { source: WORKER_NAME, ...payload },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15_000 },
  );
}

function loadSeen() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
    return { exists: true, ids: new Set(Array.isArray(raw.ids) ? raw.ids : []) };
  } catch {
    return { exists: false, ids: new Set() };
  }
}

function saveSeen(ids) {
  fs.writeFileSync(
    SEEN_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), ids: [...ids] }, null, 2),
  );
}

async function main() {
  // 매핑된 tsId 집합 (프로덕션 collector 가 실제 로드하는 파일)
  const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8"));
  const mappedTsIds = new Set(mapping.map((m) => m.tsId));

  // competition id → 한글 이름 보조 (오프라인 스냅샷)
  let snapshotKo = new Map();
  try {
    const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
    snapshotKo = new Map(snap.map((c) => [c.id, c.ko]));
  } catch {
    /* 스냅샷 없으면 diary 영문명만 사용 */
  }

  const counts = new Map(); // cid -> 매치 수
  const nameEn = new Map(); // cid -> 영문명 (diary 직접 제공)
  let totalMatches = 0;
  for (const off of SWEEP_OFFSETS) {
    const tsp = kstMidnightTsp(off);
    try {
      const { results, comps } = await fetchDiary(tsp);
      totalMatches += results.length;
      for (const c of comps) if (c.id && !nameEn.has(c.id)) nameEn.set(c.id, c.name);
      for (const r of results) {
        if (!r.competition_id) continue;
        counts.set(r.competition_id, (counts.get(r.competition_id) || 0) + 1);
      }
    } catch (e) {
      console.error(`  day ${off}: FAIL ${e.message}`);
    }
  }
  console.error(`총 매치 ${totalMatches}, 등장 대회 ${counts.size}개`);

  // 미커버 + 규모 + 노이즈 제외 후보
  const candidates = [];
  for (const [cid, n] of counts) {
    if (mappedTsIds.has(cid)) continue;
    if (n < MIN_MATCHES) continue;
    const en = nameEn.get(cid) || "";
    const ko = snapshotKo.get(cid) || "";
    if (en && NOISE_EN.test(en)) continue;
    if (ko && NOISE_KO.test(ko)) continue;
    candidates.push({ cid, n, en, ko, label: ko || en || "(이름 미상)" });
  }
  candidates.sort((a, b) => b.n - a.n);
  console.error(`미커버 후보(1~2부+컵) ${candidates.length}개`);

  if (DRY) {
    for (const c of candidates) {
      console.log(`${String(c.n).padStart(3)}경기  ${c.label}${c.en ? "  (" + c.en + ")" : ""}  [${c.cid}]`);
    }
    console.log(`\n[dry] 후보 ${candidates.length}개 — 알림/seen 저장 생략`);
    return;
  }

  const seen = loadSeen();

  // 첫 실행 = 부트스트랩. 현재 후보를 seen 에 흡수하고 개수만 알림(초기 대량 노이즈 회피).
  if (!seen.exists) {
    const ids = new Set(candidates.map((c) => c.cid));
    saveSeen(ids);
    await notify({
      severity: "INFO",
      title: "미커버 축구 대회 감지 봇 초기화",
      message: `현재 미커버 후보 ${candidates.length}개를 기준선으로 등록했습니다. 이후부터 새로 등장하는 대회만 알립니다.`,
    });
    console.error(`부트스트랩: ${ids.size}개 등록`);
    return;
  }

  // 신규 = 후보 중 seen 에 없던 것
  const fresh = candidates.filter((c) => !seen.ids.has(c.cid));
  if (fresh.length === 0) {
    console.error("신규 미커버 대회 없음 — 알림 생략");
    return;
  }

  const shown = fresh.slice(0, MAX_LIST);
  const lines = shown.map(
    (c) => `• ${escapeHtml(c.label)} — ${c.n}경기  <code>${c.cid}</code>`,
  );
  if (fresh.length > shown.length) lines.push(`… 외 ${fresh.length - shown.length}개`);

  await notify({
    severity: "INFO",
    title: `미커버 축구 대회 ${fresh.length}개 신규 감지`,
    message: lines.join("\n"),
    action: "커버 가치 있으면 league-id-mapping.json 에 { code, tsId, ... } 추가 후 배포",
  });

  // 후보 전체를 seen 에 누적(다음날 반복 알림 방지)
  for (const c of candidates) seen.ids.add(c.cid);
  saveSeen(seen.ids);
  console.error(`신규 ${fresh.length}개 알림, seen ${seen.ids.size}개로 갱신`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`❌ uncovered-leagues 실패: ${e.stack || e.message}`);
    process.exit(1);
  });
