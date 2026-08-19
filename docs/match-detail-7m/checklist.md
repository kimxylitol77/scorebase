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

- [x] `src/lib/predict/match-factors.ts` — 홈/원정 split · 연속기록 · 최근 득실 ·
      순위격차 · 맞대결 6종 규칙, 팀당 최대 3개
      → 검증: 최근 축구 200경기 전수로 양쪽 0개 6%, 평균 2.26개
- [x] `src/components/predictions/MatchFactorsCard.tsx` — 홈/원정 2열, 모바일 1열
      → 검증: 375px 1열 · 1280px 2열, 가로 스크롤 없음, tone 색 매핑 확인
- [x] 시즌 경계 오독 차단 (아래 노트) → 검증: 라리가 1R 에서 "최근 원정 10경기" 로 표기
- [x] tsc 통과 후 커밋

## 3순위 — 2차전 합산 스코어

- [x] 표기 방식 사용자 확정 — "직전 맞대결" (1·2차전 단정 안 함)
- [x] `src/lib/predict/previous-leg.ts` — 컵 대회 + 홈/원정 스왑 + 21일 이내
      → 검증: 컵 최근 400경기 전수로 96건(24.0%) 적중, 간격 중앙 7일·최대 9일
- [x] `src/components/predictions/PreviousLegCard.tsx`
      → 검증: 7m 예시 경기(COPA_LIB) 실렌더로 합계 1-1 일치
- [x] 날짜 KST 표기 (kstDateLabel) → 검증: UTC 8/11 → KST 8/12(수) 정정
- [x] tsc 통과 후 커밋

## 남은 것

- push 여부는 사용자 확인 대기 (3건 커밋 완료)
