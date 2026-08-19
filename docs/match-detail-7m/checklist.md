# 체크리스트 — 7m 매치 결과 페이지 벤치마킹

출처: https://www.7mkr2.com/sport/soccer/report/data/5071270-... (코파 리베르타도레스 2차전)
우선순위 합의: 1) 확률대별 과거 결과 카드 → 2) 요인 카드 구조화 → 3) 2차전 합산 스코어

## 1순위 — 확률대별 과거 결과 카드

- [x] `src/lib/predict/model-calibration-similar.ts` 조회 로직
      → 검증 완료: 0.25/0.35/0.45/0.55/0.65 전 구간 실측과 일치, 0.75 는 표본 미달로 null
- [x] `src/components/predictions/ModelCalibrationCard.tsx` 카드
      → 검증 완료: 비축구·2-way(predDraw null)·표본 미달 모두 null 반환
- [x] 축구 매치 상세(`/live/[league]/[gameId]`) 배선
      → 검증 완료: /live/LALIGA/1570337 실렌더, 표본 1,305경기 카드 정상
- [x] 쿼리 실행시간 측정 → 165~175ms (첫 콜만 연결 오버헤드 1.7s)
- [x] 모바일 375px → 가로 스크롤·텍스트 넘침 없음
- [x] tsc 통과 후 커밋

## 2순위 — 요인 카드 구조화 (유리/불리)

- [ ] 착수 전 재논의 (규칙 기반 요인 추출 목록 확정)

## 3순위 — 2차전 합산 스코어

- [ ] 착수 전 재논의 (1차전 매치 연결 방법 확인 필요)
