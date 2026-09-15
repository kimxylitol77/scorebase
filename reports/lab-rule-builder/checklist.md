# /lab 조건식 시스템 빌더 — 체크리스트 (2026-09-15)

1단계 = 빌더 + 즉석 백테스트 + 앞으로 48시간 해당 경기. 저장·매일 픽·랭킹 편입은 2단계.

- [x] `src/lib/predict/rule-system.ts` — 조건 재료 목록(RULE_FIELDS)·as-of 피처 생성·조건 평가·채점 순수함수
- [x] `src/lib/predict/rule-system.test.ts` — as-of 누수 없음·조건 평가·표본 부족·ROI 정산
- [x] `src/app/api/rule-backtest/route.ts` — 1년 종료 경기 + 48시간 예정 경기 피처 튜플(rate limit)
- [x] `src/app/lab/RuleBuilderClient.tsx` — 픽 방향·리그·조건 최대 5개·결과 카드·해당 예정 경기 목록
- [x] `src/app/lab/page.tsx` — 회원 구역에 빌더 배치, 비회원 소개 카드 문구
- [x] tsc·lint·테스트 통과 → dev 실렌더(회원 쿠키) → 커밋·push
- [x] 프로덕션 확인 — API 서버 처리 2.0초·전송 5.1초·1.6MB, /lab 비회원 소개 문구 반영(2026-09-15)
- [ ] 2단계(미착수): 저장(MemberBot knobs 에 kind=rules)·매일 픽 cron 편입·/picks 랭킹 합류
