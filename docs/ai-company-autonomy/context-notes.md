# AI 회사 자동화 컨텍스트 노트 (2026-07-19)

작업 중 내린 결정과 근거. 다음 세션은 이 파일부터 읽을 것.

## 배경

- AI 회사(ai-company/, 5월 제작, Phase 2)는 웹 UI 로 미션을 입력해야만 도는 구조라 제작 후 소집 0회. 서버도 꺼져 있었음.
- 사용자 요구 = "사람 개입 없이 로컬 AI 활용, 디자이너처럼 수정 제안". 한디자(designer) 페르소나가 이미 존재 → 트리거만 붙이면 됨.

## 결정 사항

1. **헤드리스 러너 신설, WS 우회** — 회의 로직이 server/main.py WS 핸들러 안에 있어 재사용 가능한 `make_team`/`save_session` 만 import 하는 `run_meeting.py` 를 별도로 만듦. FastAPI 서버 없이도 회의 가능.
2. **미션 = 경쟁사 백로그 자동 주입** — mac-mini-worker/state/idea-log.jsonl 최근 2일치(competitor-watch 봇이 매일 적재)를 미션에 넣음. "scorebase 전용" 요구 반영. 회의 규칙 프롬프트는 server/main.py 의 5규칙과 동일하게 유지(한국어만·자기 발언만 등 — 14B 페르소나 흉내 완화 목적).
3. **보고 = 기존 notify 경로 재사용** — /api/internal/notify (INTERNAL_API_TOKEN, 텔레그램). 새 채널 만들지 않음. PM(김프로) 마지막 발언을 요약으로 전송, HTML 이스케이프 필수(기존 봇 함정).
4. **스케줄 = 월 09:30 KST** — competitor-backlog(월 09:00 슬랙 백로그) 직후라 신선한 재료로 회의.
5. **FastAPI 서버도 launchd KeepAlive 등록** — 회의 기록 REST 조회용(GET /sessions). webui(Next.js)는 상시 가동하지 않음(수요 없는데 RAM 소모). 필요 시 수동 `npm run dev`.
6. **ai-company/ 는 git 언트래킹 유지** — 로컬/맥미니 사본이 이미 이원화돼 있고 이번 스코프에서 트래킹 전환은 사용자 결정 필요. run_meeting.py 는 로컬 작성 후 scp. plist 는 관례대로 mac-mini-worker/launchd/ 에 트래킹.
7. **역할 분담 원칙** — 로컬 AI 회사 = 제안·우선순위(무료, Qwen 한국어 한계 감수). 실행(코드·글) = Claude(직원팀·세션). Qwen 한계는 메모리 project_ai_company "알려진 한계" 참고.

## 검증 기록

(작업 진행하며 추가)
