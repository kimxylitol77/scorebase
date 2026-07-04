# 이적 루머 부활 — 체크리스트

## 구현

- [x] prisma/schema.prisma — TransferRumor 모델 복원 (prod 테이블 보존돼 있음 — DDL 은 IF NOT EXISTS 확인용)
- [x] src/jobs/extract-transfer-rumors.ts — 딜 추출·병합·클램프·검증·upsert 모듈 (신규)
- [x] src/jobs/fetch-news-briefing.ts — rumorOnly 소스(풋볼리스트) + extractRumors 호출 통합
- [x] src/app/transfers/page.tsx — view=rumors 복원 (7c9714d diff 를 현재 파일에 재적용)
- [x] src/app/transfers/TransfersFilterBar.tsx — 임박·루머 탭 복원
- [x] src/app/api/admin/rumor-hide/route.ts — 오보 숨김
- [x] 재출시 전 기존 24행 truncate (결함 파이프라인 산출물)

## 검증

- [x] tsc 통과
- [x] DRY 실행 — 추출·병합·클램프 결과 육안 확인 (동성 분리·단계 클램프 확인)
- [x] 실행 → TransferRumor 행 확인 → /transfers?view=rumors 로컬 렌더
- [x] rumor-hide 401/정상 동작
- [x] 브리핑 쪽 회귀 없음 (rumorOnly 소스가 브리핑 후보로 안 새는지)

## 배포

- [ ] 커밋 → 사용자 확인 후 push HEAD:main
