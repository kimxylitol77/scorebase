# KHL NHL 수준 강화 — 컨텍스트 노트

- 2026-09-29 배당: hockey-odds-poller 는 KHL 도 대상에 넣고 있다(매핑 라우트 HOCKEY_LEAGUES). 그런데 ts odds/history 가 KHL 만 빈 값 — 폴러 문제가 아니라 소스에 없다. 유럽 리그는 9,000~19,000행 적재 중.
- 라인업: /v1/ice_hockey/match/lineup/detail·match/analysis·match/player_stats·season/player_stats 모두 "not authorized". 열린 것: odds/history, match/live/history, venue/list, season/list, honor/list(팀 honor 는 빈 배열).
- 골리 보정 계수(goalie-adjust.ts: GAA 1.0→4%p, SV% 0.020→3%p)는 NHL 기준. KHL 은 표본 쌓이고 백테스트 뒤에 켠다.
- 시즌 시뮬은 잘린 일정이면 우승확률 오보([[schedule-truncation-champion-gate]]). KHL 일정 125/748 이라 탭을 열지 않는다.
- OU 기준선 백테스트(87경기): 5.5 → 모델 56.3% < 전부 언더 67.8% / 4.5 → 모델 56.3% = 전부 오버. 4.5 채택. 핸디 1.5 모델 67.8% vs 전부 원정 70.1%. 모델이 단순 전략보다 낫다고 말할 수 없는 수준 — 시즌 중반 재측정.
- 예상 골리는 JSON projected:true 로 표시 — goalie-adjust(보정 제외)·edge-badges(칩 제외)가 이 플래그를 본다. 경기 상세 카드는 KHL 이면 SCHEDULED 에서만.
- 예상 골리 잡은 nhl-goalies 크론(매일 12:30 UTC)에 붙였다 — 크론 슬롯 추가 없음.
- KHL 스쿼드에 없는 출전 선수가 45명(이적·콜업) → build 스크립트가 경기 캐시 출전 선수를 보탠다.
- 선수 기록 탭은 이미 있었다(리그 페이지가 leagueLeader 행이 있으면 stats 를 자동 삽입).
