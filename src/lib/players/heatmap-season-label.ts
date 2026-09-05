// 히트맵 묶음의 시즌 라벨을 **실제 경기 날짜**에서 도출한다.
//
// 빌더(build-player-match-heatmaps)는 matches 를 누적하면서 seasonLabel 만 매번 현재 시즌으로
// 덮어썼다. 그래서 지난 시즌 경기만 있는 선수에게 이번 시즌 딱지가 붙는다 — 2026-09-05 실측:
// 모건 로져스의 마지막 경기가 2026-05-15(25/26)인데 라벨은 "2026-27 EPL" 이라, 화면에서
// 이번 시즌 히트맵처럼 읽혔다. 소스가 26/27 좌표를 아직 안 주는 선수가 전부 이 상태다.
//
// 라벨은 데이터를 설명해야지 수집 시점을 설명하면 안 된다.

/** 유럽 시즌 경계 — 7월 이전은 직전 연도 시즌으로 친다 (8월 개막·5월 종료). */
export function seasonKeyForDate(date: string): { start: number; euro: string; calendar: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return { start, euro: `${start}-${String((start + 1) % 100).padStart(2, "0")}`, calendar: String(y) };
}

/**
 * 경기 목록에 맞는 시즌 라벨. 기존 라벨의 리그 부분(예: "2026-27 EPL" → "EPL")과
 * 연도 형식(유럽형 `2026-27` vs 달력형 `2026`)은 그대로 따르고 연도만 실제 데이터로 맞춘다.
 * 경기가 없으면 기존 라벨을 그대로 둔다 — 지어낼 근거가 없다.
 */
export function heatmapSeasonLabel(
  currentLabel: string,
  matches: Array<{ date: string }>,
): string {
  if (matches.length === 0) return currentLabel;
  const parts = currentLabel.split(" ");
  const yearPart = parts[0] ?? "";
  const leaguePart = parts.slice(1).join(" ");
  const isEuro = /^\d{4}-\d{2}$/.test(yearPart);

  // 가장 최근 경기가 그 묶음의 시즌을 대표한다 (누적이라 옛 시즌이 섞여 있을 수 있다).
  const newest = matches.reduce((a, b) => (a.date > b.date ? a : b)).date;
  const k = seasonKeyForDate(newest);
  const year = isEuro ? k.euro : k.calendar;
  return leaguePart ? `${year} ${leaguePart}` : year;
}
