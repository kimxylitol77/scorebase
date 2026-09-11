# 체크리스트 — 과제 4 /picks 기록장
- [x] `lib/predict/flat-roi.ts` settleFlatUnits + model-vs-market 이 사용
- [x] `components/predictions/RoiCard.tsx` 공용화, accuracy 교체
- [x] `/picks` 상단 5지표 + 배당 없음 제외 표기 + AI 적중 비교 제거 + 기준선
- [x] `/picks/me` lib 계산 + 제외 표기 + 나 vs AI → 수익률 기준선
- [x] `/lab` 백테스트 유닛 수익률(원배당 피처·scoreBacktest·카드)
- [x] EN 미러 3라우트 재생성
- [x] tsc · eslint · 단위 테스트
- [x] dev 렌더 검증(/picks · /picks/me · /lab · accuracy 값 불변)
## 지시서 §4 수용 기준
- [x] 신규 픽 저장 후 DB 에 배당·시각(pickOdds·createdAt) 기록
- [x] 채점 시 유닛 손익이 /picks 상단에 반영
- [x] 배당 없는 픽은 수익률에서 제외되고 제외 건수 표기
- [x] /lab 백테스트에 적중률과 유닛 수익률 동시 표시
## 마무리
- [x] 지시서 §4 체크박스 · 커밋
