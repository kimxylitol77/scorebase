# /lab 조건식 시스템 빌더 — 체크리스트 (2026-09-15)

1단계 = 빌더 + 즉석 백테스트 + 앞으로 48시간 해당 경기. 저장·매일 픽·랭킹 편입은 2단계.

- [x] `src/lib/predict/rule-system.ts` — 조건 재료 목록(RULE_FIELDS)·as-of 피처 생성·조건 평가·채점 순수함수
- [x] `src/lib/predict/rule-system.test.ts` — as-of 누수 없음·조건 평가·표본 부족·ROI 정산
- [x] `src/app/api/rule-backtest/route.ts` — 1년 종료 경기 + 48시간 예정 경기 피처 튜플(rate limit)
- [x] `src/app/lab/RuleBuilderClient.tsx` — 픽 방향·리그·조건 최대 5개·결과 카드·해당 예정 경기 목록
- [x] `src/app/lab/page.tsx` — 회원 구역에 빌더 배치, 비회원 소개 카드 문구
- [x] tsc·lint·테스트 통과 → dev 실렌더(회원 쿠키) → 커밋·push
- [x] 프로덕션 확인 — API 서버 처리 2.0초·전송 5.1초·1.6MB, /lab 비회원 소개 문구 반영(2026-09-15)
- [x] 2단계 저장 — /api/member-bot body.rules → knobs={kind:"rules",side,conds}, 조건식 한도 3개 별도
- [x] 2단계 매일 픽 — generate-member-bot-picks 조건식 분기(직전 60일 폼·조건 평가·모델 확률), 실측 9건 생성
- [x] 2단계 /lab 목록 — 저장·수정·중지·삭제·공유·오늘 픽, 봇별 30건 표시 버그 수정
- [x] 2단계 공유 문안 — community/new 조건 표
- [x] /picks 카드·랭킹 자동 합류 확인(카드 4장)
- [x] 프로덕션 확인 — Vercel 배포 success(148b2eb), /picks 카드에 조건식 시스템 픽 12장 노출. 회원 전용 화면은 prod 세션 비밀키가 달라 curl 검증 불가(dev 실렌더로 대체)
