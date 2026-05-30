// threads-auto-poster.js — Mac mini 봇: scorebase 콘텐츠를 Instagram Threads 에 자동 발행.
//
// 흐름 (30분 주기):
//   1) heartbeat POST
//   2) 토큰 자동 refresh (하루 1회, long-lived 60일 → 영구 연장)
//   3) GET /api/internal/threads-queue → 올릴 항목 list
//   4) 각 항목 Threads 2단계 발행:
//        a. POST /{user-id}/threads        (media_type=IMAGE|TEXT, image_url, text) → creation_id
//        b. POST /{user-id}/threads_publish (creation_id)                            → media_id
//   5) 성공 → POST /api/internal/threads-posted (이력=dedup) / 실패 → /api/internal/notify (텔레그램)
//
// 토큰 관리: threads-token.json(워커 디렉토리) 우선 로드 → 없으면 .env THREADS_ACCESS_TOKEN 부트스트랩.
//   refresh 로 갱신된 토큰은 파일에 저장(.env 는 런타임에 못 고치므로 파일이 진실).
//
// 환경변수: INTERNAL_API_TOKEN(필수), THREADS_USER_ID, THREADS_ACCESS_TOKEN(최초 부트스트랩),
//           SITE_URL, THREADS_DRY_RUN=1(발행 대신 로그만).
//
// 실행 (Mac mini):
//   cd ~/dev/scorebase/mac-mini-worker
//   node threads-auto-poster.js              # 실발행
//   THREADS_DRY_RUN=1 node threads-auto-poster.js   # dry-run

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const os = require("os");
const fs = require("fs");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const BOOTSTRAP_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const DRY_RUN =
  process.env.THREADS_DRY_RUN === "1" || process.argv.includes("--dry-run");

const WORKER_NAME = "mac-mini-threads-poster";
const POLL_MS = 30 * 60 * 1000; // 30분
const GRAPH = "https://graph.threads.net/v1.0";
const TOKEN_FILE = path.resolve(__dirname, "threads-token.json");

if (!TOKEN) {
  console.error("❌ INTERNAL_API_TOKEN 미설정 — .env 확인");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

function tsKst() {
  return new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 토큰 관리 ──
function loadToken() {
  try {
    const j = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    if (j.access_token)
      return { token: j.access_token, refreshedAt: j.refreshedAt || 0 };
  } catch {
    /* 파일 없음 → 부트스트랩 */
  }
  if (BOOTSTRAP_TOKEN) return { token: BOOTSTRAP_TOKEN, refreshedAt: 0 };
  return null;
}
function saveToken(token) {
  try {
    fs.writeFileSync(
      TOKEN_FILE,
      JSON.stringify({ access_token: token, refreshedAt: Date.now() }, null, 2),
    );
  } catch (e) {
    console.warn(`${tsKst()} ⚠️ 토큰 파일 저장 실패: ${e.message}`);
  }
}

let tokenState = loadToken();

async function maybeRefreshToken() {
  if (!tokenState) return;
  const DAY = 24 * 3600 * 1000;
  // long-lived 토큰은 24h 이상 됐을 때만 refresh 가능, 60일 내 무한 연장.
  if (Date.now() - tokenState.refreshedAt < DAY) return;
  try {
    const { data } = await axios.get(
      "https://graph.threads.net/refresh_access_token",
      {
        params: {
          grant_type: "th_refresh_token",
          access_token: tokenState.token,
        },
        timeout: 15000,
      },
    );
    if (data.access_token) {
      tokenState = { token: data.access_token, refreshedAt: Date.now() };
      saveToken(data.access_token);
      console.log(
        `${tsKst()} 🔑 토큰 refresh 성공 (expires_in≈${Math.round((data.expires_in || 0) / 86400)}일)`,
      );
    }
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    console.warn(`${tsKst()} ⚠️ 토큰 refresh 실패: ${msg}`);
  }
}

// ── scorebase API ──
async function sendHeartbeat() {
  try {
    await axios.post(
      `${SITE}/api/internal/bot-heartbeat`,
      { name: WORKER_NAME, metadata: { host: os.hostname(), dryRun: DRY_RUN } },
      { headers, timeout: 10000 },
    );
  } catch (e) {
    console.warn(`${tsKst()} ⚠️ heartbeat fail: ${e.message}`);
  }
}

async function notify(payload) {
  try {
    await axios.post(
      `${SITE}/api/internal/notify`,
      { source: WORKER_NAME, ...payload },
      { headers, timeout: 15000 },
    );
  } catch (e) {
    console.error(`${tsKst()} ✗ notify fail: ${e.message}`);
  }
}

async function fetchQueue() {
  const { data } = await axios.get(`${SITE}/api/internal/threads-queue`, {
    headers,
    timeout: 30000,
  });
  return data.items || [];
}

async function reportPosted(item, mediaId) {
  await axios.post(
    `${SITE}/api/internal/threads-posted`,
    {
      kind: item.kind,
      refKey: item.refKey,
      threadsMediaId: mediaId || null,
      text: item.text,
    },
    { headers, timeout: 15000 },
  );
}

// ── Threads 2단계 발행 ──
async function publishToThreads(item) {
  const access_token = tokenState.token;

  // 1단계: 미디어 컨테이너 생성
  const createParams = item.imageUrl
    ? { media_type: "IMAGE", image_url: item.imageUrl, text: item.text, access_token }
    : { media_type: "TEXT", text: item.text, access_token };
  const { data: created } = await axios.post(
    `${GRAPH}/${THREADS_USER_ID}/threads`,
    null,
    { params: createParams, timeout: 30000 },
  );
  const creationId = created.id;
  if (!creationId) throw new Error("컨테이너 생성 응답에 id 없음");

  // 이미지 비동기 처리 대기 (Threads 권장)
  await sleep(item.imageUrl ? 6000 : 1000);

  // 2단계: 발행 (미디어 처리 지연 대비 1회 재시도)
  let mediaId;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { data: pub } = await axios.post(
        `${GRAPH}/${THREADS_USER_ID}/threads_publish`,
        null,
        { params: { creation_id: creationId, access_token }, timeout: 30000 },
      );
      mediaId = pub.id;
      break;
    } catch (e) {
      if (attempt === 2) throw e;
      await sleep(6000);
    }
  }
  return mediaId;
}

