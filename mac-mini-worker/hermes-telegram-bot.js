// hermes-telegram-bot.js — 텔레그램 ↔ LLM (Ollama / Claude API) 브릿지.
//
// LLM_PROVIDER 환경변수로 백엔드 선택:
//   - "ollama" (default): 맥미니 로컬 Hermes/Qwen 등
//   - "anthropic": Claude API (haiku 빠름·자연스러움, 한국어 압도적)
//
// 환경변수:
//   HERMES_TELEGRAM_TOKEN — 봇 토큰
//   HERMES_ALLOWED_CHAT_IDS — 콤마 구분 chat_id whitelist
//   LLM_PROVIDER — "ollama" | "anthropic"
//   [ollama] OLLAMA_HOST (기본 http://localhost:11434), HERMES_MODEL (기본 hermes3)
//   [anthropic] ANTHROPIC_API_KEY, ANTHROPIC_MODEL (기본 claude-haiku-4-5-20251001)
//
// 명령어:
//   /start, /help — 안내
//   /reset — 대화 history 초기화
//   /model — 현재 사용 중 모델 표시

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");

const TG_TOKEN = process.env.HERMES_TELEGRAM_TOKEN;
const ALLOWED = (process.env.HERMES_ALLOWED_CHAT_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();

// Ollama 설정
let OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
if (!/^https?:\/\//.test(OLLAMA_HOST)) OLLAMA_HOST = "http://" + OLLAMA_HOST;
OLLAMA_HOST = OLLAMA_HOST.replace(/\/\/0\.0\.0\.0/, "//localhost");
const OLLAMA_MODEL = process.env.HERMES_MODEL || "hermes3";

// Anthropic 설정
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const ANTHROPIC_SYSTEM =
  process.env.ANTHROPIC_SYSTEM ||
  "당신은 사용자의 개인 비서입니다. 한국어로 자연스럽게, 간결하게 답하세요. " +
    "사용자가 영어로 물으면 영어로 답합니다. 모르는 건 솔직히 모른다고 합니다. " +
    "scorebase.kr (스포츠 라이브 스코어 사이트) 운영자가 사용자입니다.";

const MODEL = LLM_PROVIDER === "anthropic" ? ANTHROPIC_MODEL : OLLAMA_MODEL;

if (!TG_TOKEN) {
  console.error("❌ HERMES_TELEGRAM_TOKEN missing");
  process.exit(1);
}

const tgApi = `https://api.telegram.org/bot${TG_TOKEN}`;
const history = new Map(); // chat_id → [{role, content}, ...]
const HISTORY_MAX = 30; // 대화 길이 제한 (메모리 + 컨텍스트)

async function sendTelegram(chatId, text) {
  // 텔레그램 메시지 한도 4096 자 — 길면 분할
  const chunks = [];
  for (let i = 0; i < text.length; i += 3800) {
    chunks.push(text.slice(i, i + 3800));
  }
  for (const c of chunks) {
    try {
      await axios.post(`${tgApi}/sendMessage`, {
        chat_id: chatId,
        text: c,
        disable_web_page_preview: true,
      });
    } catch (e) {
      console.error(`[send fail] ${e.response?.data?.description || e.message}`);
    }
  }
}

async function callOllama(chatId, userMessage) {
  const msgs = history.get(chatId) || [];
  msgs.push({ role: "user", content: userMessage });
  let reply;
  try {
    const res = await axios.post(
      `${OLLAMA_HOST}/api/chat`,
      { model: OLLAMA_MODEL, messages: msgs, stream: false },
      { timeout: 180_000 },
    );
    reply = res.data?.message?.content?.trim() || "(빈 응답)";
  } catch (e) {
    msgs.pop();
    throw e;
  }
  msgs.push({ role: "assistant", content: reply });
  if (msgs.length > HISTORY_MAX) msgs.splice(0, msgs.length - HISTORY_MAX);
  history.set(chatId, msgs);
  return reply;
}

async function callClaude(chatId, userMessage) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const msgs = history.get(chatId) || [];
  msgs.push({ role: "user", content: userMessage });
  let reply;
  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: ANTHROPIC_SYSTEM,
        messages: msgs,
      },
      {
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 60_000,
      },
    );
    // Anthropic 응답: content = [{type:"text", text:"..."}]
    const blocks = res.data?.content || [];
    reply = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "(빈 응답)";
  } catch (e) {
    msgs.pop();
    const apiMsg = e.response?.data?.error?.message;
    throw new Error(apiMsg || e.message);
  }
  msgs.push({ role: "assistant", content: reply });
  if (msgs.length > HISTORY_MAX) msgs.splice(0, msgs.length - HISTORY_MAX);
  history.set(chatId, msgs);
  return reply;
}

async function callLLM(chatId, userMessage) {
  if (LLM_PROVIDER === "anthropic") return callClaude(chatId, userMessage);
  return callOllama(chatId, userMessage);
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // chat_id whitelist
  if (ALLOWED.length > 0 && !ALLOWED.includes(chatId)) {
    console.log(`[skip] chat_id ${chatId} not in whitelist`);
    return;
  }

  if (!text) return;

  if (text === "/start" || text === "/help") {
    await sendTelegram(
      chatId,
      `🤖 AI 비서\n\n` +
        `자유롭게 대화하세요.\n\n` +
        `명령어:\n` +
        `/reset — 대화 초기화\n` +
        `/model — 현재 모델 정보\n` +
        `/help — 이 안내\n\n` +
        `현재 백엔드: ${LLM_PROVIDER}\n모델: ${MODEL}`,
    );
    return;
  }
  if (text === "/model") {
    await sendTelegram(
      chatId,
      `백엔드: ${LLM_PROVIDER}\n모델: ${MODEL}`,
    );
    return;
  }
  if (text === "/reset") {
    history.delete(chatId);
    await sendTelegram(chatId, "✓ 대화 초기화됨");
    return;
  }

  console.log(`[chat ${chatId}] ${text.slice(0, 80)}`);
  // "생각중..." 잠시 표시 (타자 인디케이터)
  try {
    await axios.post(`${tgApi}/sendChatAction`, {
      chat_id: chatId,
      action: "typing",
    });
  } catch {
    // 무시
  }
  try {
    const reply = await callLLM(chatId, text);
    await sendTelegram(chatId, reply);
  } catch (e) {
    console.error(`[${LLM_PROVIDER} fail] ${e.message}`);
    await sendTelegram(chatId, `❌ ${LLM_PROVIDER} 호출 실패: ${e.message}`);
  }
}

let lastUpdateId = 0;

async function poll() {
  console.log(
    `[startup] telegram-bot — provider=${LLM_PROVIDER} model=${MODEL}`,
  );
  console.log(
    `[startup] allowed chat_ids=${ALLOWED.length > 0 ? ALLOWED.join(",") : "(ALL — 보안 위해 whitelist 설정 권장)"}`,
  );
  while (true) {
    try {
      const res = await axios.get(`${tgApi}/getUpdates`, {
        params: { offset: lastUpdateId + 1, timeout: 30 },
        timeout: 40_000,
      });
      for (const update of res.data.result) {
        lastUpdateId = update.update_id;
        const msg = update.message || update.edited_message;
        if (msg) await handleMessage(msg);
      }
    } catch (e) {
      console.error(`[poll fail] ${e.message}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
poll().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
