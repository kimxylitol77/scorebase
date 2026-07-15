// 슬랙 ↔ Hermes 두뇌 브릿지 (Socket Mode). 텔레그램 봇과 같은 hermes-core 두뇌를 공유한다.
//
// 환경변수 (mac-mini-worker/.env):
//   SLACK_BOT_TOKEN       — xoxb-… (OAuth & Permissions)
//   SLACK_APP_TOKEN       — xapp-… (Socket Mode, connections:write)
//   SLACK_ALLOWED_USER_IDS — 콤마구분 슬랙 user id whitelist (비우면 전체 허용 — 권장 안 함)
//   LLM_PROVIDER / ANTHROPIC_API_KEY / ANTHROPIC_MODEL — hermes-core 가 사용
//
// 대화. @멘션(채널) + DM 자유대화 → callLLM.
// 명령. /help /status (즉시) · /fix /repair (즉시 ack 후 결과 비동기 게시).

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const { App } = require("@slack/bolt");
const { LLM_PROVIDER, MODEL, callLLM, resetHistory, runClaudeFix } = require("./hermes-core");

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const ALLOWED = (process.env.SLACK_ALLOWED_USER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!BOT_TOKEN || !APP_TOKEN) {
  console.error("❌ SLACK_BOT_TOKEN / SLACK_APP_TOKEN missing (mac-mini-worker/.env)");
  process.exit(1);
}

const app = new App({ token: BOT_TOKEN, appToken: APP_TOKEN, socketMode: true });

const SLACK_LIMIT = 3500; // 슬랙 텍스트 한도(~4000) 보수적 분할
const startedAt = Date.now();

function allowed(userId) {
  return ALLOWED.length === 0 || ALLOWED.includes(userId);
}

// 멘션 토큰(<@U…>) 제거
function stripMention(t) {
  return (t || "").replace(/<@[^>]+>/g, "").trim();
}

// say() 로 길면 분할 전송
async function sayChunks(say, text) {
  for (let i = 0; i < text.length; i += SLACK_LIMIT) {
    await say(text.slice(i, i + SLACK_LIMIT));
  }
}

// client 로 특정 채널에 분할 게시 (슬래시 명령 비동기 결과용)
async function postChunks(client, channel, text) {
  for (let i = 0; i < text.length; i += SLACK_LIMIT) {
    await client.chat.postMessage({ channel, text: text.slice(i, i + SLACK_LIMIT) });
  }
}

function helpText() {
  return (
    `🤖 Hermes — scorebase 운영 비서\n\n` +
    `채널에선 @Hermes 멘션, DM 은 그냥 말하면 됩니다.\n\n` +
    `/help — 이 안내\n` +
    `/status — 봇 상태\n` +
    `/fix <지시> — Claude Code 진단 (읽기전용, 최대 5분)\n` +
    `/repair <지시> — Claude Code 수리 (수정·재시작·commit·push, 최대 10분)\n\n` +
    `백엔드: ${LLM_PROVIDER} · 모델: ${MODEL}`
  );
}

function statusText() {
  const up = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(up / 3600);
  const m = Math.floor((up % 3600) / 60);
  return (
    `✅ Hermes 슬랙 봇 작동 중\n` +
    `업타임: ${h}시간 ${m}분\n` +
    `백엔드: ${LLM_PROVIDER} · 모델: ${MODEL}\n` +
    `whitelist: ${ALLOWED.length > 0 ? `${ALLOWED.length}명` : "전체(권장 안 함)"}\n` +
    `(scorebase 상세 진단은 /fix)`
  );
}

// 자유 대화 (멘션·DM 공통)
async function handleChat(text, key, say) {
  try {
    const reply = await callLLM(key, text);
    await sayChunks(say, reply);
  } catch (e) {
    console.error(`[${LLM_PROVIDER} fail] ${e.message}`);
    await say(`❌ ${LLM_PROVIDER} 호출 실패: ${e.message}`);
  }
}

// 슬래시 /fix /repair 공통 — 즉시 ack 후 claude -p 결과 비동기 게시
async function handleClaudeCommand(command, ack, client, mode) {
  const repair = mode === "repair";
  await ack(repair ? "🔧 수리 시작… (최대 10분)" : "🔍 진단 시작… (읽기전용, 최대 5분)");
  if (!allowed(command.user_id)) return;
  const instruction = (command.text || "").trim();
  if (!instruction) {
    await postChunks(
      client,
      command.channel_id,
      repair
        ? "사용법: /repair <수리할 내용>\n예) /repair preview-coverage 봇 재시작"
        : "사용법: /fix <진단할 내용>\n예) /fix /predictions/NHL 브라켓 왜 stale 인지",
    );
    return;
  }
  console.log(`[${mode} ${command.user_id}] ${instruction.slice(0, 80)}`);
  try {
    const result = await runClaudeFix(instruction, mode);
    await postChunks(client, command.channel_id, result);
  } catch (e) {
    await postChunks(client, command.channel_id, `❌ ${repair ? "수리" : "진단"} 실패: ${e.message}`);
  }
}

// ── 이벤트 핸들러 ───────────────────────────────────────────────
app.event("app_mention", async ({ event, say }) => {
  if (!allowed(event.user)) return;
  const text = stripMention(event.text);
  if (!text) return;
  if (text === "reset" || text === "초기화") {
    resetHistory(event.channel);
    await say("✓ 대화 초기화됨");
    return;
  }
  console.log(`[mention ${event.user}] ${text.slice(0, 80)}`);
  await handleChat(text, event.channel, say);
});

app.message(async ({ message, say }) => {
  // DM(message.im) 만 자유대화. 채널은 멘션으로만.
  if (message.subtype || message.bot_id) return;
  if (message.channel_type !== "im") return;
  if (!allowed(message.user)) return;
  const text = (message.text || "").trim();
  if (!text) return;
  if (text === "/reset" || text === "reset" || text === "초기화") {
    resetHistory(message.user);
    await say("✓ 대화 초기화됨");
    return;
  }
  console.log(`[dm ${message.user}] ${text.slice(0, 80)}`);
  await handleChat(text, message.user, say);
});

app.command("/help", async ({ ack }) => {
  await ack(helpText());
});

app.command("/status", async ({ ack }) => {
  await ack(statusText());
});

app.command("/fix", async ({ command, ack, client }) => {
  await handleClaudeCommand(command, ack, client, "fix");
});

app.command("/repair", async ({ command, ack, client }) => {
  await handleClaudeCommand(command, ack, client, "repair");
});

// ── 기동 ────────────────────────────────────────────────────────
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

(async () => {
  await app.start();
  console.log(
    `[startup] slack hermes — provider=${LLM_PROVIDER} model=${MODEL} ` +
      `whitelist=${ALLOWED.length > 0 ? ALLOWED.join(",") : "(ALL)"}`,
  );
})().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
