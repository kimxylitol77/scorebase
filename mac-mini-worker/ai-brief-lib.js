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
async function askAnthropicWebSearch(
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

// OpenAI Responses API + web_search_preview 폴백 — Anthropic 크레딧 소진 시.
// maxSearches/fetch 옵션은 OpenAI web_search 가 자동 처리하므로 무시.
async function askOpenAIWebSearch(prompt, { system, maxTokens = 4000 } = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY 미설정 — OpenAI 폴백 불가");
  const model = process.env.OPENAI_BRIEF_MODEL || "gpt-4o-mini";
  const body = {
    model,
    tools: [{ type: "web_search_preview" }],
    input: prompt,
    max_output_tokens: maxTokens,
    ...(system ? { instructions: system } : {}),
  };
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => "");
        throw Object.assign(new Error(`OpenAI HTTP ${r.status}: ${errBody.slice(0, 160)}`), { status: r.status });
      }
      const j = await r.json();
      // Responses API: output[] 중 type=message 의 content[type=output_text].text
      const msg = (j.output || []).find((o) => o.type === "message");
      const text = msg && msg.content
        ? msg.content.filter((c) => c.type === "output_text").map((c) => c.text).join("\n").trim()
        : (j.output_text || "");
      if (!text) throw new Error("OpenAI 응답에 텍스트가 없습니다.");
      return text;
    } catch (e) {
      lastErr = e;
      const status = e && e.status;
      const aborted = e && e.name === "AbortError";
      const transient = aborted || status === 429 || (status >= 500 && status < 600) || /terminated|econnreset|network/i.test(String(e && e.message));
      if (attempt >= 3 || !transient) throw e;
      const wait = 4000 * (attempt + 1);
      console.warn(`[ai-brief/openai] retry ${attempt + 1}/3 (${aborted ? "timeout" : status || "net"}) after ${wait}ms`);
      await new Promise((res) => setTimeout(res, wait));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// Google News RSS 헤드라인 수집 (한국어·최근 when). web_search 없이 로컬 검색 대체.
async function fetchGoogleNews(query, { when = "1d", limit = 15, maxAgeDays = 2 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko&when=${when}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`Google News RSS HTTP ${r.status}`);
  const xml = await r.text();
  const items = [];
  const cutoff = Date.now() - maxAgeDays * 86400e3; // 비시즌 회고 차단
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const block = m[1];
    const rawTitle = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "";
    const title = rawTitle.replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const source = ((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || "").trim();
    // when=1d 가 비시즌엔 5월 회고까지 끌어옴 → 발행일 N일 지난 기사 제외(날짜 없으면 통과).
    const pubMs = Date.parse((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "");
    if (Number.isFinite(pubMs) && pubMs < cutoff) continue;
    // RSS 머리의 'XXX - Google 뉴스' 헤더 행 제외
    if (title && !/- Google 뉴스$/.test(title) && title !== "Google 뉴스") {
      items.push({ title, source });
    }
  }
  return items;
}

// 로컬 Ollama chat (맥미니 localhost:11434). 크레딧 0.
async function ollamaChat(prompt, { system, model = process.env.OLLAMA_MODEL || "qwen2.5:14b" } = {}) {
  const ctrl = new AbortController();
  // 32b/30b 는 긴 브리핑 생성이 swap 으로 느려 180s 를 넘길 수 있어 넉넉히(env override).
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.OLLAMA_TIMEOUT_MS) || 600000);
  try {
    const r = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.4, repeat_penalty: 1.2 },
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status} — 'ollama serve' 실행 확인`);
    const j = await r.json();
    return (j.message?.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}

// 로컬 검색+요약: RSS 헤드라인 수집 → Ollama 한국어 브리핑. query 는 문자열 또는 배열(키워드 여러 개).
async function askWithLocalSearch(query, prompt, opts = {}) {
  const queries = Array.isArray(query) ? query : [query];
  const seen = new Set();
  const all = [];
  for (const q of queries) {
    let items = [];
    try {
      items = await fetchGoogleNews(q, { when: opts.when, limit: opts.perQuery || 12 });
    } catch (e) {
      console.warn(`[ai-brief/local] RSS '${q}' 실패: ${String(e.message).slice(0, 80)}`);
    }
    for (const it of items) {
      const key = it.title.slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(it);
    }
  }
  if (all.length === 0) throw new Error("RSS 뉴스 0건 — 검색어/네트워크 확인");
  const context = all.map((a, i) => `${i + 1}. ${a.title}${a.source ? ` (${a.source})` : ""}`).join("\n");
  const fullPrompt = `${prompt}\n\n[오늘 수집된 실제 뉴스 헤드라인 — 아래 목록만 근거로 작성하고, 목록에 없는 내용은 지어내지 말 것]\n${context}\n\n[작성 규칙 엄수] 지정된 섹션을 각각 한 번씩만 쓰고 같은 이모지 섹션을 두 번 반복하지 말 것. 총평·맺음말·결론 문장 없이 마지막 뉴스 항목으로 끝낼 것.`;
  const sys = opts.system || "당신은 한국어 뉴스 큐레이터입니다. 엄수: ① 한국어로만 쓰고 일본어 가나·한자·영어 문장을 절대 섞지 말 것(NBA·EPL·MVP·ETF·BTC 같은 영문 약어만 허용). ② 주어진 이모지 섹션 형식을 그대로 따르고 같은 섹션을 두 번 반복하지 말 것. ③ 각 뉴스는 '- '로 시작하는 한 줄. ④ 총평·맺음말·결론 문장 금지.";
  const out = await ollamaChat(fullPrompt, { ...opts, system: sys });
  // 후처리: ① 일본어 가나 문자 제거(qwen 한국어 순도 보강) ② 끝의 맺음말 산문 제거.
  let lines = out.split("\n").map((l) => l.replace(/[぀-ヿ]/g, ""));
  while (lines.length) {
    const last = lines[lines.length - 1].trim();
    if (!last) { lines.pop(); continue; }
    if (/^[-•]/.test(last) || /^\p{Extended_Pictographic}/u.test(last)) break;
    lines.pop();
  }
  return lines.join("\n").trim();
}

// web_search LLM 질의 — Anthropic 우선, 크레딧 소진·장애 시 OpenAI 자동 폴백.
// BRIEF_PROVIDER=local 면 Google News RSS + Ollama 로 직행 (크레딧 0, opts.query 필요).
// BRIEF_PROVIDER=openai 면 Anthropic 건너뛰고 직행 (크레딧 0 동안 400 왕복 회피).
// 4개 브리핑 봇(ai-news-brief·competitor-watch·crypto-brief·sports-news-brief) 공유.
async function askWithWebSearch(prompt, opts = {}) {
  if (process.env.BRIEF_PROVIDER === "local" && opts.query) {
    return askWithLocalSearch(opts.query, prompt, opts);
  }
  if (process.env.BRIEF_PROVIDER === "openai") {
    return askOpenAIWebSearch(prompt, opts);
  }
  try {
    return await askAnthropicWebSearch(prompt, opts);
  } catch (e) {
    if (process.env.OPENAI_API_KEY) {
      console.warn(`[ai-brief] Anthropic 실패 → OpenAI 폴백: ${String(e && e.message).slice(0, 120)}`);
      return askOpenAIWebSearch(prompt, opts);
    }
    throw e;
  }
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
