// TheSports 각 종목 일정(diary)을 훑어 우리가 아직 매핑 안 한 대회 중 새로 등장한 것만
// 텔레그램으로 알린다. 축구·야구·농구·배구·아이스하키 5종목. 매일 1회(launchd), 신규 없으면 조용히 종료.
//
// 흐름(종목별):
//   1) /v1/{sport}/match/diary 를 -1~+3일 sweep → 대회id 집계 + 이름(results_extra)
//   2) 우리 커버 집합에 없으면 미커버 후보 (축구는 노이즈 필터로 1~2부+컵만)
//   3) seen.json 과 대조해 "새로 등장한" 후보만 알림 (첫 실행=부트스트랩=개수만)
//
// 커버 집합 출처(동기화 주의 — collector 매핑 바뀌면 여기도 갱신):
//   축구 = src/lib/sports/thesports/league-id-mapping.json 의 tsId (파일 로드)
//   야구 = lightsail-worker/baseball-match-collector.js COMP_TO_LEAGUE
//   농구 = lightsail-worker/basketball-match-collector.js COMP_TO_LEAGUE
//   하키 = lightsail-worker/ice-hockey-match-collector.js COMP_TO_LEAGUE
//   배구 = lightsail-worker/volleyball-collector.js UTID_TO_LEAGUE
//
// 환경변수(.env 또는 ../.env.local): THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN
// 옵션: --dry (알림·seen 저장 없이 콘솔만), --sport=football (특정 종목만)

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

const SWEEP_OFFSETS = [-1, 0, 1, 2, 3]; // 어제~+3일
const MAX_LIST = 40; // 텔레그램 한 통에 나열할 최대 개수
const DRY = process.argv.includes("--dry");
const ONLY_SPORT = (process.argv.find((a) => a.startsWith("--sport=")) || "").split("=")[1];

