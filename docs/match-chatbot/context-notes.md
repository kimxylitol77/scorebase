<!-- 경기 챗봇 구현 중 내린 결정과 근거. 계속 덧붙임. -->

# 경기 챗봇 — 컨텍스트 노트

## 배경
2026-07-09 세션에서 결정. scorebase "지능 심화" 방향. 페르소나 확정본 = `../match-chatbot-persona.md`(베팅 균형, 담백한 분석가).

## 정찰로 드러난 핵심 (계획 재정의)
- 챗봇 인프라가 **이미 상당수 존재**. 처음부터 3개 짓는 게 아니라 재사용+확장.
  - 데이터 조립: `src/lib/predict/build-context.ts` `buildMatchContext`, `src/lib/predictionEngine.ts` `predictMatchById`, `enrichContextWithApiFootball`
  - 챗 백엔드: `src/app/api/chat/route.ts` (tool-use 루프·rate limit·키 가드·프롬프트 캐싱)
  - Claude 클라이언트: `src/lib/ai/claude.ts` (`claude`, `CLAUDE_MODEL` 기본 haiku, 재시도·OpenAI 폴백)
  - 기존 툴: `src/lib/chatbot/tools.ts` (`get_match_prediction` 등 — persist 필드만 읽음, Elo/form/h2h/적중률 없음)
  - 기존 UI: `src/components/Chatbot.tsx` — **비용 이슈로 layout.tsx에서 주석 비활성**
- 예측 데이터 이중 경로: Match row persist 필드(predHome 등) + 런타임 재계산(buildMatchContext). 브리핑은 둘 다 활용.
- 적중률 소스: `Match.predCorrect` 집계. 로직이 `src/app/predictions/accuracy/page.tsx`의 비-export `statForLeague`에 있음 → lib 추출 필요.

## 결정
1. **tool-use 대신 컨텍스트 미리 주입.** 경기 페이지에서 열리니 matchId가 이미 확정 → 매치를 "검색"할 필요 없음. 미리 브리핑을 조립해 system에 주입하면 tool 왕복이 없어 더 싸고 빠름. (기존 /api/chat은 범용이라 tool-use, 우리 건 경기 특정이라 다름.)
2. **별도 route/컴포넌트** 신설. 기존 플로팅 Chatbot(비활성)은 건드리지 않음 — 외과적 변경.
3. **전용 system 프롬프트.** 기존 chat/route는 기사용 SYSTEM_PROMPT를 씀. 우리 챗봇은 페르소나 파일을 system으로 사용(기사 페르소나 아님).
4. **비용 우선.** 켜면 토큰 과금. haiku 기본이라 부담 작으나 rate limit·입력 상한 필수. 기존 플로팅 챗봇은 비용 때문에 꺼졌음을 기억.
5. **디자인.** 사이트 패턴 A 카드 + cyan(#00d4ff) 액센트 + 홈rose/원정blue. 기존 Chatbot.tsx는 neutral 톤이라 그대로 안 씀, 상세 페이지 인라인 톤으로 리스타일.

## 열린 질문 / 주의
- 축구 외 종목(야구 등) 확장은 v1 이후. 우선 축구 `isSoccer` 블록만.
- ~~기존 플로팅 챗봇 재활성화 여부는 별건~~ → 별건이 아니었다. 아래 6 참조.
- ~~배포 전 크레딧/비용 kimss 승인 필요~~ → 2026-08-12 승인, 회원 한정으로 배포.

## 통합 단계에서 드러난 것 (2026-08-12)

전제 하나가 틀려 있었다. **전역 플로팅 챗봇은 "비용 때문에 꺼진" 상태가 아니었다** — 2026-07-09 커밋 `ef2f729` 로 이미 배포·활성화됐고(`layout.tsx`), AI 답변도 `CHATBOT_AI_ENABLED !== "false"` 라 **기본 켜짐**이다. 위 배경 절의 "layout.tsx에서 주석 비활성" 은 그 커밋 이전 상태였다. CLAUDE.md 의 "챗봇 비활성" 기술도 같은 이유로 낡았다.

6. **자리 충돌 → 경기 상세에서만 전역 챗봇이 비켜준다.** 둘 다 우하단 고정이라 축구 상세에서 겹쳤다. 해법으로 경로 판정(`/live/{soccer}/...` 면 전역 챗봇 숨김)을 먼저 검토했으나 **비회원에서 깨진다** — 경기 챗봇은 회원 전용이라 안 뜨고 전역 챗봇도 숨어 그 페이지에 챗봇이 사라진다. 그래서 **실제 표시 여부를 신호로 공유**하는 방식(`match-chat-presence.ts`, use-me 의 모듈 스코프 패턴)을 택했다. 회원 여부·종목·조건이 바뀌어도 자동으로 맞는다.
7. **회원 게이트는 서버가 정본.** UI 미표시는 표시일 뿐이고 엔드포인트는 그대로 공개라, 진짜 방어는 route 의 `getCurrentUserId()` 401 이다. 이 경로는 쿠키 서명만 검증하고 DB 를 안 거쳐 Claude 호출 전에 끊긴다(무과금). route 는 `force-dynamic` 이라 `cookies()` 를 읽어도 ISR 영향 없다.
8. **경기 상세는 `force-dynamic`** (page.tsx 103행) 이라 ISR 제약이 없다 — 라이브성 페이지라 의도된 것([[site-performance-isr]] 기준 ⑤). 다만 이 페이지가 나중에 ISR 로 전환되면 회원 게이트를 서버에서 읽는 순간 캐시가 깨지므로, 개인화는 지금처럼 클라이언트 훅에 두는 게 안전하다.
9. **`.gitignore` 해제 필요했다.** `match-brief.ts` 가 7/9 커밋에서 "로컬 전용" 으로 제외돼 있었는데, `match-chat/route.ts` 가 이를 import 하므로 그대로 두면 배포 빌드가 모듈 미해결로 깨진다. kimss 승인 후 해제. `run-brief.ts`(로컬 러너)는 제외 유지.

## 다음에 볼 것
- 실사용 지표(질문 수·재질문율·토큰)를 보고 전면 공개 여부 판단. 지금은 회원 한정이라 노출면이 좁다.
- 야구·농구 확장 시 `MatchChat` 은 그대로 쓰고 `buildMatchBrief` 에 종목 분기를 넣으면 된다(브리핑 조립만 종목 의존).
