// Hermes 봇 공용 두뇌 — LLM 호출(Ollama/Claude) + Claude Code 진단/수리 spawn. 텔레그램·슬랙 등 전송 계층과 무관.
//
// 전송 계층(텔레그램/슬랙)은 이 모듈의 callLLM·runClaudeFix 만 호출하면 된다.
// 대화 history 는 전송 무관한 generic key(텔레그램=chat_id, 슬랙=channel/user) 로 분리 저장.

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const axios = require("axios");
const { spawn } = require("child_process");

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();

// Ollama 설정
let OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
if (!/^https?:\/\//.test(OLLAMA_HOST)) OLLAMA_HOST = "http://" + OLLAMA_HOST;
OLLAMA_HOST = OLLAMA_HOST.replace(/\/\/0\.0\.0\.0/, "//localhost");
const OLLAMA_MODEL = process.env.HERMES_MODEL || "hermes3";

// Anthropic 설정
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const SYSTEM_PROMPT =
  process.env.HERMES_SYSTEM ||
  "너는 '헤르메스(Hermes)'다. scorebase.kr(스포츠 라이브스코어 사이트) 운영자의 슬랙 비서다. " +
    "한국어로 자연스럽고 간결하게 답한다. 사용자가 영어로 물으면 영어로 답한다. " +
    "이름을 물으면 '헤르메스'라고 답하고, 절대 'Qwen'·'Claude' 등 모델명으로 자칭하지 않는다. " +
    "모르는 건 솔직히 모른다고 한다.";

const MODEL = LLM_PROVIDER === "anthropic" ? ANTHROPIC_MODEL : OLLAMA_MODEL;

const history = new Map(); // key → [{role, content}, ...]
const HISTORY_MAX = 30;

async function callOllama(key, userMessage) {
  const msgs = history.get(key) || [];
  msgs.push({ role: "user", content: userMessage });
  let reply;
  try {
    const res = await axios.post(
      `${OLLAMA_HOST}/api/chat`,
      { model: OLLAMA_MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...msgs], stream: false },
      { timeout: 180_000 },
    );
    reply = res.data?.message?.content?.trim() || "(빈 응답)";
  } catch (e) {
    msgs.pop();
    throw e;
  }
  msgs.push({ role: "assistant", content: reply });
  if (msgs.length > HISTORY_MAX) msgs.splice(0, msgs.length - HISTORY_MAX);
  history.set(key, msgs);
  return reply;
}

async function callClaude(key, userMessage) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const msgs = history.get(key) || [];
  msgs.push({ role: "user", content: userMessage });
  let reply;
  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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
    const blocks = res.data?.content || [];
    reply =
      blocks
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
  history.set(key, msgs);
  return reply;
}

async function callLLM(key, userMessage) {
  if (LLM_PROVIDER === "anthropic") return callClaude(key, userMessage);
  return callOllama(key, userMessage);
}

function resetHistory(key) {
  history.delete(key);
}

// ── Claude Code 헤드리스 진단/수리 ─────────────────────────────────
// 지시 → 맥미니 repo 에서 `claude -p` 실행 → 결과 문자열 회신.
//   fix    : 읽기전용 진단 (Edit/Write/commit/push 없음 — allowlist 로 차단)
//   repair : 수정·재시작·commit·push 까지 (chat whitelist 가 1차 방어선)
const REPO_DIR = path.resolve(__dirname, ".."); // mac-mini: /Users/kkulkkul/dev/scorebase
const CLAUDE_BIN = process.env.CLAUDE_BIN || "/opt/homebrew/bin/claude";
const FIX_TIMEOUT_MS = 5 * 60 * 1000;
const REPAIR_TIMEOUT_MS = 10 * 60 * 1000;