const SEEN_PATH = path.resolve(__dirname, "uncovered-leagues.seen.json");
const FB_MAPPING_PATH = path.resolve(
  __dirname,
  "../src/lib/sports/thesports/league-id-mapping.json",
);
const FB_SNAPSHOT_PATH = path.resolve(
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

// 노이즈 필터 조각 — 종목별로 조합해 사용 (reOf).
// 전종목 공통: 유스/예선/하위디비전/대학/아마추어/친선
const NOISE_COMMON = [
  "U-?1[5-9]", "U-?2[0-3]", "\\byouth\\b", "\\bjunior", "\\bcadet",
  "qualif", "division [b-d]\\b", "championship division [b-d]",
  "\\bcollege\\b", "university", "amateur", "friendl",
];
// 여자 (축구·농구·하키에 적용. 배구는 여자 리그 커버 중이라 미적용)
const NOISE_WOMEN = ["women", "ladies", "girls", "f[eé]minin", "\\bwnbl\\b", "여자"];
// 농구 지역 세미프로 (호주 NBL1 등)
const NOISE_HOOPS = ["nbl1", "basketball league1", "\\bleague1\\b", "national women"];
// 축구 특화 — 지역/주/3부이하/브라질 州선수권
const NOISE_FB = [
  "academy", "reserve", "futsal", "indoor", "beach", "veteran",
  "regional", "provincial", "county", "state league", "city league", "metropolitan",
  "national premier leagues", "victoria", "queensland", "new south wales", "tasmania",
  "brisbane", "capital football", "western australia", "south australia", "northern nsw",
  "adelaide", "new zealand",
  "inner mongolia", "shandong", "guangxi", "guangdong", "foshan", "zhejiang",
  "jiangsu", "sichuan", "hebei", "yunnan", "rural",
  "serie c", "serie d", "division [3-9]", "tercera", "cuarta", "segunda b",
  "kolmonen", "nelonen", "league two", "league one", "third division", "fourth division",
  "next pro", "\\bd[3-9]",
  "carioca", "paulista", "mineiro", "gaucho", "baiano", "goiano", "catarinense", "pernambucano",
  "\\bqld\\b", "\\bnsw\\b", "\\bvic\\b", "tebolidun", "group [a-z]\\b", "\\bnsl\\b",
];
// 축구 한글명 보조 (스냅샷 ko)
const NOISE_FB_KO = new RegExp(
  [
    "여자", "청소년", "유스", "예비", "아카데미", "우-?2[0-3]", "우-?1[5-9]", "아마추어", "풋살",
    "지역", "주\\s?리그", "시\\s?리그",
    "빅토리아", "퀸즐랜드", "뉴\\s?사우스웨일[스즈]", "타[스즈]마니아", "브리즈번", "캐피털", "뉴질랜드",
    "내몽골", "산둥", "광[시둥]", "시골",
    "세리에?\\s?[cd]", "세리[이에]\\s?[cd]", "리그\\s?[3-9]", "[3-9]부", "디비전\\s?[3-9]",
    "테르세라", "쿠아르타", "대학", "카리오카", "파울리스타", "미네이로",
  ].join("|"),
);
function reOf(...groups) {
  return new RegExp(groups.flat().join("|"), "i");
}

// 종목별 설정. coveredIds = 우리가 이미 커버 중인 대회 id 집합(collector 매핑 복제).
const SPORTS = [
  {
    key: "football", label: "축구",
    diaryPath: "football/match/diary", dateMode: "tsp",
    idFields: ["competition_id"], minMatches: 2,
    noiseEn: reOf(NOISE_COMMON, NOISE_WOMEN, NOISE_FB), noiseKo: NOISE_FB_KO,
    coveredIds: null, // main 에서 league-id-mapping.json 로 채움
  },
  {
    key: "baseball", label: "야구",
    diaryPath: "baseball/match/diary", dateMode: "tsp",
    idFields: ["competition_id", "unique_tournament_id"], minMatches: 2,
    noiseEn: reOf(NOISE_COMMON), noiseKo: null,
    coveredIds: new Set([
      "56ypq36s0o9qd7o", "9k82re4svpxqepz", "z8yomoys7olq0j6", "gpxwrxgsgw0myk0",
      "yl5ergxs3k8q8k0", "kjw2r06sn56rz84", "gy0or56slylmwzv", "l5ergxsov0kq8k0",
      "p3glrw5sweerdyj", "9dn1m16s4y2roep", "8y39mpzs3gwqojx", "l965mk5s7x1m1ge",
    ]),
  },
  {
    key: "basketball", label: "농구",
    diaryPath: "basketball/match/diary", dateMode: "ymd",
    idFields: ["competition_id"], minMatches: 2,
    noiseEn: reOf(NOISE_COMMON, NOISE_WOMEN, NOISE_HOOPS), noiseKo: null,
    coveredIds: new Set([
      "49vjxm8xt4q6odg", "0gx7lm73tor2wdk", "9d23xmv1t4mg8ny", "kn54ql7t28rvy9d",
      "p3glrwyt7pqdyjv",
    ]),
  },
  {
    key: "ice_hockey", label: "아이스하키",
    diaryPath: "ice_hockey/match/diary", dateMode: "ymd",
    idFields: ["unique_tournament_id"], minMatches: 2,
    noiseEn: reOf(NOISE_COMMON, NOISE_WOMEN), noiseKo: null,
    coveredIds: new Set(["gx7lm78b45nq2wd", "56ypq3vbxgerd7o"]),
  },
  {
    key: "volleyball", label: "배구",
    diaryPath: "volleyball/match/diary", dateMode: "tsp",
    idFields: ["unique_tournament_id"], minMatches: 2,
    noiseEn: reOf(NOISE_COMMON), noiseKo: null,
    coveredIds: new Set([
      "e4wyrn3hexvm86p", "yl5ergdh3wpr8k0", "y0or58hld26rwzv", "jednm9vh901qyox",
    ]),
  },
];

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// dayOffset 일 뒤 KST 자정의 unix sec (tsp 파라미터)
function kstMidnightTsp(dayOffset) {
  const ms = Date.now() + dayOffset * 86400 * 1000;
  const kst = new Date(ms + 9 * 3600 * 1000);
  const midnightUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600 * 1000;
  return Math.floor(midnightUtcMs / 1000);
}

// dayOffset 일 뒤 UTC 날짜 YYYYMMDD (date 파라미터 — 농구/하키)
function ymdUtc(dayOffset) {
  const d = new Date(Date.now() + dayOffset * 86400 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

async function fetchDiary(sport, off) {
  const params = { user: TS_USER, secret: TS_SECRET };
  if (sport.dateMode === "tsp") params.tsp = kstMidnightTsp(off);
  else params.date = ymdUtc(off);
  const { data } = await axios.get(`${TS_BASE}/v1/${sport.diaryPath}`, { params, timeout: 30_000 });
  if (data.code !== 0) throw new Error(`${sport.key} diary code=${data.code}`);
  // 대회 이름은 results_extra.competition / unique_tournament 어느 쪽으로도 올 수 있음
  const comps = [
    ...(data.results_extra?.competition ?? []),
    ...(data.results_extra?.unique_tournament ?? []),
  ];
  return { results: Array.isArray(data.results) ? data.results : [], comps };
}

function compIdOf(r, idFields) {
  for (const f of idFields) if (r[f]) return r[f];
  return null;
}

async function notify(payload) {
  await axios.post(
    `${SITE_URL}/api/internal/notify`,
    { source: WORKER_NAME, ...payload },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15_000 },
  );
}

// seen.json — { updatedAt, sports: { football: [ids], baseball: [...] } }
// 구버전({ ids: [...] }) = 축구 전용 → sports.football 로 마이그레이션.
function loadSeen() {
  try {
    const raw = JSON.parse(fs.readFileSync(SEEN_PATH, "utf8"));
    if (raw.sports) {
      const sports = {};
      for (const k of Object.keys(raw.sports)) sports[k] = new Set(raw.sports[k]);
      return { sports };
    }
    if (Array.isArray(raw.ids)) return { sports: { football: new Set(raw.ids) } };
  } catch {
    /* 없으면 빈 */
  }
  return { sports: {} };
}

function saveSeen(seen) {
  const sports = {};
  for (const k of Object.keys(seen.sports)) sports[k] = [...seen.sports[k]];
  fs.writeFileSync(
    SEEN_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), sports }, null, 2),
  );
}

