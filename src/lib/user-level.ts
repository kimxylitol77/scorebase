// 회원 등급 시스템 — 축구 디비전 "승격" 테마, 12단계.
// 누적 경험치(User.exp) → 등급(level) 순수 계산. admin(env)·user 세션과 무관.
// 권한 차등 아님: 가입하면 댓글·글쓰기 모두 가능. 등급은 활동·적중 "명예" 용도.
//
// 설계 메모:
//   - 경험치(exp) = 등급 산출 기준 / 포인트(points) = 소비용 → 완전 분리.
//   - 초반(Lv1~4)은 출석·댓글만으로 금방 올라 가입 직후 동기부여, 후반은 가파르게.
//   - 🎯 예측 적중은 기존 라이브 결과 데이터로 자동 채점(채점 로직은 후속 단계).

export interface Grade {
  level: number;
  emoji: string;
  name: string;
  minExp: number; // 이 등급 진입에 필요한 누적 경험치(포함). 오름차순.
}

/** 등급표 (단일 진실). minExp 오름차순 유지 필수. */
export const GRADES: readonly Grade[] = [
  { level: 1, emoji: "🥾", name: "조기축구", minExp: 0 },
  { level: 2, emoji: "⚽", name: "유소년", minExp: 1_000 },
  { level: 3, emoji: "🎽", name: "아마추어", minExp: 3_000 },
  { level: 4, emoji: "📋", name: "세미프로", minExp: 7_000 },
  { level: 5, emoji: "✍️", name: "프로데뷔", minExp: 15_000 },
  { level: 6, emoji: "🏟️", name: "2부리그", minExp: 30_000 },
  { level: 7, emoji: "🏆", name: "1부리그", minExp: 55_000 },
  { level: 8, emoji: "🥉", name: "컵 위너", minExp: 90_000 },
  { level: 9, emoji: "🥈", name: "유로파", minExp: 140_000 },
  { level: 10, emoji: "🥇", name: "챔피언스리그", minExp: 210_000 },
  { level: 11, emoji: "⭐", name: "발롱도르", minExp: 320_000 },
  { level: 12, emoji: "👑", name: "레전드", minExp: 500_000 },
] as const;

export const MAX_LEVEL = GRADES.length; // 12

/** 경험치 획득량 (단일 진실). 지급/채점 로직에서 import해 사용. */
export const EXP_REWARDS = {
  attendance: 10, // 출석(로그인) — 1일 1회
  comment: 50, // 댓글 — 일일 캡 권장(도배 방지)
  analysisPost: 500, // 분석글 작성
  predictionJoin: 50, // 경기 예측 참여
  predictionHit: 300, // 🎯 예측 적중 (자동 채점)
  recommendReceived: 20, // 내 글 추천 1개당
  firstPostBonus: 500, // 생애 첫 글 보너스 (일반 글 보상에 추가 — 첫 글은 사실상 2배)
} as const;

/** 포인트 획득량 (등급과 분리, 소비용). */
export const POINT_REWARDS = {
  attendance: 10,
  comment: 5,
  analysisPost: 100,
  predictionJoin: 20, // 경기 예측 참여 (글 작성 보상에 추가 지급)
  predictionHit: 100, // 🎯 예측 적중 (자동 채점)
  recommendReceived: 5,
  firstPostBonus: 100, // 생애 첫 글 보너스
} as const;

/** 누적 경험치 → 등급 레벨 (1 ~ MAX_LEVEL). 음수 exp는 1로 클램프. */
export function expToLevel(exp: number): number {
  let level = 1;
  for (const g of GRADES) {
    if (exp >= g.minExp) level = g.level;
    else break;
  }
  return level;
}

/** 레벨 → 등급 정보. 범위 밖은 클램프. */
export function gradeByLevel(level: number): Grade {
  const clamped = Math.min(Math.max(Math.trunc(level), 1), MAX_LEVEL);
  return GRADES[clamped - 1];
}

/** 누적 경험치 → 등급 정보 (UI 표시용). */
export function gradeByExp(exp: number): Grade {
  return gradeByLevel(expToLevel(exp));
}

/**
 * 다음 등급까지 진행도 (프로필 경험치 바용).
 * 최고 등급이면 next=null, ratio=1.
 */
export function levelProgress(exp: number): {
  level: number;
  current: Grade;
  next: Grade | null;
  expIntoLevel: number; // 현재 등급 진입 후 쌓은 경험치
  expForNext: number; // 다음 등급까지 필요한 총 구간(0이면 최고 등급)
  ratio: number; // 0~1
} {
  const level = expToLevel(exp);
  const current = gradeByLevel(level);
  const next = level < MAX_LEVEL ? gradeByLevel(level + 1) : null;
  const expIntoLevel = Math.max(exp - current.minExp, 0);
  if (!next) {
    return { level, current, next: null, expIntoLevel, expForNext: 0, ratio: 1 };
  }
  const expForNext = next.minExp - current.minExp;
  const ratio = expForNext > 0 ? Math.min(expIntoLevel / expForNext, 1) : 1;
  return { level, current, next, expIntoLevel, expForNext, ratio };
}

/** 특별 등급 — 레전드(Lv12) 위. exp 무관, badge 로만 부여(매니저·운영 계정). */
export const OFFICIAL_GRADE = { emoji: "🎖️", name: "공식 분석관" } as const;

/** 표시용 등급 — badge 가 있으면 특별 등급, 없으면 exp(level) 기반 일반 등급. */
export function displayGrade(
  level: number,
  badge?: string | null,
): { emoji: string; name: string } {
  if (badge === "OFFICIAL") return OFFICIAL_GRADE;
  const g = gradeByLevel(level);
  return { emoji: g.emoji, name: g.name };
}
