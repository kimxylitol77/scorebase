# WKBL 을 KBL 수준으로 (2026-10-03)
- 원천 = wkbl.or.kr(UA 에 bot 금지). 일정 /game/sch/inc_list_1_new.asp(GET, 먼저 적힌 팀 = 홈, 경기장으로 확인), 선수 기록 /game/ajax/ajax_game_result_2.asp(POST season_gu·game_type·game_no), 문자중계 /live11/path_live_sms.asp?quarter_gu0=Q1~Q4·X1~ (XML "쿼터|1홈2원정|문구|홈점수|원정점수|시간", 득점 장면만 점수).
- 플레이오프는 일정 목록에 없다 → 백필은 정규리그만(6시즌 540경기). 이번 시즌 105경기(11/1 KB-BNK 개막) 예정 행 선입력. externalId wkbl-{season_gu}-{날짜}-{홈}-{원정}. ts 수집기는 ±90분 같은 팀 non-ts 행을 흡수하므로 중복 안 생김.
- AI 승률 비공개(NO_PREDICTION_LEAGUES): 2024-25·2025-26 백테스트 Brier .2667(찍기 .25), 홈 승률 47.3%, 홈 이점 0·Platt 보정해도 .255 이상. 시즌 중 재검증 과제.
- 메모리 kbl-league-page-players 의 "WKBL 경기별 기록 endpoint 없다"는 틀렸다(정정).
