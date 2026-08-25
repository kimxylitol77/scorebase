// stale LIVE 매치를 FINISHED 로 확정하기 전, ts 캐시가 "경기가 끝까지 치러졌다"고
// 말하는지 판정한다. 0-0 오확정(중단 경기가 없는 결과로 굳는 것) 차단 전용.
//
// 배경: cleanup-stale-scheduled 의 폴백은 `homeScore != null` 을 "점수 있음 = 완주"로
// 읽어 0-0 을 FINISHED 로 도장 찍는다. 1피리어드/전반에서 중단된 무득점 경기가 그대로
// 확정된다 (2026-08-25 HOCKEY_FRIENDLY #7179267 — ts 가 status_id=30(P1)·{ft:[0,0],p1:[0,0]}
// 에 고착한 채 4.6h 방치).
//
// ⚠️ "0-0 이면 연기" 같은 일괄 규칙은 금지다. 정당한 0-0 무승부가 실재한다.
//
// 실측 (2026-08-25, 최근 365일 FINISHED + ts score 배열 11,169건):
//   축구 7,623건 중 0-0 509건 · ts 상태 ≠ 종료 12건.
//     그 12건 중 FA컵 4·클럽친선 2 는 score 배열이 전부 0 인데 incidents 에 45'(HT)·90'(FT)
//     마커가 있어 실제로 치러진 0-0 이었다. 나머지도 코너·카드가 쌓여 있었다.
//     → 축구는 score 배열만으로 "미진행"을 가릴 수 없다. UNKNOWN 으로 두고 기존 동작 유지.
//   야구 2,700건 중 0-0 16건 — 전부 status_id=14(취소, KBO 10·NPB 6) + score[3]={}.
//     이미 FINISHED 0-0 으로 굳은 오확정이다. status 만으로 확실히 갈린다.
//   하키 202건 중 0-0 0건 — 아직 오확정 없음(사고 건은 수동 POSTPONED 로 회피).
//   농구 336·배구 303건 중 0-0 0건 — 0-0 자체가 성립하지 않아 대상 아님.

import { BASEBALL_LEAGUES, HOCKEY_LEAGUES, SOCCER_LEAGUES } from "../sport-leagues";

/**
 * COMPLETED = 완주 확인 (FINISHED 확정 가능)
 * UNPLAYED  = 완주하지 않음 (FINISHED 로 확정하면 안 됨)
 * UNKNOWN   = 판정 불가 → 호출부가 기존 동작을 유지해야 한다. 절대 UNPLAYED 로 밀지 말 것.
 */
export type FinishEvidence = "COMPLETED" | "UNPLAYED" | "UNKNOWN";

/** 종목별 정규 피리어드 수 — 이만큼 기록돼 있어야 완주로 본다. */
const REGULAR_PERIODS: Record<string, number> = { hockey: 3, baseball: 9 };

/** ts status_id 중 "확실히 끝났다" / "확실히 안 치러졌다" 코드. status-codes.ts 표와 동일. */
const TERMINAL: Record<string, { completed: number[]; unplayed: number[] }> = {
  // 하키 100=ENDED 105=AFTER_OT 110=AFTER_PENALTIES 19=Cut in half / 14=POSTPONED 16=CANCELED
  hockey: { completed: [100, 105, 110, 19], unplayed: [14, 16] },
  // 야구 100=종료 / 14·19=취소·중단
  baseball: { completed: [100], unplayed: [14, 19] },
  // 축구 8=End / 12=Cancel. 9(Delay)·10(Interrupt) 는 넣지 않는다 — 실측에서 완주한
  // FA컵 0-0 이 9 로 남아 있었다(폴러가 FT 스탬프를 놓친 것). 시간 기반 판정도 금지.
  soccer: { completed: [8], unplayed: [12] },
};

function sportOf(league: string): string | null {
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (SOCCER_LEAGUES.has(league)) return "soccer";
  return null;
}

/** score[3] 의 p1·p2… 키 개수. 객체가 아니면 null(판정 불가). */
function periodCount(periods: unknown): number | null {
  if (!periods || typeof periods !== "object" || Array.isArray(periods)) return null;
  return Object.keys(periods).filter((k) => /^p\d+$/.test(k)).length;
}

/**
 * ts 캐시 detailLive.score 로 완주 여부를 판정한다.
 *
 * score 구조 (실측):
 *   하키·야구  [tsId, status_id, ?, { ft, p1, p2, ... }]
 *   축구       [tsId, status_id, [홈 스탯], [원정 스탯], kickoff, ""]
 */
export function tsFinishEvidence(league: string, tsScore: unknown): FinishEvidence {
  const sport = sportOf(league);
  if (!sport) return "UNKNOWN";
  if (!Array.isArray(tsScore)) return "UNKNOWN";

  const statusId = Number(tsScore[1]);
  if (!Number.isFinite(statusId)) return "UNKNOWN";

  const terminal = TERMINAL[sport];
  if (terminal.completed.includes(statusId)) return "COMPLETED";
  if (terminal.unplayed.includes(statusId)) return "UNPLAYED";

  // 여기부터는 ts 가 아직 진행 중/예정이라고 말하는 상태. 축구는 이 상태에서 쓸 수 있는
  // 완주 증거가 score 배열에 없다 (전부 0 이어도 실제로 치러진 사례가 실측됐다).
  const regular = REGULAR_PERIODS[sport];
  if (regular == null) return "UNKNOWN";

  const count = periodCount(tsScore[3]);
  if (count == null) return "UNKNOWN";
  return count >= regular ? "COMPLETED" : "UNPLAYED";
}
