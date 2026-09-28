# 컨텍스트 노트
- 이름은 사용자 선택 "스코어보드"(2026-09-28). URL 은 ?sort=board.
- AI 확률은 NormalizedMatch.soccerCtx.prediction(probHome/Draw/Away·pick), 배당은 odds(home/draw/away·trend), 전반은 soccerHalfScore, 순위는 home/away.position.
- 리그 순서: 진행 중 경기가 있는 리그 먼저, 그다음 LEAGUE_ORDER. 축구 AI 확률은 NormalizedMatch 에 없어서 pred1x2 필드를 새로 실었다(liveCommentary.prediction 은 야구 전용).
- 2026-09-28 사용자 지시로 순서를 시간순으로 변경 — 리그는 가장 이른 경기 시각순, 리그 안도 시각순. 진행 중 리그 우선·상태 정렬은 뺐다.
