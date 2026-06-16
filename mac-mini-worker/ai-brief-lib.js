// 아침 브리핑 봇(sports-news-brief·competitor-watch) 공용 헬퍼 — web_search LLM 호출 + 텔레그램 전송.
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });

const Anthropic = require("@anthropic-ai/sdk");
const axios = require("axios");

const SITE = process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.INTERNAL_API_TOKEN;
// 경쟁사 분석·뉴스 큐레이션은 추론 품질이 중요 → Sonnet 4.6 (env 로 override 가능).
const MODEL = process.env.BRIEF_MODEL || "claude-sonnet-4-6";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || "" });

function todayKst() {
  return new Date().toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

// 텔레그램 parse_mode=HTML 안전화 — 본문의 & < > 만 이스케이프 (notify message 용).
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// LLM 이 가끔 "보고서를 작성하겠습니다" 같은 서두를 붙임 — 첫 섹션 헤더(anchors)부터 잘라 버림.
function stripPreamble(text, anchors) {
  const lines = String(text).split("\n");
  const i = lines.findIndex((l) => anchors.some((a) => l.trimStart().startsWith(a)));
  return (i > 0 ? lines.slice(i) : lines).join("\n").trim();
}

// LLM 이 "- "(불릿) 뒤에 줄바꿈을 넣거나 출처를 다음 줄로 흘리는 습관 정리 — 항목을 한 줄로 합침.
function tidyBullets(text) {
  return String(text)
    .replace(/^[-•][ \t]*\n+[ \t]*/gm, "- ") // '- \n내용' → '- 내용'
    .replace(/\n[ \t]+(\()/g, " $1");         // '내용\n  (출처)' → '내용 (출처)'
}

// web_search(+web_fetch) server-side tool 로 LLM 질의. server tool 루프가
// 10회 한도에 닿으면 stop_reason=pause_turn → assistant 턴 붙여 재요청해 이어감.
async function askWithWebSearch(
  prompt,
  { system, maxTokens = 4000, maxSearches = 5, fetch = false } = {},
) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY 미설정 — .env.local 확인");
  }
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: maxSearches },
  ];
  if (fetch) {
    tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: maxSearches });
  }
  const messages = [{ role: "user", content: prompt }];
  let finalText = "";
  // pause_turn 이어가기 최대 8회 (무한루프 방지)
  for (let turn = 0; turn < 8; turn++) {
    // web_search 다회 요청은 응답까지 오래 걸려 non-stream 은 connection 이 끊긴다.
    // streaming 으로 keepalive 를 유지하고 finalMessage() 로 완성 메시지를 받는다.
    // 간헐적 연결 끊김(terminated/ECONNRESET)·과부하(429/529)는 backoff 로 재시도.
    let res;
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          tools,
          messages,
        });
        res = await stream.finalMessage();
        break;
      } catch (e) {
        const msg = String(e?.message || e);
        const transient = /terminated|econnreset|connection|aborted|socket|network|timeout|overload|429|503|529/i.test(msg);
        if (attempt >= 3 || !transient) throw e;
        const wait = 4000 * (attempt + 1);
        console.warn(`[ai-brief] retry ${attempt + 1}/3 (${msg.slice(0, 60)}) after ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) finalText = text;
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }
  return finalText;
}

// 기존 모니터링 봇과 동일하게 /api/internal/notify 로 텔레그램 전송.
async function notify(payload) {
  await axios.post(`${SITE}/api/internal/notify`, payload, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15000,
  });
}

// 텔레그램 sendPhoto — 이미지 buffer + 캡션 (multipart). notify(텍스트 전용)와 별개.
async function sendPhoto(buffer, caption, filename = "card.png") {
  const fd = new FormData();
  fd.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  if (caption) fd.append("caption", caption);
  fd.append("photo", new Blob([buffer], { type: "image/png" }), filename);
  const r = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
    { method: "POST", body: fd },
  );
  const j = await r.json();
  if (!j.ok) throw new Error("sendPhoto 실패: " + JSON.stringify(j).slice(0, 200));
  return j;
}

module.exports = { client, MODEL, SITE, TOKEN, todayKst, escapeHtml, stripPreamble, tidyBullets, askWithWebSearch, notify, sendPhoto };
