# Hermes 슬랙 지휘소 — 컨텍스트 노트

> 작업 중 내린 결정과 근거. 다음 세션이 다시 도출하지 않게.

## 큰 그림 (사용자 비전)

- 3층 구조. **설계실**(Claude Code 세션) / **실행팀**(맥미니·Lightsail 상주 봇) / **프런트데스크**(슬랙).
- 지휘소 = 프런트데스크. 슬랙 워크스페이스(예: datapod)에서 명령 넣고 모든 보고 받는 단일 창구.
- 핵심 코드·사고는 Claude Code 세션과 함께. 슬랙 Hermes 는 가벼운 운영·보고·간단 수리 담당.
- 스코어베이스는 거의 자율운영 → 같은 패턴으로 새 프로젝트 확장이 다음 목표.

## 결정 1 — 별도 폴더(~/hermes-hub) 가 아니라 `mac-mini-worker/` 안에 둔다

처음엔 프로젝트 무관성 때문에 별도 repo 를 제안했으나, 코드를 읽어보니 **두뇌(callLLM·runClaudeFix)·launchd 배포 패턴·.env·notify 인프라가 전부 `mac-mini-worker/` 에 있음.** 여기 두면 전부 재사용·무신설인프라. 별도 폴더는 두뇌 중복을 강요. 프로젝트 #2 생기면 그때 공용 hub 로 추출. v1 은 외과적·단순 우선.

## 결정 2 — 한 두뇌, 두 얼굴 (텔레그램 + 슬랙)

`hermes-telegram-bot.js` 의 브레인을 `hermes-core.js` 로 추출. 슬랙 봇은 이 코어 위에 Socket Mode 전송만. **텔레그램 봇은 v1 에서 손대지 않음**(프로덕션 상주 — 리스크 차단). 결과적으로 코어와 텔레그램 인라인 두뇌가 잠시 중복되지만, 라이브 봇 무수정이 우선. dedupe 는 v1.1 별도 작업.

## 결정 3 — Socket Mode

인바운드 포트 0. 봇이 슬랙으로 아웃바운드 연결만. → 집 맥미니(NAT 뒤)에서 그대로 상주 가능. 기존 봇 군단과 같은 집.

## 결정 4 — /fix /repair 는 슬래시 명령

슬랙은 줄 맨앞 `/` 를 슬래시 명령 시스템이 가로채서, 텔레그램처럼 텍스트 `/fix ...` 를 멘션 안에 못 넣음. 그래서 `/fix` `/repair` 를 **진짜 슬래시 명령**으로 등록. 단 3초 ack 제한 + 작업은 5~10분 → **즉시 ack 후 결과는 `chat.postMessage` 로 비동기 게시.** chat·자유대화는 @멘션(채널) + DM(message.im).

## 재사용한 핵심 (출처)

- 두뇌. `hermes-telegram-bot.js:80-145` callOllama/callClaude/callLLM (LLM_PROVIDER 추상화)
- 수리. `hermes-telegram-bot.js:147-222` runClaudeFix + FIX/REPAIR allowlist·system
- 알림 표준. `src/app/api/internal/notify/route.ts` (v1.1 에서 슬랙 cross-post 연결점)
- Claude 래퍼(웹앱용). `src/lib/ai/claude.ts` generate() — 기본 haiku-4-5 (슬랙 봇은 axios 직접, 텔레그램과 동일 패턴 유지)

## 토큰·환경변수 (mac-mini-worker/.env — gitignore 됨)

- `SLACK_BOT_TOKEN` (xoxb-…) · `SLACK_APP_TOKEN` (xapp-…, Socket Mode)
- `SLACK_ALLOWED_USER_IDS` — 콤마구분 슬랙 user id whitelist (텔레그램 ALLOWED 패턴 동일)
- 기존 재사용. `LLM_PROVIDER`(anthropic 권장) · `ANTHROPIC_API_KEY` · `ANTHROPIC_MODEL`

## 주의

- 사용자 `assistant/`(로컬 RAG)·`Chatbot.tsx` 는 사용자 본인 작업 — 절대 건드리지 않음.
- 텔레그램 봇 `REPO_DIR` = mac-mini `/Users/kkulkkul/dev/scorebase`. 슬랙 봇도 동일(같은 repo 수리). 멀티프로젝트는 v2.
