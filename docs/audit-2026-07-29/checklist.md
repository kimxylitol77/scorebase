# 정밀검사 대응 체크리스트 (2026-07-29)

출처. 외부 감사(ChatGPT) 6항목 → 실측 검증 후 재정의.

## 1. JSON-LD XSS 방어
- [x] `jsonLdScript` 가 `<`·`>`·`&`·U+2028/2029 를 이스케이프 → 검증. `</script>` 문자열이 태그를 탈출하지 못하는 테스트 통과
- [x] `dangerouslySetInnerHTML` + 생 `JSON.stringify` 37곳을 `jsonLdScript` 로 통합 → 검증. 잔여 생 stringify 0건 grep
- [x] 단위 테스트 `src/lib/seo/jsonld.test.ts` 추가 → 검증. `node --test` 통과

## 2. 린트 정상화
- [x] `.worktrees` 고유 코드 보존(태그) 후 추적 해제 → 검증. `git ls-files .worktrees` 0건, 태그에서 복원 가능
- [x] `.gitignore` + eslint `globalIgnores` 에 `.worktrees/**` → 검증. lint 대상에서 62개 오류 사라짐
- [x] 워커·스크립트 `.js` CJS 룰 예외 → 검증. `no-require-imports` 0건
- [x] src 안전 룰 수정 → 검증. lint 오류 전후 비교표

## 3. 챗봇 비용 방어 (Neon Postgres)
- [x] Prisma `RateLimit` 모델 + 분산 제한 lib → 검증. 단위 테스트 통과
- [x] IP별 + 전체 일일 한도 동시 적용 → 검증. 테스트에서 두 한도 각각 429
- [x] 저장소 장애 시 fail-closed → 검증. DB throw 시 allowed=false 테스트
- [x] `chat/route.ts` 배선은 diff 제시만, 커밋 제외 (CLAUDE.md 사용자 영역)

## 4. 빌드 환경
- [x] worktree 에 `npm ci` (외부 심볼릭 링크 없음 — 감사의 `app/node_modules` 는 검사 샌드박스 경로)
- [x] `npm run lint` / `npx tsc --noEmit` / `npm run build` 3종 실행 → 검증. 종료코드 0

## 5. 페이지 인벤토리
- [x] 생성물 단일 정책 확정 → 검증. 정책 1개만 남고 소비처 전부 동작

## 6. NBA 순위 장애 처리
- [x] ESPN 실패 시 마지막 정상 캐시 반환 → 검증. 테스트
- [x] 캐시도 없으면 503 + error 상태 → 검증. 테스트
- [x] 외부 실패 / 29팀 / 정상 30팀 3종 테스트 → 검증. `node --test` 통과

## 2차 (사용자 "다 해줘" 지시로 전부 처리)
- [x] react-hooks/refs 7 → effect 동기화
- [x] react-hooks/purity 31 → 클라이언트 2건 실수정(DateSlider·KickoffCountdown), 서버 컴포넌트 29건 사유 주석 + disable
- [x] set-state-in-effect 25 → 19건 useSyncExternalStore·파생 상태로 수정, 6건 사유 주석 + disable
- [x] no-explicit-any 112 → 외부 API 응답 타입 부여. 가드 없던 접근 10여 곳 함께 수정
- [x] 챗봇 route.ts 배선 적용 (별도 커밋 — revert 로 되돌릴 수 있음)

**lint 오류 498 → 0**

## 배포 전 남은 일 (사용자 확인 필요)
- [ ] **docs/audit-2026-07-29/prod-ddl.sql 적용** — 권한 정책에 막혀 실행 못 함. 사용자 직접 실행 필요.
      ⚠️ prisma db push 금지 (UserMatchFollow·User.alertOdds* 를 DROP 함)
- [x] chat/route.ts 배선 완료 — DDL 적용 전에는 fail-closed 로 챗봇이 429 가 된다