const FIX_ALLOWED_TOOLS = [
  "Read", "Grep", "Glob",
  "mcp__postgres__query",
  "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)",
  "Bash(npx tsc:*)",
  "Bash(cat:*)", "Bash(ls:*)", "Bash(head:*)", "Bash(tail:*)", "Bash(wc:*)",
  "Bash(grep:*)", "Bash(rg:*)", "Bash(find:*)", "Bash(curl:*)",
].join(",");

const REPAIR_ALLOWED_TOOLS = [
  FIX_ALLOWED_TOOLS,
  "Edit", "Write",
  "Bash(git add:*)", "Bash(git commit:*)", "Bash(git push:*)", "Bash(git fetch:*)", "Bash(git reset:*)",
  "Bash(launchctl:*)", "Bash(pkill -f autossh:*)",
  "Bash(npx prisma generate:*)", "Bash(npx tsx:*)", "Bash(node:*)", "Bash(zsh -n:*)",
  "Bash(scp:*)", "Bash(ssh:*)",
].join(",");

const FIX_SYSTEM = [
  "너는 scorebase(스포츠 라이브스코어 사이트) 운영 진단 보조다.",
  "읽기전용으로 원인을 진단하라. 파일을 수정하거나 git commit/push 하지 마라.",
  "코드 수정이 필요하면 적용하지 말고 제안 diff 와 설명을 한국어로 간결히 출력하라.",
  "DB 조회는 postgres MCP(읽기전용), 진단 endpoint 는 curl 로 확인할 수 있다.",
].join(" ");

const REPAIR_SYSTEM = [
  "너는 scorebase 운영 수리 봇이다. mac-mini repo(~/dev/scorebase)에서 실행 중이다.",
  "절차: ① 원인 진단 ② 최소 수정 ③ 검증(tsc/zsh -n/재실행) ④ 필요 시 commit·push(main 직접, 한국어 메시지, footer 없음) ⑤ 결과를 한국어로 간결 보고.",
  "검증과 push 판정에 파이프를 쓰지 마라 — `cmd | tail` 은 exit code 가 tail 것이라 실패가 0 으로 읽힌다(2026-08-22 커밋 5건이 \"push 성공\" 오보 후 사라졌다). tsc 는 `out=$(npx tsc --noEmit 2>&1); code=$?` 로 받고, push 는 거부되면 fetch + rebase 후 재시도하며, 끝나고 `git rev-list --count origin/main..HEAD` 가 0 인 것을 확인한 뒤에만 완료라고 보고하라.",
  "봇 재시작: launchctl kickstart -k gui/$(id -u)/com.scorebase.<name>. Lightsail 워커는 ssh ubuntu@15.164.60.238 (LightsailDefaultKey).",
  "위험한 광역 삭제·schema 변경·대량 데이터 변경은 하지 말고 제안만 하라.",
].join(" ");

function runClaudeFix(instruction, mode = "fix") {
  const repair = mode === "repair";
  return new Promise((resolve) => {
    const args = [
      "-p", instruction,
      "--allowedTools", repair ? REPAIR_ALLOWED_TOOLS : FIX_ALLOWED_TOOLS,
      "--append-system-prompt", repair ? REPAIR_SYSTEM : FIX_SYSTEM,
    ];
    let out = "";
    let err = "";
    let done = false;
    // Max 구독(OAuth 토큰)으로 인증 — ANTHROPIC_API_KEY 가 OAuth 토큰을 이기므로
    // claude 자식 프로세스 env 에서만 제거 (봇 자체 챗은 process.env 의 API 키 계속 사용).
    const childEnv = { ...process.env };
    delete childEnv.ANTHROPIC_API_KEY;
    const child = spawn(CLAUDE_BIN, args, { cwd: REPO_DIR, env: childEnv });
    const timer = setTimeout(
      () => {
        if (!done) {
          try { child.kill("SIGTERM"); } catch {}
        }
      },
      repair ? REPAIR_TIMEOUT_MS : FIX_TIMEOUT_MS,
    );
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

module.exports = {
  LLM_PROVIDER,
  MODEL,
  callLLM,
  resetHistory,
  runClaudeFix,
};