async function runOnce() {
  const t0 = Date.now();
  console.log(`\n[${tsKst()}] ▶ cycle 시작`);
  await sendHeartbeat();
  await maybeRefreshToken();

  let items;
  try {
    items = await fetchQueue();
  } catch (e) {
    console.error(`${tsKst()} ✗ 큐 조회 실패: ${e.message}`);
    return;
  }
  if (!items.length) {
    console.log(`${tsKst()} 큐 비어있음 — 올릴 항목 없음`);
    return;
  }
  console.log(`${tsKst()} 큐 ${items.length}건`);

  for (const item of items) {
    if (DRY_RUN) {
      console.log(`\n──── DRY_RUN [${item.kind}] ${item.refKey} ────`);
      console.log(`image: ${item.imageUrl || "(없음)"}`);
      console.log(item.text);
      console.log("────────────────────────────");
      continue;
    }
    if (!tokenState || !THREADS_USER_ID) {
      console.warn(
        `${tsKst()} ⚠️ Threads 토큰/USER_ID 미설정 — 발행 스킵 (셋업 대기)`,
      );
      break;
    }
    try {
      const mediaId = await publishToThreads(item);
      await reportPosted(item, mediaId);
      console.log(
        `${tsKst()} ✓ 발행 [${item.kind}] ${item.refKey} → media ${mediaId}`,
      );
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message;
      console.error(`${tsKst()} ✗ 발행 실패 [${item.kind}] ${item.refKey}: ${msg}`);
      await notify({
        severity: "WARN",
        title: "Threads 발행 실패",
        message: `[${item.kind}] ${item.refKey}\n${msg}`,
      });
    }
    await sleep(3000); // rate limit 여유
  }

  console.log(
    `[${tsKst()}] ◀ cycle 완료 (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
}

async function main() {
  console.log(`▶ ${WORKER_NAME} 시작`);
  console.log(`   site=${SITE}`);
  console.log(`   threads user=${THREADS_USER_ID || "(미설정)"}`);
  console.log(`   token=${tokenState ? "로드됨" : "(미설정)"}  dry_run=${DRY_RUN}`);
  if (!THREADS_USER_ID || !tokenState) {
    console.warn(
      "⚠️ THREADS_USER_ID 또는 토큰 미설정 — heartbeat/큐 조회는 하되 실발행은 스킵합니다. docs/threads-setup.md 참고.",
    );
  }

  process.on("SIGTERM", () => {
    console.log(`\n[${tsKst()}] SIGTERM — 종료`);
    process.exit(0);
  });

  while (true) {
    try {
      await runOnce();
    } catch (e) {
      console.error(`${tsKst()} cycle error: ${e.message}`);
    }
    await sleep(POLL_MS);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
