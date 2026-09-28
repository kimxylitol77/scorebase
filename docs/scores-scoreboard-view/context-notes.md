# 컨텍스트 노트
- 이름은 사용자 선택 "스코어보드"(2026-09-28). URL 은 ?sort=board.
- AI 확률은 NormalizedMatch.soccerCtx.prediction(probHome/Draw/Away·pick), 배당은 odds(home/draw/away·trend), 전반은 soccerHalfScore, 순위는 home/away.position.
- 리그 순서: 진행 중 경기가 있는 리그 먼저, 그다음 LEAGUE_ORDER. 축구 AI 확률은 NormalizedMatch 에 없어서 pred1x2 필드를 새로 실었다(liveCommentary.prediction 은 야구 전용).
