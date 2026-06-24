// scorebase 기능 소개 SNS 콘텐츠 풀 — 매일 1개씩 로테이션 발행(Threads/인스타).
// 카드 이미지(/api/og/feature)와 caption(buildFeatureCaption)이 공유하는 단일 소스.

export interface ThreadsFeature {
  key: string;
  emoji: string;
  title: string;
  sub: string; // 한 줄 부제
  points: string[]; // 카드 체크 포인트 3개
  accent: [string, string]; // 그라데이션 [밝은, 어두운]
  path: string; // 해당 기능 페이지 (scorebase.kr + path)
  hook: string; // caption 첫 줄 훅
  hashtags: string;
}

export const THREADS_FEATURES: ThreadsFeature[] = [
  {
    key: "predict",
    emoji: "🤖",
    title: "AI 승부예측",
    sub: "Elo 모델 + 멀티 AI 가 매 경기 분석",
    points: ["승·무·패 확률을 숫자로", "적중률 실시간 공개 (숨기지 않음)", "오버언더·핸디캡·BTTS 까지"],
    accent: ["#7c3aed", "#4c1d95"],
    path: "/",
    hook: "“이 경기 누가 이길까?” 를 감이 아니라 데이터로.",
    hashtags: "#스코어베이스 #승부예측 #AI예측 #축구분석 #스포츠",
  },
  {
    key: "transfer",
    emoji: "💰",
    title: "이적시장 · 선수 몸값",
    sub: "Transfermarkt 식 시장가치 추적",
    points: ["선수별 몸값 추이 그래프", "구단 선수단 가치 랭킹", "여름·겨울 이적 빅딜 총정리"],
    accent: ["#059669", "#064e3b"],
    path: "/transfers",
    hook: "내가 응원하는 선수, 지금 몸값 얼마일까?",
    hashtags: "#스코어베이스 #이적시장 #몸값 #축구 #트랜스퍼",
  },
  {
    key: "live",
    emoji: "📡",
    title: "실시간 라이브 스코어",
    sub: "축구·야구·농구·하키·e스포츠·UFC",
    points: ["2~3초 단위 실시간 갱신", "라인업·통계·타임라인까지", "즐겨찾기로 내 팀만 모아보기"],
    accent: ["#2563eb", "#1e3a8a"],
    path: "/scores",
    hook: "여러 앱 켤 필요 없이, 모든 종목 한 화면에서.",
    hashtags: "#스코어베이스 #라이브스코어 #실시간중계 #축구 #야구",
  },
  {
    key: "sim",
    emoji: "🎲",
    title: "시즌 시뮬레이션",
    sub: "몬테카를로 5,000회 시뮬레이션",
    points: ["우승·강등 확률 예측", "리그 최종 순위 시나리오", "경기마다 매일 갱신"],
    accent: ["#db2777", "#831843"],
    path: "/",
    hook: "우리 팀, 이대로면 몇 위로 끝날까?",
    hashtags: "#스코어베이스 #시즌예측 #우승확률 #축구 #순위",
  },
  {
    key: "experts",
    emoji: "🏆",
    title: "예측 전문가 리더보드",
    sub: "누가 제일 잘 맞히나",
    points: ["전문가별 적중률 순위", "리그별 강점 한눈에", "나도 예측에 참여 가능"],
    accent: ["#ea580c", "#7c2d12"],
    path: "/experts",
    hook: "예측 좀 한다는 사람들, 진짜 실력은?",
    hashtags: "#스코어베이스 #전문가예측 #적중률 #스포츠 #랭킹",
  },
  {
    key: "standings",
    emoji: "📊",
    title: "리그 순위 · 리더보드",
    sub: "전 세계 축구 + 다종목",
    points: ["실시간 순위표", "득점왕·도움왕 리더보드", "팀별 최근 폼 추이"],
    accent: ["#0891b2", "#164e63"],
    path: "/standings",
    hook: "지금 우리 리그 1위는? 득점왕은 누구?",
    hashtags: "#스코어베이스 #리그순위 #득점왕 #축구 #순위표",
  },
  {
    key: "analysis",
    emoji: "📰",
    title: "AI 경기 분석 · 블로그",
    sub: "매일 프리뷰·리뷰를 데이터로",
    points: ["AI 가 쓰는 경기 프리뷰/리뷰", "데이터 기반 인사이트", "구단 가치·이적 특집"],
    accent: ["#4f46e5", "#312e81"],
    path: "/blog",
    hook: "경기 보기 전, 데이터로 미리 읽는 관전 포인트.",
    hashtags: "#스코어베이스 #축구분석 #경기프리뷰 #스포츠 #데이터",
  },
];

// 날짜 기반 로테이션 — KST 날짜(YYYY-MM-DD)로 매일 다른 기능 1개를 고정 선택.
export function featureForDate(dateKey: string): ThreadsFeature {
  // 날짜 문자열을 안정적 정수로 → features 길이로 modulo (요일 무관 순환).
  const n = dateKey.replace(/-/g, "");
  const idx = Number(n) % THREADS_FEATURES.length;
  return THREADS_FEATURES[idx];
}
