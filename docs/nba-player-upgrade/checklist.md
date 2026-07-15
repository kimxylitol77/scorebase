# NBA 선수 페이지 업그레이드 — 체크리스트

축구/야구 선수 페이지 업데이트와 대칭. per-36(축구 per-90 대응) · 시즌추이 라인차트 · 부상이력 축적.

## Phase A — per-36 지표 (쉬움, DB무관)  [완료·배포 a05756b]
- [x] `NbaViews.tsx` 통산 평균 섹션 아래 "36분 환산" 섹션 추가
- [x] PTS/REB/AST/STL/BLK per-36 계산 (career.min 기준, min>0 가드)
- [x] tsc 통과 확인

## Phase B — 시즌 추이 라인차트 (중간, DB무관)  [완료·배포 a05756b]
- [x] `NbaTrendChart.tsx` 신설 (BaseballTrendChart 패턴, recharts)
- [x] PTS/REB/AST 3라인, year>0 시즌만, 2+시즌일 때만 렌더
- [x] NbaPlayerView 개요에 삽입 (career 섹션 아래)
- [x] tsc 통과
- [x] 프로덕션 검증 완료 (다이슨 대니얼스: per-36 12.3/6.7/5.2, 추이 '23~'26 렌더)
- 참고: 레이더 차트(축구 ③)는 농구 개요에 이미 구현돼 있었음 (NbaSeasonOverview)

## Phase C — 부상 이력 축적 (PlayerEvent 재사용, db push 불요)
- [x] 방식 확정: 새 테이블 폐기 → 기존 PlayerEvent 재사용(축구와 통일). db push 없음.
- [x] cron: collect-player-events 에 NBA 블록 추가 — ESPN injuries 스냅샷 →
      INJURY 적재 + 명단이탈=RETURN 상태비교. id prefix "nba-injury:"/"nba-return:".
- [x] UI: NBA 선수 페이지 "부상이력" 탭 (playerId=espnId 조회, NbaInjuryHistory)
- [x] tsc 통과
- [x] 로직 교차검증: 현재 부상자 127명 전원 espnId 추출·nba-players 매칭 100%
- [x] 첫 적재 완료: 잡 수동 실행 → nba-injury 127건 적재(무릎·발목 등 한글 부위)
- [x] 프로덕션 검증: 자미르 왓킨스 페이지 부상이력 탭 노출 + "2026.07.15 부상 — 무릎 Day-To-Day" 렌더
- 제약: ESPN 이 과거를 안 줘 오늘부터 축적. 이후 주간 cron 이 자동 갱신.

## 배포
- [x] A·B commit + push (a05756b) → 프로덕션 검증 완료
- [x] C commit + push (3ecf052) → 잡 수동 실행으로 첫 데이터 적재·검증 완료
