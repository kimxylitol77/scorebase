// 매일 아침 AI 주요 뉴스를 web_search 로 모아 한국어로 요약, 텔레그램·슬랙(#ai-뉴스)으로 보내는 봇.
// crontab: 0 9 * * * (KST). 1회 실행 후 종료. (운영자 개인 관심사)
const { askWithWebSearch, notify, escapeHtml, stripPreamble, tidyBullets, todayKst } = require("./ai-brief-lib");

function buildPrompt() {
  return `오늘은 ${todayKst()} 입니다. 당신은 scorebase 운영자의 개인 AI 뉴스 큐레이터입니다.

web_search 로 지난 24시간의 주요 AI 뉴스를 조사해 한국어 아침 브리핑을 작성하세요.

## 다룰 내용
- 새 모델·제품 출시 (OpenAI·Anthropic·Google·Meta·xAI 등) — 무엇이 새로운지 한 줄로.
- 주요 기업·투자·인수·정책/규제 뉴스.
- 화제가 된 도구·오픈소스·연구.

## 내용 규칙
- 가장 중요한 뉴스만 4~6줄. 전체 800자 이내.
- "무엇이 새롭고 왜 중요한지" 핵심만.
- 출처 사이트명은 괄호로 짧게.
- 큰 뉴스가 없으면 줄여서. 억지로 채우지 말 것.

## 출력 형식 (엄수)
- 서두·인사·맺음말·메타발언·구분선(---)·제목 줄 없이 첫 글자부터 바로 🤖 섹션으로 시작.
- 각 항목은 "- 내용" 한 줄로 작성 (불릿 기호 뒤에 줄바꿈 금지).
- 한국어. 마크다운 별표·HTML 태그·꺾쇠(<>)·앰퍼샌드(&) 금지 (& 는 'and').

🤖 AI
- 내용 한 줄
- 내용 한 줄
📌 주목: 1) ... 2) ...`;
}

async function main() {
  const text = await askWithWebSearch(buildPrompt(), {
    maxTokens: 4000,
    maxSearches: 10,
    // 로컬 모드(BRIEF_PROVIDER=local) 시 RSS 검색어.
    query: ["AI 인공지능", "ChatGPT OpenAI", "구글 제미나이 AI", "Anthropic 클로드"],
  });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");
  const clean = tidyBullets(stripPreamble(text, ["🤖", "📌"]));
  await notify({
    source: "ai-news-brief",
    severity: "INFO",
    title: "🤖 AI 뉴스 브리핑",
    message: escapeHtml(clean),
  });
  console.log("[ai-news-brief] sent:\n" + clean);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[ai-news-brief] error:", e.message);
    try {
      await notify({
        source: "ai-news-brief",
        severity: "WARN",
        title: "⚠️ AI 브리핑 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
