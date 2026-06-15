// 지난 한 주 경쟁사 워치 산출물(idea-log)을 모아 중복 병합·임팩트 랭킹해 "이번주 실행 후보"로 정리, 슬랙(#경쟁사)+텔레그램 전송.
// launchd: 월요일 09:00 KST. competitor-watch 가 매일 누적한 state/idea-log.jsonl 의 최근 7일을 읽는다.
const path = require("path");
const fs = require("fs");
const { client, MODEL, notify, escapeHtml, stripPreamble, tidyBullets, todayKst } = require("./ai-brief-lib");

const IDEA_LOG = path.resolve(__dirname, "state", "idea-log.jsonl");
const FEATURES = fs.readFileSync(path.resolve(__dirname, "scorebase-features.md"), "utf8");

function loadRecent(n = 7) {
  try {
    const lines = fs.readFileSync(IDEA_LOG, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-n).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function buildPrompt(entries) {
  const week = entries.map((e) => `### ${e.date}\n${e.report}`).join("\n\n");
  return `오늘은 ${todayKst()} 입니다. 당신은 한국 AI 스포츠 미디어 scorebase 의 제품 전략가입니다.

아래는 지난 한 주간 경쟁사 워치 봇이 매일 수집한 관찰과 아이디어 모음입니다. 매일 쏟아져 슬랙에 묻히기 쉬우니, 이번 주에 실제로 착수할 만한 후보로 압축하는 것이 당신의 일입니다.

## scorebase 현재 기능 (이미 가진 것은 후보에서 제외)
${FEATURES}

## 지난 한 주 경쟁사 워치 로그
${week || "(로그 없음)"}

## 작업
- 한 주간 반복·유사하게 등장한 아이디어를 하나로 병합 (여러 날 나온 것 = 그만큼 신호가 강함, 우선순위 가점).
- scorebase 에 이미 있는 기능과 겹치는 것은 제외.
- 실제 임팩트(트래픽·체류·신뢰·SEO) 큰 순으로 이번 주 실행 후보 Top 5~6 선정.
- 각 후보: 한 줄 설명 + 왜 지금(근거: 어느 경쟁사 움직임·며칠 반복됐는지) + [난이도 상/중/하·효과 상/중/하].
- 1인 운영 기준 현실성 고려 — "큰일"과 "반나절거리"를 섞어 균형있게.

## 출력 형식 (엄수)
- 서두·인사·맺음말 없이 첫 글자부터 바로 📋 로 시작.
- 각 후보는 번호 + 한 줄. 마크다운 별표·HTML·꺾쇠(<>)·앰퍼샌드(&) 금지. 한국어 1200자 이내.

📋 이번주 실행 후보 (지난 7일 경쟁사 워치 종합)
1. 후보 — 한 줄 설명. 근거: ... [난이도 중·효과 상]
2. ...

🔁 이번주 반복 신호 (여러 날 겹친 주제 1~2개, 없으면 생략)
- 내용 한 줄`;
}

async function main() {
  const entries = loadRecent(7);
  if (entries.length === 0) {
    console.log("[competitor-backlog] idea-log 비어있음 — 스킵 (competitor-watch 가 며칠 누적되면 첫 종합 발행)");
    return;
  }
  // 순수 LLM 정리(web_search 불필요) — non-stream messages.create 로 충분.
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2500,
    messages: [{ role: "user", content: buildPrompt(entries) }],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!text) throw new Error("빈 응답");
  const clean = tidyBullets(stripPreamble(text, ["📋", "🔁"]));
  // source 를 competitor-watch 로 두면 notify 라우트가 슬랙 #경쟁사 채널로 cross-post (매핑 재사용).
  await notify({
    source: "competitor-watch",
    severity: "INFO",
    title: "📋 이번주 실행 후보 (경쟁사 워치 종합)",
    message: escapeHtml(clean),
  });
  console.log(`[competitor-backlog] ${entries.length}일치 종합 sent:\n` + clean);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[competitor-backlog] error:", e.message);
    try {
      await notify({
        source: "competitor-watch",
        severity: "WARN",
        title: "⚠️ 경쟁사 백로그 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
