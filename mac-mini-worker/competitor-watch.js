// 매일 아침 유사 스포츠 사이트를 web_search/fetch 로 살펴 scorebase 와 대조, 개선 아이디어를 텔레그램으로 보내는 봇.
// crontab: 0 8 * * * (KST). 어제 스냅샷과 diff 해 새 변화만 보고. 1회 실행 후 종료.
const path = require("path");
const fs = require("fs");
const { askWithWebSearch, notify, escapeHtml, stripPreamble, todayKst } = require("./ai-brief-lib");

const STATE_DIR = path.resolve(__dirname, "state");
const SNAP = path.join(STATE_DIR, "competitor-snapshot.json");
const FEATURES = fs.readFileSync(path.resolve(__dirname, "scorebase-features.md"), "utf8");

function loadPrev() {
  try {
    return JSON.parse(fs.readFileSync(SNAP, "utf8"));
  } catch {
    return null;
  }
}

function saveSnap(report) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(SNAP, JSON.stringify({ date: todayKst(), report }, null, 2));
}

function buildPrompt(prev) {
  return `오늘은 ${todayKst()} 입니다. 당신은 한국 AI 스포츠 미디어 scorebase 의 경쟁 분석가입니다.

## scorebase 현재 기능
${FEATURES}

## 추적 대상 — web_search / web_fetch 로 최근 동향을 조사
1. 데이터·예측 글로벌: Sofascore, FotMob, Opta, Understat
2. 한국 스포츠 미디어: 네이버 스포츠, 스포티비뉴스, 스포탈코리아, 풋볼리스트
3. AI 픽·배팅 분석: 축구 예측·픽 분석 사이트(Forebet, WinDrawWin 등)
4. 해외 프리미엄: The Athletic, ESPN

## 어제까지 보고한 내용 (반복하지 말 것)
${prev ? prev.report : "없음 (첫 실행 — 이번엔 전반적 현황을 보고)"}

## 작업
- 각 추적군에서 최근 눈에 띄는 기능·콘텐츠·UX·예측 방식 변화를 조사.
- scorebase 기능과 대조해 분류: 저들에 있고 우리에 없는 것 / 우리가 이미 앞선 것.
- 어제 보고와 겹치면 제외하고 "새로운 관찰"만.
- 이번 주 적용할 만한 아이디어 Top 3 — 각각 [난이도 상/중/하·효과 상/중/하] 태그.
- 변화가 거의 없으면 솔직하게 "특이 변화 없음"으로 짧게 보고.

## 출력 형식 (엄수)
- 서두·인사·맺음말·메타발언 없이 첫 글자부터 바로 🔍 섹션으로 시작.
- 각 항목은 "- 내용" 한 줄로 작성 (불릿 기호 뒤에 줄바꿈 금지).
- 텔레그램용 한국어 순수 텍스트, 1000자 이내. 마크다운 별표·HTML·꺾쇠(<>)·앰퍼샌드(&) 금지.

🔍 경쟁사 새 관찰
- 내용 한 줄
🟢 우리가 앞선 점
- 내용 한 줄
💡 이번 주 아이디어 Top 3
1. 내용 [난이도 중·효과 상]
2. 내용
3. 내용`;
}

async function main() {
  const prev = loadPrev();
  const text = await askWithWebSearch(buildPrompt(prev), {
    maxTokens: 4500,
    maxSearches: 14,
    fetch: true,
  });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");
  const clean = stripPreamble(text, ["🔍", "🟢", "💡"]);
  await notify({
    source: "competitor-watch",
    severity: "INFO",
    title: "🔭 경쟁사 워치",
    message: escapeHtml(clean),
  });
  saveSnap(clean);
  console.log("[competitor-watch] sent:\n" + clean);
}

main()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error("[competitor-watch] error:", e.message);
    try {
      await notify({
        source: "competitor-watch",
        severity: "WARN",
        title: "⚠️ 경쟁사 워치 봇 실패",
        message: escapeHtml(e.message || String(e)),
      });
    } catch {}
    process.exit(1);
  });
