# 컨텍스트 노트
- 이름은 사용자 선택 "스코어보드"(2026-09-28). URL 은 ?sort=board.
- AI 확률은 NormalizedMatch.soccerCtx.prediction(probHome/Draw/Away·pick), 배당은 odds(home/draw/away·trend), 전반은 soccerHalfScore, 순위는 home/away.position.
- 리그 순서: 진행 중 경기가 있는 리그 먼저, 그다음 LEAGUE_ORDER. 축구 AI 확률은 NormalizedMatch 에 없어서 pred1x2 필드를 새로 실었다(liveCommentary.prediction 은 야구 전용).
- 2026-09-28 사용자 지시로 순서를 시간순으로 변경 — 리그는 가장 이른 경기 시각순, 리그 안도 시각순. 진행 중 리그 우선·상태 정렬은 뺐다.
- 2026-09-28 사용자 지시: 리그를 묶지 않고 전 경기 시각순 + 리그 바뀔 때 제목 줄(같은 리그가 여러 번 나올 수 있음). 점수 hover 툴팁(GoalsTooltip 재사용), 즐겨찾기도 스코어보드 표(한국어판만 — 영어판 FavoriteMatches 는 en-mirror 자동 생성 파일이라 직접 수정 금지), 예측 없음은 '전력 데이터 부족'(양 팀 Elo 1500 → 모델이 일부러 skip). 시간순 목록의 '분석' 버튼은 예측 유무와 무관하게 모든 경기에 붙는다(오해 원인).

## 2026-10-01 축구 외 종목
- 카드를 없애지 않고 토글로 남겼다. 야구 이닝별 점수·선발·주자, UFC Tale of the Tape 처럼 카드에만 있는 정보가 있어서.
- 쿠키를 축구(scores_sort)와 나눴다(scores_view). 축구에서 리그별을 고른 사람이 야구 표를 잃지 않게.
- mmaResultLabel 은 MatchCard("use client") 안에 있어 서버 렌더에서 호출하면 500 — lib 로 이동. 세부가 붙은 "Submission (Rear Naked Choke)" 도 한글화되게 괄호 앞부분으로 매칭(카드도 같이 좋아짐).
- tsc 가 기본 힙에서 OOM — NODE_OPTIONS=--max-old-space-size=8192 로 통과.
