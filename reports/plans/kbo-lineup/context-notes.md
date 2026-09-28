# KBO 라인업 — 컨텍스트 노트

## 출발점 (2026-09-28)

사용자가 네이버 라인업 탭(m.sports.naver.com/game/20260927HHLT02026/lineup)처럼 만들고
"오늘의 선발 매치업" 아래에 넣자고 했다. 경쟁 6곳 조사 결과 전부 타순 목록, 다이아몬드 그림 없음, 경기 전 예상 라인업 없음.

## 네이버 구성 (Playwright 390px 실측)

양 팀 좌우 2열. 열마다 "{팀}선발" 머리 → [선발] 배지 + 사진 + 이름 + "우투" → 1~9 타순(번호·사진·이름·"유격수, 우타")
→ 후보야수(이름·"포수, 우타") → 불펜투수(이름·"우완투수"/"좌완투수"/"우완언더"). 시즌 기록 없음.

## KBO 공식 데이터 (실측)

- `POST /ws/Main.asmx/GetKboGameList` leId=1&srId=0,1,3,4,5,6,7,8,9&date=YYYYMMDD
  → G_ID, AWAY_ID/HOME_ID(팀코드), AWAY_NM/HOME_NM(약칭), G_TM, T_PIT_P_ID(원정 선발)/B_PIT_P_ID(홈 선발).
- `POST /ws/Schedule.asmx/GetLineUpAnalysis` leId&srId&seasonId&gameId
  → [0] LINEUP_CK, [1][2] 팀 정보(T_ID·구간별 WAR), [3][4] 타순 표 JSON 문자열(타순·포지션·선수명·WAR).
  **발표 전(LINEUP_CK=false)에도 "최근 라인업"을 준다**(9/29 삼성-한화 확인). KBO 화면은 발표 전엔 안 띄우지만 데이터는 있다.
  두 ws 모두 X-Requested-With + Referer 필요(없으면 에러 HTML).
- `Player/Register.aspx` 1군 등록 현황 — hfSearchTeam·hfSearchDate 넣고 btnCalendarSelect 포스트백.
  표: 감독·코치·투수·포수·내야수·외야수, 행 = 등번호·이름(playerId 링크)·투타유형("우투좌타","우언우타")·생일·체격.
- 사진은 기존 kboPhotoUrl(playerId).

## 결정

- 네이버와 달리 발표 전에도 KBO "최근 라인업"으로 예상 라인업을 보여준다(차별화). 라벨로 예상/확정 구분.
- 타순 표에는 선수 id 가 없어 등록 현황과 이름으로 매칭(같은 팀 안이라 동명이인 위험 낮음). 못 찾으면 사진·타석 없이 이름만.
- WAR 은 네이버엔 없지만 KBO 가 주는 값이라 작게 붙인다.
- WAR 은 375px 2열에서 자리가 모자라 행에 넣지 않았다(데이터는 lib 에 있음).
- 후보·불펜은 14행+로 길어 <details> 로 접었다(네이버는 펼침).

## 검증 (2026-09-28)

- 9/27 한화-롯데(확정): 선발·타순 9·포지션·타석·후보 10·불펜 14 가 네이버 라인업 탭과 일치.
- 9/29 한화-삼성(발표 전): KBO 최근 라인업 + 경기일 등록 현황이 비어(미래 날짜) 최근 등록 현황으로 폴백.
- 375px 말줄임 0(번호 칸·간격 축소 후), 다크·라이트 확인.

## MLB·NPB 확장 (2026-09-28)

- 공용 타입 `src/lib/sports/baseball-lineup.ts`, 카드 `BaseballLineupCard`(KboLineupCard 에서 이름 변경) — 사진·링크·기준 문구를 데이터로 받는다.
- MLB `mlb-lineup.ts`: 오늘 박스스코어 battingOrder 9명이면 확정. 아니면 팀 직전 종료 경기 박스의 타순(취소·연기는
  abstractGameState 가 Final 이라 detailedState 로 거른다 — 9/27 NYY 취소 실측). 경기 전 박스에도 26인(bench 14·bullpen 14)이 있다.
  좌우 = /people?personIds 한 번. 선발 = 경기 시작 후 pitchers[0], 전엔 probablePitcher.
- NPB `npb-lineup.ts`: npb.jp 는 경기 전 스타팅을 안 준다(9/28 경기 전 box·roster 모두 빈 값). 오늘 box 에 선발 9명이면 확정,
  아니면 팀 직전 경기 box. 선발 판정 = 타순 칸 숫자 + 수비 칸이 "(遊)" 로 시작(경기 중 이동하면 "(中)左").
  roster.html = 등번호·pid·투타. 사진은 npbPlayerPhoto 사전, 없으면 players_photo/{Y}/180/s/{등번호3자리}_{pid}.jpg.
  예상 라인업의 투수 타순(센트럴 DH 없음)은 오늘 선발로 바꾼다.
- MLB 한글 풀네임이 길어 375px 에서 잘려 이름은 break-keep 두 줄 허용(세로 깨짐 0 확인).
