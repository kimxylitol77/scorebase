// TheSports football MQTT topic 가능 여부 자체 진단.
// 맥미니 (또는 IP whitelist 머신) 에서 실행 — mqtt 라이브러리 필요.
//
// 사용:
//   scp scripts/_test-thesports-football-mqtt.js kkulkkul@scorebase-mimi.local:/tmp/
//   ssh kkulkkul@scorebase-mimi.local 'cd /Users/kkulkkul/dev/scorebase/mac-mini-worker && node /tmp/_test-thesports-football-mqtt.js'

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../mac-mini-worker/.env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const mqtt = require("mqtt");

const USER = process.env.THESPORTS_USER;
const SECRET = process.env.THESPORTS_SECRET;

if (!USER || !SECRET) {
  console.error("❌ THESPORTS_USER / THESPORTS_SECRET 미설정");
  process.exit(1);
}

// 시도할 topic 목록 — baseball 패턴 + football REST endpoint 매칭으로 추정
const TOPICS = [
  // 핵심 (점수/이벤트)
  "thesports/football/match/v1",
  "thesports/football/incident/v1",
  "thesports/football/stats/v1",
  // 통계
  "thesports/football/team_stats/v1",
  "thesports/football/player_stats/v1",
  "thesports/football/half/team_stats/v1",
  // 라인업/list
  "thesports/football/lineup/v1",
  "thesports/football/live/v1",
  // 분석
  "thesports/football/analysis/v1",
  "thesports/football/season_stats/v1",
  // 기타
  "thesports/football/odds/v1",
  "thesports/football/standings/v1",
];

const URL = "wss://mq.thesports.com:443/mqtt";
console.log(`[connect] ${URL}`);

const client = mqtt.connect(URL, {
  username: USER,
  password: SECRET,
  connectTimeout: 15_000,
  reconnectPeriod: 0, // 한 번만 시도
});

const grantedTopics = new Map(); // topic → qos
const deniedTopics = new Set();
const messageCount = new Map();
const messageSamples = new Map();

client.on("connect", () => {
  console.log("[connect] ✅ MQTT 연결 성공\n");
  console.log("=== Topic subscribe 시도 ===");
  let pending = TOPICS.length;
  for (const t of TOPICS) {
    client.subscribe(t, { qos: 0 }, (err, granted) => {
      pending--;
      if (err) {
        console.log(`  ❌ ${t} — ${err.message}`);
        deniedTopics.add(t);
      } else if (granted && granted[0]?.qos === 128) {
        console.log(`  ❌ ${t} — denied (plan 미포함 또는 미존재)`);
        deniedTopics.add(t);
      } else {
        const qos = granted?.[0]?.qos ?? 0;
        console.log(`  ✅ ${t} — granted qos=${qos}`);
        grantedTopics.set(t, qos);
        messageCount.set(t, 0);
      }
      if (pending === 0) {
        console.log("\n=== 30초간 메시지 수신 대기 (sample 수집) ===");
      }
    });
  }
});

client.on("message", (topic, payload) => {
  const cnt = (messageCount.get(topic) ?? 0) + 1;
  messageCount.set(topic, cnt);
  if (!messageSamples.has(topic)) {
    try {
      const json = JSON.parse(payload.toString());
      messageSamples.set(topic, json);
    } catch {
      messageSamples.set(topic, payload.toString().slice(0, 200));
    }
  }
});

client.on("error", (e) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.log("\n=== 30초 결과 ===");
  console.log(`Granted: ${grantedTopics.size} / Denied: ${deniedTopics.size}\n`);

  console.log("✅ 사용 가능한 topic:");
  for (const [t, q] of grantedTopics) {
    const cnt = messageCount.get(t) ?? 0;
    console.log(`  ${t} (qos=${q}) — ${cnt} 메시지 수신`);
  }

  console.log("\n📨 메시지 sample (각 topic 첫 message):");
  for (const [t, sample] of messageSamples) {
    const s = typeof sample === "string" ? sample : JSON.stringify(sample);
    console.log(`\n  --- ${t} ---`);
    console.log(`  ${s.slice(0, 600)}`);
    if (s.length > 600) console.log(`  ... (${s.length} chars total)`);
  }

  console.log("\n❌ 거부된 topic:");
  for (const t of deniedTopics) console.log(`  ${t}`);

  client.end();
  process.exit(0);
}, 30_000);