// 한 종목의 미커버 후보 계산
async function collectSport(sport, snapshotKo) {
  const counts = new Map(); // id -> 매치 수
  const nameEn = new Map(); // id -> 영문명(diary 제공)
  let total = 0;
  for (const off of SWEEP_OFFSETS) {
    try {
      const { results, comps } = await fetchDiary(sport, off);
      total += results.length;
      for (const c of comps) if (c.id && !nameEn.has(c.id)) nameEn.set(c.id, c.name);
      for (const r of results) {
        const cid = compIdOf(r, sport.idFields);
        if (cid) counts.set(cid, (counts.get(cid) || 0) + 1);
      }
    } catch (e) {
      console.error(`  [${sport.key}] off ${off}: ${e.message}`);
    }
  }

  const candidates = [];
  for (const [cid, n] of counts) {
    if (sport.coveredIds.has(cid)) continue;
    if (n < sport.minMatches) continue;
    const en = nameEn.get(cid) || "";
    const ko = snapshotKo.get(cid) || "";
    if (sport.noiseEn && en && sport.noiseEn.test(en)) continue;
    if (sport.noiseKo && ko && sport.noiseKo.test(ko)) continue;
    candidates.push({ cid, n, en, label: ko || en || "(이름 미상)" });
  }
  candidates.sort((a, b) => b.n - a.n);
  console.error(`[${sport.key}] 매치 ${total}, 미커버 후보 ${candidates.length}`);
  return candidates;
}

