# 텔레그램 경기 알림 — 체크리스트

## Phase 0 — 준비 (블로커, 사용자 액션)
- [x] 새 사용자 봇 생성 — @scorebasetim123_bot (2026-07-16)
- [ ] `USER_BOT_TOKEN` + `USER_BOT_WEBHOOK_SECRET` .env.local 등록 (운영자만 가능 — 토큰 비밀)
- [x] DB 스키마 프로덕션 적용·검증 완료 (2026-07-16) — telegramChatId·telegramLinkToken 컬럼 + UserTeamFollow·TelegramAlertLog 테이블

## Phase 1 — 연결 + 스케줄 알림 (MVP)
- [x] 스키마 편집(schema.prisma) + prisma generate (로컬 타입) — 2026-07-16
- [x] `docs/telegram-alerts/migration.sql` — Neon 적용용 ALTER SQL
- [x] `notify/telegram.ts` — `sendTelegramTo(chatId, text, opts)` 추가 (USER_BOT_TOKEN)
- [x] `/api/telegram/user-webhook` — 새 봇 웹훅. /start `<token>`→User 매핑·chatId 저장, /stop 해제. (ops 웹훅과 별도, 화이트리스트 없음)
- [x] `/api/telegram/link` — 딥링크 발급(POST)·해제(DELETE)·상태(GET). 로그인 회원 전용
- [x] 연결 UI — account 페이지 `TelegramConnectCard`(연결/해제 + 상태 폴링). 라우트 게이팅 검증(401/403/307)
- [x] 팀 팔로우 = 기존 ⭐(useFavoriteTeams) 재사용 + `/api/favorites/teams` 서버 동기화(연결 시 PUT)
- [x] 디스패처 잡(`dispatch-telegram-alerts.ts`) — KICKOFF(임박+AI픽)·FINAL(결과), TelegramAlertLog 중복 방지. prod 실행 검증(no-op OK). GAME_REMINDER는 후속
- [x] cron 라우트 `/api/cron/telegram-alerts` (*/5) + vercel.json 등록. TELEGRAM_ALERTS_DISABLED 킬스위치
- [ ] **Vercel 프로덕션 env 등록** — USER_BOT_TOKEN·USER_BOT_WEBHOOK_SECRET (운영자)
- [ ] 배포 + setWebhook(프로덕션 URL) 등록
- [ ] 검증 — 봇 연결 → 팀 ⭐ → 경기로 알림 수신 (배포 후 end-to-end)

## Phase 2 — 실시간 골 (후속)
- [ ] 라이브 score diff 훅(MQTT/cron) → GOAL 알림 fan-out
- [ ] 알림 종류별 on/off 설정

## Phase 3 — 확장 (후속)
- [ ] 이적/부상/근황 이벤트 알림 (이적시장·PlayerEvent·부상자 재활용)
- [ ] 아침 다이제스트·주간 리뷰
- [ ] 텔레그램 로그인(구글 OAuth 옆)
