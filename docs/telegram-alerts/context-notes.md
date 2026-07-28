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

---

## 2026-07-28 — "연결됐는데 알림이 안 온다" 진단 + 즐겨찾기 경기·배당 알림

### 진단 (prod DB 실측)

- 연결 회원 2명, 둘 다 `telegramChatId` 정상 저장. cron `telegram-alerts` 도 2분 주기로 정상 실행 중.
- 개인 알림 발송 로그(KICKOFF/FINAL/GOAL) **총 0건**. 로그에 있는 건 전부 채널 브로드캐스트(`CH_*`).
- 원인 = 버그 아님. **알림 대상이 팀 팔로우(`UserTeamFollow`)뿐**인데 한 명은 0개, 다른 한 명은
  바르셀로나 1개지만 라리가 오프시즌이라 대상 경기가 없었다.
- 결정적 갭 = 사용자가 실제로 별표한 건 **경기**(`useFavorites`, localStorage `scorebase:fav-matches`).
  이건 서버로 전혀 올라가지 않아 디스패처가 볼 수 없었다. 화면의 "즐겨찾기 경기 1개" 와
  "즐겨찾기 팀 0개" 가 서로 다른 저장소라는 것이 사용자에겐 보이지 않았다.

### 결정

1. **즐겨찾기 경기도 알림 축으로 승격** (`UserMatchFollow`). 팀 팔로우와 별개 테이블 — 팀은 안 봐도
   특정 경기만 챙기는 패턴이 흔하고, 경기는 수명이 짧아 팀 팔로우와 정리 주기가 다르다.
   동기화는 teams 와 동일하게 마이페이지 방문 시 PUT 전체 교체(단순함 우선, 실시간 동기화 불필요).
2. **경기 id 는 `Match.id`(Int)** — `/scores` 의 별표가 넘기는 값이 내부 id 다. 단 ESPN 전용 종목
   (테니스·골프·F1) 카드에도 별표가 붙어 DB 매치가 아닌 id 가 섞일 수 있으므로 **API 에서 숫자만 통과**시킨다.
3. **배당 변동 알림은 방향별 옵트인** (`alertOddsDrop`/`alertOddsRise`, 기본 OFF). 사용자 요청이
   "하락·상승을 고를 수 있게" 였고, 방향마다 읽는 의미가 달라서다 — 하락=돈이 몰림, 상승=기대가 낮아짐.
4. **배당 알림 대상은 즐겨찾기 팀·경기 한정.** 전 경기 스캔은 알림 폭주 + 무의미한 쿼리.
   옵트인 회원이 0명이면 `dispatchOddsMoves` 는 쿼리조차 하지 않는다 (기본 OFF 라 평상시 비용 0).
5. **임계·윈도우는 운영 채널용 `odds-mover-alert` 와 동일** (150분/8%). fetch-odds 가 2h 주기라
   윈도우가 짧으면 스냅샷이 1개뿐이라 감지가 안 된다 — 이미 그 함정을 겪은 값이므로 그대로 재사용.
6. **배당 중복 방지 키 = `ODDS:{DROP|RISE}:{도달 배당}`.** 같은 값까지의 이동은 1회만,
   계속 움직이면 새 값이라 다시 발송된다. 시간 버킷보다 이쪽이 "또 움직였다"를 정확히 표현한다.

### 적용·검증 (2026-07-28)

- DB 마이그레이션 적용 완료. 컬럼 2개·`UserMatchFollow`·인덱스 3종·FK 모두 확인.
- 새 쿼리(oddsSnapshot 중첩 relation where, 팔로우 경기 OR 절) 읽기 실행 검증 통과.
- 디스패처 전체 실행은 실제 발송 위험으로 권한 차단 → 발송 없는 쿼리 검증으로 대체.

### 남은 것

- e2e 검증 — 경기 ⭐ → 킥오프 35분 전 알림 수신.
- ~~동기화 트리거가 마이페이지 방문뿐~~ → **해결(2026-07-28)**: 별표 토글 시
  `fav-server-sync.ts` 가 debounce PUT 으로 즉시 미러링. 비로그인 401 스팸은 use-me 의
  `sb:me` localStorage 캐시(닉네임 존재=로그인)로 사전 차단. 마이페이지 방문 동기화는 보조로 유지.
- 실사용 함정 기록(2026-07-28 운영자 제보): 배당 변동 알림은 **프리매치 한정**이라
  이미 시작한 경기의 급변은 발송되지 않는다. 옵트인·별표를 급변 발생 후에 설정하면
  그 경기 건은 영영 안 온다 — 다음 급변부터 정상 수신.
