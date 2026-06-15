// 매일 아침 유사 스포츠 사이트를 web_search/fetch 로 살펴 scorebase 와 대조, 개선 아이디어를 텔레그램으로 보내는 봇.
// crontab: 0 8 * * * (KST). 어제 스냅샷과 diff 해 새 변화만 보고. 1회 실행 후 종료.
const path = require("path");
const fs = require("fs");
const { askWithWebSearch, notify, escapeHtml, stripPreamble, tidyBullets, todayKst } = require("./ai-brief-lib");

const STATE_DIR = path.resolve(__dirname, "state");
const SNAP = path.join(STATE_DIR, "competitor-snapshot.json");
const IDEA_LOG = path.join(STATE_DIR, "idea-log.jsonl");
const FEATURES = fs.readFileSync(path.resolve(__dirname, "scorebase-features.md"), "utf8");

// 요일별 중점 추적군 — 대상이 늘어도 매일 깊이를 유지하려 하루 한 군에 집중(나머지 군은 큰 변화만).
const FOCUS_ROTATION = [
  "야구 데이터·세이버메트릭스 — FanGraphs, Baseball Savant, Statiz(KBO), 네이버 야구",   // 0 일
  "글로벌 데이터·예측 — Sofascore, FotMob, Opta(theanalyst), WhoScored, Understat",       // 1 월
  "한국 축구 미디어 — 네이버 스포츠, 풋볼리스트, 인터풋볼, 베스트일레븐, 스포탈코리아",   // 2 화
  "AI 픽·배팅 분석 — Forebet, WinDrawWin, PredictZ, Infogol(xG)",                          // 3 수
  "해외 프리미엄·종합 — The Athletic, ESPN, OneFootball, 365Scores",                       // 4 목
  "소셜·신흥 — Reddit r/soccer·r/baseball, 유튜브 전술·통계 분석 채널",                    // 5 금
  "종합 — 이번 주 변화가 가장 큰 곳을 자유 선정",                                          // 6 토
];

function todaysFocus() {
  const dow = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Seoul", weekday: "long" });
  const idx = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(dow);
  return FOCUS_ROTATION[idx >= 0 ? idx : 6];
}

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

// 매일 산출물을 누적 저장 — 주간 백로그 봇(competitor-backlog.js)이 최근 7일치를 모아 정리한다.
function appendIdeaLog(report) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(IDEA_LOG, JSON.stringify({ date: todayKst(), report }) + "\n");
}

function buildPrompt(prev, focus) {
  return `오늘은 ${todayKst()} 입니다. 당신은 한국 AI 스포츠 미디어 scorebase 의 경쟁 분석가입니다.

## scorebase 현재 기능
${FEATURES}

## 추적 대상 — web_search / web_fetch 로 최근 동향을 조사
1. 글로벌 데이터·예측: Sofascore, FotMob, Opta(theanalyst.com), WhoScored, Understat, Flashscore
2. 한국 스포츠 미디어: 네이버 스포츠, 풋볼리스트, 인터풋볼, 베스트일레븐, 스포탈코리아, OSEN, 점프볼(농구)
3. AI 픽·배팅 분석: Forebet, WinDrawWin, PredictZ, Infogol(xG 기반)
4. 해외 프리미엄·종합: The Athletic, ESPN, OneFootball, 365Scores
5. 야구 데이터(우리 KBO·MLB 강점군): FanGraphs, Baseball Savant, Statiz(KBO 세이버), 네이버 야구
6. 소셜·신흥: Reddit r/soccer·r/baseball, 유튜브 전술·통계 분석 채널

## 오늘의 중점군 — 여기를 깊게 파고, 나머지 군은 큰 변화만
${focus}

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
  const focus = todaysFocus();
  const text = await askWithWebSearch(buildPrompt(prev, focus), {
    maxTokens: 4500,
    maxSearches: 18,
    fetch: true,
  });
  if (!text) throw new Error("빈 응답 (검색 실패 가능)");
  const clean = tidyBullets(stripPreamble(text, ["🔍", "🟢", "💡"]));
  await notify({
    source: "competitor-watch",
    severity: "INFO",
    title: "🔭 경쟁사 워치",
    message: escapeHtml(clean),
  });
  saveSnap(clean);
  appendIdeaLog(clean);
  console.log("[competitor-watch] (focus: " + focus.split(" — ")[0] + ") sent:\n" + clean);
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
