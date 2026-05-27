// baseball-ws-subscriber.js — TheSports MQTT 실시간 push → Scorebase cache + DB.Match upsert.
// Topic: thesports/baseball/match/v1 (extra + stats + score + players)
//
// 매핑: /api/internal/ts-baseball-mapping (TheSportsMatchCache 누적 매핑)
// baseball-poller 가 team_id 매칭으로 cache 채우면 → 이 endpoint 가 그 매핑 반환
// 5분 주기로 refresh.
//
// score 메시지 받을 때 homeScore/awayScore 추출 후 cache POST 에 함께 보냄 →
// /api/internal/thesports-cache 가 DB.Match.homeScore/awayScore monotonic max update.
// 결과: /scores 야구 목록 SSR 이 즉시 fresh 받음 (이전 15-30초 → 2-3초).

require("dotenv").config({ path: "/home/ubuntu/.env" });
const mqtt = require("mqtt");
const axios = require("axios");

const USER = process.env.THESPORTS_USER;
const SECRET = process.env.THESPORTS_SECRET;
const SITE_URL = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
if (!USER || !SECRET || !TOKEN) { console.error("❌ env missing"); process.exit(1); }

const SITE_HEADERS = { Authorization: `Bearer ${TOKEN}` };

// === ts match id → { matchId, swap } 매핑 (5분 TTL) ===
// swap: TheSports 의 home/away 가 우리 home/away 와 거꾸로면 true.
// baseball-poller 가 match/list 의 home_team_id 와 우리 Team.tsTeamId 비교로 결정.
let mappingCache = new Map();
let mappingFetchedAt = 0;
const MAPPING_TTL_MS = 5 * 60 * 1000;

async function refreshMapping(force = false) {
  if (!force && Date.now() - mappingFetchedAt < MAPPING_TTL_MS && mappingCache.size > 0) return;
  try {
    const { data } = await axios.get(
      `${SITE_URL}/api/internal/ts-baseball-mapping`,
      { headers: SITE_HEADERS, timeout: 20_000 },
    );
    const newMap = new Map(Object.entries(data.mapping || {}));
    mappingCache = newMap;
    mappingFetchedAt = Date.now();
    console.log(`[mapping] refreshed ${mappingCache.size} ts↔our match entries`);
  } catch (e) {
    console.error(`[mapping] refresh fail: ${e.message}`);
  }
}

// baseball MQTT score 메시지에서 현재 점수 추출.
// raw ft = [ts_away, ts_home] 일관 (메모리: feedback_thesports_baseball_indexing).
// swap=true 면 ts_home == our_away → 우리 관점에서 뒤집어 반환.
function extractBaseballScore(item, swap) {
  const arr = item?.score;
  if (!Array.isArray(arr) || arr.length < 4) return [null, null];
  const scores = arr[3];
  if (!scores || typeof scores !== "object") return [null, null];
  const ft = scores.ft;
  if (!Array.isArray(ft) || ft.length < 2) return [null, null];
  const tsAway = parseInt(String(ft[0]), 10);
  const tsHome = parseInt(String(ft[1]), 10);
  if (!Number.isFinite(tsHome) || !Number.isFinite(tsAway)) return [null, null];
  return swap ? [tsAway, tsHome] : [tsHome, tsAway]; // [homeScore, awayScore]
}

async function pushCache(matchId, tsMatchId, detailLiveDelta, homeScore, awayScore) {
  try {
    const body = { matchId, tsMatchId, detailLive: detailLiveDelta };
    if (typeof homeScore === "number" && typeof awayScore === "number") {
      body.homeScore = homeScore;
      body.awayScore = awayScore;
    }
    await axios.post(
      `${SITE_URL}/api/internal/thesports-cache`,
      body,
      { headers: SITE_HEADERS, timeout: 10_000 },
    );
  } catch (e) {
    console.error(`[cache] push fail match=${matchId}: ${e.message}`);
  }
}

let totalReceived = 0;
let totalPushed = 0;
let totalSkipped = 0;
let totalDbUpdated = 0;

async function handleMessage(topic, payload) {
  let arr;
  try { arr = JSON.parse(payload.toString()); }
  catch { return; }
  if (!Array.isArray(arr)) return;

  await refreshMapping();

  totalReceived += arr.length;
  for (const item of arr) {
    if (!item?.id) continue;
    const entry = mappingCache.get(item.id);
    if (!entry || entry.matchId == null) { totalSkipped++; continue; }
    const delta = {};
    if (item.extra) delta.extra = item.extra;
    if (item.score) delta.score = item.score;
    if (item.stats) delta.stats = item.stats;
    if (item.players) delta.players = item.players;
    if (Object.keys(delta).length === 0) continue;

    // score 메시지 있으면 DB.Match.homeScore/awayScore 도 함께 update.
    const [homeScore, awayScore] = item.score
      ? extractBaseballScore(item, entry.swap === true)
      : [null, null];
    if (homeScore != null && awayScore != null) totalDbUpdated++;

    await pushCache(parseInt(entry.matchId, 10), item.id, delta, homeScore, awayScore);
    totalPushed++;
  }
}

// === MQTT 연결 ===
const URL = "wss://mq.thesports.com:443/mqtt";
const client = mqtt.connect(URL, {
  username: USER,
  password: SECRET,
  reconnectPeriod: 5_000,
  connectTimeout: 30_000,
  clean: true,
});

client.on("connect", async () => {
  console.log("[connect] ✅ wss://mq.thesports.com:443");
  await refreshMapping(true);
  client.subscribe("thesports/baseball/match/v1", { qos: 0 }, (err, granted) => {
    if (err || granted[0]?.qos === 128) {
      console.error(`[subscribe] ❌ ${err?.message ?? "denied"}`);
      process.exit(1);
    }
    console.log(`[subscribe] ✅ thesports/baseball/match/v1 qos=${granted[0]?.qos}`);
  });
});

client.on("message", handleMessage);
client.on("error", (e) => console.error("[mqtt-error]", e.message));
client.on("reconnect", () => console.log("[mqtt] reconnecting..."));
client.on("close", () => console.log("[mqtt] connection closed"));

// 매 60초 통계
setInterval(() => {
  console.log(`[stats] received=${totalReceived} pushed=${totalPushed} skipped=${totalSkipped} db-updated=${totalDbUpdated} mapping=${mappingCache.size}`);
}, 60_000);

process.on("SIGTERM", () => { client.end(); process.exit(0); });
process.on("SIGINT", () => { client.end(); process.exit(0); });

console.log("[startup] baseball-ws-subscriber (score → DB.Match update enabled)");
