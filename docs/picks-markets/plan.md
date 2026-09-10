# /picks 핸디캡·오버언더 투표 + 랭킹 아바타·등급 — 계획

## 무엇을
1. 승부예측 투표를 1X2 외에 핸디캡·오버언더 시장까지 열고, 시장별로 따로 채점한다.
2. 적중 랭킹에 회원 아바타(프로필 사진)와 등급(계급 이모지·이름)을 보여준다.

## 왜
/picks 에 회원 26명·727표가 쌓였다. 참여 장치가 작동하니 선택지를 넓히고(핸디·오버언더), 랭킹을 "얼굴 있는" 표로 만들어 경쟁 동기를 준다.

## 설계
- DB: `MatchVote` 에 `market TEXT NOT NULL DEFAULT '1X2'`, `line DOUBLE PRECISION` 추가. 유니크를 (matchId,userId)·(matchId,sessionId) 에서 (…,market) 3중으로 교체. 기존 727행은 market='1X2' 로 자동 분류. raw SQL(prisma/sql) + lock_timeout 3s.
- pick 값: 1X2 = home/draw/away · HANDICAP = home/away (line 양수, home=홈 −line, away=원정 +line — handicapCorrect 규약) · OU = over/under (line = 총점 기준선).
- 라인 결정은 서버 단일: hc = Match.predHcLine → |oddsHcLine| → 종목 프로필 handicapLine, ou = oddsTotalLine → 프로필 overLine. 프로필 없는 리그(월드컵 등)는 1X2 만.
- 채점: score-match-votes 가 시장별로 — 1X2 승자, HANDICAP handicapCorrect, OU overActual. CLV 는 1X2 만(스냅샷에 hc/ou 배당 없음).
- UI: MatchVoteButtons 에 시장 탭(승부 · 핸디캡 −1.5 · 오버언더 9.5). 탭마다 분포·내 픽·AI 픽·결과. 기존 1X2 흐름 그대로.
- 랭킹: 기존 집계(전 시장 합산) 유지 + 아바타(resolveAvatar/Avatar)·등급(displayGrade) 표시, 시장별 적중 부가 표기.
