<!-- "이 경기 어때?" 경기 챗봇 구현 체크리스트. 진행하며 체크. -->

# 경기 챗봇 구현 체크리스트

목표. 축구 경기 상세 페이지에서 회원이 "이 경기 어때?" 물으면, 그 경기 데이터를 근거로 Claude가 한국어로 답하는 인라인 챗 박스.

성공 기준. 실제 경기 페이지에서 질문 → 예측·Elo·폼·적중률 근거로 페르소나(docs/match-chatbot-persona.md)대로 답이 나오고, 비용 가드가 걸려 있다.

## 조각 1 — 데이터 함수 (경기 브리핑 조립) ✅ tsc 통과
- [x] `src/lib/chatbot/match-brief.ts` 신설 — `buildMatchBrief(matchId)` → 사람이 읽는 텍스트
- [x] 재사용: `buildMatchContext`로 Elo·form·h2h·streak (persist pred 는 화면 위젯 소스라 그대로 사용)
- [x] persist된 Match 필드(predHome/Draw/Away, market*, strongPick 판정)도 반영
- [x] 리그 적중률 — `statForLeague` 로직을 `src/lib/predict/accuracy.ts`로 추출해 재사용 (page.tsx 는 이번엔 미변경, dedup 은 후속)
- [x] Strong Pick 판정은 `src/lib/predict/strong-pick.ts` 단일 소스 사용
- [x] 데이터 없는 항목은 라인 자체를 생략(빈값 주입 금지 — preview 패턴 동일)
- 검증: tsc 통과. 실데이터 호출 검증은 조각 2 API curl 로 함께 수행(standalone 러너 대신).

## 조각 2 — 챗 API (경기 특정) ✅ 검증됨(curl 실답변)
- [x] `src/app/api/match-chat/route.ts` 신설 (`runtime="nodejs"`, `dynamic="force-dynamic"`)
- [x] 입력: `{ matchId, messages }`. matchId로 `buildMatchBrief` 호출해 컨텍스트 확보
- [x] tool-use 대신 **미리 주입** — system = `src/prompts/match-chat-system.ts` 페르소나 + 주입된 경기 브리핑
- [x] 재사용: `claude`/`CLAUDE_MODEL` (claude.ts), `rateLimit`, ANTHROPIC_API_KEY 가드
- [x] 비용 가드: rate limit(ip당 5분 10회), user 500자 slice, max_tokens 700
- 검증: curl matchId=936083 → 페르소나대로 한국어 답(Elo·폼·적중률 근거, Strong Pick 아님, 참고용). haiku, 입력876/출력237 토큰.

## 조각 3 — UI (인라인 챗 박스) ✅ preview 검증됨
- [x] `src/components/live/MatchChat.tsx` (`'use client'`) — 칩 + 입력 + 버블
- [x] 스타일: 패턴 A 카드 + cyan 액센트. 다크모드 확인
- [x] `/api/match-chat`로 POST, matchId prop 전달
- [ ] 축구 경기 상세 `src/app/live/[league]/[gameId]/page.tsx`의 `isSoccer` 블록에 삽입 ← **남음(실제 페이지 통합)**
- 검증: 임시 `/dev-match-chat`에서 칩 클릭 → 답변 렌더 확인(France vs Morocco). 다크모드 정상.

## 마무리 / 남은 것
- [x] 새 파일 tsc 통과
- [x] 비용/rate limit 확인 (5분 10회, haiku)
- [x] UI = 우하단 플로팅 런처+패널로 변경(인라인 카드 아님). preview 검증됨.
- [x] 폴리시: system 에 "마크다운 금지, 평문" 추가 → 별표 사라짐(curl 확인).
- [x] **실제 경기 페이지 삽입** (2026-08-12, kimss 승인) — `live/[league]/[gameId]` 축구 블록 끝. 임시 `/dev-match-chat` 은 이미 정리돼 있었음.
- [x] **회원 한정 게이트** — 서버 401(`getCurrentUserId`) + UI 미표시(`useMe`). 실험 단계 과금 노출면 축소.
- [x] **전역 챗봇과 자리 충돌 해소** — `match-chat-presence.ts` 신호로 경기 챗봇이 뜨는 동안 전역 챗봇이 비켜준다.
- [x] `.gitignore` 에서 `match-brief.ts` 제외 해제 (kimss 승인) — 안 풀면 배포 빌드가 모듈 미해결로 깨짐.
- [x] 커밋 + 배포 (2026-08-12)
- [ ] 축구 외 종목 확장(현재 축구만)
- [ ] 실사용 지표 확인 후 전면 공개 판단 (현재 회원 한정)

## 검증 기록 (2026-08-12, 로컬 dev)
- 비회원: `/live/EPL/538158` 플로팅 버튼 1개(전역 챗봇만). 경기 챗봇 미노출 — 의도대로.
- 비회원 API: `POST /api/match-chat` → **401** `{"error":"로그인한 회원만 이용할 수 있습니다."}`. Claude 호출 전 차단이라 무과금.
- 회원(게이트 일시 우회로 확인, 즉시 원복): 플로팅 버튼 1개(경기 챗봇만) — **전역 챗봇이 사라져 겹침 0**. 패널에 팀명 주입("번리 vs 울버햄프턴"), 칩 3개, 면책 문구, 다크모드 정상.
