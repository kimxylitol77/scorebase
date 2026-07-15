# NBA 선수 페이지 업그레이드 — 체크리스트

축구/야구 선수 페이지 업데이트와 대칭. per-36(축구 per-90 대응) · 시즌추이 라인차트 · 부상이력 축적.

## Phase A — per-36 지표 (쉬움, DB무관)
- [ ] `NbaViews.tsx` 통산 평균 섹션 아래 "36분 환산" 섹션 추가
- [ ] PTS/REB/AST/STL/BLK per-36 계산 (career.min 기준, min>0 가드)
- [ ] tsc 통과 확인

## Phase B — 시즌 추이 라인차트 (중간, DB무관)
- [ ] `NbaTrendChart.tsx` 신설 (BaseballTrendChart 패턴, recharts)
- [ ] PTS/REB/AST 3라인, year>0 시즌만, 2+시즌일 때만 렌더
- [ ] NbaPlayerView 개요에 삽입 (career 섹션 아래)
- [ ] tsc 통과 + 프리뷰에서 2+시즌 선수 렌더 확인

## Phase C — 부상 이력 축적 (큼, db push 승인 필요)
- [ ] 스키마 설계 확정 (새 모델 NbaInjurySpell, ESPN id 키)
- [ ] 사용자 db push 승인
- [ ] cron: 매일 ESPN NBA injuries 스냅샷 → 상태변화 감지 → 멱등 적재
- [ ] UI: NBA 선수 페이지에 "부상이력" 탭/섹션
- [ ] tsc 통과 + cron 1회 실행 검증

## 배포
- [ ] A·B 먼저 commit + push (DB무관)
- [ ] C는 스키마 승인 후 별도 진행
