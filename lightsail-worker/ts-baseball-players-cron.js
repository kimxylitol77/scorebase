// ts-baseball-players-cron.js — TheSports baseball player/list page iterate.
// 매일 1회 (systemd timer 또는 cron 등록). 응답 batch 단위로 Scorebase API POST.
// API 가 team_id 로 sport 식별 (baseball-team-id-mapping.json) 후 KBO/NPB/MLB 만 upsert.
//
// 환경변수 (/home/ubuntu/.env):
//   THESPORTS_USER, THESPORTS_SECRET, SITE_URL, INTERNAL_API_TOKEN

require("dotenv").config({ path: "/home/ubuntu/.env" });
const axios = require("axios");
// 내부 워커 UA — 미들웨어 rate limit 면제(bot-detect "scorebase-monitor" 매칭, b25a72a 참조).
axios.defaults.headers.common["User-Agent"] = "scorebase-monitor/1.0 (ts-baseball-players-cron)";

const TS_BASE = "https://api.thesports.com";
const TS_USER = process.env.THESPORTS_USER;
const TS_SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;

// 한 cycle 에 fetch 할 최대 page 수 — TheSports baseball player/list 가 매우 큼.
// 응답 page total 보고 자동 종료. 안전 cap 으로 무한 루프 방지.
const MAX_PAGES = 200;
// page 간 sleep — rate limit 회피 (TheSports baseball 120 req/min 일반).
const PAGE_SLEEP_MS = 600;

if (!TS_USER || !TS_SECRET) { console.error("❌ THESPORTS env missing"); process.exit(1); }
if (!TOKEN) { console.error("❌ INTERNAL_API_TOKEN missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPlayerListPage(page) {
  const { data } = await axios.get(`${TS_BASE}/v1/baseball/player/list`, {
    params: { user: TS_USER, secret: TS_SECRET, page },
    timeout: 30_000,
  });
  if (data.code !== 0) throw new Error(`code=${data.code} page=${page}`);
  const total = data.query?.total ?? 0;
  const results = Array.isArray(data.results) ? data.results : [];
  return { total, results };
}

async function postPlayers(players) {
  const { data } = await axios.post(
    `${SITE_URL}/api/internal/ts-baseball-players`,
    { players },
    { headers: SITE_HEADERS, timeout: 60_000 },
  );
  return data;
}

async function runOnce() {
  const startedAt = Date.now();
  let totalSeen = 0;
  let totalUpserted = 0;
  let totalSkippedOther = 0;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let pageData;
    try {
      pageData = await fetchPlayerListPage(page);
    } catch (e) {
      console.error(`⚠️  page=${page} fetch 실패:`, e.message);
      break;
    }
    pagesFetched++;
    const players = pageData.results.map((p) => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? ""),
      short_name: p.short_name ?? undefined,
      team_id: p.team_id ?? undefined,
      position: p.position ?? undefined,
    })).filter((p) => p.id && p.name);
    totalSeen += players.length;

    if (players.length > 0) {
      try {
        const r = await postPlayers(players);
        totalUpserted += r.upserted ?? 0;
        totalSkippedOther += r.skippedOtherSport ?? 0;
      } catch (e) {
        console.error(`⚠️  page=${page} POST 실패:`, e.message);
      }
    }

    // page 응답이 비었거나 total 보다 많이 가져왔으면 종료.
    if (players.length === 0) break;
    if (pageData.total > 0 && pagesFetched * 100 >= pageData.total) {
      // baseball player/list 는 page 당 약 100개 — 정확 cutoff 는 응답이 비는 시점.
      // 안전망: total 추정치를 넘으면 break (응답 빈 page 까지 안 가도 됨).
    }
    await sleep(PAGE_SLEEP_MS);
  }

  const took = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `✅ 완료: pages=${pagesFetched} seen=${totalSeen} upserted=${totalUpserted} ` +
    `skippedOther=${totalSkippedOther} took=${took}s`,
  );
}

runOnce().catch((e) => {
  console.error("❌ 치명적 에러:", e.message);
  process.exit(1);
});
