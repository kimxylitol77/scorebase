# 체크리스트 — TheSportsPlayer 영문 name 복구

## 1단계 — 로컬 소스 복구 (무료)
- [x] `scripts/backfill-ts-player-en-name.ts` 작성 (dry-run 기본, `--apply`)
- [x] 라인업 캐시 + team-squads.json 수집 → dry-run 샘플 20건 검수 (정상)
- [x] `--apply` 실행 → **1,157건 적용**, 대상 3,349 → 2,192

## 2단계 — TheSports API 복구 (2,192건, 700ms 페이스 ≈ 26분)
- [x] `--fetch` 모드 추가 (uuid 단건, 실패는 건너뛰고 계속)
- [x] 20건 시험 → 20/20 성공, 응답 name 전부 영문 확인
- [ ] 전량 실행 (진행 중) → 검증: 남은 대상 수 · 실패 사유 집계

## 3단계 — 재오염 방지
- [x] `src/lib/players/en-name-source.ts` — squad·라인업에서 id→영문 해석 (공용)
- [x] `apply-thesports-official-korean.ts` createMany 가 영문 name 우선 사용
- [x] `apply-transfers-star-names.ts` 동일 적용 → dry-run 회귀 없음(추가 대상 0)
- [x] `npx tsc --noEmit` 0 에러 (사전에 `npx prisma generate` 필요했음)

## 4단계 — 마무리
- [ ] 커밋 · push
- [ ] (다음 후보) 복구된 영문으로 위키 langlink 대조 재실행 — 북유럽 `Hj/Kj/Sj/Gj` 오음역 계열 정리
