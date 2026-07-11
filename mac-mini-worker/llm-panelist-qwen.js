// 로컬 Qwen 예측 패널 워커 — 맥미니 launchd.
// Vercel 은 Ollama 에 못 닿으므로, 서버가 만든 프롬프트를 대신 로컬 Ollama(qwen2.5:32b)에 전달하고
// 원문 응답을 서버로 되돌린다. 프롬프트/파싱/채점은 전부 서버(TS)에 있어 GPT 와 동일 파이프라인.
//   ① GET  /api/internal/llm-panel?cap=N → 예정 경기별 {matchId, system, user} 태스크
//   ② 각 태스크를 로컬 Ollama 로 실행(JSON 강제) → raw 응답 수집
//   ③ POST /api/internal/llm-panel {items:[{matchId,text}]} → 서버가 파싱·저장

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const axios = require("axios");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/chat";
const OLLAMA_MODEL = process.env.QWEN_PANEL_MODEL || "qwen2.5:32b";
const CAP = Number(process.env.QWEN_PANEL_CAP || 40);
const CALL_GAP_MS = 500; // Ollama 호출 사이 간격

function log(...a) {
  console.log(new Date().toISOString(), "[qwen-panel]", ...a);
}

// 서버가 준 프롬프트를 그대로 Ollama 에 전달 → raw JSON 텍스트 반환(파싱은 서버가).
async function askOllama(system, user) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data } = await axios.post(
        OLLAMA_URL,
        {
          model: OLLAMA_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          stream: false,
          format: "json",
          options: { temperature: 0.3, num_ctx: 4096 },
        },
        { timeout: 180000 },
      );
      const content = ((data && data.message && data.message.content) || "").trim();
      if (content) return content;
    } catch (e) {
      log(`Ollama 호출 실패(attempt ${attempt + 1}):`, e.message);
    }
  }
  return null;
}

async function main() {
  if (!TOKEN) {
    console.error("❌ INTERNAL_API_TOKEN 미설정");
    process.exit(1);
  }

  let tasks;
  try {
    const { data } = await axios.get(`${SITE}/api/internal/llm-panel?cap=${CAP}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 60000,
    });
    tasks = (data && data.tasks) || [];
  } catch (e) {
    console.error("태스크 조회 실패:", e.message);
    process.exit(1);
  }
  if (tasks.length === 0) {
    log("대상 경기 없음 — 종료");
    return;
  }
  log(`대상 ${tasks.length}경기 — Ollama 예측 시작 (${OLLAMA_MODEL})`);

  const items = [];
  for (const t of tasks) {
    const text = await askOllama(t.system, t.user);
    if (text) items.push({ matchId: t.matchId, text });
    await new Promise((r) => setTimeout(r, CALL_GAP_MS));
  }
  log(`Ollama 완료 — ${items.length}/${tasks.length} 응답`);
  if (items.length === 0) return;

  try {
    const { data } = await axios.post(
      `${SITE}/api/internal/llm-panel`,
      { items },
      {
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        timeout: 120000,
      },
    );
    log(`저장 완료 — saved ${data.saved} / failed ${data.failed}`);
  } catch (e) {
    console.error("저장 실패:", e.message);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
