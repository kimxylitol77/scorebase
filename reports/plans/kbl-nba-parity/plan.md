# KBL 을 NBA 수준으로 (2026-10-03, KBL 개막일)

## 왜
사용자: "KBL 데이터가 너무 없어, 수집할 수 있는 것 전부 수집하고 NBA 정도 맞춰줘".
진단: KBL 은 DB 에 2026-04-30 이후 경기만(종료 6) → Elo 이력 0 → AI 승률·프리뷰·AI 대결·시즌 예측 전부 공백. 같은 날 NBA 경기는 전부 있음.

## 원천
- ts: 현재 시즌만(지난 시즌 match/season/recent 405). 라이브 점수·일정은 ts 그대로.
- KBL 공식 api.kbl.or.kr (헤더 Channel: WEB, TeamCode: XX 필수): /match/list(기간), /match/{gmkey}/player-stat·team-record·text-cast·match-chart.
- 베트맨: KBL 발매 중(leagueName "KBL", 팀 id = KBL 구단 코드).
- The Odds API: KBL 없음.

## 1차 (이번 커밋)
- scripts/backfill-kbl-history.ts — 2020-21~2025-26 정규·PO·챔프 1,734경기(구단 코드→현재 구단 프랜차이즈)
- home-calibration KBL Platt(a .6, c -.05): 2025-26 검증 Brier .2443→.2369
- markets SPORT_PROFILE KBL + 농구 득실 평균 최근 365일 창: KBL OU 50→62.5%(오버 100→40%), 핸디 62.5→62.2(동일), NBA 불변
- 프리뷰·GPT AI 대결·시즌 예측 대상에 KBL, 베트맨 팀 사전 10구단(발매 7경기 35라인 연결)

## 2차
- 경기 상세: KBL 공식 player-stat·team-record·text-cast 로 박스스코어·팀 기록·문자중계(NBA 상세 수준)
