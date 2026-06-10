// 휴식일·일정 혼잡 + 시즌 막판 동기부여 컨텍스트 — 자체 DB·standings 만 사용 (외부 비용 0).
//
// 근거 (축구 문헌 일반치):
// - 휴식 3일 vs 6일: 승률 ~2-4%p 차이 (UEFA 미드위크 연구들)
// - 8일 내 3경기 혼잡: 후반 체력 저하 → 실점 증가
// - 시즌 막판 동기부여 격차 (강등 사투 vs 중위 dead rubber): 결과 분포가 실력 모델에서 이탈
// 각 효과는 보수적 계수 + cap 으로 반영 (predictionEngine football 분기).

import type { PredictMatch } from "./types";
import type { StandingsRow } from "@/lib/sports/thesports/standings-helper";

export interface RestContext {
  /** 직전 경기 후 휴식일. 10일 초과(시즌 첫 경기·A매치 브레이크)는 null — 신호 아님 */
  restDays: number | null;
  /** 킥오프 직전 8일간 치른 경기 수 (이번 경기 제외) */
  matchesIn8d: number;
}

export function computeRestContext(
  seasonMatches: PredictMatch[],
  teamId: number,
  startTime: Date,
): RestContext {
  const ref = startTime.getTime();
  const played = seasonMatches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId) &&
        m.startTime.getTime() < ref,
    )
    .map((m) => m.startTime.getTime());
  if (played.length === 0) return { restDays: null, matchesIn8d: 0 };
  const last = Math.max(...played);
  const restDaysRaw = Math.floor((ref - last) / 86400e3);
  const restDays = restDaysRaw > 10 ? null : restDaysRaw;
  const matchesIn8d = played.filter((t) => t >= ref - 8 * 86400e3).length;
  return { restDays, matchesIn8d };
}

export type Motivation = "fight" | "dead" | "normal";

/**
 * 시즌 막판 동기부여 분류.
 * - 발동 조건: 시즌 진행률 ≥ 72% (더블 라운드로빈 가정 — 변칙 포맷은 자연히 보수적)
 * - fight: 우승권(1~3위) 또는 강등권(뒤에서 3팀) — 전력 100% 동기
 * - dead: 중위 안전권 (6위 ~ 뒤에서 6팀 사이) — 걸린 것 없음
 */
export function computeMotivation(
  row: Pick<StandingsRow, "position" | "won" | "draw" | "loss"> | null,
  totalTeams: number,
): Motivation {
  if (!row || totalTeams < 10) return "normal";
  const played = row.won + row.draw + row.loss;
  const seasonLength = 2 * (totalTeams - 1);
  if (seasonLength <= 0 || played / seasonLength < 0.72) return "normal";
  if (row.position <= 3 || row.position >= totalTeams - 2) return "fight";
  if (row.position >= 6 && row.position <= totalTeams - 6) return "dead";
  return "normal";
}
