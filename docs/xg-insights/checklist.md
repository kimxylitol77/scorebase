# xG 인사이트 시리즈 (xGscore 벤치마크) 체크리스트

경쟁분석 봇이 발굴한 xgscore.io 의 UI 패턴 3개를 기존 xG 데이터(Match.fixtureStats.expectedGoals)로 이식.

## Phase 1 — 월드컵 xG 트래커에 결과 부합도(fairness)
- [ ] 경기별 xG 쌍 → Poisson 승/무/패 확률 → 실제 결과의 확률 = 부합도 %
- [ ] WcXgList 행에 부합도 칩 표시 (높음=결과가 내용대로, 낮음=이변/불운)
- [ ] tsc + 로컬 렌더 확인

## Phase 2 — /standings xG 탭 (PTS vs xPTS)
- [ ] 리그별 FINISHED 매치에서 팀별 누적: 득점 vs xG, 실점 vs xGC, PTS vs xPTS(경기별 Poisson 3×P승+1×P무 합산)
- [ ] 커버리지 게이트: xG 보유율 90% 미만 리그는 탭 숨김 (현재 통과: 라리가·세리에A)
- [ ] OVERALL / xG 탭 토글 UI, ±편차 컬러
- [ ] tsc + 로컬 렌더 확인

## Phase 3 — 팀 프로필 xG 추이
- [ ] 팀 페이지에 최근 경기 xG 생성/허용 추이 섹션
- [ ] xG 없는 팀/리그는 섹션 자체 미노출
- [ ] tsc + 로컬 렌더 확인

## 마무리
- [ ] Phase 별 시맨틱 커밋
- [ ] 배포는 사용자 지시 시
