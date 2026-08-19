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
- [x] GOAL 알림 (2026-07-16, be01121) — 디스패처 GOAL pass, 폴링 방식(cron */2). LIVE 축구만(SOCCER_LEAGUES, 야구·농구 제외). 상태=TelegramAlertLog "GOAL:h-a", 총득점 증가 시만, 최초=베이스라인 무발송. 배포됨
- [ ] 알림 종류별 on/off 설정 (배당 변동만 방향별 토글 완료 — 킥오프·종료·골은 아직 일괄)

## Phase 2.5 — 즐겨찾기 "경기" 알림 + 배당 변동 (2026-07-28)
> 발단 = 사용자 제보 "연결됐다는데 알림이 안 온다". 진단 결과 버그가 아니라 설계 갭 —
> 알림 대상이 팀 팔로우뿐인데 사용자가 별표한 건 경기(localStorage, 서버 미동기화)였다.
- [x] 스키마 — `UserMatchFollow` 신규 + `User.alertOddsDrop/alertOddsRise`(기본 false)
- [x] `docs/telegram-alerts/migration.sql` 에 additive SQL 추가 (섹션 4·5)
- [x] **DB 프로덕션 적용** (2026-07-28) — `scripts/apply-telegram-alerts-migration.ts`. 컬럼 2개·테이블·인덱스 3종·FK 검증 완료, 장기 트랜잭션 0건 상태에서 lock_timeout 3s 로 적용
- [x] `/api/favorites/matches` GET/PUT — 경기 ⭐ 서버 미러링 (teams 라우트 동일 패턴, 숫자 id 만·상한 50)
- [x] `/api/telegram/settings` GET/PUT — 배당 알림 방향 옵트인
- [x] `TelegramConnectCard` — 경기 동기화 + 하락/상승 체크박스 + 즐겨찾기 0개 경고 문구
- [x] 디스패처 — 팔로우 경기를 KICKOFF/FINAL/GOAL 대상에 포함 (`recipientsOf` 병합)
- [x] 디스패처 — `dispatchOddsMoves` 신설. 윈도우 150분·임계 8%, 옵트인 0명이면 쿼리 skip
- [ ] 검증 — 마이그레이션 후 경기 ⭐ → KICKOFF 수신 e2e

## Phase 2.6 — 알림 종류별 선택 + 라인업 + 전 경기 배당 (2026-07-31)
> 발단 = 사용자 요청 "회원 페이지에서 설명해주고 킥오프·라인업 등을 골라 받게 하자,
> 배당은 아직도 수정 안 된 것 같다". 진단 결과 배당 알림 발송 이력 0건 —
> 코드 버그가 아니라 옵트인 회원의 즐겨찾기(EPL)가 비시즌이라 배당 스냅샷이 0건이었다.
- [x] 스키마 — `User.alertKickoff/alertLineup/alertGoal/alertFinal/alertFollowPick`(기본 true),
      `alertOddsAll`(기본 false). 기존 회원이 갑자기 못 받는 일이 없게 발송 중이던 4종은 ON 으로 시작
- [x] `prisma/sql/add-user-alert-prefs.sql` + **프로덕션 적용** (장기 트랜잭션 0건 확인 → lock_timeout 3s)
- [x] `/api/telegram/settings` — 필드 화이트리스트 기반으로 8종 GET/PUT
- [x] `TelegramConnectCard` — 종류별 토글 + 한 줄 설명 + 켠 항목의 실제 발송 문구 미리보기
- [x] 디스패처 — `fanOut(m, kind, text, wants)` 게이트. KICKOFF·FINAL·GOAL·FOLLOW_PICK 각각 설정 확인.
      골은 끈 회원도 상태(GOAL:h-a)를 기록해 나중에 켤 때 지난 골이 몰아 오지 않게 한다
- [x] 디스패처 — LINEUP 신설. 축구·SCHEDULED·확정 XI 보유·킥오프 180분 내. 명단은 싣지 않고
      "라인업 등록 완료" 한 줄 + 매치 링크 (축구 선수 한글 사전이 얇아 영문 22줄이 나가서)
- [x] 디스패처 — `dispatchOddsDigest`(ODDS_ALL). 즐겨찾기 무관 전 경기 급변 상위 5개를 KST 21시에 하루 1건
- [ ] 검증 — 실제 수신 e2e (라인업은 EPL 개막 후, 배당 다이제스트는 옵트인 후 첫 21시)

### 실측 메모 (2026-07-31, 운영 DB)
- 발송 로그 전체 기간 — FOLLOW_PICK 41 · FINAL 15 · GOAL 13 · KICKOFF 11 · **ODDS 0**
- 배당 옵트인 2명 중 1명은 즐겨찾기 0개, 1명은 맨유·첼시(EPL) → EPL 프리매치 스냅샷 0건
- 프리매치 스냅샷이 실제로 있는 리그 = MLB·KBO·MLS·BRASILEIRAO·EREDIVISIE… (EPL 없음)
- **라인업 도착 시점이 함정** — 14일 729경기 중 킥오프 전 도착은 372경기(51%)뿐.
  나머지는 라이브 폴링 중에 들어와 킥오프 뒤에 저장된다(60~90분 후가 218경기로 최다).
  즉 라인업 알림은 구조적으로 절반쯤만 발송된다. 창을 넓혀도 해결 안 됨 — 수집 시점 문제

## Phase 3 — 확장 (후속)
- [ ] 이적/부상/근황 이벤트 알림 (이적시장·PlayerEvent·부상자 재활용)
- [ ] 아침 다이제스트·주간 리뷰
- [ ] 텔레그램 로그인(구글 OAuth 옆)
