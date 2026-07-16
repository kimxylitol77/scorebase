# 텔레그램 경기 알림 — 컨텍스트 노트

회원이 텔레그램을 연결하면 즐겨찾기 팀의 중요 경기를 텔레그램으로 발송하는 기능. 가입 유인 + 리텐션 레버(가입 퍼널과 직결).

## 기존 인프라 재사용 지도 (2026-07-16 조사)

- `src/lib/notify/telegram.ts` — `sendTelegram(text, opts)`. **고정** `TELEGRAM_CHAT_ID`(운영자)로만 발송. per-user 발송 헬퍼로 확장 필요(chatId 인자화).
- `src/app/api/telegram/webhook/route.ts` — **운영자 전용 health 봇**. `TELEGRAM_BOT_TOKEN` 사용, 단일 `TELEGRAM_CHAT_ID`만 통과시키고 나머지 chat_id는 전부 거부(fail-closed). /health·/status·/help. → **사용자 봇으로 재사용 불가.**
- `mac-mini-worker/hermes-telegram-bot.js` — 텔레그램↔LLM 브릿지(화이트리스트). 사용자 대면 아님.
- env: `TELEGRAM_BOT_TOKEN`(ops), `HERMES_TELEGRAM_TOKEN`(LLM), `TELEGRAM_WEBHOOK_SECRET`.

## 결정

1. **새 사용자 전용 봇** (기존 ops 봇 확장 X). 이유 = ops 봇의 단일-chat 화이트리스트가 보안 통제라 풀면 안 됨, ops/유저 알림 혼선 방지. → 운영자가 BotFather로 새 봇 생성 후 토큰 제공 필요(에이전트는 계정 생성 불가). env 신규 `USER_BOT_TOKEN` + `USER_BOT_WEBHOOK_SECRET`.
2. **연결 방식 = 링크**(텔레그램 로그인 아님). 이미 구글 OAuth로 로그인한 회원이 "텔레그램 연결" 클릭 → 딥링크 `t.me/<bot>?start=<token>` → 봇 /start 로 온 token 으로 User↔chat_id 매핑. (텔레그램 로그인은 후속 상위호환.)
3. **개인화 축 = 팀 팔로우** (`UserTeamFollow`). 리그 전체 팔로우는 후속.
4. **DB 변경은 additive nullable + 신규 테이블**, Neon SQL로 적용(프로덕션 쓰기 게이팅 — [[feedback_db_push_prod_hang]]·[[feedback_prisma_db_push]] NOT NULL 함정 회피, @default/nullable 필수).
5. **골 실시간 알림은 Phase 2** — 라이브 파이프라인(MQTT/cron score diff) 훅이 필요. Phase 1은 스케줄 가능한 것(킥오프·종료·게임 마감)만.

## 스키마 변경 (초안)

```prisma
model User {
  // ...기존...
  telegramChatId String? @unique   // 텔레그램 연결 시 매핑. null=미연결
  telegramLinkToken String? @unique // 딥링크 /start 토큰(연결 후 null화)
}

model UserTeamFollow {   // 즐겨찾기 팀
  id        String   @id @default(cuid())
  userId    String
  teamId    String
  createdAt DateTime @default(now())
  @@unique([userId, teamId])
  @@index([teamId])
}

model TelegramAlertLog {  // 중복 발송 방지
  id      String   @id @default(cuid())
  userId  String
  matchId String
  kind    String   // "KICKOFF" | "FINAL" | "GAME_REMINDER"
  sentAt  DateTime @default(now())
  @@unique([userId, matchId, kind])
}
```

## 하드 블로커 (사용자 액션 필요)

- **A. 새 봇 생성** — 운영자가 BotFather에서 봇 생성 → `USER_BOT_TOKEN` 전달. (에이전트 불가)
- **B. DB 마이그레이션 승인** — 위 스키마를 Neon에 적용(운영자 SQL 또는 승인).

## 발송 문안 (Phase 1)

- KICKOFF(30분 전): "⚽ 오늘 21:00 · 토트넘 vs 첼시\nAI 픽: 토트넘 승 62%\n[매치 상세]"
- FINAL: "⏱ 종료 · 토트넘 2-1 첼시\n[리캡]"
- GAME_REMINDER: "🎯 오늘 빅매치 3경기 예측 마감 1시간 전 [참여]"
