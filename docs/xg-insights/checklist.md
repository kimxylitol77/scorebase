# xG 인사이트 시리즈 (xGscore 벤치마크) 체크리스트

경쟁분석 봇이 발굴한 xgscore.io 의 UI 패턴 3개를 기존 xG 데이터(Match.fixtureStats.expectedGoals)로 이식.

## Phase 1 — 월드컵 xG 트래커에 결과 부합도(fairness)
- [x] 경기별 xG 쌍 → Poisson 승/무/패 확률 → 실제 결과의 확률 = 부합도 %
- [x] 판정 칩 옆 부합도 % 표시 (높음=결과가 내용대로, 낮음=이변/불운)
- [x] tsc + 로컬 렌더 확인 (이변 13%·순리 93% 분포)

## Phase 2 — /standings xG 심화 섹션 (PTS vs xPTS)
- [x] 리그별 FINISHED 매치에서 팀별 누적: 득점 vs xG, 실점 vs xGC, PTS vs xPTS(경기별 Poisson 3×P승+1×P무 합산)
- [x] 커버리지 게이트: xG 보유율 90% 미만 리그는 섹션 숨김 (현재 통과: 라리가·세리에A)
- [x] 탭 대신 순위표 하단 상시 섹션으로 결정 (클라 JS 불필요 + GEO 크롤 가치, context-notes 참조)
- [x] tsc + 로컬 렌더 확인 (라리가 380/380, EPL 미노출)

## Phase 3 — 팀 프로필 xG 추이
- [x] 팀 페이지에 최근 10경기 xG 생성/허용 페어 바 차트 + 요약 타일 3개
- [x] 5경기 미만·비축구는 섹션 미노출
- [x] tsc + 로컬 렌더 확인 (바르셀로나)

## 마무리
- [x] Phase 별 시맨틱 커밋 3건
- [ ] 배포는 사용자 지시 시
