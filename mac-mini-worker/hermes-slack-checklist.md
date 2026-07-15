# Hermes 슬랙 지휘소 — v1 체크리스트

> 목표. 텔레그램 Hermes 와 **같은 두뇌**를 슬랙에서도 쓴다. chat + /fix + /repair 슬랙에서 작동.

## v1 (오늘 — 토큰 도착 후 라이브 검증)

- [x] 1. `hermes-core.js` — 브레인 추출 (callLLM·runClaudeFix·상수) → 검증: `node --check`
- [x] 2. `hermes-slack-bot.js` — Bolt Socket Mode 어댑터 → 검증: `node --check`
- [x] 3. `package.json` — `@slack/bolt` 추가 + `slack` 스크립트 → 검증: `npm install`
- [x] 4. `launchd/com.scorebase.hermes-slack-bot.plist` — 맥미니 상주용 (텔레그램 plist 복제)
- [ ] 5. 토큰 도착 → `mac-mini-worker/.env` 에 `SLACK_BOT_TOKEN`·`SLACK_APP_TOKEN`·`SLACK_ALLOWED_USER_IDS` 추가
- [~] 6. 로컬 라이브 검증 (노트북 nohup 기동, 2026-06-14)
      - [x] 채널 `@Demo App 안녕`/`방가워` → Claude haiku 한국어 응답 ✅ (member id U0BAALEBJNA)
      - [ ] DM 자유 대화 → App Home 메시지 탭 켜야 함
      - [ ] `/help` `/status` `/fix` → slash 명령 생성 후
      - ⚠️ 교훈: Event Subscriptions 켠 뒤 봇 **재시작 필수** (소켓이 이벤트 활성화 전 연결되면 이벤트 0건 — 재설치 아님, 재연결이 답)
- [ ] 7. 맥미니 배포: scp/pull + plist 설치 + `launchctl load` → 24h 상주 확인 (← 진짜 24/7 지휘소)

## v1.1 (다음)

- [ ] `/status` 에 실제 scorebase 지표 (오늘 수집 매치·최근 글·cron 실패) 연결
- [ ] `/api/internal/notify` → 슬랙 `#scorebase` 채널 cross-post (sendTelegram 옆에 sendSlack)
- [ ] 텔레그램 봇도 `hermes-core.js` 로 dedupe (현재는 인라인 두뇌 유지 = 안전)

## v2 (멀티 프로젝트)

- [ ] 채널=프로젝트 라우팅 — `#project2` 의 /fix /repair 는 그 repo 에서 실행 (REPO_DIR 파라미터화)
- [ ] 새 프로젝트 온보딩 절차 문서화
