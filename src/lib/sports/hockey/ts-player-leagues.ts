// ts 선수 사전(khl-players.json·hockey-eu-players.json)이 있는 하키 리그 — 선수 페이지·링크 판정의 단일 출처.
// json 을 import 하지 않아 클라이언트 컴포넌트(리더보드·박스스코어)에서 써도 번들이 가볍다.
export const HOCKEY_TS_PLAYER_LEAGUES = [
  "KHL", "LIIGA", "SWISS_NL", "CZECH_EXTRALIGA", "SLOVAK_EXTRALIGA", "DENMARK_METAL", "CHL_HOCKEY",
] as const;
export const HOCKEY_TS_PLAYER_LEAGUE_SET = new Set<string>(HOCKEY_TS_PLAYER_LEAGUES);

/** ts 경기 캐시 집계 리그(스탯 표·리더보드) — 선수 이름 사전이 있고 경기 기록이 쌓이는 곳.
 *  슬로바키아·덴마크는 사전은 있지만 ts 가 경기별 선수 기록을 거의 안 줘(2026-09-29 31경기 중 1~2) 뺀다. */
export const TS_HOCKEY_LEAGUES = ["KHL", "LIIGA", "SWISS_NL", "CZECH_EXTRALIGA", "CHL_HOCKEY"] as const;
