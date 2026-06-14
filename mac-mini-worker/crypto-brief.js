// 매일 아침 코인(암호화폐) 주요 뉴스를 web_search 로 모아 한국어로 요약, 텔레그램·슬랙(#코인ai)으로 보내는 봇.
// crontab: 0 9 * * * (KST). 1회 실행 후 종료. (운영자 개인 관심사)
const { askWithWebSearch, notify, escapeHtml, stripPreamble, tidyBullets, todayKst } = require("./ai-brief-lib");

function buildPrompt() {
  return `오늘은 ${todayKst()} 입니다. 당신은 scorebase 운영자의 개인 코인(암호화폐) 뉴스 큐레이터입니다.

web_search 로 지난 24시간의 주요 암호화폐 뉴스를 조사해 한국어 아침 브리핑을 작성하세요.

## 다룰 내용
- 비트코인·이더리움 가격 흐름과 큰 변동 (구체 수치).
- 주목받는 알트코인 움직임.
- ETF·규제·기관 자금·상장·해킹 등 시장에 영향 큰 사건.

## 내용 규칙
- 가장 중요한 뉴스만 4~6줄. 전체 800자 이내.
- 가격은 구체 수치로(예: BTC 9만달러 회복, ETH +5%).
- 출처 사이트명은 괄호로 짧게.
- 큰 뉴스가 없으면 줄여서. 억지로 채우지 말 것.

## 출력 형식 (엄수)
- 서두·인사·맺음말·메타발언·구분선(---)·제목 줄 없이 첫 글자부터 바로 🪙 섹션으로 시작.
- 각 항목은 "- 내용" 한 줄로 작성 (불릿 기호 뒤에 줄바꿈 금지).
- 한국어. 마크다운 별표·HTML 태그·꺾쇠(<>)·앰퍼샌드(&) 금지 (& 는 'and').

🪙 코인
- 내용 한 줄
- 내용 한 줄
📌 주목: 1) ... 2) ...`;
}

async function main() {
  const text = await askWithWebSearch(buildPrompt(), { maxTokens: 4000, maxSearches: 10 });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");
  const clean = tidyBullets(stripPreamble(text, ["🪙", "📌"]));
  await notify({
    source: "crypto-brief",
    severity: "INFO",
    title: "🪙 코인 뉴스 브리핑",
    message: escapeHtml(clean),
  });
  console.log("[crypto-brief] sent:\n" + clean);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[crypto-brief] error:", e.message);
    try {
      await notify({
        source: "crypto-brief",
        severity: "WARN",
        title: "⚠️ 코인 브리핑 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