async function main() {
  // 축구 커버 집합 + 한글명 스냅샷
  const fbMapping = JSON.parse(fs.readFileSync(FB_MAPPING_PATH, "utf8"));
  const footballTsIds = new Set(fbMapping.map((m) => m.tsId));
  SPORTS.find((s) => s.key === "football").coveredIds = footballTsIds;

  let footballKo = new Map();
  try {
    const snap = JSON.parse(fs.readFileSync(FB_SNAPSHOT_PATH, "utf8"));
    footballKo = new Map(snap.map((c) => [c.id, c.ko]));
  } catch {
    /* 스냅샷 없으면 영문명만 */
  }

  const targets = ONLY_SPORT ? SPORTS.filter((s) => s.key === ONLY_SPORT) : SPORTS;
  const perSport = [];
  for (const sport of targets) {
    const koMap = sport.key === "football" ? footballKo : new Map();
    const candidates = await collectSport(sport, koMap);
    perSport.push({ sport, candidates });
  }

  if (DRY) {
    for (const { sport, candidates } of perSport) {
      console.log(`\n=== [${sport.label}] 미커버 후보 ${candidates.length}개 ===`);
      for (const c of candidates) {
        console.log(`${String(c.n).padStart(3)}경기  ${c.label}${c.en ? "  (" + c.en + ")" : ""}  [${c.cid}]`);
      }
    }
    console.log("\n[dry] 알림/seen 저장 생략");
    return;
  }

  const seen = loadSeen();
  const bootstrapParts = []; // 첫 등장 종목: "야구 8"
  const freshSections = []; // 신규 감지 종목별 리스트

  for (const { sport, candidates } of perSport) {
    const first = !seen.sports[sport.key];
    if (first) {
      seen.sports[sport.key] = new Set(candidates.map((c) => c.cid));
      bootstrapParts.push(`${sport.label} ${candidates.length}`);
      continue;
    }
    const known = seen.sports[sport.key];
    const fresh = candidates.filter((c) => !known.has(c.cid));
    if (fresh.length) freshSections.push({ sport, fresh });
    for (const c of candidates) known.add(c.cid);
  }

  // 첫 등장 종목 = 기준선 등록 알림(개수만)
  if (bootstrapParts.length) {
    await notify({
      severity: "INFO",
      title: "미커버 대회 감지 — 신규 종목 기준선 등록",
      message: `${bootstrapParts.join(", ")} 를 기준선으로 등록했습니다. 이후부터 새로 등장하는 대회만 알립니다.`,
    });
  }

  // 신규 감지 = 종목별 섹션으로 1건
  if (freshSections.length) {
    const totalNew = freshSections.reduce((s, f) => s + f.fresh.length, 0);
    const lines = [];
    for (const { sport, fresh } of freshSections) {
      lines.push(`<b>[${sport.label}]</b>`);
      for (const c of fresh.slice(0, MAX_LIST)) {
        lines.push(`• ${escapeHtml(c.label)} — ${c.n}경기  <code>${c.cid}</code>`);
      }
      if (fresh.length > MAX_LIST) lines.push(`… 외 ${fresh.length - MAX_LIST}개`);
    }
    await notify({
      severity: "INFO",
      title: `미커버 대회 ${totalNew}개 신규 감지`,
      message: lines.join("\n"),
      action: "커버 가치 있으면 매핑에 추가 (축구=league-id-mapping.json, 타종목=해당 collector COMP_TO_LEAGUE)",
    });
  }

  if (!bootstrapParts.length && !freshSections.length) {
    console.error("신규 미커버 대회 없음 — 알림 생략");
  }
  saveSeen(seen);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(`❌ uncovered-leagues 실패: ${e.stack || e.message}`);
    process.exit(1);
  });
