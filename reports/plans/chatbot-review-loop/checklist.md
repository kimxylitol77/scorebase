# 챗봇 자동 점검 + 승인형 규칙 루프 체크리스트

> 목표. 사용자가 /admin/chat-logs 를 매일 읽지 않아도 된다 — 매일 밤 AI 가 전날 대화를 채점해 텔레그램으로 한 줄 요약,
> 반복 실패는 규칙 제안으로 만들고, 관리자가 승인하면 배포 없이 챗봇 시스템 프롬프트에 들어간다.

## 계획

1. 테이블 2개(ChatReview 일별 결과, ChatbotRule 규칙) raw SQL → 검증: prod 적용 후 generate, 빈 테이블 조회.
2. 채점 lib + cron 라우트(?dry=1·?date=) → 검증: 9/28 로그로 dry 실행, 분류·수요·제안이 말이 되는지 눈으로 확인.
3. 챗봇 route 에 ACTIVE 규칙 블록 주입(5분 캐시) → 검증: 승인한 규칙이 system 에 실리는지 로컬 호출.
4. 관리자 화면에 최근 점검 요약 + 규칙 승인/거절/끄기 → 검증: 로컬 렌더·버튼 동작.
5. vercel.json 09:00 KST + CRON_REGISTRY → tsc·test → 커밋.

## A. 데이터
- [x] prisma/sql/create-chat-review.sql (ChatReview, ChatbotRule) + schema.prisma 모델
- [x] prod 적용 (`prisma db execute`) + generate

## B. 채점
- [x] src/lib/chatbot/review.ts — 전날(KST) 로그 → haiku JSON 채점(분류·수요·규칙 제안) → ChatReview upsert, 제안은 ChatbotRule(PROPOSED)
- [x] 기존 ACTIVE·PROPOSED 규칙을 채점기에 보여 중복 제안 방지, 하루 최대 3개·200자
- [x] 텔레그램 요약 한 통
- [x] /api/cron/chat-review (cron-auth, withLlmTag, recordCronRun, ?dry=1 ?date=)

## C. 반영
- [x] src/lib/chatbot/rules.ts — ACTIVE 규칙 블록(5분 캐시, 태그 무효화)
- [x] /api/chat route — systemBlocks 에 규칙 블록 추가(기본 프롬프트 캐시와 분리)

## D. 관리자
- [x] /admin/chat-logs 상단 — 최근 점검 요약 + 규칙 목록(승인·거절·끄기) 서버 액션(requireAdmin)

## E. 마무리
- [x] vercel.json + CRON_REGISTRY
- [x] tsc · npm test · 로컬 렌더
