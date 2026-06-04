// 분석 예측 픽 라벨 / 마켓 라벨 / 결과 배지 — 글 상세(/analysis/[id])와
// 전문가 프로필 예측이력(/experts/[userId])에서 공유. (시각 표기 단일 소스)

export const MARKET_LABEL: Record<string, string> = {
  "1X2": "승무패",
  HANDICAP: "핸디캡",
  OU: "오버언더",
};

/** 핸디캡 라인 부호 표기: +1.5 / -1.5. */
export const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/**
 * 픽을 사람이 읽는 라벨로. home/away 는 이미 한글화된 팀명.
 * 1X2 → "홈팀 승"/"무승부", HANDICAP → "홈팀 -1.5", OU → "오버 2.5".
 */
export function pickLabel(
  market: string | null,
  pick: string | null,
  line: number | null,
  home: string,
  away: string,
): string {
  if (!pick) return "";
  if (market === "HANDICAP" && line != null) {
    return pick === "HOME" ? `${home} ${fmtLine(line)}` : `${away} ${fmtLine(-line)}`;
  }
  if (market === "OU" && line != null) {
    return pick === "OVER" ? `오버 ${line}` : `언더 ${line}`;
  }
  return pick === "HOME" ? `${home} 승` : pick === "AWAY" ? `${away} 승` : "무승부";
}

export interface ResultBadge {
  t: string;
  c: string; // tailwind 클래스
}

/** 채점 결과 배지 (컴팩트) — 적중 / 미적중 / 경기 대기. */
export function resultBadge(isCorrect: boolean | null): ResultBadge {
  if (isCorrect === true)
    return { t: "✓ 적중", c: "bg-amber-400/90 text-yellow-950 font-bold" };
  if (isCorrect === false)
    return { t: "✗ 미적중", c: "bg-neutral-500/15 text-neutral-500" };
  return { t: "⏳ 대기", c: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
}
