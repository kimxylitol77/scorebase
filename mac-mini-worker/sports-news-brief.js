// 매일 아침 12개 리그 스포츠 뉴스를 web_search 로 모아 한국어로 요약, 텔레그램으로 보내는 봇.
// crontab: 0 7 * * * (KST). 1회 실행 후 종료.
const { askWithWebSearch, notify, escapeHtml, stripPreamble, tidyBullets, todayKst } = require("./ai-brief-lib");

function buildPrompt() {
  return `오늘은 ${todayKst()} 입니다. 당신은 한국 스포츠 미디어 scorebase 의 아침 뉴스 큐레이터입니다.

web_search 로 지난 24시간의 주요 스포츠 뉴스를 조사해 한국 독자용 아침 브리핑을 작성하세요.

## 다룰 종목·리그
- 축구: EPL, 라리가, 분데스리가, 세리에A, 리그1, MLS, 챔피언스리그, 2026 월드컵
- 야구: MLB, KBO, NPB
- 농구: NBA / 아이스하키: NHL
- (지금 시즌이 활발한 리그 위주. 비시즌 리그는 생략)

## 내용 규칙
- 종목별로 묶어 가장 중요한 뉴스만 3~5줄. 전체 900자 이내.
- 이적·부상·일정·승부 결과·감독 변동 등 한국 독자가 관심 가질 핵심만.
- 출처 사이트명은 괄호로 짧게.
- 맨 끝 "📝 글감" 줄에 scorebase 가 글로 다루면 좋을 빅뉴스 1~3개.
- 뉴스가 적은 종목은 생략. 억지로 채우지 말 것.

## 출력 형식 (엄수)
- 서두·인사·맺음말·메타발언·구분선(---)·제목 줄 없이 첫 글자부터 바로 ⚽ 섹션으로 시작.
- 각 항목은 "- 내용" 한 줄로 작성 (불릿 기호 뒤에 줄바꿈 금지).
- 한국어. 마크다운 별표·HTML 태그·꺾쇠(<>)·앰퍼샌드(&) 금지 (팀명의 & 는 'and').

⚽ 축구
- 내용 한 줄
- 내용 한 줄
⚾ 야구
- 내용 한 줄
🏀 농구 / 🏒 하키 (있으면)
📝 글감: 1) ... 2) ...`;
}

async function main() {
  const text = await askWithWebSearch(buildPrompt(), { maxTokens: 4000, maxSearches: 10 });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");
  const clean = tidyBullets(stripPreamble(text, ["⚽", "⚾", "🏀", "🏒", "📝"]));
  await notify({
    source: "sports-news-brief",
    severity: "INFO",
    title: "☀️ 스포츠 뉴스 브리핑",
    message: escapeHtml(clean),
  });
  console.log("[news-brief] sent:\n" + clean);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[news-brief] error:", e.message);
    try {
      await notify({
        source: "sports-news-brief",
        severity: "WARN",
        title: "⚠️ 뉴스 브리핑 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
