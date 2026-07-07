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
  "글로벌 데이터·예측 — Sofascore, FotMob, Opta(theanalyst), WhoScored, Understat, AiScore(aiscore.com/ko — 우리와 데이터소스 TheSports 동일·한국어판 운영)",       // 1 월
  "한국 축구 데이터·미디어 — 빌드업(buildup-football.com·우리와 가장 직접 경쟁), 네이버 스포츠, 풋볼리스트, 인터풋볼, 베스트일레븐, 스포탈코리아",   // 2 화
  "AI 픽·예측·시뮬 — [축구] Forebet, WinDrawWin, PredictZ, Infogol(xG), worldcup26simulator.com / [NBA·MLB] Dimers(ML 전경기 승률), Rithmm(모델 빌더), OddsTrader(정확도 별점 공개), The Stat Wire(ELO+선발 파워랭킹), PropsBot.AI(MLB prop 검증 ROI), Baseball Predict, Covers(MLB 컨센서스)",   // 3 수
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
1. 글로벌 데이터·예측: Sofascore, FotMob, Opta(theanalyst.com), WhoScored, Understat, Flashscore, AiScore(aiscore.com/ko — TheSports 데이터소스가 우리와 동일한 글로벌 라이브스코어+기초 AI예측 애그리게이터, 한국어판 운영·우리와 가장 직접적 데이터 겹침. 같은 원천으로 저들이 무엇을 더/다르게 노출하는지에 주목)
2. 한국 축구 데이터·미디어: 빌드업(buildup-football.com — 순위·매치픽 예측·선수비교·전술판·이적·커뮤니티, scorebase 와 가장 직접 경쟁하는 한국 축구 플랫폼·운영 트리플스퀘어), 네이버 스포츠, 풋볼리스트, 인터풋볼, 베스트일레븐, 스포탈코리아, OSEN, 점프볼(농구)
3. AI 픽·예측·시뮬: [축구] Forebet, WinDrawWin, PredictZ, Infogol(xG 기반), worldcup26simulator.com(드래그앤드롭 조별순위·스코어입력 2모드·104경기 풀브래킷·한국어 지원·우리 /world-cup 대진표빌더·조별 시뮬과 직접 경쟁) / [NBA·MLB — 우리 야구·농구 예측 강점군과 직접 경쟁] Dimers(ML 전경기 승률·in-game), Rithmm(AI 픽+사용자 모델 빌더), OddsTrader(시뮬 픽·별점 정확도 공개 — 우리 /predictions/accuracy 와 정면 비교), The Stat Wire(AI 파워랭킹 ELO+선발투수 — 우리 Elo 접근과 유사), PropsBot.AI(MLB prop·검증 ROI 투명성), Baseball Predict(신경망 MLB), Covers(MLB 대중 컨센서스)
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

// 로컬 모드(BRIEF_PROVIDER=local) 전용 — 사이트 본문 분석 불가라 "업계 뉴스 동향"으로 격하.
// web_search 크레딧 충전 시 BRIEF_PROVIDER 풀면 원래 buildPrompt(사이트 추적)로 자동 복귀.
function buildLocalPrompt(prev) {
  return `오늘은 ${todayKst()} 입니다. 당신은 한국 AI 스포츠 미디어 scorebase 의 업계 동향 분석가입니다.

## scorebase 현재 기능 (대조용)
${FEATURES}

## 작업
아래 [수집된 뉴스 헤드라인]에서:
- 스포츠 데이터·예측·미디어 업계의 새 서비스·기능·동향만 고른다.
- 스포츠와 무관한 기사(정부 통계, 일반 경제 등)는 버린다.
- scorebase 기능과 견줘 참고할 만한 아이디어를 뽑는다.
- 어제 보고와 겹치면 제외.

## 어제 보고 (반복 금지)
${prev ? prev.report : "없음"}

## 출력 형식 (엄수)
- 한국어로만. 첫 글자부터 바로 🔍 로 시작. 인사·맺음말·총평·메타발언 금지.
- 각 항목은 "- 내용" 한 줄. 같은 이모지 섹션을 두 번 반복하지 말 것.
- 아래 두 섹션만 순서대로 한 번씩:

🔍 업계 새 동향
- 내용 한 줄
💡 scorebase 적용 아이디어
- 내용 한 줄`;
}

async function main() {
  const prev = loadPrev();
  const focus = todaysFocus();
  const isLocal = process.env.BRIEF_PROVIDER === "local";
  // 로컬: 스포츠 특화 검색어(정부통계 등 무관 배제) + 격하 prompt. web_search: 원래 사이트 추적.
  const text = isLocal
    ? await askWithWebSearch(buildLocalPrompt(prev), {
        maxTokens: 2000,
        query: ["Sofascore 축구", "FotMob 축구", "Opta 축구 통계", "Forebet 축구 예측", "스포츠 베팅 예측 서비스", "네이버 스포츠 기능"],
        perQuery: 8,
      })
    : await askWithWebSearch(buildPrompt(prev, focus), {
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
