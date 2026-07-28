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
- [x] **Vercel 프로덕션 env 등록** — USER_BOT_TOKEN·USER_BOT_WEBHOOK_SECRET (vercel env ls 로 확인, 2026-07-19)
- [x] 배포 + setWebhook(프로덕션 URL) 등록 — getWebhookInfo url=prod·last_error 없음·pending 0, 무시크릿 POST 403 fail-closed 확인 (2026-07-19)
- [ ] 검증 — 봇 연결 → 팀 ⭐ → 경기로 알림 수신 (연결 회원 1명 존재하나 팀 팔로우 0·발송 로그 0 — 실제 알림 수신 e2e 는 팀 ⭐ 후 경기 시점에 확인)

## Phase 2 — 실시간 골 (후속)
- [x] 라이브 score diff 훅(MQTT/cron) → GOAL 알림 fan-out
- [ ] 알림 종류별 on/off 설정 (배당 변동만 방향별 토글 완료 — 킥오프·종료·골은 아직 일괄)

## Phase 2.5 — 즐겨찾기 "경기" 알림 + 배당 변동 (2026-07-28)
> 발단 = 사용자 제보 "연결됐다는데 알림이 안 온다". 진단 결과 버그가 아니라 설계 갭 —
> 알림 대상이 팀 팔로우뿐인데 사용자가 별표한 건 경기(localStorage, 서버 미동기화)였다.
- [x] 스키마 — `UserMatchFollow` 신규 + `User.alertOddsDrop/alertOddsRise`(기본 false)
- [x] `docs/telegram-alerts/migration.sql` 에 additive SQL 추가 (섹션 4·5)
- [ ] **DB 프로덕션 적용** — Neon SQL 에디터에서 migration.sql 4·5 실행 (권한상 에이전트 실행 불가)
- [x] `/api/favorites/matches` GET/PUT — 경기 ⭐ 서버 미러링 (teams 라우트 동일 패턴, 숫자 id 만·상한 50)
- [x] `/api/telegram/settings` GET/PUT — 배당 알림 방향 옵트인
- [x] `TelegramConnectCard` — 경기 동기화 + 하락/상승 체크박스 + 즐겨찾기 0개 경고 문구
- [x] 디스패처 — 팔로우 경기를 KICKOFF/FINAL/GOAL 대상에 포함 (`recipientsOf` 병합)
- [x] 디스패처 — `dispatchOddsMoves` 신설. 윈도우 150분·임계 8%, 옵트인 0명이면 쿼리 skip
- [ ] 검증 — 마이그레이션 후 경기 ⭐ → KICKOFF 수신 e2e

## Phase 3 — 확장 (후속)
- [ ] 이적/부상/근황 이벤트 알림 (이적시장·PlayerEvent·부상자 재활용)
- [ ] 아침 다이제스트·주간 리뷰
- [ ] 텔레그램 로그인(구글 OAuth 옆)
