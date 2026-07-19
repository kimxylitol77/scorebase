# AI 회사 자동화 + 직원팀 검증 체크리스트 (2026-07-19)

목표. 잠자던 두 AI 시스템을 scorebase 전용으로 가동. (A) 맥미니 AI 회사(Ollama 7페르소나)를 사람 개입 없이 주간 자동 회의 + 텔레그램 보고로. (B) scorebase .claude/agents 직원팀 실호출 검증.

## A. AI 회사 자동화 (맥미니)

- [ ] 헤드리스 러너 `ai-company/server/run_meeting.py` 작성 — 미션 자동 조립(경쟁사 idea-log 최근분) + 회의 실행 + 세션 JSON 저장 + notify 텔레그램 보고
- [ ] 맥미니 scp 배포
- [ ] 실회의 1회 실행 검증 — 세션 JSON 생성 + 텔레그램 수신 + PM P0/P1/P2 결론 확인
- [ ] launchd 주간 회의 plist (`com.scorebase.ai-company-meeting`, 월 09:30 KST — competitor-backlog 월 09:00 직후) 등록
- [ ] launchd FastAPI 서버 plist (`com.scorebase.ai-company-server`, KeepAlive — 회의 기록 REST 조회용) 등록
- [ ] launchctl list 로 두 서비스 확인

## B. 직원팀 검증 (scorebase/.claude/agents)

- [ ] scorebase 폴더에서 headless claude 로 content-seo 서브에이전트 실호출 — 한 줄 보고 왕복 확인
- [ ] 인식 안 되면 원인 진단 (폴더/프론트매터/도구 제한)

## 마무리

- [ ] plist·docs 커밋/push (ai-company/ 는 언트래킹 유지 — 컨텍스트 노트 참고)
- [ ] 메모리 갱신 (project_ai_company, project_ai_team_agents, MEMORY.md)
