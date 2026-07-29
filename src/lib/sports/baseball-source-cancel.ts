// api-baseball 이 주는 "미래 경기 CANC" 를 취소로 믿을지 판정 — collector·재대조 cron 공용.
//
// 실측 근거 2건. 모두 소스가 틀렸다.
//   2026-05-10 KBO 90건(8~9월) CANC → 이후 소스 자신이 NS 로 정정. 그 사이 우리 DB 만 고착.
//   2026-07-29 NPB 71건(9월) CANC → NPB 공식 일정(npb.jp)과 대조 결과 전부 정상 편성.
//     경기 수·팀 매치업·개시 시각까지 일치(9/10 6경기·9/21 5경기·9/27 3경기).
//
// 야구에서 미래 일정이 통째로 "취소"되는 일은 사실상 없다 — 우천 취소는 당일에 일어나고
// (그건 킥오프가 지난 뒤라 이 규칙에 안 걸린다) 시즌 중 사전 취소는 파업급 사건이다.
// 반면 소스가 미확정 미래 경기를 CANC 로 주는 기벽은 반복 관측됐다. 그래서 미래 CANC 만
// 무시한다. POST(연기)·ABD(미성립)·SUSP(중단)는 실제 신호이므로 그대로 존중한다.
//
// 킥오프가 지나면 이 규칙은 더 이상 적용되지 않아, 진짜 취소는 그날 자연히 반영된다.

/** 소스 status 가 "미래 경기에 대한 CANC" 인가 — true 면 취소로 취급하지 않는다. */
export function isFutureSourceCancel(
  short: string | null | undefined,
  startTime: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!startTime) return false;
  return (short ?? "").toUpperCase() === "CANC" && startTime.getTime() > now.getTime();
}
