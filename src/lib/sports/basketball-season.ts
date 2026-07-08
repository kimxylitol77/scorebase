// 농구 경기 날짜 → 시즌 라벨("2026-27") 계산. 서머리그(7월)~익년 6월을 한 시즌으로 묶는다.
// NBA/KBL/WKBL 모두 10월~익년 봄 시즌 + 여름 서머리그 → 7월 1일(KST) 경계면 한 시즌에 자연히 들어온다.

/** 시즌 시작 연도. 7월(KST)부터 그 해가 시작연도, 6월까지는 전년이 시작연도. */
export function basketballSeasonStartYear(d: Date): number {
  const k = new Date(d.getTime() + 9 * 3600_000); // KST
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth(); // 0=1월 … 6=7월
  return m >= 6 ? y : y - 1;
}

/** 시작연도 → "2026-27" 라벨. */
export function basketballSeasonLabelFromStart(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** 경기 날짜 → 시즌 라벨("2026-27"). */
export function basketballSeasonLabel(d: Date): string {
  return basketballSeasonLabelFromStart(basketballSeasonStartYear(d));
}
