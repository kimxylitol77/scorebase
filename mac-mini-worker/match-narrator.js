// match-narrator.js — Mac mini Ollama 워커. 라이브 매치 진행 상황 박스 (3-4문장) 5분 주기 생성.
//
// 흐름:
//   1) heartbeat POST (워커 살아있음 알림)
//   2) GET /api/internal/live-matches-for-bot → LIVE 매치 리스트
//   3) 각 매치:
//      - 직전 summary 가 5분 이내면 skip (TTL)
//      - Ollama (qwen2.5:14b) 호출 → 3-4문장 한국어 분석
//      - POST /api/internal/live-commentary → DB upsert
//   4) sleep 5min, 반복
//
// 실행:
//   cd ~/scorebase/mac-mini-worker
//   npm install
//   cp .env.example .env && vi .env  # INTERNAL_API_TOKEN 채우기
//   node match-narrator.js
//
// 환경변수 (.env):
//   INTERNAL_API_TOKEN  — scorebase Vercel env 와 동일 값
//   SITE_URL            — 기본 https://www.scorebase.kr
//   OLLAMA_HOST         — 기본 http://localhost:11434
//   OLLAMA_MODEL        — 기본 qwen2.5:14b
//   LEAGUES             — 기본 KBO (콤마구분 가능: "KBO,NPB,MLB")

const path = require("path");
// 1. mac-mini-worker/.env 우선 (개별 봇 설정)
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
// 2. ../.env.local fallback (scorebase 키 자동 활용)
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");

// ── config ────────────────────────────────────────────────────
const SCOREBASE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// launchd 환경에 Ollama 앱이 OLLAMA_HOST=0.0.0.0:11434 (listen 주소) 를 미리 set 해놓는
// 경우 있음 — 스킴 보강 + 0.0.0.0 (outbound 불가) 을 localhost 로 정규화.
const OLLAMA = (() => {
  const raw = process.env.OLLAMA_HOST || "http://localhost:11434";
  const withScheme = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/^https?:\/\/0\.0\.0\.0(?=[:/]|$)/, "http://localhost");
})();
const MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b";
const LEAGUES = (process.env.LEAGUES || "KBO,NPB,MLB").split(",").map((s) => s.trim());

const WORKER_NAME = "mac-mini-match-narrator";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5분 주기
const SUMMARY_TTL_MS = 5 * 60 * 1000; // 직전 summary 5분 이내면 skip
const OLLAMA_TIMEOUT_MS = 180_000; // 14B 추론 최대 3분 허용

if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

// ── helpers ───────────────────────────────────────────────────
function tsKst() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function logPrefix() {
  return `[${tsKst()}]`;
}

async function sendHeartbeat() {
  try {
    await axios.post(
      `${SCOREBASE}/api/internal/bot-heartbeat`,
      {
        name: WORKER_NAME,
        metadata: { host: os.hostname(), model: MODEL, leagues: LEAGUES },
      },
      { headers, timeout: 10_000 },
    );
  } catch (e) {
    console.warn(`${logPrefix()} ⚠️ heartbeat 실패:`, e.message);
  }
}

async function fetchLiveMatches() {
  const { data } = await axios.get(`${SCOREBASE}/api/internal/live-matches-for-bot`, {
    params: { leagues: LEAGUES.join(",") },
    headers,
    timeout: 30_000,
  });
  return data.matches || [];
}

function buildPrompt(match) {
  const home = match.homeName;
  const away = match.awayName;
  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;

  return `너는 한국 스포츠 라이브 캐스터다. 다음 ${match.league} 매치의 현재 상황을 한국어 3-4문장으로 분석하시오.

[지침]
- 데이터 기반, 추측·hallucination 금지
- "지금" 시점의 긴장감·흐름·다음 변수 포함
- 짧고 강렬하게. 통계 인용 시 정확하게.
- 답은 본문만 (인사·해설자 멘트 X)

[매치 정보]
- 리그: ${match.league}
- 어웨이: ${away} (${as_}점)
- 홈: ${home} (${hs}점)
- 스코어: ${away} ${as_} - ${hs} ${home}
`;
}

async function generateSummary(match) {
  const prompt = buildPrompt(match);
  const { data } = await axios.post(
    `${OLLAMA}/v1/chat/completions`,
    {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 400,
    },
    { timeout: OLLAMA_TIMEOUT_MS },
  );
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

function makeScoreSnapshot(m) {
  return `${m.awayScore ?? 0}:${m.homeScore ?? 0}`;
}

async function postCommentary(match, summary, snapshot) {
  await axios.post(
    `${SCOREBASE}/api/internal/live-commentary`,
    {
      matchId: match.matchId,
      league: match.league,
      matchSummary: summary,
      scoreSnapshot: snapshot,
      model: `ollama-${MODEL}`,
    },
    { headers, timeout: 30_000 },
  );
}

// ── main loop ─────────────────────────────────────────────────
async function runOnce() {
  const cycleStart = Date.now();
  console.log(`\n${logPrefix()} ▶ cycle start`);

  await sendHeartbeat();

  let matches;
  try {
    matches = await fetchLiveMatches();
  } catch (e) {
    console.error(`${logPrefix()} ✗ live-matches fetch 실패:`, e.message);
    return;
  }
  console.log(`${logPrefix()}   live 매치: ${matches.length}건`);

  for (const m of matches) {
    const label = `${m.awayName} vs ${m.homeName} (matchId=${m.matchId})`;
    try {
      // TTL skip
      if (m.lastSummaryAt) {
        const age = Date.now() - new Date(m.lastSummaryAt).getTime();
        if (age < SUMMARY_TTL_MS) {
          const ageS = Math.round(age / 1000);
          console.log(`${logPrefix()}   ↩ skip ${label} (${ageS}s 전 생성)`);
          continue;
        }
      }

      const t0 = Date.now();
      const summary = await generateSummary(m);
      if (!summary) {
        console.warn(`${logPrefix()}   ⚠ empty ${label}`);
        continue;
      }

      const snapshot = makeScoreSnapshot(m);
      await postCommentary(m, summary, snapshot);
      const dur = Date.now() - t0;
      console.log(
        `${logPrefix()}   ✓ ${label} (${dur}ms): ${summary.slice(0, 60).replace(/\n/g, " ")}...`,
      );
    } catch (e) {
      console.error(`${logPrefix()}   ✗ ${label}:`, e.message);
    }
  }

  const cycleDur = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`${logPrefix()} ◀ cycle done (${cycleDur}s)`);
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작`);
  console.log(`   site=${SCOREBASE}`);
  console.log(`   ollama=${OLLAMA} model=${MODEL}`);
  console.log(`   leagues=${LEAGUES.join(",")}`);
  console.log(`   refresh=${REFRESH_INTERVAL_MS / 1000}s, ttl=${SUMMARY_TTL_MS / 1000}s`);

  // graceful shutdown
  process.on("SIGTERM", () => {
    console.log(`\n${logPrefix()} SIGTERM — 종료`);
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log(`\n${logPrefix()} SIGINT — 종료`);
    process.exit(0);
  });

  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error(`${logPrefix()} cycle error:`, e.message);
    }
    await new Promise((r) => setTimeout(r, REFRESH_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
