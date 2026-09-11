// "이번 시즌" 경기 선택 — 시즌 경계(season-window)로 자르고, 새 시즌 일정조차 없을 때만 지난 시즌으로 폴백.
// /predictions/[league] 에 인라인으로 있던 규칙을 빼냈다. 홈 「시즌 인사이트」 카드가 시즌 구분 없이 전체 경기를 읽어
// 지난 시즌 우승팀(아스널 94점)을 1위로, 그 위에 이번 시즌 잔여 일정을 얹은 우승 확률을 내던 사고(2026-09-11)의 재발 방지 —
// 순위·시뮬은 반드시 이 함수를 거친다. Elo 는 시즌을 넘어 누적돼야 하므로 호출부가 전체 경기로 따로 계산한다.
import { SEASON_BOUNDARY, currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";

export interface SeasonSelection<T> {
  /** 순위·시뮬에 쓸 경기 — 이번 시즌(또는 폴백된 지난 시즌) */
  season: T[];
  /** true 면 지난 시즌 데이터 — 화면에 "지난 시즌" 라벨을 붙여야 한다(현재 값처럼 렌더 금지) */
  isPreviousSeason: boolean;
  seasonStart: Date | null;
  /** 선택된 시즌의 라벨 — "2026-27"(경계가 6월 이후인 유럽형) | "2026"(달력형). 경계 미정의 리그는 null. 하드코딩 자막 대신 이걸 쓴다 */
  seasonLabel: string | null;
}

/** 시즌 시작일 → 라벨. seasonWindowForLabel("2026-27") 의 역함수와 같은 규칙(앞 4자리 = 시작 연도). */
export function seasonLabelFromStart(league: string, start: Date): string {
  const y = start.getUTCFullYear();
  const b = SEASON_BOUNDARY[league];
  const european = (b?.month ?? 1) >= 6; // 6월 이후 개막 = 두 해에 걸친 시즌
  return european ? `${y}-${String(y + 1).slice(2)}` : `${y}`;
}

const MIN_FINISHED_FOR_CURRENT = 10;

export function selectSeasonMatches<T extends { startTime: Date; status: string }>(
  all: readonly T[],
  league: string,
  now: Date = new Date(),
): SeasonSelection<T> {
  const seasonStart = currentSeasonStart(league, now);
  if (!seasonStart) return { season: [...all], isPreviousSeason: false, seasonStart: null, seasonLabel: null };
  let season = all.filter((m) => m.startTime >= seasonStart);
  // 오프시즌 폴백 — 지난 시즌 표시는 "새 시즌 일정조차 없을 때"만. 새 시즌 fixture 가 이미 잡혀 있으면
  // (개막 직전~직후) 지난 시즌으로 돌아가지 않는다(2026-08-15: 완료<10 조건만 보다가 지난 시즌 380경기가 되살아났다).
  const finished = season.filter((m) => m.status === "FINISHED").length;
  const hasScheduled = season.some((m) => m.status === "SCHEDULED");
  if (finished < MIN_FINISHED_FOR_CURRENT && !hasScheduled) {
    const prevStart = previousSeasonStart(seasonStart);
    season = all.filter((m) => m.startTime >= prevStart && m.startTime < seasonStart);
    return { season, isPreviousSeason: true, seasonStart, seasonLabel: seasonLabelFromStart(league, prevStart) };
  }
  return { season, isPreviousSeason: false, seasonStart, seasonLabel: seasonLabelFromStart(league, seasonStart) };
}
