// FootballTransfer.transferTime 해석 — 날짜만 있는 필드라 "경계일 일괄 기록" 을 판정하는 단일 출처.
//
// ── 실측 근거 (2026-08-13, 전체 130,187행) ──
// transferTime 은 초 단위 unix 지만 실제로는 날짜 전용이다. 값이 취하는 UTC 시각은
// 16:00(87,609) · 22:00(21,275) · 23:00(13,802) · 00:00(7,397) 네 가지뿐 — 각각
// UTC+8 · UTC+2 · UTC+1 · UTC 의 자정이다. 즉 소스가 "그 날짜 자정" 을 시간대만 달리 찍는다.
// 최근 행은 전부 16:00 UTC = UTC+8 자정이라 판정 기준 시간대는 UTC+8 로 고정한다.
//
// UTC+8 기준 월-일별 쏠림(2010~2025, 각 연도 일평균 대비 배수).
//   07-01  60.7배(13,027건)   06-30  53.2배(11,830건)   01-01  18.8배(3,988건)
//   ── 뚜렷한 단절 ──
//   01-31  8.6배   08-31  8.4배   12-31  6.9배   08-01  5.7배   09-01  5.4배
// 앞 3개는 계약연도 경계(신 계약 개시 7/1 · 계약·임대 만료 6/30 · 연 경계 1/1)이고,
// 뒤쪽 8배 이하 무리는 실제 마감일(1월창 마감·여름창 마감)이라 성격이 다르다 —
// 2026 1월창도 마감일 2/2 에 188건이 정상적으로 몰렸다. 그래서 앞 3개만 경계일로 본다.
//
// "그날 성사" 가 아니라 "발효일" 이라는 증거.
//   · 2026-07-01(UTC+8) 로 찍힌 이적료 194건 중 43건은 우리 DB 에 6월에 이미 들어와 있었다
//     — 아직 오지 않은 날짜로 미리 기록됐다는 뜻.
//   · 에메가(스트라스부르→첼시 €25M)는 6/30 수집, ts 원본 updated_at 은 8/2, 날짜는 7/1.
//   · 반대로 7/2 이후 발표분은 실제 발표일이 그대로 들어온다(7월 일별 10~50건 수준).
//   · 6/30(UTC+8) 무더기 950건은 이적료 3건뿐 — 대부분 임대 만료(transferType=2).
//
// ⚠️ 창 경계 함정. 2026 여름창을 "7/1 UTC 이후" 로 잡으면 이 무더기가 UTC 로는 6/30 16:00 이라
// 이적료 200건 €1,862.8M 이 통째로 빠진다. 창 시작은 6/1 처럼 경계일보다 앞에 둬야 한다.
//
// DB 플래그 컬럼을 만들지 않은 이유. transferTime 만으로 100% 결정되는 값이라 컬럼은 백필과
// 재동기화 부담만 늘고 원본과 어긋날 여지가 생긴다. 판정은 이 모듈 하나로 유지한다.

/** TheSports 가 날짜 자정을 찍는 기준 시간대 (UTC+8) */
const TS_TZ_OFFSET_SEC = 8 * 3600;

/** 계약연도 경계일 (UTC+8 기준 MM-DD) — 실제 이적일이 아니라 발효일이 일괄로 찍히는 날 */
const BOUNDARY_MMDD = new Set(["06-30", "07-01", "01-01"]);

/** transferTime(unix 초) → UTC+8 기준 "MM-DD" */
function monthDayCst(unix: number): string {
  const d = new Date((unix + TS_TZ_OFFSET_SEC) * 1000);
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * 계약연도 경계일에 일괄 기록된 행인가.
 * true = 그날 성사됐다는 뜻이 아니라 "발효일이 시즌 전환일로 찍힌 건" — 집계에 넣는 건 맞지만
 * 날짜 기준 정렬·일별 분해·창 경계 판정에는 쓰면 안 된다.
 */
export function isSeasonBoundaryTransfer(unix: number | null | undefined): boolean {
  if (!unix) return false;
  return BOUNDARY_MMDD.has(monthDayCst(unix));
}

/** 집계 결과에 붙이는 기준 문구 — 페이지·영상 자막 공용 */
export const BOUNDARY_NOTE =
  "이적일은 소스 기준 발효일이라 시즌 전환일(6/30·7/1)에 일괄 기록되는 건이 있습니다. 집계에는 포함하되 일자별 분포로는 읽지 마세요.";

/** 경계일 비중 — 집계 화면·영상에 "이 중 얼마가 경계일 기록인지" 를 노출하기 위한 요약 */
export function boundaryShare(
  rows: { transferTime: number | null; transferFee: number | null }[],
): { count: number; fee: number; totalCount: number; totalFee: number; feePct: number } {
  let count = 0, fee = 0, totalCount = 0, totalFee = 0;
  for (const r of rows) {
    const f = r.transferFee || 0;
    totalCount++;
    totalFee += f;
    if (isSeasonBoundaryTransfer(r.transferTime)) { count++; fee += f; }
  }
  return { count, fee, totalCount, totalFee, feePct: totalFee > 0 ? (fee / totalFee) * 100 : 0 };
}
