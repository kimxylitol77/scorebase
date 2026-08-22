# 컨텍스트 노트 — /scores UX 2순위

## 배경
1순위(reports/plans/scores-ux-tier1) 완료 후. 사용자 요청 1건 편입: 상세 상단에 /scores 툴팁 블록.

## 결정
- **7a 경기 한눈에** — `SoccerGlanceBlock`(탭 밖, 스코어보드 아래). /scores 툴팁과 같은 파생 함수(tsIncidentsToGoals/Cards·tsTeamStatsToSoccerStats·tsHalfStatsToSoccerStats) 재사용. 종료 경기도 전반 통계 유지. 옛 statsTab 의 FINISHED 전반 탈락은 그대로 둠(리포트 PhaseComparison 이 대신).
- **7b 요약 카드** — `MatchSummaryCard` 를 결론 3카드 위에. 시장 확률 = Match.market*(마진 제거), raw implied = 1/odds*. 신뢰도는 `getModelCalibrationStats` 표본·보정 오차만으로 판정(80경기·5%p). 결장은 예상 XI 계산 블록의 injuries 를 호이스팅. 차이 부호 분기(음수 = 시장이 더 높게 봄).
- **7c 순서** — 배당 탭(`soccer-odds`)을 MatchInsight 에서 빼서 최근 경기 뒤·AI 매치업 앞 `CollapsibleSection` 으로 이동(복제 금지 — LiveOddsCard 폴링). 종료 경기는 접힘.
- **6a 구획** — `showHighlights`(리그·상태 필터 없음 + 리그별 뷰)일 때만 주요(인기 리그 6)·곧 시작(2h 내 10)·변동(배당 trend≠0 또는 라인업 도착 8). 전체 목록은 그대로.
- **6b 접기** — 행 10개 캡만으로는 DOM 38k 그대로(리그 카드 207개 × 데스크톱·모바일 두 트리가 진범). 상태 섹션마다 리그 카드 8개 + "리그 N개 더 보기"(`ShowMoreRows`, 펼치기 전엔 DOM 에 안 올림). 실측 DOM 38,463→17,596·링크 2,829→1,466. RSC payload 는 그대로(더 보기 노드 직렬화).
- **8 베트맨** — `getBetmanLineForMatch`(팀 id 역인덱스 + 킥오프 ±3h + 최신 회차). `data/betman-team-map.json` 이 220건뿐이라 새 시즌 EPL 팀이 없었음 → 빌더 재실행(326건). ⚠ 빌더가 "병합"이라면서 기존 12개 값을 바꿔서(링컨 시티 600033→610435 등, 중복 Team row 의심) **기존 값 우선으로 되돌리고 신규 키만 추가**.
- **9a** — LiveOddsCard 북메이커 표 칼럼별 최고 배당 하이라이트·헤더 클릭 정렬·최고−최저 스프레드. **9b** — `/value-bets` 목록을 `ValueBetList`(클라이언트)로: 배당 구간 필터 + 차이/켈리/배당/시간 정렬, 켈리 비중 열.
- **M3 실재 확인·수정** — `BasketballLiveOddsTab` 을 축구도 쓰는데 `hasDraw={false}` 고정이라 무승부가 통째로 빠져 있었다. 데이터(`h2h.draw != null`)로 판정하게 고침. 리뷰 오판이 아니라 진짜였음(1순위 때 "데이터 케이스"라 봤던 내 추정이 틀림).
