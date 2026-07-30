# 정밀검사 대응 — 결정과 근거 (2026-07-29)

## 감사 주장 vs 실측

| 감사 주장 | 실측 | 판정 |
|---|---|---|
| jsonLdScript 가 `<` 미이스케이프 | 사실. `JSON.stringify` 를 그대로 반환 | 수정 |
| dangerouslySetInnerHTML 32곳 | 실제 52곳(35파일). 그중 생 `JSON.stringify` 37곳 | 수정 |
| `.worktrees` 406개 추적 | 403개는 `.worktrees/agents-chat/` 전체 스냅샷, 3개는 gitlink | 수정 |
| 본체 lint 오류 225개 | 전체 498. `src/**` 114 · `.worktrees` 62 · 워커/스크립트 JS 322 | 재분류 |
| `app/node_modules` 외부 심볼릭 링크 | 이 저장소에 `app/` 자체가 없음. 감사 샌드박스(`/app` 마운트) 산물 | 해당 없음 |
| NBA 실패 시 빈 200 | 사실. `fetchNbaStandings` → null → `rows: []` + 200 | 수정 |

## 결정

### D1. `.worktrees/agents-chat` 은 단순 중복이 아니었다
`feat/agents-chat` 브랜치에는 관리자 에이전트 챗 기능이 **없고**, main 에 커밋된 `.worktrees/agents-chat/` 스냅샷에만 8파일 701줄
(`src/lib/agents/personas.ts`·`chat.ts`, `src/app/admin/agents/*`, `src/app/api/admin/agents/*`, prisma 모델)이 존재했다.

→ 태그 `archive/agents-chat-snapshot` 으로 커밋을 고정한 뒤 추적 해제. `git rm --cached` 는 히스토리를 지우지 않으므로
`git show archive/agents-chat-snapshot:.worktrees/agents-chat/src/lib/agents/chat.ts` 로 언제든 복원 가능.
브랜치 수술은 하지 않음 — 되돌릴 수 있음이 핵심이지 위치 정리가 목적이 아니다.

### D2. rate limit 저장소는 Upstash 가 아니라 Neon Postgres
새 벤더·새 환경변수 없이 이미 쓰는 Prisma/Neon 으로 분산 제한이 성립한다. Upstash 를 쓰면 env 등록 전까지
fail-closed 정책 때문에 챗봇이 통째로 막힌다. 챗봇 트래픽 규모에서 DB 왕복 1회는 무시할 수준.

### D3. fail-closed 는 "저장소 장애" 에만 적용
카운터 조회/증가가 예외를 던지면 `allowed=false`. 단, 챗봇 라우트는 이 경우에도 사용자에게 500 이 아니라
"잠시 후 다시" 429 로 응대해 UX 를 깨지 않는다. 무제한 허용은 금지(감사 지적의 핵심).

### D4. 워커 `.js` 의 `require()` 는 버그가 아니다
`mac-mini-worker/`·`lightsail-worker/`·`vultr-worker/`·`scripts/*.js` 는 Node CJS 로 실행된다.
242개 `no-require-imports` 는 코드를 고칠 게 아니라 lint 설정이 잘못 잡은 것 — 해당 경로에 룰 예외를 준다.
(메모리 `ai-brief-lib-user-owned` — 브리핑 봇 코드는 요청 없이 수정 금지이므로 코드 변경은 애초에 선택지가 아니다.)

### D5. react-hooks/purity 31 · set-state-in-effect 25 는 보류
React Compiler 신규 룰. 대부분 `new Date()` 렌더 호출과 mounted 게이트 패턴이라,
고치려면 렌더링·하이드레이션 동작을 바꿔야 한다. 사용자 확인 결과 "안전한 것만 수정" 으로 합의.
별도 작업으로 분리하고 여기서는 분류표만 남긴다.

### D6. 챗봇 파일은 커밋하지 않는다
CLAUDE.md — `src/components/Chatbot.tsx`·`src/app/api/chat/`·`src/lib/chatbot/` 은 사용자 본인 작업.
분산 제한 lib 과 테스트는 커밋하고, `chat/route.ts` 한 줄 배선은 diff 만 제시한다.
