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

// ─────────────────────────────────────────────────────────────
// 취소 경기가 "종료 0-0" 으로 굳는 것 차단 (2026-08-25).
//
// collect 의 mergeStatus 는 "점수 없는 FINISHED 는 확정 결과가 아니다" 라며 소스의
// POSTPONED 를 받아준다. 그런데 그 판정이 `homeScore != null` 이라 **0-0 은 점수 있음**
// 으로 읽힌다. 취소 경기가 한 번 FINISHED 0-0 으로 찍히면 소스가 매 수집마다 POST 를
// 줘도 영영 "종료 0-0" 으로 남는다.
//
// 실측 (2026-08-25, 최근 365일). FINISHED 인데 raw 가 연기/취소인 매치 24건 중
//   0-0 23건 = KBO 18 · NPB 5 — 전부 이 경로로 굳은 취소 경기.
//   득점 있음 1건 = KBO #2218 (0-1, ABD 중단) — 이건 가드가 막는 게 맞다.
//   축구 0건.
// 야구 FINISHED 0-0 37건 중 소스가 연기/취소인 게 23건, 나머지 14건은 소스 FT 라
// 이 규칙에 걸리지 않는다(incoming 이 POSTPONED 일 때만 발동).
//
// 축구를 제외하는 이유. 0-0 무승부가 정상 결과인 데다, af 가 종료 경기에 PST/NS 를
// 주는 기벽이 실측돼 있어(SUI_CUP #5801019 af NS 26h+ 고착) 진짜 결과를 지울 수 있다.

/** 야구 리그 — 0-0 종료를 "결과 없음"으로 볼 대상. */
const BASEBALL = new Set(["KBO", "NPB", "MLB", "LMB", "CPBL", "KBO_FUTURES"]);

/**
 * 기존 FINISHED row 가 "지켜야 할 확정 결과" 를 갖고 있는가.
 * false 면 소스의 POSTPONED 를 받아들여도 된다.
 */
export function hasProtectedResult(
  league: string,
  homeScore: number | null | undefined,
  awayScore: number | null | undefined,
): boolean {
  if (homeScore == null && awayScore == null) return false;
  // 야구의 0-0 은 취소 경기의 잔여값이지 결과가 아니다 (실측 23/23).
  if (BASEBALL.has(league) && homeScore === 0 && awayScore === 0) return false;
  return true;
}
