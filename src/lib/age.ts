// 생일(Date)로부터 만 나이를 계산하는 공용 헬퍼 — 연봉 랭킹 등 종목별 나이 컬럼 공유.
// 소스가 제각각(NBA unix sec·KBO/MLB ISO 문자열)이라 Date 로 정규화 후 단일 로직으로 계산.

/** 생일 → 만 나이. null·무효·범위 밖이면 null. SSR 기준 현재(UTC) 날짜로 산출. */
export function calcAge(birth: Date | null | undefined): number | null {
  if (!birth || Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
