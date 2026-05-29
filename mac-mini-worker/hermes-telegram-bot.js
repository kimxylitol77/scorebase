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
const { spawn } = require("child_process");

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

// ── /fix — Claude Code 헤드리스 진단 ───────────────────────────────
// 텔레 지시 → 맥미니 repo 에서 `claude -p` 실행 (읽기전용 도구만) → 결과 회신.
// Phase 1: 진단 + 수정안(diff) 제안만. 파일 수정/commit/push 안 함 (allowlist 로 차단).
const REPO_DIR = path.resolve(__dirname, ".."); // /Users/kkulkkul/dev/scorebase
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/opt/homebrew/bin/claude";
const FIX_TIMEOUT_MS = 5 * 60 * 1000;

// 읽기전용 진단 도구만 — Edit/Write/commit/push/rm 은 목록에 없어 자동 차단됨.
const FIX_ALLOWED_TOOLS = [
  "Read", "Grep", "Glob",
  "mcp__postgres__query",
  "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)",
  "Bash(npx tsc:*)",
  "Bash(cat:*)", "Bash(ls:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)",
  "Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)", "Bash(curl:*)",
].join(",");

const FIX_SYSTEM = [
  "너는 scorebase(스포츠 라이브스코어 사이트) 운영 진단 보조다.",
  "읽기전용으로 원인을 진단하라. 파일을 수정하거나 git commit/push 하지 마라.",
  "코드 수정이 필요하면 적용하지 말고 제안 diff 와 설명을 한국어로 간결히 출력하라.",
  "DB 조회는 postgres MCP(읽기전용), 진단 endpoint 는 curl 로 확인할 수 있다.",
].join(" ");

function runClaudeFix(instruction) {
  return new Promise((resolve) => {
    const args = [
      "-p", instruction,
      "--allowedTools", FIX_ALLOWED_TOOLS,
      "--append-system-prompt", FIX_SYSTEM,
    ];
    let out = "";
    let err = "";
    let done = false;
    const child = spawn(CLAUDE_BIN, args, { cwd: REPO_DIR, env: process.env });
    const timer = setTimeout(() => {
      if (!done) { try { child.kill("SIGTERM"); } catch {} }
    }, FIX_TIMEOUT_MS);
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });
    child.on("error", (e) => {
      done = true; clearTimeout(timer);
      resolve(`❌ claude 실행 실패: ${e.message}`);
    });
    child.on("close", (code) => {
      done = true; clearTimeout(timer);
      const body = out.trim() || err.trim() || "(출력 없음)";
      resolve(code === 0 ? body : `⚠️ claude 종료 code=${code}\n${body}`);
    });
  });
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
        `/fix <지시> — Claude Code 진단 (읽기전용, repo+DB 조회)\n` +
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
  if (text.startsWith("/fix") || text.startsWith("/진단")) {
    const instruction = text.replace(/^\/(fix|진단)\s*/, "").trim();
    if (!instruction) {
      await sendTelegram(
        chatId,
        "사용법: /fix <진단할 내용>\n예) /fix /predictions/NHL 브라켓 왜 stale 인지 봐줘",
      );
      return;
    }
    console.log(`[fix ${chatId}] ${instruction.slice(0, 80)}`);
    await sendTelegram(chatId, "🔍 Claude Code 진단 중… (읽기전용, 최대 5분)");
    try {
      const result = await runClaudeFix(instruction);
      await sendTelegram(chatId, result);
    } catch (e) {
      await sendTelegram(chatId, `❌ 진단 실패: ${e.message}`);
    }
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
