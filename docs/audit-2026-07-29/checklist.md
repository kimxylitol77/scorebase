# 정밀검사 대응 체크리스트 (2026-07-29 ~ 07-30)

출처. 외부 감사(ChatGPT) 6항목 → 실측 검증 후 재정의.
숫자는 모두 **main 기준 실측값**이다 (최초 작업은 93커밋 뒤처진 base 였어서 main 위에 다시 적용했다).

## 1. JSON-LD XSS 방어
- [x] `jsonLdScript` 가 `<`·`>`·`&`·U+2028/2029 를 이스케이프 → `</script>` 가 태그를 탈출하지 못하는 테스트 통과
- [x] `dangerouslySetInnerHTML` + 생 `JSON.stringify` **39곳(28파일)** 을 `jsonLdScript` 로 통합 → 잔여 0건
- [x] `src/lib/seo/jsonld.test.ts` 5종 추가

## 2. 린트 정상화
- [x] `.worktrees` 고유 코드 보존(태그 `archive/agents-chat-snapshot`) 후 403개 추적 해제
- [x] `.gitignore` + eslint `globalIgnores` 에 `.worktrees/**`
- [x] 워커·스크립트 `.js` CJS 룰 예외 (`no-require-imports` 0건)
- [x] **lint 오류 220 → 0** (규칙 5종 전부. 경고 120 은 미사용 변수·img 태그 등 별건)

## 3. 챗봇 비용 방어 (Neon Postgres)
- [x] `RateLimitCounter` 모델 + `src/lib/rate-limit-distributed.ts`
- [x] IP 버스트 5분 15회 / IP 일일 100회 / 전체 일일 3000회 3단
- [x] 저장소 장애 시 fail-closed (DB throw 시 allowed=false 테스트)
- [x] `chat/route.ts` 배선 **적용 완료** (커밋 `0ceed01` — 되돌리려면 이 커밋만 revert)

## 4. 빌드 환경
- [x] 감사의 `app/node_modules` 외부 심볼릭 링크는 이 저장소에 없다 — 검사 샌드박스(`/app` 마운트) 산물
- [x] `npm run lint` / `npx tsc --noEmit` / `npm run build` 전부 실행. `npm run test`·`npm run typecheck` 스크립트 추가

## 5. 페이지 인벤토리
- [x] "생성물이지만 커밋한다" 한 가지로 통일 (`/admin/structure` 가 정적 import 하므로 파일이 없으면 tsc·lint 가 깨진다)

## 6. NBA 순위 장애 처리
- [x] ESPN 실패 시 마지막 정상 캐시 반환 (`stale: true`)
- [x] 캐시도 없으면 빈 200 대신 503 + `status: "unavailable"`
- [x] 테스트 5종 — 정상 30팀 / 외부 실패 / 29팀 부분응답 / 캐시 없음 / 캐시 저장소 장애

## React Compiler 룰 (2차)
- [x] `react-hooks/refs` 9 → 렌더 중 ref 쓰기를 effect 동기화로
- [x] `react-hooks/purity` 31 → 클라이언트 2건은 실제 버그였다(DateSlider·KickoffCountdown 의
      자정 근처 SSR/CSR 불일치). 서버 컴포넌트 29건은 사유 주석 + disable
- [x] `set-state-in-effect` 28 → 22건 수정(공용 훅 `src/lib/use-client-value.ts` 신설),
      6건 사유 주석 (DOM 실측 2 · PiP 창 상태 3 · 서버 상태 조회 1)
- [x] `no-explicit-any` 117 → 외부 API 응답에 실제 shape 부여. 가드 없던 접근 10여 곳 함께 수정

## 최종 검증 (커밋 c563915 시점)
| 항목 | 결과 |
|---|---|
| lint | 220 → **0 errors** |
| `tsc --noEmit` | **0** |
| `npm test` | **26/26** |
| `npm run build` | **0** (111 페이지) |
| 브라우저 | 콘솔 에러 0. 즐겨찾기(구형식 복원·토글)·날짜슬라이더·헤더/푸터 실클릭 확인 |

## 배포 전 남은 일 (사용자 직접)
- [ ] **DDL 적용** — 권한 정책에 막혀 실행하지 못했다.
      ```
      npx prisma db push --skip-generate && npx prisma generate
      ```
      main 기준 `prisma migrate diff --from-url` 로 실측 확인했다 — `RateLimitCounter` ·
      `BasketballStandingsCache` **CREATE 2개 + 인덱스 1개뿐이고 DROP 은 없다**.
      (초기에 "db push 금지" 라고 적었던 건 93커밋 뒤처진 base 기준이라 생긴 오판이었다.
       알림 스키마 `UserMatchFollow`·`User.alertOdds*` 는 2026-07-28 에 main 에 머지돼 있다.
       단, 오래된 base 브랜치에서 돌리면 여전히 DROP 하니 main 최신에서만 실행할 것.)
- [ ] DDL 적용 전까지 챗봇은 fail-closed 로 전부 429 다. 급하면 `0ceed01` 만 revert.

## 폐기한 작업
- 즐겨찾기 `scorebase:fav-teams` 이중 형식 버그 수정 — main `2413eb6`(7/28)이 이미 더 낫게
  고쳐 뒀다(♡ 버튼 제거로 단일화 + `/api/teams/by-ids` 로 구형식 항목 이름까지 서버 복원).
  내 구현은 이름 없는 항목을 숨기는 수준이라 버렸다.
